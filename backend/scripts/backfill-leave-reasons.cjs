// Tag historical departures with the reason they happened, from the owner's
// own knowledge of the group (2026-08-29).
//
//   cd backend
//   node -r dotenv/config scripts/backfill-leave-reasons.cjs           # dry run
//   node -r dotenv/config scripts/backfill-leave-reasons.cjs --apply   # writes + backup
//
// Only 'leave' rows are touched, and only for the players named below. An
// untagged departure still COUNTS toward Lack of Stamina — injured/family/work
// are what clear it, and 'quit' records that somebody actually asked.
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

// playerName -> reason for EVERY leave they have, or a per-gameNumber map.
const CONFIG = {
  // Young kids; he leaves to take care of them. Also worth setting
  // staminaExempt on his player record so future weeks need no tagging.
  // 11 leave rows across 10 games — game #5 holds two, which the rollup
  // already collapses to one departure.
  'Jon Schwarz': 'family',

  'Mike Missouri': 'quit',

  // 2 quit, 2 work, and today's was an injury. The injury is pinned; the
  // other four await the owner saying which two were work.
  'David Ramos': {
    35: 'injured',
    // 3:  'quit' | 'work',
    // 12: 'quit' | 'work',
    // 15: 'quit' | 'work',
    // 17: 'quit' | 'work',
  },
};

const VALID = new Set(['injured', 'family', 'work', 'quit']);
const APPLY = process.argv.includes('--apply');

async function withRetry(fn, tries = 6, delayMs = 8000) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries) throw e;
      console.log(`  attempt ${i} failed (${e.message.split('\n')[0]}); retry in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

const reasonFor = (rule, gameNumber) =>
  typeof rule === 'string' ? rule : (rule ?? {})[gameNumber];

(async () => {
  for (const [name, rule] of Object.entries(CONFIG)) {
    const values = typeof rule === 'string' ? [rule] : Object.values(rule);
    for (const v of values) if (!VALID.has(v)) throw new Error(`${name}: bad reason "${v}"`);
  }

  const names = Object.keys(CONFIG);
  const players = await withRetry(() => prisma.player.findMany({
    where: { name: { in: names } }, select: { id: true, name: true },
  }));
  const missing = names.filter(n => !players.some(p => p.name === n));
  if (missing.length) throw new Error(`not on roster: ${missing.join(', ')}`);
  const nameById = new Map(players.map(p => [p.id, p.name]));

  const games = await withRetry(() => prisma.game.findMany({
    where: { teamChanges: { not: null } },
    select: { id: true, gameNumber: true, createdAt: true, teamChanges: true },
    orderBy: { createdAt: 'asc' },
  }));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const writes = [];
  let tagged = 0, skipped = 0, already = 0;

  for (const g of games) {
    let changes;
    try { changes = JSON.parse(g.teamChanges) || []; } catch { continue; }
    let touched = false;
    const next = changes.map(c => {
      if (c.type !== 'leave') return c;
      const name = nameById.get(c.playerId);
      if (!name) return c;
      const reason = reasonFor(CONFIG[name], g.gameNumber);
      if (!reason) {
        console.log(`  --     #${String(g.gameNumber).padStart(2)} ${name.padEnd(16)} left untagged (no rule)`);
        skipped++;
        return c;
      }
      if (c.reason === reason) { already++; return c; }
      console.log(`  tag    #${String(g.gameNumber).padStart(2)} ${name.padEnd(16)} -> ${reason}`);
      tagged++;
      touched = true;
      return { ...c, reason };
    });
    if (touched) writes.push({ id: g.id, gameNumber: g.gameNumber, before: changes, after: next });
  }

  console.log(`\n  ${tagged} to tag · ${already} already correct · ${skipped} left untagged (still count)`);
  console.log(`  ${writes.length} game row(s) would be written`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `leave-reasons-backup-${ts}.json`;
  fs.writeFileSync(bak, JSON.stringify(writes.map(w => ({ id: w.id, gameNumber: w.gameNumber, teamChanges: w.before })), null, 2));
  console.log(`\nBackup of pre-existing teamChanges: backend/${bak}`);

  for (const w of writes) {
    await withRetry(() => prisma.game.update({
      where: { id: w.id }, data: { teamChanges: JSON.stringify(w.after) },
    }));
  }
  console.log(`Wrote ${writes.length} game row(s).`);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
