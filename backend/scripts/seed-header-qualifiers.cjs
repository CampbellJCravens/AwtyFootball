// Seed historical headers so the two aerial achievements start where the owner
// knows they should (2026-08-29). Goal tagging began the same day, so without
// this every player starts at zero regardless of what they have actually done.
//
//   cd backend
//   node -r dotenv/config scripts/seed-header-qualifiers.cjs           # dry run
//   node -r dotenv/config scripts/seed-header-qualifiers.cjs --apply   # writes + backup
//
// ⚠️ HONEST LIMITATION: the owner supplied the COUNTS ("Campbell has the most
// headers; Morgan-Sean has two"), not which goals they were. Nobody has that
// record. This tags each player's most RECENT goals, on the reasoning that
// recent ones are the ones anyone could still correct from memory. The
// per-goal choice is therefore a placeholder for a true count — re-run with
// GOAL_PICKER changed to move them.
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

// playerName -> how many of their goals to mark as headers.
const CONFIG = {
  'Campbell Cravens': 3,      // unlocks Rise Above + Air Superiority
  'Morgan-Sean McCright': 2,  // unlocks Rise Above, 2/3 toward Air Superiority
};

// Which of a player's goals to tag, given all of them oldest-first.
const GOAL_PICKER = (goals, n) => goals.slice(-n); // the most recent n

const APPLY = process.argv.includes('--apply');

async function withRetry(fn, tries = 8, delayMs = 6000) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries) throw e;
      console.log(`  attempt ${i} failed (${e.message.split('\n')[0]}); retry in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  const names = Object.keys(CONFIG);
  const players = await withRetry(() => prisma.player.findMany({
    where: { name: { in: names } }, select: { id: true, name: true },
  }));
  const missing = names.filter(n => !players.some(p => p.name === n));
  if (missing.length) throw new Error(`not on roster: ${missing.join(', ')}`);

  const games = await withRetry(() => prisma.game.findMany({
    where: { goals: { not: null } },
    select: { id: true, gameNumber: true, createdAt: true, goals: true },
    orderBy: { createdAt: 'asc' },
  }));

  // Flatten every goal, oldest first, so "most recent" is unambiguous.
  const parsed = games.map(g => {
    let goals = [];
    try { goals = JSON.parse(g.goals) || []; } catch { goals = []; }
    return { ...g, parsedGoals: goals };
  });

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const targets = new Set(); // `${gameId}#${goalIndex}`

  for (const player of players) {
    const owned = [];
    for (const g of parsed) {
      g.parsedGoals.forEach((goal, i) => {
        // Own goals are never headers worth celebrating, and they credit the
        // other side anyway — skip them.
        if (goal.scorerId === player.id && !goal.ownGoal) {
          owned.push({ gameId: g.id, gameNumber: g.gameNumber, date: g.createdAt, index: i, goal });
        }
      });
    }
    const want = CONFIG[player.name];
    if (owned.length < want) throw new Error(`${player.name} has only ${owned.length} goals, need ${want}`);
    const picked = GOAL_PICKER(owned, want);
    console.log(`${player.name} — ${owned.length} goals on record, tagging ${want} as headers:`);
    for (const pk of picked) {
      const already = pk.goal.qualifiers?.includes('header');
      console.log(`   game #${String(pk.gameNumber).padStart(2)}  ${pk.date.toISOString().slice(0, 10)}` +
        `  goal ${pk.index}${already ? '  (already a header)' : ''}`);
      if (!already) targets.add(`${pk.gameId}#${pk.index}`);
    }
    console.log('');
  }

  const writes = [];
  for (const g of parsed) {
    let touched = false;
    const next = g.parsedGoals.map((goal, i) => {
      if (!targets.has(`${g.id}#${i}`)) return goal;
      touched = true;
      const qualifiers = Array.from(new Set([...(goal.qualifiers || []), 'header']));
      return { ...goal, qualifiers };
    });
    if (touched) writes.push({ id: g.id, gameNumber: g.gameNumber, before: g.parsedGoals, after: next });
  }

  console.log(`  ${targets.size} goal(s) to tag across ${writes.length} game row(s)`);
  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `header-seed-backup-${ts}.json`;
  fs.writeFileSync(bak, JSON.stringify(writes.map(w => ({ id: w.id, gameNumber: w.gameNumber, goals: w.before })), null, 2));
  console.log(`\nBackup of pre-existing goals: backend/${bak}`);

  for (const w of writes) {
    await withRetry(() => prisma.game.update({ where: { id: w.id }, data: { goals: JSON.stringify(w.after) } }));
  }
  console.log(`Wrote ${writes.length} game row(s).`);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
