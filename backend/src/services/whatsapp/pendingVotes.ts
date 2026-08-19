/**
 * Holding pen for poll votes that arrive before their poll is captured.
 *
 * WhatsApp poll votes are separate messages from the poll itself. If the poll's
 * creation message fails to decrypt (Signal session rotating — see the CIPHERTEXT
 * stub handling in listener.ts), we have no messageSecret and can't decode any of
 * its votes. Previously those votes were logged and thrown away, permanently:
 * a whole week's RSVPs, one "Vote for uncaptured poll ... ignored" line at a time.
 *
 * Now they're parked here until the creation message is recovered, then replayed.
 *
 * DELIBERATELY NOT POSTGRES. Every write to Neon wakes the compute for minutes,
 * and that is exactly what exhausted the monthly quota on 2026-07-29. Votes land
 * sporadically over days, so buffering them in Postgres would be close to the
 * worst possible access pattern. Redis is already configured for auth state and
 * bills per command, so a few dozen writes a week is free. Falls back to memory
 * when Redis isn't configured (local dev), accepting loss on restart.
 */
import { BufferJSON } from '@whiskeysockets/baileys';
import { getSharedRedis } from './redisAuthState';

const PREFIX = 'wa:pendingvotes:';
/** Cap per poll so a malformed stream can't grow without bound. */
const MAX_PER_POLL = 300;
/** Self-cleaning: a poll not recovered within two weeks never will be. */
const TTL_SECONDS = 14 * 24 * 60 * 60;

const memory = new Map<string, string[]>();

const enc = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const dec = (s: string) => JSON.parse(s, BufferJSON.reviver);

/** Park a vote message until its poll turns up. Returns how many are now held. */
export async function bufferPendingVote(pollMessageId: string, msg: unknown): Promise<number> {
  const key = PREFIX + pollMessageId;
  const payload = enc(msg);
  const redis = getSharedRedis();

  if (!redis) {
    const list = memory.get(pollMessageId) ?? [];
    if (list.length >= MAX_PER_POLL) return list.length;
    list.push(payload);
    memory.set(pollMessageId, list);
    return list.length;
  }

  const len = await redis.rpush(key, payload);
  // Only touch the TTL on the first push; renewing it per vote would let a
  // never-recovered poll live forever.
  if (len === 1) await redis.expire(key, TTL_SECONDS);
  if (len > MAX_PER_POLL) await redis.ltrim(key, 0, MAX_PER_POLL - 1);
  return Math.min(len, MAX_PER_POLL);
}

/** Take everything held for a poll and clear it. */
export async function takePendingVotes(pollMessageId: string): Promise<any[]> {
  const key = PREFIX + pollMessageId;
  const redis = getSharedRedis();

  if (!redis) {
    const list = memory.get(pollMessageId) ?? [];
    memory.delete(pollMessageId);
    return list.map(dec);
  }

  const raw = await redis.lrange(key, 0, -1);
  if (raw.length) await redis.del(key);
  return raw.map(dec);
}

/** How many votes are waiting, without consuming them. For diagnostics. */
export async function countPendingVotes(pollMessageId: string): Promise<number> {
  const redis = getSharedRedis();
  if (!redis) return memory.get(pollMessageId)?.length ?? 0;
  return redis.llen(PREFIX + pollMessageId);
}
