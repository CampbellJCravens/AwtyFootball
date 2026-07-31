/**
 * Core engine for the WhatsApp poll listener.
 *
 * Responsibilities:
 *   - capturePoll: persist a poll-creation message (needed to decrypt votes),
 *     auto-match it to a game by title date.
 *   - ingestVoteUpdates: accumulate raw encrypted vote updates, re-decode the
 *     full aggregate, and sync it to GameRsvp rows (idempotent).
 *   - resolveContact / linkPollToGame: admin actions that re-sync affected polls.
 *   - listPolls / getUnmatched: read models for the admin UI.
 *
 * All votes are attributed via Player.phone. A vote from an unknown number is
 * surfaced as "unmatched" (derived, not stored) for an admin to resolve, which
 * backfills Player.phone and re-syncs.
 *
 * See docs/whatsapp-poll-listener-spec.md.
 */
import { createHash } from 'crypto';
import {
  decryptPollVote,
  jidNormalizedUser,
  getKeyAuthor,
  BufferJSON,
} from '@whiskeysockets/baileys';
import prisma from '../../prisma';
import { combineSelections } from './options';
import { findGameForPollTitle } from './gameMatch';

// Sentinel written to GameRsvp.setByUserId so listener-sourced votes are
// distinguishable from self ("null") and admin (a real user id) votes.
export const WHATSAPP_SOURCE = 'whatsapp';

const enc = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const dec = (s: string | null | undefined) => (s ? JSON.parse(s, BufferJSON.reviver) : null);

/** Normalize a WhatsApp JID / phone to digits only (drop @server and :device). */
export function phoneFromJid(jid: string): string {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

/** Coerce a stored latestVotes value to string[] (tolerates the old string form). */
function toNames(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v) return [v];
  return [];
}

// ── Scope: restrict what the listener captures ──────────────────────────────
// Cached so per-message checks don't hit the DB. Loaded at listener start and
// refreshed whenever settings change. groupJid limits to one chat; titleFilter
// limits to polls whose title contains the given text (e.g. "Soccer Saturday").
let scopeGroupJid: string | null = null;
let scopeTitleFilter: string | null = null;

export interface WhatsappSettingsDTO {
  groupJid: string | null;
  titleFilter: string | null;
}

export async function refreshScope(): Promise<void> {
  const s = await prisma.whatsappSettings.findUnique({ where: { id: 'singleton' } });
  scopeGroupJid = s?.groupJid ?? null;
  scopeTitleFilter = s?.titleFilter ?? null;
}

/** True if a message from this chat should be processed. Unscoped (no group set) = all. */
export function isInScope(remoteJid?: string | null): boolean {
  if (!scopeGroupJid) return true;
  return remoteJid === scopeGroupJid;
}

/** True if a poll title should be captured. No filter set = any title. */
export function titleInScope(title?: string | null): boolean {
  if (!scopeTitleFilter) return true;
  return (title || '').toLowerCase().includes(scopeTitleFilter.toLowerCase());
}

export async function getWhatsappSettings(): Promise<WhatsappSettingsDTO> {
  await refreshScope();
  return { groupJid: scopeGroupJid, titleFilter: scopeTitleFilter };
}

export async function setWhatsappSettings(patch: {
  groupJid?: string | null;
  titleFilter?: string | null;
}): Promise<WhatsappSettingsDTO> {
  const clean = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const data: { groupJid?: string | null; titleFilter?: string | null } = {};
  if (patch.groupJid !== undefined) data.groupJid = clean(patch.groupJid);
  if (patch.titleFilter !== undefined) data.titleFilter = clean(patch.titleFilter);

  await prisma.whatsappSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  });
  await refreshScope();
  return { groupJid: scopeGroupJid, titleFilter: scopeTitleFilter };
}

/**
 * Unwrap the container messages WhatsApp nests real content inside (disappearing
 * messages, view-once, edits, own-device echoes). The payload we care about can
 * sit one or more layers down, and every layer hides it from a naive lookup.
 */
export function unwrapMessage(message: any): any | null {
  let m = message;
  for (let depth = 0; m && depth < 5; depth++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message ||
      m.deviceSentMessage?.message;
    if (!inner) return m;
    m = inner;
  }
  return m;
}

