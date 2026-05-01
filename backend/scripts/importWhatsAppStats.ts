/**
 * Imports WhatsApp RSVP poll data from AFC screenshots (Oct 2025 – Jan 2026)
 * into the FieldStat table, merging with any existing records for those dates.
 *
 * Usage:
 *   npx ts-node scripts/importWhatsAppStats.ts [--dry-run]
 *
 * Notes:
 *   - showUp  = waIn + waPlus1*2 + waPlus2*3  (actual bodies expected at field)
 *   - eviteResponse = all who voted (In + Out + Maybe + +1 + +2)
 *   - Rates use GROUP_SIZE as denominator — adjust to match actual group membership
 *   - Upserts by date, so safe to re-run
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// Adjust to the actual WhatsApp group member count for the relevant period.
// Oct–Jan data showed max 31 respondents (Dec 13); 28 is a conservative estimate.
const GROUP_SIZE = 28;

interface RsvpGame {
  date: Date;
  year: number;
  location: 'stadium' | 'grass' | 'turf';
  waIn: number;
  waPlus1: number;
  waPlus2: number;
  waMaybe: number;
  waOut: number;
  extraNote?: string;
}

// All games extracted from WhatsApp screenshots (screenshots taken 2026-04-28)
const GAMES: RsvpGame[] = [
  // Poll: "8:45AM Awty Soccer" — no location specified → stadium
  { date: new Date(Date.UTC(2025, 9, 4)),  year: 2025, location: 'stadium', waIn: 10, waPlus1: 3, waPlus2: 0, waMaybe: 3,  waOut: 7  },
  // Poll: "Soccer 845 on 11-Oct"
  { date: new Date(Date.UTC(2025, 9, 11)), year: 2025, location: 'stadium', waIn: 15, waPlus1: 2, waPlus2: 0, waMaybe: 4,  waOut: 8  },
  // Poll: "Soccer Saturday - 18-Oct - Awty (grass field) 845 AM"
  { date: new Date(Date.UTC(2025, 9, 18)), year: 2025, location: 'grass',   waIn: 11, waPlus1: 2, waPlus2: 0, waMaybe: 1,  waOut: 10 },
  // Poll: "Soccer Saturday - 25-Oct - Awty Stadium - 845AM"
  { date: new Date(Date.UTC(2025, 9, 25)), year: 2025, location: 'stadium', waIn: 10, waPlus1: 1, waPlus2: 0, waMaybe: 2,  waOut: 15 },
  // Poll: "Soccer Saturday - 1-Nov - Awty Stadium - 845AM"
  { date: new Date(Date.UTC(2025, 10, 1)), year: 2025, location: 'stadium', waIn: 11, waPlus1: 0, waPlus2: 0, waMaybe: 5,  waOut: 10 },
  // Poll: "Soccer Saturday - 8-Nov - 845AM - Awty Stadium" (extra option: 3 still owe dues)
  { date: new Date(Date.UTC(2025, 10, 8)), year: 2025, location: 'stadium', waIn: 7,  waPlus1: 1, waPlus2: 0, waMaybe: 2,  waOut: 14, extraNote: '3 still owe dues' },
  // Poll: "Soccer Saturday - 15-Nov - 845AM - Awty Grass Field"
  { date: new Date(Date.UTC(2025, 10, 15)),year: 2025, location: 'grass',   waIn: 9,  waPlus1: 1, waPlus2: 0, waMaybe: 5,  waOut: 12 },
  // Poll: "Soccer Saturday November 22 8:45am at awty turf" (chat correction: stadium)
  { date: new Date(Date.UTC(2025, 10, 22)),year: 2025, location: 'stadium', waIn: 5,  waPlus1: 0, waPlus2: 0, waMaybe: 2,  waOut: 19, extraNote: 'poll said turf; chat correction said stadium' },
  // Poll: "Soccer Saturday 11/29 8:45am awty stadium"
  { date: new Date(Date.UTC(2025, 10, 29)),year: 2025, location: 'stadium', waIn: 11, waPlus1: 2, waPlus2: 1, waMaybe: 1,  waOut: 10 },
  // Poll: "Soccer Saturday - 6-Dec - 845AM - Awty Stadium"
  { date: new Date(Date.UTC(2025, 11, 6)), year: 2025, location: 'stadium', waIn: 12, waPlus1: 2, waPlus2: 0, waMaybe: 4,  waOut: 9  },
  // Poll: "Soccer Saturday - 13-Dec - 845AM - Awty Stadium"
  { date: new Date(Date.UTC(2025, 11, 13)),year: 2025, location: 'stadium', waIn: 17, waPlus1: 3, waPlus2: 1, waMaybe: 5,  waOut: 5  },
  // Poll: "Soccer Saturday - 20Dec - 845AM - Awty Stadium"
  { date: new Date(Date.UTC(2025, 11, 20)),year: 2025, location: 'stadium', waIn: 14, waPlus1: 1, waPlus2: 0, waMaybe: 3,  waOut: 8  },
  // Poll: "Soccer Saturday - 27Dec - 845AM - Awty Stadium"
  { date: new Date(Date.UTC(2025, 11, 27)),year: 2025, location: 'stadium', waIn: 11, waPlus1: 0, waPlus2: 1, waMaybe: 1,  waOut: 11 },
  // Poll: "Soccer Saturday - 3-Jan - 845 - Awty Stadium"
  { date: new Date(Date.UTC(2026, 0, 3)),  year: 2026, location: 'stadium', waIn: 12, waPlus1: 0, waPlus2: 2, waMaybe: 5,  waOut: 9  },
  // Poll: "Soccer Saturday - 10Jan - 845 - Awty Stadium"
  { date: new Date(Date.UTC(2026, 0, 10)), year: 2026, location: 'stadium', waIn: 15, waPlus1: 1, waPlus2: 0, waMaybe: 2,  waOut: 6  },
  // Poll: "Soccer Saturday - 17Jan - 845AM - Awty Stadium"
  { date: new Date(Date.UTC(2026, 0, 17)), year: 2026, location: 'stadium', waIn: 23, waPlus1: 1, waPlus2: 0, waMaybe: 1,  waOut: 2  },
];

function computeStats(g: RsvpGame) {
  // Bodies showing up: each In = 1, each +1 voter = 2 bodies, each +2 voter = 3 bodies
  const showUp = g.waIn + g.waPlus1 * 2 + g.waPlus2 * 3;
  // All who responded to the poll (any option)
  const eviteResponse = g.waIn + g.waPlus1 + g.waPlus2 + g.waMaybe + g.waOut;
  const responseRate  = eviteResponse / GROUP_SIZE;
  const attendanceRate = showUp / GROUP_SIZE;

  const noteParts = [`WhatsApp: In=${g.waIn} +1=${g.waPlus1} +2=${g.waPlus2} Maybe=${g.waMaybe} Out=${g.waOut}`];
  if (g.extraNote) noteParts.push(g.extraNote);

  return { showUp, eviteResponse, responseRate, attendanceRate, notes: noteParts.join(' | ') };
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== IMPORTING WHATSAPP FIELD STATS ===');
  console.log(`Group size for rate calculation: ${GROUP_SIZE}\n`);

  const upserts = GAMES.map(g => {
    const { showUp, eviteResponse, responseRate, attendanceRate, notes } = computeStats(g);

    if (DRY_RUN) {
      console.log(
        `${g.date.toISOString().slice(0, 10)} | ${g.location.padEnd(7)} | ` +
        `In:${String(g.waIn).padStart(2)} +1:${g.waPlus1} +2:${g.waPlus2} ` +
        `Maybe:${g.waMaybe} Out:${String(g.waOut).padStart(2)} | ` +
        `resp:${eviteResponse}/${GROUP_SIZE}=${(responseRate*100).toFixed(0)}% ` +
        `showUp:${showUp} att:${(attendanceRate*100).toFixed(0)}%`
      );
    }

    return prisma.fieldStat.upsert({
      where: { date: g.date },
      create: {
        date:           g.date,
        year:           g.year,
        played:         'yes',
        eviteResponse,
        responseRate,
        showUp,
        attendanceRate,
        engagement:     g.location,
        notes,
        location:       g.location,
        waIn:           g.waIn,
        waPlus1:        g.waPlus1,
        waPlus2:        g.waPlus2,
        waMaybe:        g.waMaybe,
        waOut:          g.waOut,
        groupSize:      GROUP_SIZE,
      },
      update: {
        // Update WhatsApp-derived fields; preserve played/engagement if already set
        eviteResponse,
        responseRate,
        showUp,
        attendanceRate,
        notes,
        location:       g.location,
        waIn:           g.waIn,
        waPlus1:        g.waPlus1,
        waPlus2:        g.waPlus2,
        waMaybe:        g.waMaybe,
        waOut:          g.waOut,
        groupSize:      GROUP_SIZE,
      },
    });
  });

  if (DRY_RUN) {
    console.log('\n(No changes made — dry run)');
    await prisma.$disconnect();
    return;
  }

  const results = await prisma.$transaction(upserts);
  console.log(`Upserted ${results.length} FieldStat records`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
