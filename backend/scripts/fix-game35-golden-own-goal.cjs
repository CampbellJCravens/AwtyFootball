// One-off: record game #35's decider as a GOLDEN GOAL.
//
//   cd backend
//   node -r dotenv/config scripts/fix-game35-golden-own-goal.cjs           # dry run
//   node -r dotenv/config scripts/fix-game35-golden-own-goal.cjs --apply   # writes + backup
//
// Why by hand: the game ran 74:41 of PLAY and the arming gate was 80 minutes,
// so the button never appeared. The gate is now 70 (GameModuleExpanded.tsx),
// which would have opened the window at 15:44:19Z — 3:41 before the goal.
//
// The own goal itself is ALREADY correct on the record: goal #5 carries
// ownGoal:true and team:'white', i.e. credited to the side that benefited
// (Jason Arizpe is on Color). Nothing about the own goal changes here.
//
// What changes is only the golden-goal weighting:
//   - a goldenGoalArmed event, n=1, trailing='white' (Color led 3-2)
//   - goal #5 gains goldenGoal:true and value:2  (n+1 to the trailing side)
// Net effect on the scoreline: 3-3 draw  ->  Color 3 - 4 White.
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

const GAME_ID = 'cebee9b4-8ff4-4042-8f32-044946535303';
// Between the 4th goal (15:34Z) and the decider (15:48Z), and at/after 70 min
// of play (15:44:19Z). Chosen as the last whole minute before the goal.
const ARMED_AT = '2026-08-29T15:47:00.000Z';
const DECIDER_TS = '2026-08-29T15:48:00.000Z';

const APPLY = process.argv.includes('--apply');
const goalValue = g => (typeof g.value === 'number' && g.value > 0 ? g.value : 1);
const scoreFor = (goals, team) =>
  goals.reduce((s, g) => (g.team === team ? s + goalValue(g) : s), 0);

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

(async () => {
  const rows = await withRetry(() => prisma.$queryRaw`
    SELECT id, "gameNumber", goals, "gameEvents" FROM "Game" WHERE id = ${GAME_ID}`);
  const game = rows[0];
  if (!game) throw new Error('game not found');

  const goals = JSON.parse(game.goals || '[]');
  const events = JSON.parse(game.gameEvents || '[]');

  if (events.some(e => e.type === 'goldenGoalArmed')) {
    throw new Error('already armed — refusing to double-apply');
  }
  const idx = goals.findIndex(g => g.timestamp === DECIDER_TS);
  if (idx === -1) throw new Error(`no goal at ${DECIDER_TS}`);
  if (idx !== goals.length - 1) throw new Error('target goal is not the last one');
  const decider = goals[idx];
  if (!decider.ownGoal) throw new Error('expected the decider to be an own goal');

  // n and trailing are frozen from the scoreline BEFORE the decider, exactly as
  // handleArmGoldenGoal would have computed them live.
  const before = goals.slice(0, idx);
  const c = scoreFor(before, 'color');
  const w = scoreFor(before, 'white');
  const n = Math.abs(c - w);
  const trailing = c === w ? null : c < w ? 'color' : 'white';
  const value = decider.team === trailing ? n + 1 : 1;

  const newGoals = goals.map((g, i) => (i === idx ? { ...g, goldenGoal: true, value } : g));
  const newEvents = [...events, { type: 'goldenGoalArmed', timestamp: ARMED_AT, n, trailing }]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Game #${game.gameNumber}  ${GAME_ID}\n`);
  console.log(`  before decider:  Color ${c} - ${w} White   (n=${n}, trailing=${trailing})`);
  console.log(`  decider credited to ${decider.team}, own goal -> worth ${value}`);
  console.log(`  arming event at ${ARMED_AT}`);
  console.log(`\n  scoreline  ${scoreFor(goals, 'color')} - ${scoreFor(goals, 'white')}  ->  ` +
              `${scoreFor(newGoals, 'color')} - ${scoreFor(newGoals, 'white')}`);
  const res = (a, b) => (a === b ? 'draw' : a > b ? 'Color win' : 'White win');
  console.log(`  result     ${res(scoreFor(goals, 'color'), scoreFor(goals, 'white'))}  ->  ` +
              `${res(scoreFor(newGoals, 'color'), scoreFor(newGoals, 'white'))}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `game35-golden-backup-${ts}.json`;
  fs.writeFileSync(bak, JSON.stringify({ gameId: GAME_ID, goals, gameEvents: events }, null, 2));
  console.log(`\nBackup of pre-existing goals + events: backend/${bak}`);

  await withRetry(() => prisma.$executeRaw`
    UPDATE "Game" SET goals = ${JSON.stringify(newGoals)},
                      "gameEvents" = ${JSON.stringify(newEvents)}
    WHERE id = ${GAME_ID}`);

  const after = await withRetry(() => prisma.$queryRaw`
    SELECT goals, "gameEvents" FROM "Game" WHERE id = ${GAME_ID}`);
  const vg = JSON.parse(after[0].goals);
  console.log(`Verify: Color ${scoreFor(vg, 'color')} - ${scoreFor(vg, 'white')} White · ` +
    `armed=${JSON.parse(after[0].gameEvents).some(e => e.type === 'goldenGoalArmed')}`);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