/**
 * Pull the poll-creation content out of a message, across proto versions and
 * container wrappers.
 *
 * WhatsApp has shipped poll creations as pollCreationMessage through V5. This
 * used to test an explicit list ending at V3, so when a sender's client moved to
 * a newer version the poll was skipped SILENTLY — no log, no capture, and every
 * later vote rejected as "uncaptured poll". That's what lost the 25Jul 2026
 * poll. Match any pollCreationMessage* field instead, so the next bump can't
 * break it the same way.
 */
function getPollCreation(message: any): any | null {
  const m = unwrapMessage(message);
  if (!m) return null;
  for (const [key, value] of Object.entries(m)) {
    // pollCreationMessageKey is a back-reference carried on votes, not a poll.
    if (key.startsWith('pollCreationMessage') && key !== 'pollCreationMessageKey' && value) {
      return value;
    }
  }
  return null;
}

/** The poll-vote payload, likewise tolerant of wrappers. */
export function getPollUpdate(message: any): any | null {
  return unwrapMessage(message)?.pollUpdateMessage ?? null;
}

export function isPollCreation(message: any): boolean {
  return getPollCreation(message) !== null;
}

/**
 * Persist a newly-seen poll and try to auto-match it to a game. `raw` is the
 * Baileys WAMessage ({ key, message, pushName }).
 */
export async function capturePoll(raw: any): Promise<void> {
  const creation = getPollCreation(raw.message);
  if (!creation) return;

  const pollMessageId: string | undefined = raw.key?.id;
  const remoteJid: string | undefined = raw.key?.remoteJid;
  if (!pollMessageId || !remoteJid) return;

  const question: string = creation.name || '(untitled poll)';

  if (!titleInScope(question)) {
    console.log(`[whatsapp] Poll "${question}" skipped — title doesn't match filter.`);
    return;
  }

  const existing = await prisma.whatsappPoll.findUnique({ where: { pollMessageId } });
  if (existing) return; // already captured

  const gameId = await findGameForPollTitle(question);

  await prisma.whatsappPoll.create({
    data: {
      pollMessageId,
      remoteJid,
      question,
      pollMessage: enc({ key: raw.key, message: raw.message }),
      gameId: gameId ?? undefined,
      linkedBy: gameId ? null : undefined, // null = auto-matched
    },
  });

  if (raw.pushName && raw.key?.participant) {
    await upsertContact(phoneFromJid(raw.key.participant), raw.pushName);
  }

  console.log(
    `[whatsapp] Captured poll "${question}" (${pollMessageId})` +
      (gameId ? ` → auto-matched game ${gameId}` : ' → no game match, awaiting manual link')
  );
}

// Display names essentially never change, but this used to write on EVERY group
// message, keeping the database awake around the clock. Cache what we've already
// stored and only write on a real change. The cache is per-process, so a restart
// costs one write per contact and nothing more.
const contactNameCache = new Map<string, string | null>();

async function upsertContact(phone: string, pushName?: string | null): Promise<void> {
  if (!phone) return;
  const next = pushName ?? null;
  if (contactNameCache.has(phone)) {
    const cached = contactNameCache.get(phone)!;
    // Nothing new to record: same name, or no name to add to what we have.
    if (cached === next || next === null) return;
  }
  await prisma.whatsappContact.upsert({
    where: { phone },
    create: { phone, pushName: next },
    update: next ? { pushName: next } : {},
  });
  contactNameCache.set(phone, next ?? contactNameCache.get(phone) ?? null);
}

/**
 * Handle an encrypted poll vote (arrives on messages.upsert as a
 * pollUpdateMessage in Baileys 7 — the lib no longer decrypts polls itself).
 * Decrypts it using the stored poll's messageSecret, then feeds the decrypted
 * vote into ingestVoteUpdates. Follows Baileys' own (removed) blueprint.
 *
 * IMPORTANT: only works when the poll was created by a DIFFERENT account than
 * the linked listener — WhatsApp only ships the messageSecret to the creator's
 * own devices, so a poll the linked account created on its phone can't be
 * decrypted here (messageSecret will be absent).
 */
