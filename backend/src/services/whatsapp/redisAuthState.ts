/**
 * Redis-backed Baileys auth state.
 *
 * Why this exists: Signal keys rotate constantly, and persisting each one to
 * Postgres kept the Neon compute permanently awake, which exhausted the monthly
 * compute quota and took the whole app down on 2026-07-29. A persistent disk
 * would also fix it, but attaching a disk to a Render service disables
 * zero-downtime deploys. Redis keeps deploys seamless AND keeps the churn off
 * Postgres.
 *
 * Command budget: Upstash's free tier allows 500K commands/month. Everything
 * here is batched so the count stays far below that — a `keys.get` of any size
 * is one MGET, and a `keys.set` of any size is one MSET plus at most one DEL.
 * Observed key churn was ~800 writes/day, so expect low tens of thousands of
 * commands a month.
 *
 * Provider-agnostic: driven by a standard REDIS_URL, so Upstash, Redis Cloud or
 * a self-hosted instance all work.
 *
 * See docs/whatsapp-poll-listener-spec.md.
 */
import { Redis } from 'ioredis';
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import prisma from '../../prisma';

const PREFIX = 'wa:auth:';
const CREDS_KEY = `${PREFIX}creds`;

/**
 * The subset of the Redis API this store uses. Declared so tests can supply an
 * in-memory double — there's no local Redis to run against, and this path holds
 * the WhatsApp session, so it needs to be exercised rather than assumed.
 */
export interface RedisLike {
  exists(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  mset(...args: string[]): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  scan(cursor: string, ...args: any[]): Promise<[string, string[]]>;
}

let client: Redis | null = null;

/** Shared connection. ioredis reconnects on its own, so this is created once. */
function getClient(url: string): Redis {
  if (client) return client;
  client = new Redis(url, {
    // Keep trying rather than throwing on a blip; the listener has its own
    // backoff on top of this.
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
    lazyConnect: false,
  });
  client.on('error', (err) => console.error('[whatsapp] Redis error:', err.message));
  return client;
}

const encode = (value: unknown) => JSON.stringify(value, BufferJSON.replacer);
const decode = (raw: string | null) => (raw ? JSON.parse(raw, BufferJSON.reviver) : null);

/**
 * Seed Redis from the Postgres auth rows the first time we run on this store,
 * so switching over keeps the existing WhatsApp pairing instead of demanding a
 * fresh pairing code. No-ops once creds are present.
 *
 * Throws if Postgres is unreachable and Redis is empty: continuing would hand
 * Baileys a blank slate, silently mint a new session, and force a re-pair.
 */
async function migratePostgresAuthToRedis(redis: RedisLike): Promise<void> {
  if (await redis.exists(CREDS_KEY)) return;

  let rows: Array<{ id: string; value: string }> = [];
  try {
    rows = await prisma.whatsappAuthState.findMany({ select: { id: true, value: true } });
  } catch (err) {
    console.error('[whatsapp] Could not read Postgres auth state to migrate:', err);
    throw new Error(
      'WhatsApp auth migration deferred: the database is unreachable and Redis holds no session. ' +
        'Refusing to start a fresh session that would require re-pairing.'
    );
  }
  if (rows.length === 0) return;

  // Chunked MSET: a handful of commands for thousands of keys.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const pairs: string[] = [];
    for (const row of rows.slice(i, i + CHUNK)) pairs.push(PREFIX + row.id, row.value);
    await redis.mset(...pairs);
  }
  console.log(
    `[whatsapp] Migrated ${rows.length} auth rows from Postgres to Redis. ` +
      `The Postgres rows are left intact as a fallback; delete them once this is proven.`
  );
}

export async function useRedisAuthState(
  url: string,
  injected?: RedisLike
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const redis: RedisLike = injected ?? (getClient(url) as unknown as RedisLike);
  await migratePostgresAuthToRedis(redis);

  const creds: AuthenticationCreds = decode(await redis.get(CREDS_KEY)) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          if (ids.length === 0) return data;
          // One MGET for the whole batch, whatever its size.
          const raw = await redis.mget(...ids.map((id) => `${PREFIX}${type}-${id}`));
          ids.forEach((id, i) => {
            let value = decode(raw[i]);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          });
          return data;
        },
        set: async (data) => {
          const writes: string[] = [];
          const deletes: string[] = [];
          for (const category in data) {
            for (const id in (data as any)[category]) {
              const value = (data as any)[category][id];
              const key = `${PREFIX}${category}-${id}`;
              if (value) writes.push(key, encode(value));
              else deletes.push(key);
            }
          }
          // At most two commands regardless of how many keys changed.
          const tasks: Promise<unknown>[] = [];
          if (writes.length) tasks.push(redis.mset(...writes));
          if (deletes.length) tasks.push(redis.del(...deletes));
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await redis.set(CREDS_KEY, encode(creds));
    },
  };
}

/** Remove every stored auth key, for a forced re-link. */
export async function clearRedisAuthState(url: string, injected?: RedisLike): Promise<void> {
  const redis: RedisLike = injected ?? (getClient(url) as unknown as RedisLike);
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
}
