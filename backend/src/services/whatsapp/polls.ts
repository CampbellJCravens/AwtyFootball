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

// ── Scope: restrict capture to a single group chat ──────────────────────────
// Cached so the per-message check doesn't hit the DB. Loaded at listener start
// and updated whenever setScope runs.
let scopeGroupJid: string | null = null;

export async function refreshScope(): Promise<void> {
  const s = await prisma.whatsappSettings.findUnique({ where: { id: 'singleton' } });
  scopeGroupJid = s?.groupJid ?? null;
}

/** True if a message from this chat should be processed. Unscoped (no group set) = all. */
export function isInScope(remoteJid?: string | null): boolean {
  if (!scopeGroupJid) return true;
  return remoteJid === scopeGroupJid;
}

export async function getScope(): Promise<string | null> {
  await refreshScope();
  return scopeGroupJid;
}

export async function setScope(groupJid: string | null): Promise<void> {
  const jid = groupJid && groupJid.trim() ? groupJid.trim() : null;
  await prisma.whatsappSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', groupJid: jid },
    update: { groupJid: jid },
  });
  scopeGroupJid = jid;
}

/** Pull the poll-creation content out of a message, across proto versions. */
function getPollCreation(message: any): any | null {
  if (!message) return null;
  return (
    message.pollCreationMessage ||
    message.pollCreationMessageV2 ||
    message.pollCreationMessageV3 ||
    null
  );
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

async function upsertContact(phone: string, pushName?: string | null): Promise<void> {
  if (!phone) return;
  await prisma.whatsappContact.upsert({
    where: { phone },
    create: { phone, pushName: pushName ?? null },
    update: pushName ? { pushName } : {},
  });
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
  const pum = msg.message?.pollUpdateMessage;
  const creationKey = pum?.pollCreationMessageKey;
  if (!pum || !creationKey?.id) return;

  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId: creationKey.id } });
  if (!poll) {
    console.warn(`[whatsapp] Vote for uncaptured poll ${creationKey.id} — ignored.`);
    return;
  }

  const stored = dec(poll.pollMessage);
  const pollEncKey = toBytes(stored?.message?.messageContextInfo?.messageSecret);
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