/**
 * Coerce a proto bytes field into a raw Buffer. WhatsApp/Baileys hands these to
 * us as base64 strings (not Uint8Arrays) in this message path — the messageSecret,
 * the vote's encPayload and encIv are all base64. The crypto needs raw bytes;
 * passing the base64 string derives the wrong key / ciphertext (GCM auth failure).
 */
function toBytes(s: any): Buffer | null {
  if (!s) return null;
  if (Buffer.isBuffer(s)) return s;
  if (s instanceof Uint8Array) return Buffer.from(s);
  if (typeof s === 'string') return Buffer.from(s, 'base64');
  if (s.type === 'Buffer' && Array.isArray(s.data)) return Buffer.from(s.data);
  return null;
}

const normJid = (j?: string | null): string | null => {
  if (!j) return null;
  try {
    return jidNormalizedUser(j);
  } catch {
    return null;
  }
};

/**
 * Candidate author JIDs for a message key. WhatsApp's LID addressing means the
 * jid used to encrypt a poll vote may be the @lid or the @s.whatsapp.net (PN)
 * form; we can't know which up front, so we return both and let decryption pick.
 */
function authorCandidates(key: any, meId?: string, meLid?: string): string[] {
  const out = new Set<string>();
  if (key?.fromMe) {
    for (const j of [meId, meLid]) {
      const n = normJid(j);
      if (n) out.add(n);
    }
  } else {
    for (const j of [key?.participant, key?.participantAlt, key?.remoteJid, key?.remoteJidAlt]) {
      const n = normJid(j);
      if (n) out.add(n);
    }
  }
  return [...out];
}

export async function handlePollUpdateMessage(
  msg: any,
  meId: string | undefined,
  meLid?: string
): Promise<void> {
  const pum = getPollUpdate(msg.message);
  const creationKey = pum?.pollCreationMessageKey;
  if (!pum || !creationKey?.id) return;

  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId: creationKey.id } });
  if (!poll) {
    console.warn(`[whatsapp] Vote for uncaptured poll ${creationKey.id} — ignored.`);
    return;
  }

  const stored = dec(poll.pollMessage);
  // The secret rides on the poll-creation message; when that message was
  // wrapped (ephemeral/view-once), it sits on the inner layer instead.
  const pollEncKey = toBytes(
    unwrapMessage(stored?.message)?.messageContextInfo?.messageSecret ??
      stored?.message?.messageContextInfo?.messageSecret
  );
  if (!pollEncKey) {
    console.warn(
      `[whatsapp] Poll ${creationKey.id} has no messageSecret — can't decrypt votes. ` +
        `This happens when the poll was created by the linked account itself; ` +
        `it must be created by another member.`
    );
    return;
  }
  if (pollEncKey.length !== 32) {
    console.warn(`[whatsapp] messageSecret is ${pollEncKey.length} bytes (expected 32) for ${creationKey.id}`);
  }

  // WhatsApp encrypts the vote keyed on (pollMsgId, pollCreatorJid, voterJid).
  // With LID addressing we don't know whether it used the @lid or PN form, so
  // try each combination and keep the one that authenticates. Prefer the stored
  // poll-creation key for the creator (it carries both @lid and PN alt fields).
  const creatorCands = authorCandidates(stored?.key ?? creationKey, meId, meLid);
  const voterCands = authorCandidates(msg.key, meId, meLid);

  // Decode the encrypted vote bytes (also base64 strings in this path).
  const encVote = {
    encPayload: toBytes(pum.vote?.encPayload),
    encIv: toBytes(pum.vote?.encIv),
  };

  let voteMsg: any = null;
  let usedCreator = '';
  let usedVoter = '';
  for (const c of creatorCands) {
    for (const v of voterCands) {
      try {
        voteMsg = decryptPollVote(encVote as any, {
          pollEncKey,
          pollCreatorJid: c,
          pollMsgId: creationKey.id,
          voterJid: v,
        });
        usedCreator = c;
        usedVoter = v;
        break;
      } catch {
        // wrong jid combination — try the next
      }
    }
    if (voteMsg) break;
  }

  if (!voteMsg) {
    console.error(
      `[whatsapp] Could not decrypt vote for poll ${creationKey.id} with any jid combo. ` +
        `creators=${JSON.stringify(creatorCands)} voters=${JSON.stringify(voterCands)}`
    );
    return;
  }

  const pollUpdate = {
    pollUpdateMessageKey: msg.key,
    vote: voteMsg,
    senderTimestampMs: Number(pum.senderTimestampMs) || 0,
  };
  console.log(
    `[whatsapp] Decrypted vote (creator=${usedCreator} voter=${usedVoter}) on poll ${creationKey.id} — ${voteMsg?.selectedOptions?.length ?? 0} option(s)`
  );
  await ingestVoteUpdates(creationKey.id, [pollUpdate], meId);
}

