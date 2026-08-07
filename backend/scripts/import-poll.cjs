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

// Poll "Soccer Saturday - 1Aug", posted Wed 2026-07-29, read from screenshots
// on 2026-07-31. The listener never captured it (pollCreationMessageV4/V5 fix
// still undeployed, and Neon was suspended from 07-29), so this is a manual
// reconstruction of 11 In / 4 Maybe / 4 Out / one +2.
const CONFIG = {
  gameId: '23b36af8-0b75-4b48-8ab0-def7ec14f603', // game #31, 2026-08-01
  // Roster names, already reconciled against the poll's display names.
  // Poll label -> roster name, where they differ:
  //   "You" -> Campbell Cravens          "~Jason.A" -> Jason Arizpe
  //   "~Joshua" (303 895-7146) -> Josh Jackson   NOT Joshua Tapia
  //   "~J" (832 659-3930) -> Joseph Garcia
  //   "~Milad" -> Milad Moradi           "Morgan McCright" -> Morgan-Sean McCright
  //   "Franco" -> Franco Silva           "~Handsome Corey" -> Corey Rasch
  //   "~Robert" -> Robert Peresich       "~Nelson junior" -> Junior
  yes: [
    'Campbell Cravens', 'Jason Arizpe', 'Josh Jackson', 'Rolando Abreu',
    'Brian Buhr', 'Joseph Garcia', 'Manny Suarez', 'Tommy El-Gawly',
    'Franco Silva', 'Milad Moradi', 'Morgan-Sean McCright',
    'Lammy Lammers', // voted In at 9:11 PM on 07-31, after the first screenshot
  ],
  // Rolando Abreu picked BOTH In and Maybe (multi-select poll, same timestamp).
  // Counted as In, matching combineSelections() in options.ts: any In wins.
  maybe: ['Marcos Conner', 'Corey Rasch', 'Robert Peresich'],
  // "~Jon" +1 (872) 222-9972 = Jon Schwarz, matched on Player.phone.
  no: ['Siegfried Casar', 'Connor Shannon', 'Junior', 'Jon Schwarz'],
  // Guests brought, by roster name. Only counted on a 'yes' row.
  guests: { 'Josh Jackson': 2 },
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
  const wanted = [...CONFIG.yes, ...CONFIG.maybe, ...CONFIG.no];
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
  const guestTotal = rows.reduce((s, r) => s + r.guestCount, 0);
  console.log(`\n  ${CONFIG.yes.length} yes · ${CONFIG.maybe.length} maybe · ${CONFIG.no.length} no · ${guestTotal} guest(s)`);
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

  const after = await withRetry(() => prisma.gameRsvp.groupBy({
    by: ['status'],
    where: { gameId: CONFIG.gameId },
    _count: { status: true },
  }));
  console.log('Verify:', after.map(a => `${a.status}=${a._count.status}`).join(' · '));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
