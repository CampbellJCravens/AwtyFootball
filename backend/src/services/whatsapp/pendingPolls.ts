/**
 * Holding pen for poll CREATION messages we couldn't persist.
 *
 * Companion to pendingVotes.ts, for the other half of the same loss. Votes can
 * be replayed once the poll turns up, but only if the poll turns up at all: the
 * messageSecret rides on the creation message, so if that write is lost the
 * buffered votes have nothing to decrypt against and the week is gone.
 *
 * The write can fail even when the message decrypted perfectly — Neon suspends
 * after ~5 idle minutes and resumes in ~4-6s, so a poll landing in a quiet group
 * is exactly the request that meets a cold database. capturePoll retries first;
 * anything still failing after that is parked here and replayed on reconnect.
 *
 * REDIS, NOT POSTGRES — same reasoning as pendingVotes: the failure we're
 * insuring against is Postgres being unreachable, so Postgres is the one store
 * that cannot hold the insurance. Falls back to memory without Redis.
 */
import { BufferJSON } from '@whiskeysockets/baileys';
import { getSharedRedis } from './redisAuthState';

const KEY = 'wa:pendingpolls';
/** A poll a fortnight stale is past any game it could have been collecting for. */
const TTL_SECONDS = 14 * 24 * 60 * 60;
/** Far more than a healthy week needs; a runaway loop can't grow unbounded. */
const MAX_HELD = 50;

const memory: string[] = [];

const enc = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const dec = (s: string) => JSON.parse(s, BufferJSON.reviver);

/** Park a creation message that wouldn't persist. Returns how many are now held. */
export async function bufferPendingPoll(raw: unknown): Promise<number> {
  const payload = enc(raw);
  const redis = getSharedRedis();

  if (!redis) {
    if (memory.length >= MAX_HELD) return memory.length;
    memory.push(payload);
    return memory.length;
  }

  const len = await redis.rpush(KEY, payload);
  if (len === 1) await redis.expire(KEY, TTL_SECONDS);
  if (len > MAX_HELD) await redis.ltrim(KEY, 0, MAX_HELD - 1);
  return Math.min(len, MAX_HELD);
}

/** Take every held creation message and clear the buffer. */
export async function takePendingPolls(): Promise<any[]> {
  const redis = getSharedRedis();

  if (!redis) {
    const list = memory.splice(0, memory.length);
    return list.map(dec);
  }

  const held = await redis.lrange(KEY, 0, -1);
  if (held.length) await redis.del(KEY);
  return held.map(dec);
}

/** How many creations are waiting, without consuming them. For diagnostics. */
export async function countPendingPolls(): Promise<number> {
  const redis = getSharedRedis();
  if (!redis) return memory.length;
  return redis.llen(KEY);
}
