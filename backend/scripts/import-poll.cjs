// Manually import a WhatsApp RSVP poll when the listener isn't capturing it.
// Edit CONFIG below for the week, then:
//
//   cd backend
//   node -r dotenv/config scripts/import-poll.cjs           # dry run (no writes)
//   node -r dotenv/config scripts/import-poll.cjs --apply   # writes + backup
//
// Rows are written with setByUserId = 'whatsapp' so that when the listener is
// re-linked it treats them as poll-sourced and refreshes them (polls.ts
// precedence skips rows set by self/admin, so any other tag would lock it out).
//
// Reversible: the backup json holds every pre-existing row for the game; the
// admin "Reset poll" button clears them all.
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

// Poll for 29Aug — GAME-MORNING read from screenshots on 2026-08-29 06:45 CDT
// (game is 08:45 today), superseding the 08-28 read (12 In / 2 Maybe / 5 Out /
// 1 guest) and the 08-27 mid-week read (9/2/3/0).
// Capture is STILL dead despite Campbell's 2026-08-19 fix: WhatsappPoll still
// holds exactly 2 rows ever (2026-08-07, 2026-07-15), so this week's poll was
// never captured and the votes had nowhere to land -> manual import again.
// This read: 14 In / 2 Maybe / 5 Out, +1 guest (Franco Silva). Deltas vs 08-28:
// +2 In (Adam "Lammy" Lammers 02:58, Jason Arizpe 21:08 Thu), everything else
// unchanged — no retractions, same Out/Maybe lists, same single guest.
const CONFIG = {
  gameId: 'cebee9b4-8ff4-4042-8f32-044946535303', // game #35, 2026-08-29
  // Roster names, reconciled against the poll's display names. All matched the
  // Player table exactly or via a known alias — verified against the roster:
  //   "You" -> Morgan-Sean McCright        "Franco Silva" -> Franco Silva
  //   "Campbell" -> Campbell Cravens       "Robert-san" -> Robert Peresich
  //   "Marcos" -> Marcos Conner            "Junior" -> Junior (literal name)
  //   "Alejandro De la Morena" -> Alejandro de la Molina
  //     ^ NOTE: a separate player named plain "Alejandro" also exists. The
  //       alias mapping is the owner-resolved one; do not re-guess it.
  //   "Adam Lammers" -> Lammy Lammers      "Jason Azirpe" -> Jason Arizpe
  //     ^ NOTE: a separate player "Adam Zebdawi" exists; not the same person.
  yes: [
    'Morgan-Sean McCright', 'Lammy Lammers', 'Jason Arizpe',
    'Alejandro de la Molina', 'Marcos Conner', 'Joseph Garcia',
    'Franco Silva', 'Brian Buhr', 'Rolando Abreu', 'Tommy El-Gawly',
    'Josh Jackson', 'Campbell Cravens', 'Manny Suarez', 'Corey Rasch',
  ],
  maybe: ['David Ramos', 'Robert Peresich'],
  no: [
    'Brian Karrs', 'Junior', 'Milad Moradi', 'Connor Shannon',
    'Siegfried Casar',
  ],
  // Votes WITHDRAWN since a previous import: the row is deleted, not set to
  // 'no'. All 19 voters from the 08-28 read still hold the same position, so
  // nothing to retract this time.
  retracted: [],
  // Guests brought, by roster name. Only counted on a 'yes' row.
  // Franco Silva voted both "In" and the "1 guest" option (same timestamp).
  guests: { 'Franco Silva': 1 },
};

