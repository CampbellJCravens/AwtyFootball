/**
 * Assertions for which roster a game is measured against (services/rosterSize.ts).
 * No database:  node scripts/roster-size-assertions.cjs
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const assert = require('assert');
const { rosterOn, rosterYearFor } = require('../src/services/rosterSize');

const d = s => new Date(`${s}T12:00:00Z`);
const sheet = y => ({ 2025: 56, 2026: 55 }[y] ?? null);
const open2027 = [{ duesYear: 2026, rosterClosedAt: null }, { duesYear: 2027, rosterClosedAt: null }];
const closed2027 = [{ duesYear: 2026, rosterClosedAt: null }, { duesYear: 2027, rosterClosedAt: d('2026-11-12') }];
// 2027: 5 present from the start, 1 joined 1 Nov 2026, 2 left before the close, 1 leaves in March 2027.
const E = (joinedAt, leftAt) => ({ duesYear: 2027, joinedAt: joinedAt && d(joinedAt), leftAt: leftAt && d(leftAt) });
const entries = [E(), E(), E(), E(), E(null, '2027-03-10'), E('2026-11-01'), E(null, '2026-10-19'), E(null, '2026-11-12')];
let n = 0;
const eq = (got, want, label) => { assert.deepStrictEqual(got, want, label); n++; };

eq(rosterOn('2026-11-14', open2027, entries, sheet), { rosterYear: 2026, size: 55 }, 'roster not closed: still the 2026 sheet number');
eq(rosterOn('2026-11-07', closed2027, entries, sheet), { rosterYear: 2026, size: 55 }, 'a game before the close is untouched');
eq(rosterOn('2026-11-12', closed2027, entries, sheet), { rosterYear: 2027, size: 6 }, 'the close day itself counts');
eq(rosterOn('2026-11-14', closed2027, entries, sheet), { rosterYear: 2027, size: 6 }, 'after the close: members on the 2027 roster that day');
eq(rosterOn('2027-01-09', closed2027, entries, sheet), { rosterYear: 2027, size: 6 }, 'the new calendar year uses its own roster');
eq(rosterOn('2027-03-13', closed2027, entries, sheet), { rosterYear: 2027, size: 5 }, 'someone who leaves in March drops out from then on');
eq(rosterOn('2025-06-07', closed2027, entries, sheet), { rosterYear: 2025, size: 56 }, 'years before dues use the sheet');
eq(rosterOn('2024-06-01', closed2027, entries, sheet), { rosterYear: 2024, size: null }, 'no number anywhere = null, never a guess');
eq(rosterYearFor('2026-12-26', closed2027), 2027, 'late December after a close');
eq(rosterYearFor('2026-12-26', []), 2026, 'no configs at all');

console.log(`roster-size assertions: ${n} passed`);