/**
 * Given decrypted pollUpdates for a poll message, accumulate them, re-decode the
 * full aggregate, persist it, and sync to RSVPs. `meId` is the linked account's JID.
 */
export async function ingestVoteUpdates(
  pollMessageId: string,
  newUpdates: any[],
  meId: string | undefined
): Promise<void> {
  if (!newUpdates?.length) return;

  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId } });
  if (!poll) {
    // Vote for a poll we never captured (e.g. posted before we linked). Can't
    // decrypt without the creation message; log so it's visible during testing.
    console.warn(`[whatsapp] Vote for unknown poll ${pollMessageId} — ignored (poll not captured).`);
    return;
  }

  // Append the new decrypted updates (dedupe by message id), then re-derive.
  const prior: any[] = dec(poll.pollUpdates) || [];
  const merged = dedupeUpdates([...prior, ...newUpdates]);
  await prisma.whatsappPoll.update({
    where: { pollMessageId },
    data: { pollUpdates: enc(merged) },
  });

  await rederivePollVotes(pollMessageId, meId);
}

/**
 * Recompute latestVotes for a poll from its accumulated raw updates, then sync
 * to RSVPs. Separated so it can also be run as a one-off backfill. We do our own
 * hash-matching (rather than getAggregateVotesInPollMessage) because Baileys
 * compares option hashes with a .toString() that mismatches Uint8Array vs Buffer,
 * and because these polls are multi-select (guest count comes from a "+N" option).
 */
export async function rederivePollVotes(pollMessageId: string, meId: string | undefined): Promise<void> {
  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId } });
  if (!poll || !poll.pollUpdates) return;

  const merged: any[] = dec(poll.pollUpdates) || [];
  const stored = dec(poll.pollMessage);
  const options = getPollCreation(stored?.message)?.options || [];
  const hashToName = new Map<string, string>();
  for (const o of options) {
    const name = o.optionName || '';
    const hash = createHash('sha256').update(Buffer.from(name, 'utf8')).digest('hex');
    hashToName.set(hash, name);
  }

  const meIdNorm = meId ? jidNormalizedUser(meId) : '';
  // Each vote message is a full snapshot of that voter's current selection, so
  // keep the latest per voter (by timestamp).
  const latestByPhone = new Map<string, { ts: number; names: string[] }>();
  for (const u of merged) {
    const phone = phoneFromJid(getKeyAuthor(u.pollUpdateMessageKey, meIdNorm));
    if (!phone) continue;
    const ts = Number(u.senderTimestampMs) || 0;
    const names: string[] = [];
    for (const sel of u.vote?.selectedOptions || []) {
      // selectedOptions are base64 strings in this path — decode to raw bytes
      // before comparing to the option-name hashes.
      const bytes = toBytes(sel);
      if (!bytes) continue;
      const name = hashToName.get(bytes.toString('hex'));
      if (name) names.push(name);
    }
    const existing = latestByPhone.get(phone);
    if (!existing || ts >= existing.ts) latestByPhone.set(phone, { ts, names });
  }

  const votes: Record<string, string[]> = {};
  for (const [phone, v] of latestByPhone) votes[phone] = v.names;

  await prisma.whatsappPoll.update({
    where: { pollMessageId },
    data: { latestVotes: JSON.stringify(votes) },
  });

  await syncPollToRsvps(pollMessageId);
}

function dedupeUpdates(updates: any[]): any[] {
  // Each vote message has a unique key id; keep them all and resolve
  // latest-per-voter later by timestamp.
  const byKey = new Map<string, any>();
  for (const u of updates) {
    const k = u?.pollUpdateMessageKey?.id || JSON.stringify(u?.pollUpdateMessageKey ?? {});
    byKey.set(k, u);
  }
  return [...byKey.values()];
}