const WHATSAPP_SOURCE = 'whatsapp';
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
  const retracted = CONFIG.retracted || [];
  const wanted = [...CONFIG.yes, ...CONFIG.maybe, ...CONFIG.no, ...retracted];
  const dupes = wanted.filter((n, i) => wanted.indexOf(n) !== i);
  if (dupes.length) throw new Error(`same player in two buckets: ${dupes.join(', ')}`);

  const game = await withRetry(() => prisma.game.findUnique({
    where: { id: CONFIG.gameId },
    select: { id: true, gameNumber: true, createdAt: true },
  }));
  if (!game) throw new Error(`game ${CONFIG.gameId} not found`);

  const players = await withRetry(() => prisma.player.findMany({
    where: { name: { in: wanted } },
    select: { id: true, name: true },
  }));
  const byName = new Map(players.map(p => [p.name, p.id]));
  const missing = wanted.filter(n => !byName.has(n));
  if (missing.length) throw new Error(`not on roster: ${missing.join(', ')}`);

  const rows = [];
  for (const [status, names] of [['yes', CONFIG.yes], ['maybe', CONFIG.maybe], ['no', CONFIG.no]]) {
    for (const name of names) {
      rows.push({
        playerId: byName.get(name),
        name,
        status,
        guestCount: status === 'yes' ? (CONFIG.guests[name] || 0) : 0,
      });
    }
  }

  const existing = await withRetry(() => prisma.gameRsvp.findMany({ where: { gameId: CONFIG.gameId } }));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Game #${game.gameNumber} (${game.createdAt.toISOString().slice(0, 10)})  ${CONFIG.gameId}`);
  console.log(`Existing RSVP rows for this game: ${existing.length}\n`);
  for (const r of rows) {
    const g = r.guestCount ? `  +${r.guestCount} guest` : '';
    const prior = existing.find(e => e.playerId === r.playerId);
    const note = prior ? `  (OVERWRITES ${prior.status}, src=${prior.setByUserId})` : '';
    console.log(`  ${r.status.padEnd(5)}  ${r.name.padEnd(24)}${g}${note}`);
  }
  const drops = retracted
    .map(name => ({ name, prior: existing.find(e => e.playerId === byName.get(name)) }))
    .filter(d => d.prior);
  for (const d of drops) console.log(`  DELETE ${d.name.padEnd(24)}  (was ${d.prior.status}, src=${d.prior.setByUserId})`);
  for (const name of retracted) {
    if (!drops.some(d => d.name === name)) console.log(`  (no row to delete for ${name})`);
  }

  const guestTotal = rows.reduce((s, r) => s + r.guestCount, 0);
  console.log(`\n  ${CONFIG.yes.length} yes · ${CONFIG.maybe.length} maybe · ${CONFIG.no.length} no · ${guestTotal} guest(s) · ${drops.length} deleted`);
  console.log(`  expected turnout: ${CONFIG.yes.length} + ${guestTotal} = ${CONFIG.yes.length + guestTotal}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `import-poll-backup-${ts}.json`;
  fs.writeFileSync(bak, JSON.stringify({ gameId: CONFIG.gameId, existing }, null, 2));
  console.log(`\nBackup of pre-existing rows: backend/${bak}`);

  let written = 0;
  for (const r of rows) {
    await withRetry(() => prisma.gameRsvp.upsert({
      where: { gameId_playerId: { gameId: CONFIG.gameId, playerId: r.playerId } },
      create: {
        gameId: CONFIG.gameId,
        playerId: r.playerId,
        status: r.status,
        guestCount: r.guestCount,
        setByUserId: WHATSAPP_SOURCE,
      },
      update: {
        status: r.status,
        guestCount: r.guestCount,
        setByUserId: WHATSAPP_SOURCE,
      },
    }));
    written++;
  }
  console.log(`Wrote ${written} RSVP row(s).`);

  for (const d of drops) {
    await withRetry(() => prisma.gameRsvp.delete({
      where: { gameId_playerId: { gameId: CONFIG.gameId, playerId: byName.get(d.name) } },
    }));
  }
  if (drops.length) console.log(`Deleted ${drops.length} withdrawn RSVP row(s).`);

  const after = await withRetry(() => prisma.gameRsvp.groupBy({
    by: ['status'],
    where: { gameId: CONFIG.gameId },
    _count: { status: true },
  }));
  console.log('Verify:', after.map(a => `${a.status}=${a._count.status}`).join(' · '));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
