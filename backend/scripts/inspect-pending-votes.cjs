// Read-only. Lists the Redis buffers holding votes for polls that were never captured.
// Run against PROD Redis:  REDIS_URL='<from Render env>' node scripts/inspect-pending-votes.cjs
const { Redis } = require('ioredis');

const PREFIX = 'wa:pendingvotes:';

const ts = (m) => {
  const t = m?.messageTimestamp;
  const n = typeof t === 'object' && t !== null ? Number(t.low ?? t.seconds ?? 0) : Number(t ?? 0);
  return n ? new Date(n * 1000).toISOString() : '(no timestamp)';
};

(async () => {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('Set REDIS_URL (copy it from the Render dashboard env)');
  const redis = new Redis(url);

  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', PREFIX + '*', 'COUNT', 200);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');

  console.log(`pending-vote buffers: ${keys.length}\n`);

  for (const key of keys.sort()) {
    const pollId = key.slice(PREFIX.length);
    const [len, ttl, raw] = await Promise.all([
      redis.llen(key),
      redis.ttl(key),
      redis.lrange(key, 0, -1),
    ]);

    const msgs = raw.map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    });
    const stamps = msgs.map(ts).filter((s) => s !== '(no timestamp)').sort();
    const voters = new Set(
      msgs.map((m) => m?.key?.participant || m?.participant).filter(Boolean)
    );

    console.log(`poll ${pollId}`);
    console.log(`  votes held : ${len}`);
    console.log(`  expires in : ${(ttl / 86400).toFixed(1)} days`);
    console.log(`  first vote : ${stamps[0] ?? 'n/a'}`);
    console.log(`  last vote  : ${stamps[stamps.length - 1] ?? 'n/a'}`);
    console.log(`  distinct voters: ${voters.size}`);
    for (const v of voters) console.log(`     ${v}`);
    console.log('');
  }

  await redis.quit();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