/**
 * Write the poll's current decoded aggregate into GameRsvp. No-op if the poll
 * isn't linked to a game yet. Unknown numbers are skipped (surfaced via
 * getUnmatched). Idempotent — safe to call repeatedly.
 */
export async function syncPollToRsvps(pollMessageId: string): Promise<void> {
  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId } });
  if (!poll || !poll.gameId || !poll.latestVotes) return;

  const votes: Record<string, string[]> = JSON.parse(poll.latestVotes);
  const phones = Object.keys(votes);
  if (phones.length === 0) return;

  const players = await prisma.player.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  });
  const byPhone = new Map(players.map((p) => [p.phone!, p.id]));

  for (const phone of phones) {
    const playerId = byPhone.get(phone);
    if (!playerId) continue; // unmatched — resolved by admin later

    const parsed = combineSelections(toNames(votes[phone]));
    if (!parsed) continue; // unrecognized / cleared vote

    // Precedence: a vote set in the app (self, setByUserId null) or by an admin
    // override wins over the WhatsApp poll. Only create new rows or refresh ones
    // that are still WhatsApp-sourced.
    const existing = await prisma.gameRsvp.findUnique({
      where: { gameId_playerId: { gameId: poll.gameId, playerId } },
      select: { setByUserId: true },
    });
    if (existing && existing.setByUserId !== WHATSAPP_SOURCE) continue;

    await prisma.gameRsvp.upsert({
      where: { gameId_playerId: { gameId: poll.gameId, playerId } },
      create: {
        gameId: poll.gameId,
        playerId,
        status: parsed.status,
        guestCount: parsed.guestCount,
        setByUserId: WHATSAPP_SOURCE,
      },
      update: {
        status: parsed.status,
        guestCount: parsed.guestCount,
        setByUserId: WHATSAPP_SOURCE,
      },
    });
  }
}

// ── Admin read models & actions ────────────────────────────────────────────

export interface UnmatchedVote {
  phone: string;
  pushName: string | null;
  pollMessageId: string;
  question: string;
  gameId: string | null;
  optionText: string;
}

/** Phones that voted in a captured poll but don't map to any Player. Optionally scoped to one game. */
export async function getUnmatched(gameId?: string): Promise<UnmatchedVote[]> {
  const polls = await prisma.whatsappPoll.findMany({
    where: { latestVotes: { not: null }, ...(gameId ? { gameId } : {}) },
    select: { pollMessageId: true, question: true, gameId: true, latestVotes: true },
  });

  const allPhones = new Set<string>();
  const perPoll: Array<{ pollMessageId: string; question: string; gameId: string | null; votes: Record<string, string[]> }> = [];
  for (const p of polls) {
    const votes: Record<string, string[]> = JSON.parse(p.latestVotes!);
    perPoll.push({ pollMessageId: p.pollMessageId, question: p.question, gameId: p.gameId, votes });
    Object.keys(votes).forEach((ph) => allPhones.add(ph));
  }
  if (allPhones.size === 0) return [];

  const known = await prisma.player.findMany({
    where: { phone: { in: [...allPhones] } },
    select: { phone: true },
  });
  const knownSet = new Set(known.map((k) => k.phone!));

  const contacts = await prisma.whatsappContact.findMany({
    where: { phone: { in: [...allPhones] } },
  });
  const nameByPhone = new Map(contacts.map((c) => [c.phone, c.pushName]));

  const out: UnmatchedVote[] = [];
  for (const p of perPoll) {
    for (const [phone, rawNames] of Object.entries(p.votes)) {
      if (knownSet.has(phone)) continue;
      const names = toNames(rawNames);
      if (!names.length) continue; // vote was cleared
      out.push({
        phone,
        pushName: nameByPhone.get(phone) ?? null,
        pollMessageId: p.pollMessageId,
        question: p.question,
        gameId: p.gameId,
        optionText: names.join(' + '),
      });
    }
  }
  return out;
}

/**
 * Re-sync every linked poll that has a vote from this phone, so newly-linked
 * numbers get their past votes attributed. Called both when resolving an
 * unmatched vote and when an admin sets a number on a player's profile.
 */
