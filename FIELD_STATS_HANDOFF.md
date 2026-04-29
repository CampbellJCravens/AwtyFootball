# Field Stats — handoff for finishing the feature

This is a context-dump for picking up the Field Stats tab you started in commit
`fc09357` ("Add Field Stats tab sourced from Google Sheets"). Read top to bottom
before changing anything — there are some non-obvious findings.

## TL;DR

The current implementation can't work because:

1. The Google Sheet was never actually published, so `fetch(FIELD_STATS_URL)`
   returned **HTTP 401** for everyone. (Now fixed by publishing.)
2. **Even after publishing, the parser doesn't match the sheet's actual shape**
   — it expects one row per game, but the sheet is a wide pivot with one row
   per *year* and games laid out horizontally.

Recommended path forward: **stop fetching from Google Sheets entirely.** Do a
one-time import of the existing data into a new `FieldStat` table in our DB,
then add a small admin form so new games are recorded in the app going forward.
Retire the sheet (or treat it as a read-only archive).

This mirrors the pattern Campbell used for `LegacyStat` (legacy 2022–2024 player
stats) — see those files as reference.

## What's currently committed

- `frontend/src/components/FieldStatsTab.tsx` — new component, 250 lines
- `frontend/src/components/Stats.tsx` — adds a "Field" tab to the Stats Hub
- `backend/src/routes/stats.ts` — adds a `/api/stats/field-stats` proxy route
  (currently unused; the frontend hits Google directly)

## What goes wrong

`FieldStatsTab.tsx` does:

```ts
const FIELD_STATS_URL =
  'https://docs.google.com/spreadsheets/d/18NqBcjOKXKOxl6OinKBCELvHz_qAUxYrWXalYLo0yvo/pub?gid=1341421447&single=true&output=csv';

const res = await fetch(FIELD_STATS_URL);
// ... parses CSV expecting columns: row[0]=year, row[8]=date, row[9]=played, row[10]=evite, etc.
```

But the actual sheet is a **dashboard layout**, not a normalized table. Each row
is one *year* (2017–2026), with all games for that year strung out horizontally
in 9-column blocks: `[Date, Played?, Evite Response, Evite %, Show up, Show up %, Engagement, Notes, sep]`.

A real row from the published CSV (truncated):

```
"" , 2026 , 1.92% , 0.63% , 0.89% , ... , 2026 , 0 , 0 , 0 , 1 , 0 , ... , N/A , , , 27-Jan , Yes , 17 , 39.53% , 20 , 46.51% , "More showed up, guests?" , , , 26-Jan , Yes , 11 , 25.58% , 13 , 30.23% , ...
```

So `row[0]` is empty, `row[8]` is `"2026"` (a year, not a date), and dates
start around column 21 and repeat every 9 columns. The current parser's
date-format check (`/^\d{1,2}-[A-Za-z]{3}/`) on `row[8]` never matches, so
every row is skipped → empty array → "No data found."

The parser was written against an *imagined* normalized layout. It looks like
the component was never tested live (it couldn't have been — the URL was
returning 401 to anonymous requests until just now).

## Recommended approach

### Step 1 — New `FieldStat` table

Add to `backend/prisma/schema.prisma` (mirror the `LegacyStat` model at line 69):

```prisma
model FieldStat {
  id             String   @id @default(uuid())
  date           DateTime         // actual game date, parsed from "27-Jan" + year row
  year           Int              // for cheap year filtering
  played         String           // "yes" | "alt" | "no" | "weather" | "low numbers" | "school use"
  eviteResponse  Int?             // null when no game (cancelled, etc.)
  responseRate   Float            // stored as decimal, e.g. 0.3953 for 39.53%
  showUp         Int?
  attendanceRate Float
  engagement     String?          // "More showed up, guests?", "Less showed up", "Good", etc.
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([date])               // one record per date
  @@index([year])
}
```

Then `npx prisma migrate dev --name add_field_stats` to create the migration.

