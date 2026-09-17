/**
 * Assertions for ensureGuestSlot / slotsForGuestPhones against a stubbed Prisma.
 * No database, no network:  node scripts/guest-slot-assertions.cjs
 *
 * The behaviour that matters is auto-assignment picking the right slot and
 * refusing to evict anyone when the pool is full.
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const prismaPath = require.resolve('../src/prisma');
const state = {};

const db = {
  guestVisit: {
    findFirst: async ({ where }) =>
      state.visits.find(v => v.gameId === where.gameId && v.guestId === where.guestId) || null,
    findMany: async ({ where }) => state.visits.filter(v => v.gameId === where.gameId),
    create: async ({ data }) => {
      if (state.visits.some(v => v.gameId === data.gameId && v.slotPlayerId === data.slotPlayerId)) {
        throw new Error('unique constraint');
      }
      state.visits.push({ ...data });
      state.created.push({ ...data });
      return data;
    },
  },
  player: { findMany: async () => state.players },
  guest: { findMany: async ({ where }) => state.guests.filter(g => where.phone.in.includes(g.phone)) },
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { default: db, __esModule: true } };

const { ensureGuestSlot, slotsForGuestPhones } = require('../src/services/guests');

let pass = 0;
const fail = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail.push(`${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
};

const reset = (visits = []) => {
  state.players = [
    { id: 'm1', name: 'Aaron' },
    { id: 'g10', name: 'Guest10' },
    { id: 'g2', name: 'Guest2' },
    { id: 'g1', name: 'Guest1' },
    { id: 'gx', name: 'Guesto' },
  ];
  state.guests = [
    { id: 'am', phone: '17135551234' },
    { id: 'duke', phone: '17135559999' },
  ];
  state.visits = visits;
  state.created = [];
};

(async () => {
  // 1. she already has a slot in this game: reuse it, create nothing
  reset([{ gameId: 'G', slotPlayerId: 'g2', guestId: 'am' }]);
  check('reuses her existing slot', await ensureGuestSlot('G', 'am'), 'g2');
  check('  and creates nothing', state.created.length, 0);

  // 2. free slot: first by NUMBER, not by string (Guest2 before Guest10)
  reset([{ gameId: 'G', slotPlayerId: 'g1', guestId: 'duke' }]);
  check('claims the next free slot numerically', await ensureGuestSlot('G', 'am'), 'g2');
  check('  and records the visit', state.created, [{ gameId: 'G', slotPlayerId: 'g2', guestId: 'am' }]);

  // 3. "Guesto" is a person, not a slot
  reset([
    { gameId: 'G', slotPlayerId: 'g1', guestId: 'x' },
    { gameId: 'G', slotPlayerId: 'g2', guestId: 'y' },
    { gameId: 'G', slotPlayerId: 'g10', guestId: 'z' },
  ]);
  check('never hands out a non-slot player', await ensureGuestSlot('G', 'am'), null);
  check('  and evicts nobody', state.created.length, 0);

  // 4. another game's visits do not occupy this game's slots
  reset([{ gameId: 'OTHER', slotPlayerId: 'g1', guestId: 'duke' }]);
  check('slots are per game', await ensureGuestSlot('G', 'am'), 'g1');

  // 5. phone map: only numbers that belong to a guest
  reset([]);
  const map = await slotsForGuestPhones('G', ['17135551234', '17130000000']);
  check('maps a guest phone to her slot', [...map.entries()], [['17135551234', 'g1']]);

  reset([]);
  check('no phones, no lookups', [...(await slotsForGuestPhones('G', [])).entries()], []);

  console.log(`${pass} passed, ${fail.length} failed`);
  fail.forEach(f => console.log('  FAIL ' + f));
  process.exit(fail.length ? 1 : 0);
})();