export async function resyncPollsForPhone(digits: string): Promise<void> {
  if (!digits) return;
  const polls = await prisma.whatsappPoll.findMany({
    where: { gameId: { not: null }, latestVotes: { not: null } },
    select: { pollMessageId: true, latestVotes: true },
  });
  for (const p of polls) {
    const votes: Record<string, unknown> = JSON.parse(p.latestVotes!);
    if (votes[digits] !== undefined) await syncPollToRsvps(p.pollMessageId);
  }
}

// ── Read-only poll view for the RSVP tab ────────────────────────────────────
// Computed live from WhatsApp votes so it counts everyone — linked players AND
// unlinked numbers — and reflects a new link immediately. Never exposes phone
// numbers to the client (unlinked voters show their WhatsApp display name).
// Falls back to the stored GameRsvp rows when there's no poll data for the game,
// so a missing or unlinked poll can't blank out RSVPs we already have.

export interface GamePollEntry {
  key: string; // stable React key; never the phone number
  name: string;
  pictureUrl: string | null;
  guestCount: number;
  linked: boolean;
  playerId: string | null;
}

export interface GamePoll {
  in: GamePollEntry[];
  maybe: GamePollEntry[];
  out: GamePollEntry[];
  counts: { in: number; maybe: number; out: number };
  guestTotal: number;
  // Where these results came from, so the UI can label them honestly.
  // "poll" = decoded WhatsApp votes; "rsvp" = the stored GameRsvp rows.
  source: 'poll' | 'rsvp';
}

function emptyPoll(source: 'poll' | 'rsvp'): GamePoll {
  return {
    in: [],
    maybe: [],
    out: [],
    counts: { in: 0, maybe: 0, out: 0 },
    guestTotal: 0,
    source,
  };
}

/** Sort each bucket by name and derive the counts. */
function finalizePoll(result: GamePoll): GamePoll {
  result.in.sort((a, b) => a.name.localeCompare(b.name));
  result.maybe.sort((a, b) => a.name.localeCompare(b.name));
  result.out.sort((a, b) => a.name.localeCompare(b.name));
  result.counts = { in: result.in.length, maybe: result.maybe.length, out: result.out.length };
  return result;
}

function bucketFor(status: string): 'in' | 'maybe' | 'out' {
  return status === 'yes' ? 'in' : status === 'maybe' ? 'maybe' : 'out';
}