### Step 2 — One-shot import script

Create `backend/scripts/importFieldStats.ts` modelled on
`backend/scripts/importLegacyStats.ts`. The CSV data is sitting in Campbell's
local `data/` folder OR can be fetched once from the now-published sheet URL.

The parsing logic needs to:

1. For each row in the CSV:
   - Extract the year from `row[1]` (or `row[8]` — both have it; use whichever is non-empty and a valid year 2015–2030).
   - Walk columns starting at index ~21 in groups of 9: `[date, played, evite, evite%, showUp, showUp%, engagement, notes]`.
   - For each block, if `date` matches `/^\d{1,2}-[A-Za-z]{3}/`, build a `FieldStat` row.
2. Combine the year (from the row) with the date string (`27-Jan`) to make a real `Date`.
3. Insert all rows in a transaction. Use `@@unique([date])` + `skipDuplicates: true` to make the script idempotent.

Run it once against Neon: `npx ts-node scripts/importFieldStats.ts --dry-run`
first to preview, then without the flag to commit.

### Step 3 — Backend endpoint

Replace the proxy route in `backend/src/routes/stats.ts` with a real endpoint
that reads from the DB. Suggested shape:

```
GET /api/stats/field-stats?year=2026
```

Returns the same shape `FieldStatsTab.tsx` already expects after parsing
(`GameRecord[]`), so the frontend changes are minimal.

Look at the existing `/legacy` route in the same file as a template (line 749).

### Step 4 — Update the frontend

In `FieldStatsTab.tsx`, replace the Google Sheets fetch with a call to the
new endpoint. The summary/grouping logic below the fetch (`useMemo` blocks for
availability, rate stats, etc.) can stay roughly as-is — only the data source
changes.

### Step 5 — Admin form for new entries (separate PR is fine)

A small form on an admin-only page that POSTs to `POST /api/stats/field-stats`
(admin-only, mirror the auth check pattern in `backend/src/routes/auth.ts`'s
`/allowed-emails` endpoints). Fields: date, played status, evite response
count, show-up count, engagement, notes. The response/attendance percentages
can be computed server-side from the member count if we want, or stored
directly.

Whoever currently maintains the spreadsheet uses this form instead of editing
the sheet from now on.

## Reference files (mirror these patterns)

| Concept | File |
|---|---|
| Schema model | `backend/prisma/schema.prisma` (`LegacyStat`, line 69) |
| Migration | `backend/prisma/migrations/20260327000000_add_legacy_stats/migration.sql` |
| Import script | `backend/scripts/importLegacyStats.ts` |
| Backend GET route | `backend/src/routes/stats.ts:749` (`/legacy`) |
| Admin auth + POST | `backend/src/routes/auth.ts` (`/allowed-emails` POST/DELETE) |
| Frontend tab | `frontend/src/components/Stats.tsx` (already wired up) |

## Open questions to confirm with Campbell before building

1. **Member count by year** — the percentages in the sheet are computed against
   the membership for that year. Do we want to store member count per year
   somewhere, or just store the raw response/attendance counts and compute
   percentages on read? (Storing raw counts is more flexible.)
2. **Cancellation reasons** — the sheet uses `played` values like `weather`,
   `low numbers`, `school use` to encode why a game didn't happen. Confirm
   whether the admin form should expose those exact options or simplify.
3. **Historical accuracy** — some early years (2017–2019) only have aggregate
   stats in the sheet, not per-game data. Do we import partial-year aggregates,
   or only import years where per-game records exist? Recommend the latter for
   simplicity.

## Local setup notes

- DB is Neon Postgres; `DATABASE_URL` is in `backend/.env`
- Frontend dev server is currently set to port `5174` (vite.config.ts) so it
  doesn't clash with another local project
- Backend runs on port `4000`
- Run both with `npm run dev` from each folder

Ping Campbell with questions — he's been through this codebase a lot and can
unblock you fast.
