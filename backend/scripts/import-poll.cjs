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

// Poll for 5Sep (game #36) — GAME-MORNING read from screenshots on 2026-09-05
// 06:25 CDT (kickoff 08:45), superseding the 09-02 mid-week read
// (11 In / 3 Maybe / 6 No / 2 guests).
// Poll screenshot totals: In 14 · Out 7 · Maybe 2 · +1 0 · +2 0.
// This import writes 13 of the 14 In: "Amelia Hebert" has NO Player row and no
// alias — held out pending the owner, so the app will read 13 In until she is
// resolved. Everything else reconciles.
// Deltas vs the 09-02 read:
//   -> yes:  Siegfried Casar (was no), Corey Rasch (was maybe), Junior (was no)
//   -> yes:  Eric Saito, Bayo Tojuola (new voters)
//   -> no:   Campbell Cravens, Tommy El-Gawly, Rolando Abreu (all were yes)
//   -> no:   Marcos Conner (was maybe); Husam Ali, Alejandro (new voters)
//   -> maybe: David Ramos (new voter)
//   -> guests: Josh Jackson's +2 is GONE (+1/+2 both show 0 votes) -> 0 guests
//   -> retracted: Brian Karrs, Jason Arizpe, Jon Schwarz were 'no' on 09-02 and
//      are absent from a COMPLETE 7-name Out section today, so their rows are
//      deleted rather than left as stale 'no' (a withdrawn vote is not a no).
const CONFIG = {
  // Game #36 was DELETED and RECREATED in the app on 2026-09-05 (old id
  // 959267cd-dff5-4905-9445-eab7f99ad12a, gone). GameRsvp cascades on gameId,
  // so the 22 rows imported that morning went with it. This is the re-import
  // against the replacement row — same date (13:45Z), same read.
  gameId: '149a457a-bc3e-4cbe-ab34-8cd4b2d24576', // game #36, 2026-09-05
  // Roster names, reconciled against the poll's display names. All matched the
  // Player table exactly or via a known alias — verified against the roster:
  //   "You" -> Morgan-Sean McCright        "Franco Silva" -> Franco Silva
  //   "Campbell" -> Campbell Cravens       "Robert-san" -> Robert Peresich
  //   "Marcos" -> Marcos Conner            "Junior" -> Junior (literal name)
  //   "~ Bayo Tojuola" -> Bayo Tojuola     "~ Husam Ali" -> Husam Ali
  //     ^ both confirmed by the phone number shown beside the poll name.
  //   "Alejandro De la Morena" -> Alejandro de la Molina
  //     ^ NOTE: a separate player named plain "Alejandro" also exists. The
  //       alias mapping is the owner-resolved one; do not re-guess it.
  //   "Adam Lammers" -> Lammy Lammers
  //     ^ NOTE: a separate player "Adam Zebdawi" exists; not the same person.
  //   "Eric Saito" -> Eric Saito (SEPARATE person from Campbell Cravens, who
  //       also shows as "Campbell Saito" in some poll reads).
  yes: [
    'Morgan-Sean McCright', 'Lammy Lammers', 'Siegfried Casar', 'Corey Rasch',
    'Eric Saito', 'Brian Buhr', 'Junior', 'Milad Moradi', 'Joseph Garcia',
    'Josh Jackson', 'Bayo Tojuola', 'Manny Suarez', 'Franco Silva',
  ],
  maybe: ['David Ramos', 'Robert Peresich'],
  no: [
    'Campbell Cravens', 'Connor Shannon', 'Husam Ali', 'Marcos Conner',
    'Alejandro de la Molina', 'Tommy El-Gawly', 'Rolando Abreu',
  ],
  // Votes WITHDRAWN since a previous import: the row is deleted, not set to
  // 'no'. These three held 'no' on 09-02 and are gone from today's Out list.
  retracted: ['Brian Karrs', 'Jason Arizpe', 'Jon Schwarz'],
  // Guests brought, by roster name. Only counted on a 'yes' row.
  // Nobody voted +1 or +2 this week (Josh Jackson's +2 was withdrawn).
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