export async function getGamePoll(gameId: string): Promise<GamePoll> {
  const polls = await prisma.whatsappPoll.findMany({
    where: { gameId, latestVotes: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { latestVotes: true },
  });

  // phone -> selected option labels (later polls override earlier for same phone)
  const byPhone = new Map<string, string[]>();
  for (const p of polls) {
    const votes: Record<string, unknown> = JSON.parse(p.latestVotes!);
    for (const [phone, names] of Object.entries(votes)) byPhone.set(phone, toNames(names));
  }

  const phones = [...byPhone.keys()];
  const [players, contacts] = await Promise.all([
    prisma.player.findMany({
      where: { phone: { in: phones } },
      select: { id: true, name: true, pictureUrl: true, phone: true },
    }),
    prisma.whatsappContact.findMany({ where: { phone: { in: phones } } }),
  ]);
  const playerByPhone = new Map(players.map((p) => [p.phone!, p]));
  const nameByPhone = new Map(contacts.map((c) => [c.phone, c.pushName]));

  const result = emptyPoll('poll');

  let anon = 0;
  for (const [phone, names] of byPhone) {
    const parsed = combineSelections(names);
    if (!parsed) continue; // vote cleared / unrecognized

    const player = playerByPhone.get(phone);
    const entry: GamePollEntry = {
      key: player ? player.id : `wa:${anon}`,
      // Unlinked voters: use their WhatsApp display name if we have it, else a
      // numbered "Guest" so multiple unlinked people stay distinguishable. Never
      // the phone number.
      name: player ? player.name : nameByPhone.get(phone) || `Guest ${++anon}`,
      pictureUrl: player ? player.pictureUrl : null,
      guestCount: parsed.status === 'yes' ? parsed.guestCount : 0,
      linked: !!player,
      playerId: player ? player.id : null,
    };

    const bucket = bucketFor(parsed.status);
    result[bucket].push(entry);
    if (bucket === 'in') result.guestTotal += entry.guestCount;
  }

  // No poll votes to show — either no poll is linked to this game, or its
  // captured votes are gone. Fall back to the RSVP rows we already hold so the
  // tab reflects reality instead of reading as "nobody voted".
  if (result.in.length + result.maybe.length + result.out.length === 0) {
    return getGamePollFromRsvps(gameId);
  }

  return finalizePoll(result);
}

/**
 * Build the same read-only view straight from GameRsvp. Used when a game has no
 * usable poll data: WhatsApp-sourced RSVPs already written by syncPollToRsvps
 * survive even if the poll record doesn't, and pre-listener games have RSVPs
 * that were never poll-backed at all. Every entry maps to a real player, so
 * there are no unlinked voters here.
 */
async function getGamePollFromRsvps(gameId: string): Promise<GamePoll> {
  const rsvps = await prisma.gameRsvp.findMany({
    where: { gameId },
    select: {
      status: true,
      guestCount: true,
      player: { select: { id: true, name: true, pictureUrl: true } },
    },
  });

  const result = emptyPoll('rsvp');
  for (const r of rsvps) {
    const bucket = bucketFor(r.status);
    const entry: GamePollEntry = {
      key: r.player.id,
      name: r.player.name,
      pictureUrl: r.player.pictureUrl,
      guestCount: bucket === 'in' ? r.guestCount : 0,
      linked: true,
      playerId: r.player.id,
    };
    result[bucket].push(entry);
    if (bucket === 'in') result.guestTotal += entry.guestCount;
  }

  return finalizePoll(result);
}

/** Assign a phone to a player (backfills Player.phone) and re-sync all polls. */
export async function resolveContact(phone: string, playerId: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  await prisma.player.update({ where: { id: playerId }, data: { phone: digits } });
  await resyncPollsForPhone(digits);
}

/** Link (or re-link) a captured poll to a game and sync its votes. */
export async function linkPollToGame(
  pollMessageId: string,
  gameId: string,
  userId: string
): Promise<void> {
  await prisma.whatsappPoll.update({
    where: { pollMessageId },
    data: { gameId, linkedBy: userId },
  });
  await syncPollToRsvps(pollMessageId);
}

export async function listPolls() {
  const polls = await prisma.whatsappPoll.findMany({
    orderBy: { createdAt: 'desc' },
    include: { game: { select: { id: true, gameNumber: true, createdAt: true } } },
  });
  return polls.map((p) => {
    const votes: Record<string, string[]> = p.latestVotes ? JSON.parse(p.latestVotes) : {};
    const voteCount = Object.values(votes).filter((names) => names.length > 0).length;
    return {
      pollMessageId: p.pollMessageId,
      question: p.question,
      gameId: p.gameId,
      game: p.game,
      linkedBy: p.linkedBy,
      voteCount,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

/** Record/refresh a contact's display name (used as we observe messages). */
export async function noteContact(jid: string, pushName?: string | null): Promise<void> {
  await upsertContact(phoneFromJid(jid), pushName);
}

/**
 * Whether a game has a WhatsApp poll linked, plus the unlinked captured polls an
 * admin could link to it (for the in-game "link a poll" banner).
 */
export async function getGameLinkStatus(gameId: string): Promise<{
  linkedPollId: string | null;
  candidates: Array<{ pollMessageId: string; question: string; voteCount: number }>;
}> {
  const [linked, unlinked] = await Promise.all([
    prisma.whatsappPoll.findFirst({ where: { gameId }, select: { pollMessageId: true } }),
    prisma.whatsappPoll.findMany({
      where: { gameId: null },
      orderBy: { createdAt: 'desc' },
      select: { pollMessageId: true, question: true, latestVotes: true },
    }),
  ]);
  return {
    linkedPollId: linked?.pollMessageId ?? null,
    candidates: unlinked.map((p) => {
      const votes: Record<string, unknown> = p.latestVotes ? JSON.parse(p.latestVotes) : {};
      const voteCount = Object.values(votes).filter((n) => toNames(n).length > 0).length;
      return { pollMessageId: p.pollMessageId, question: p.question, voteCount };
    }),
  };
}
