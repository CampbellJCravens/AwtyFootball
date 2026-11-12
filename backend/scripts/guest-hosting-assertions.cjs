/**
 * Assertions for the promised-vs-brought roll-up (services/guestHosting.ts).
 * No database:  node scripts/guest-hosting-assertions.cjs
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const prismaPath = require.resolve('../src/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { __esModule: true, default: {} } };
const assert = require('assert');
const { rollupGuestHosting: roll } = require('../src/services/guestHosting');

const d = s => new Date(`${s}T13:45:00Z`);
const games = [
  { id: 'old', createdAt: d('2026-06-06'), played: true },   // before hosts were recorded
  { id: 'g1', createdAt: d('2026-08-08'), played: true },
  { id: 'g2', createdAt: d('2026-08-15'), played: true },
  { id: 'next', createdAt: d('2026-11-14'), played: false }, // not played yet
];
const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cy' }];
let n = 0;
const eq = (got, want, label) => { assert.deepStrictEqual(got, want, label); n++; };

eq(roll({ games, players, rsvps: [{ gameId: 'g1', playerId: 'a', status: 'yes', guestCount: 2 }], visits: [] }),
  { since: null, games: 0, unhostedVisits: 0, rows: [] }, 'no hosted visit yet = nothing to compare');

const res = roll({
  games, players,
  rsvps: [
    { gameId: 'old', playerId: 'a', status: 'yes', guestCount: 2 },  // outside the window
    { gameId: 'g1', playerId: 'a', status: 'yes', guestCount: 2 },   // brought 1 of 2
    { gameId: 'g2', playerId: 'a', status: 'yes', guestCount: 1 },   // kept
    { gameId: 'g2', playerId: 'b', status: 'maybe', guestCount: 1 }, // a maybe promises nothing
    { gameId: 'next', playerId: 'c', status: 'yes', guestCount: 2 }, // game not played
  ],
  visits: [
    { gameId: 'g1', hostPlayerId: 'a' },
    { gameId: 'g1', hostPlayerId: null },
    { gameId: 'g2', hostPlayerId: 'a' },
    { gameId: 'g2', hostPlayerId: 'c' },  // unannounced
    { gameId: 'g2', hostPlayerId: 'gone' }, // host since deleted
  ],
});
eq(res.since, d('2026-08-08').toISOString(), 'window opens at the first hosted game');
eq(res.games, 2, 'only played games in the window');
eq(res.unhostedVisits, 1, 'unhosted visits are counted, not attributed');
eq(res.rows.map(r => r.name), ['Ann', 'Cy'], 'a maybe and a deleted host produce no row');
eq(res.rows[0], { playerId: 'a', name: 'Ann', promised: 3, brought: 2, gamesPromised: 2, gamesKept: 1, unannounced: 0 }, 'promised vs brought');
eq(res.rows[1], { playerId: 'c', name: 'Cy', promised: 0, brought: 1, gamesPromised: 0, gamesKept: 0, unannounced: 1 }, 'unannounced guest');

console.log(`guest-hosting assertions: ${n} passed`);
