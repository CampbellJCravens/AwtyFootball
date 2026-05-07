import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

const FIELD_STATS_URL =
  'https://docs.google.com/spreadsheets/d/18NqBcjOKXKOxl6OinKBCELvHz_qAUxYrWXalYLo0yvo/pub?gid=1341421447&single=true&output=csv';

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,  Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function isDateLike(val: string): boolean {
  return /^\d{1,2}-[A-Za-z]{3}/.test((val || '').trim());
}

function parseDate(dateStr: string, year: number): Date | null {
  const m = dateStr.trim().match(/^(\d{1,2})-([A-Za-z]{3})/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const monthIdx = MONTH_INDEX[m[2]];
  if (monthIdx === undefined) return null;
  return new Date(Date.UTC(year, monthIdx, day));
}

function parsePercent(val: string): number {
  return parseFloat((val || '').replace('%', '').trim()) / 100 || 0;
}

function normalizePlayedStatus(val: string): string {
  return (val || '').trim().toLowerCase();
}

interface FieldStatInput {
  date: Date;
  year: number;
  played: string;
  eviteResponse: number | null;
  responseRate: number;
  showUp: number | null;
  attendanceRate: number;
  engagement: string | null;
  notes: string | null;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== IMPORTING FIELD STATS ===');

  const res = await fetch(FIELD_STATS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sheet`);
  const csv = await res.text();

  const { data } = Papa.parse<string[]>(csv, { skipEmptyLines: false });
  const records: FieldStatInput[] = [];

  for (const row of data as string[][]) {
    // Year is in column 1 (or fall back to column 8)
    const yearRaw = (row[1] || row[8] || '').trim();
    const year = parseInt(yearRaw);
    if (!year || year < 2015 || year > 2030) continue;

    // Scan entire row for date-like cells; each starts a 9-col game block
    for (let i = 0; i < row.length - 7; i++) {
      if (!isDateLike(row[i])) continue;

      const date = parseDate(row[i], year);
      if (!date) continue;

      const played    = normalizePlayedStatus(row[i + 1]);
      const eviteResp = row[i + 2]?.trim() ? parseInt(row[i + 2]) : null;
      const respRate  = parsePercent(row[i + 3]);
      const showUp    = row[i + 4]?.trim() ? parseInt(row[i + 4]) : null;
      const attRate   = parsePercent(row[i + 5]);
      const engagement = (row[i + 6] || '').trim() || null;
      const notes      = (row[i + 7] || '').trim() || null;

      records.push({
        date,
        year,
        played,
        eviteResponse: isNaN(eviteResp as number) ? null : eviteResp,
        responseRate: respRate,
        showUp: isNaN(showUp as number) ? null : showUp,
        attendanceRate: attRate,
        engagement,
        notes,
      });

      // Skip past this block so we don't re-scan inside it
      i += 8;
    }
  }

  console.log(`\nParsed ${records.length} game records`);

  if (DRY_RUN) {
    for (const r of records) {
      console.log(`  ${r.year} ${r.date.toISOString().slice(0, 10)} | ${r.played} | evite:${r.eviteResponse} resp:${(r.responseRate * 100).toFixed(1)}% showUp:${r.showUp} att:${(r.attendanceRate * 100).toFixed(1)}%`);
    }
    console.log('\n(No changes made - dry run)');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(
    records.map(r =>
      prisma.fieldStat.upsert({
        where: { date: r.date },
        update: {
          year: r.year,
          played: r.played,
          eviteResponse: r.eviteResponse,
          responseRate: r.responseRate,
          showUp: r.showUp,
          attendanceRate: r.attendanceRate,
          engagement: r.engagement,
          notes: r.notes,
        },
        create: r,
      })
    )
  );

  console.log(`Upserted ${result.length} records`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
