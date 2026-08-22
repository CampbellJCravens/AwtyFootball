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

// Poll for 22Aug, final pre-game read from screenshots on 2026-08-22 10:58 CDT.
// The poll creation message was dropped before the 08-19 fixes deployed
// (Campbell's 656faa3 landed 08:26, ~2h after the poll went up), so no
// WhatsappPoll row exists and the votes never had anywhere to land — hence
// three rounds of manual import for this one game.
// Final: 11 In / 3 Maybe / 5 Out, guests confirmed zero (+1 and +2 both empty).
// Deltas vs the 08-21 09:08 read: Campbell Cravens in -> maybe, Siegfried Casar
// out -> in, Lammy Lammers + Eric Saito new in, Nick Mbaezue-Daniel + Joseph
// Garcia new out, and Bayo Tojuola WITHDREW (see `retracted`).
const CONFIG = {
  gameId: 'a86657df-e3ae-48aa-9069-cce374052ec7', // game #34, 2026-08-22
  // Roster names, reconciled against the poll's display names. All matched the
  // Player table exactly or via a known alias — none ambiguous this week:
  //   "You" -> Morgan-Sean McCright        "Marcos" -> Marcos Conner
  //   "Franco" -> Franco Silva             "Robert-san" -> Robert Peresich
  //   "Adam Lammers" -> Lammy Lammers      "Jason Azirpe" -> Jason Arizpe
  //   "Nicholas Mbaezue-Daniel" -> Nick Mbaezue-Daniel
  //   "Campbell" -> Campbell Cravens (Eric Saito is a separate player, and he
  //      is In this week, so both names appear)
  yes: [
    'Morgan-Sean McCright', 'Lammy Lammers', 'Siegfried Casar', 'Eric Saito',
    'Milad Moradi', 'Manny Suarez', 'Marcos Conner', 'Josh Jackson',
    'Franco Silva', 'Connor Shannon', 'Rolando Abreu',
  ],
  maybe: ['Campbell Cravens', 'Jason Arizpe', 'Robert Peresich'],
  no: [
    'Nick Mbaezue-Daniel', 'Joseph Garcia', 'Tommy El-Gawly', 'Adam Zebdawi',
    'Corey Rasch',
  ],
  // Votes WITHDRAWN since a previous import: the row is deleted, not set to
  // 'no'. Bayo Tojuola (the raw 954 number, unnamed because he isn't in the
  // linked account's contacts) was In on 08-19 and 08-21 and appears in no
  // section at all today. Leaving the stale 'yes' row would score him as a
  // no-show; deleting it returns him to the silent majority, which is what
  // the poll now says.
  retracted: ['Bayo Tojuola'],
  // Guests brought, by roster name. Only counted on a 'yes' row.
  // +1 and +2 both read 0 votes this time, so zero is confirmed, not assumed.
  guests: {},
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
