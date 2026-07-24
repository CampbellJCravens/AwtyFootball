// One-off: mark specific players as Former (onRoster=false) so they drop to the
// Prior Members section. RUN AFTER the roster-current-prior branch is deployed
// (the onRoster column must exist in the DB first).
//
//   cd backend
//   node -r dotenv/config scripts/mark-former.cjs           # dry run (no writes)
//   node -r dotenv/config scripts/mark-former.cjs --apply   # writes + backup
//
// Reversible: to undo, set onRoster=true for the same names (or restore the backup json).
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

const NAMES = ['Johnny Reyes', 'Nich Bardio', 'Peter Prentice'];
const APPLY = process.argv.includes('--apply');

// Neon flaps intermittently via PIA — retry until it sticks.
async function withRetry(fn, tries = 6, delayMs = 8000) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries) throw e;
      console.log(`  attempt ${i} failed (${e.message}); retry in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  const players = await withRetry(() => prisma.player.findMany({
    where: { name: { in: NAMES } },
    select: { id: true, name: true, onRoster: true },
  }));

  const foundNames = new Set(players.map(p => p.name));
  const missing = NAMES.filter(n => !foundNames.has(n));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\nMatched:`);
  players.forEach(p => console.log(`  ${p.name} (${p.id})  onRoster ${p.onRoster} -> false`));
  if (missing.length) console.log(`  WARNING not found (check spelling): ${missing.join(', ')}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `mark-former-backup-${ts}.json`;
  fs.writeFileSync(bak, JSON.stringify(players, null, 2));
  console.log(`\nBackup: backend/${bak}`);

  const res = await withRetry(() => prisma.player.updateMany({
    where: { name: { in: NAMES } },
    data: { onRoster: false },
  }));
  console.log(`Updated ${res.count} player(s) -> Former.`);

  const after = await withRetry(() => prisma.player.findMany({
    where: { name: { in: NAMES } },
    select: { name: true, onRoster: true },
  }));
  after.forEach(p => console.log(`  ${p.name}: onRoster=${p.onRoster}`));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
