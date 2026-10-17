/**
 * Assertions for the guest ledger's promotion rules, against a stubbed Prisma.
 * No database, no network:  node scripts/guest-promotion-assertions.cjs
 *
 * The rules that cost money if they are wrong:
 *  · joining clears the guest balance for EVERY dues year (owner 2026-10-17),
 *  · a guest who has not joined still bills beyond the annual free trial.
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const prismaPath = require.resolve('../src/prisma');
const state = {};

const db = {
  guestVisit: { findMany: async () => state.visits },
  game: { findMany: async () => state.games },
  guest: { findMany: async () => state.guests.filter(g => g.promotedPlayerId) },
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { default: db, __esModule: true } };

const { computeGuestLedger, FREE_TRIAL_VISITS } = require('../src/services/guests');

let pass = 0;
const fail = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail.push(`${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
};

/** n games for one guest in a given year. */
const games = (year, n, prefix) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${year}-${i}`, createdAt: new Date(`${year}-06-0${(i % 9) + 1}`) }));

const setup = ({ perYear, promotedYear }) => {
  state.games = [];
  state.visits = [];
  for (const [year, n] of Object.entries(perYear)) {
    for (const g of games(year, n, 'a')) {
      state.games.push(g);
      state.visits.push({ gameId: g.id, guestId: 'am', hostPlayerId: null, guest: { name: 'Amelia' } });
    }
  }
  state.guests = [{ id: 'am', promotedPlayerId: promotedYear ? 'p1' : null, promotedYear: promotedYear ?? null }];
};

const billable = async () => (await computeGuestLedger()).find(r => r.guestId === 'am').billableVisits;

(async () => {
  check('free trial is 2 a year', FREE_TRIAL_VISITS, 2);

  // still a guest: 5 games in one year = 3 billable
  setup({ perYear: { 2026: 5 } });
  check('unpromoted guest bills beyond the trial', await billable(), 3);

  // joined in 2026: that year stops billing entirely
  setup({ perYear: { 2026: 5 }, promotedYear: 2026 });
  check('joining stops the meter for that year', await billable(), 0);

  // joining clears earlier years too
  setup({ perYear: { 2025: 6, 2026: 5 }, promotedYear: 2026 });
  check("last year's debt is cleared by joining", await billable(), 0);

  // converting in October joins NEXT year; this year's guest games are cleared too
  setup({ perYear: { 2026: 3 }, promotedYear: 2027 });
  check('joining next year clears this year', await billable(), 0);

  // the trial is per year for a guest who has not joined
  setup({ perYear: { 2024: 2, 2025: 3, 2026: 9 } });
  check('trial applies per year while still a guest', await billable(), 8); // 0 + 1 + 7

  // a year AFTER she joined never bills either
  setup({ perYear: { 2026: 1, 2027: 8 }, promotedYear: 2026 });
  check('years after joining never bill', await billable(), 0);

  // the promotion is reported so the UI can stop showing "convert"
  setup({ perYear: { 2026: 5 }, promotedYear: 2026 });
  const row = (await computeGuestLedger()).find(r => r.guestId === 'am');
  check('ledger reports the promotion', [row.promotedPlayerId, row.promotedYear], ['p1', 2026]);

  setup({ perYear: { 2026: 5 } });
  const still = (await computeGuestLedger()).find(r => r.guestId === 'am');
  check('a plain guest reports none', [still.promotedPlayerId, still.promotedYear], [null, null]);

  console.log(`${pass} passed, ${fail.length} failed`);
  fail.forEach(f => console.log('  FAIL ' + f));
  process.exit(fail.length ? 1 : 0);
})();
