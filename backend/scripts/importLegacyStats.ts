import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// CSV name → DB name mapping (confirmed by user)
const NAME_MAP: Record<string, string> = {
  'Adam Lammers': 'Lammy Lammers',
  'Brian J. Buhr': 'Brian Buhr',
  'Mohammad abdel-Rahman': 'Mo Abdel-Rahman',
  'Nicholas Mbazeu': 'Nick Mbaezue-Daniel',
  'Nick Mbaezue-Daniel': 'Nick Mbaezue-Daniel',
  'Mofe': 'Mofe Ariyo',
  'Morgan Sean McCright': 'Morgan-Sean McCright',
  'CJ': 'Christopher Conlon',
  'CJ - Christopher Conlon': 'Christopher Conlon',
  'Manny suarez': 'Manny Suarez',
  'Ahmed elgiar': 'Ahmed Elgiar',
};

const SKIP_NAMES = [
  'Guest',
  'Brent - Dads',
  'Dads - Brent',
  'Ore - Dads',
  'Dads - Ore',
];

interface CsvRow {
  [key: string]: string;
}

const CSV_FILES: { file: string; season: string }[] = [
  { file: '../../data/AFC - Roster - 2022-2023 - 7-Oct - End of Season.csv', season: '2022-2023' },
  { file: '../../data/AFC - Roster - 2023-2024 - 27-Apr.csv', season: '2023-2024' },
];

function shouldSkip(name: string): boolean {
  return SKIP_NAMES.some(skip => name.toLowerCase() === skip.toLowerCase());
}

function normalizeName(csvName: string): string {
  const trimmed = csvName.trim();
  if (NAME_MAP[trimmed]) return NAME_MAP[trimmed];
  return trimmed;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== IMPORTING LEGACY STATS ===');

  const allPlayers = await prisma.player.findMany();
  const playerByName = new Map(allPlayers.map(p => [p.name.toLowerCase(), p]));

  let created = 0;
  let upserted = 0;
  let skipped = 0;
  let playersCreated = 0;

  for (const { file, season } of CSV_FILES) {
    const filePath = path.resolve(__dirname, file);
    const csvContent = fs.readFileSync(filePath, 'utf-8');

    const parsed = Papa.parse<CsvRow>(csvContent, { header: true, skipEmptyLines: true });

    console.log(`\n--- ${season} (${path.basename(file)}) ---`);
    console.log(`Rows: ${parsed.data.length}`);

    for (const row of parsed.data) {
      // First column is unnamed - try empty string key or first key
      const rawName = (row[''] || Object.values(row)[0] || '').trim();
      if (!rawName) continue;

      if (shouldSkip(rawName)) {
        console.log(`  SKIP: ${rawName}`);
        skipped++;
        continue;
      }

      const name = normalizeName(rawName);
      const goals = parseInt(row['Goals Total']) || 0;
      const assists = parseInt(row['Assists Total']) || 0;
      const wins = parseInt(row['Wins Total']) || 0;

      if (goals === 0 && assists === 0 && wins === 0) {
        console.log(`  SKIP (all zeros): ${rawName}`);
        skipped++;
        continue;
      }

      // Find or create player
      let player = playerByName.get(name.toLowerCase());

      if (!player) {
        if (DRY_RUN) {
          console.log(`  CREATE PLAYER: "${name}" (from CSV: "${rawName}") → G:${goals} A:${assists} W:${wins}`);
          playersCreated++;
          upserted++;
          continue;
        }
        player = await prisma.player.create({ data: { name } });
        playerByName.set(name.toLowerCase(), player);
        playersCreated++;
        console.log(`  CREATED PLAYER: "${name}" (id: ${player.id})`);
      }

      if (DRY_RUN) {
        console.log(`  UPSERT: ${name} (${season}) → G:${goals} A:${assists} W:${wins}`);
        upserted++;
        continue;
      }

      await prisma.legacyStat.upsert({
        where: { playerId_season: { playerId: player.id, season } },
        update: { goals, assists, wins },
        create: { playerId: player.id, season, goals, assists, wins },
      });
      upserted++;
      console.log(`  UPSERTED: ${name} (${season}) → G:${goals} A:${assists} W:${wins}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Players created: ${playersCreated}`);
  console.log(`Stats upserted: ${upserted}`);
  console.log(`Rows skipped: ${skipped}`);
  if (DRY_RUN) console.log('(No changes made - dry run)');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
