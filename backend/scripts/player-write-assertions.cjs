/**
 * Assertions for who may write which Player fields (services/playerWrites.ts).
 * No database, no network:  node scripts/player-write-assertions.cjs
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const assert = require('assert');
const { refusedPlayerFields: refused } = require('../src/services/playerWrites');

const anon = (mode, data, hasPhone) => refused({ isAdmin: false, mode, data, hasPhone });
const admin = (mode, data, hasPhone) => refused({ isAdmin: true, mode, data, hasPhone });
let n = 0;
const eq = (got, want, label) => { assert.deepStrictEqual(got, want, label); n++; };

// "Pick your player → add yourself" sends a name and nothing else.
eq(anon('create', { name: 'New Guy' }), [], 'anyone creates by name');
eq(anon('create', { name: 'New Guy', pictureUrl: undefined, phone: undefined }), [], 'undefined keys are not writes');
eq(anon('create', { name: 'X', isAlumni: true }), ['isAlumni'], 'no self-granted dues exemption on create');
eq(anon('create', { name: 'X', phone: '7135550100' }), ['phone'], 'no phone on anonymous create');
eq(anon('create', { name: 'X', onRoster: true, memberSince: 2020 }), ['onRoster', 'memberSince'], 'roster fields refused');

// Own photo and a first phone are self-service.
eq(anon('update', { pictureUrl: 'data:image/png;base64,AAAA' }), [], 'anyone sets a photo');
eq(anon('update', { phone: '7135550100' }, false), [], 'anyone adds a missing phone');
eq(anon('update', { phone: '7135550100' }, true), ['phone'], 'replacing a phone takes an admin');
eq(anon('update', { phone: null }, true), ['phone'], 'clearing a phone takes an admin');
eq(anon('update', { phone: undefined }, true), [], 'phone not in the request');

// The fields that decide money or standing.
for (const f of ['name', 'team', 'onRoster', 'isAlumni', 'graduationYear', 'memberSince', 'staminaExempt']) {
  eq(anon('update', { [f]: f === 'name' ? 'Renamed' : true }), [f], `${f} refused`);
}
eq(anon('update', { pictureUrl: 'data:image/png;base64,AAAA', isAlumni: true }), ['isAlumni'], 'a mixed request is refused, not half-applied');

// Admins are unrestricted.
eq(admin('create', { name: 'X', isAlumni: true, phone: '1', onRoster: false }), [], 'admin create');
eq(admin('update', { name: 'Y', phone: null, isAlumni: false, memberSince: 2019 }, true), [], 'admin update');

console.log(`player-write assertions: ${n} passed`);
