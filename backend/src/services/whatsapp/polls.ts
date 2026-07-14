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
import {
  getAggregateVotesInPollMessage,
  decryptPollVote,
  jidNormalizedUser,
  getKeyAuthor,
  BufferJSON,
} from '@whiskeysockets/baileys';
import prisma from '../../prisma';
import { parsePollOption } from './options';
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
export async function handlePollUpdateMessage(msg: any, meId: string | undefined): Promise<void> {
  const pum = msg.message?.pollUpdateMessage;
  const creationKey = pum?.pollCreationMessageKey;
  if (!pum || !creationKey?.id) return;

  const poll = await prisma.whatsappPoll.findUnique({ where: { pollMessageId: creationKey.id } });
  if (!poll) {
    console.warn(`[whatsapp] Vote for uncaptured poll ${creationKey.id} — ignored.`);
    return;
  }

  const stored = dec(poll.pollMessage);
  const pollEncKey = stored?.message?.messageContextInfo?.messageSecret;
  if (!pollEncKey) {
    console.warn(
      `[whatsapp] Poll ${creationKey.id} has no messageSecret — can't decrypt votes. ` +
        `This happens when the poll was created by the linked account itself; ` +
        `it must be created by another member.`
    );
    return;
  }

  const meIdNorm = meId ? jidNormalizedUser(meId) : '';
  const pollCreatorJid = getKeyAuthor(creationKey, meIdNorm);
  const voterJid = getKeyAuthor(msg.key, meIdNorm);

  let voteMsg;
  try {
    voteMsg = decryptPollVote(pum.vote, {
      pollEncKey,
      pollCreatorJid,
      pollMsgId: creationKey.id,
      voterJid,
    });
  } catch (err) {
    console.error(`[whatsapp] Failed to decrypt poll vote for ${creationKey.id}:`, err);
    return;
  }

  const pollUpdate = {
    pollUpdateMessageKey: msg.key,
    vote: voteMsg,
    senderTimestampMs: Number(pum.senderTimestampMs) || 0,
  };
  console.log(
    `[whatsapp] Decrypted vote from ${voterJid} on poll ${creationKey.id} (${voteMsg?.selectedOptions?.length ?? 0} option(s))`
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

  // Accumulate raw updates (dedupe by voter+timestamp), then re-aggregate.
  const prior: any[] = dec(poll.pollUpdates) || [];
  const merged = dedupeUpdates([...prior, ...newUpdates]);

  const stored = dec(poll.pollMessage);
  let aggregated: Array<{ name: string; voters: string[] }> = [];
  try {
    aggregated = getAggregateVotesInPollMessage(
      { message: stored.message, pollUpdates: merged },
      meId
    ) as any;
  } catch (err) {
    console.error(`[whatsapp] Failed to decode votes for poll ${pollMessageId}:`, err);
    return;
  }

  // phone -> chosen option text (last write wins; polls here are single-select)
  const votes: Record<string, string> = {};
  for (const opt of aggregated) {
    for (const voterJid of opt.voters || []) {
      votes[phoneFromJid(voterJid)] = opt.name;
    }
  }

  await prisma.whatsappPoll.update({
    where: { pollMessageId },
    data: { pollUpdates: enc(merged), latestVotes: JSON.stringify(votes) },
  });

  await syncPollToRsvps(pollMessageId);
}

function dedupeUpdates(updates: any[]): any[] {
  // Each vote message has a unique key id; keep them all and let
  // getAggregateVotesInPollMessage resolve latest-per-voter by timestamp.
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

  const votes: Record<string, string> = JSON.parse(poll.latestVotes);
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

    const parsed = parsePollOption(votes[phone]);
    if (!parsed) continue; // unrecognized option

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

/** Phones that voted in a captured poll but don't map to any Player. */
export async function getUnmatched(): Promise<UnmatchedVote[]> {
  const polls = await prisma.whatsappPoll.findMany({
    where: { latestVotes: { not: null } },
    select: { pollMessageId: true, question: true, gameId: true, latestVotes: true },
  });

  const allPhones = new Set<string>();
  const perPoll: Array<{ pollMessageId: string; question: string; gameId: string | null; votes: Record<string, string> }> = [];
  for (const p of polls) {
    const votes: Record<string, string> = JSON.parse(p.latestVotes!);
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
    for (const [phone, optionText] of Object.entries(p.votes)) {
      if (knownSet.has(phone)) continue;
      out.push({
        phone,
        pushName: nameByPhone.get(phone) ?? null,
        pollMessageId: p.pollMessageId,
        question: p.question,
        gameId: p.gameId,
        optionText,
      });
    }
  }
  return out;
}

/** Assign a phone to a player (backfills Player.phone) and re-sync all polls. */
export async function resolveContact(phone: string, playerId: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  await prisma.player.update({ where: { id: playerId }, data: { phone: digits } });

  const polls = await prisma.whatsappPoll.findMany({
    where: { gameId: { not: null }, latestVotes: { not: null } },
    select: { pollMessageId: true, latestVotes: true },
  });
  for (const p of polls) {
    const votes: Record<string, string> = JSON.parse(p.latestVotes!);
    if (votes[digits] !== undefined) await syncPollToRsvps(p.pollMessageId);
  }
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
    const votes: Record<string, string> = p.latestVotes ? JSON.parse(p.latestVotes) : {};
    return {
      pollMessageId: p.pollMessageId,
      question: p.question,
      gameId: p.gameId,
      game: p.game,
      linkedBy: p.linkedBy,
      voteCount: Object.keys(votes).length,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

/** Record/refresh a contact's display name (used as we observe messages). */
export async function noteContact(jid: string, pushName?: string | null): Promise<void> {
  await upsertContact(phoneFromJid(jid), pushName);
}
