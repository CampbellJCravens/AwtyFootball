# PRD — Hardening pass + features the data now supports

Status: DRAFT, awaiting sign-off. Owner: Morgan-Sean. Drafted 2026-11-12 from a read-only review (code + public endpoints + two read-only counts on prod).

## Problem
1. **Player writes need no login.** `POST /api/players` and `PATCH /api/players/:id` (`backend/src/routes/players.ts:76`, `:170`) accept any caller, and ids are public from `GET /api/players`. Writable fields include `isAlumni` (the dues exemption), `phone` (decides whose WhatsApp votes count; changing it clears that player's RSVP claims), `onRoster`, `memberSince`, `name`, `staminaExempt` and a photo of up to 10 MB. This was a deliberate open-access choice, made before dues and WhatsApp attribution depended on those fields. The create route also logs every request body.
2. **Every backend build runs `prisma db push --accept-data-loss`** against `DATABASE_URL`. A renamed or removed column drops prod data without a prompt. Two people push to `main`.
3. **No backup the owner controls.** The game #37 wipe (2026-09-12) was restored through Campbell's Neon access.
4. **Static assets are uncached** (`max-age=0, s-maxage=300`, checked 2026-11-12). `render.yaml` holds the fix but was never applied.
5. **No tests, no CI.** `GameModuleExpanded.tsx` (2,324 lines) has produced two data-loss bugs.
6. Backend `npm audit`: 12 issues in production dependencies (1 critical, 4 high).
7. Three features were parked waiting for data that now exists (see cut I, J).

## What must NOT change
The app's identity model is anonymous: a member picks their player on their device ("Pick your player", stored locally) with no sign-in, then RSVPs, uploads their own photo and adds their own phone. Those flows stay login-free. RSVP create/clear stays public (identity = `playerId`), as designed.

## Success criteria
1. An unauthenticated request can no longer change `name`, `team`, `onRoster`, `isAlumni`, `graduationYear`, `memberSince`, `staminaExempt`, or replace/clear an existing `phone`. Each returns 403 and changes nothing.
2. An unauthenticated request can still: create a player with a name only; set a photo; set a phone on a player that has none. An admin can still do everything.
3. A schema change that would drop data makes the build fail with a readable error.
4. A full JSON export of every table lands on the NUC weekly and the hub flags it if it stops.
5. `/assets/*` is served `immutable`; a repeat visit pulls no JS/CSS from origin.
6. A pull request that breaks `tsc` in either package shows a red check.
7. No regression: game scoring, autosave, RSVP, dues, WhatsApp capture.

## Scope

### A. Lock player writes by field (backend)
- One pure function `allowedPlayerWrite(actor, existing, patch)` → the permitted subset, or a refusal naming the field. Tested.
- **Admin:** every field.
- **Anyone else (anonymous or signed-in non-admin):**
  - PATCH: `pictureUrl`; `phone` only when the player currently has none.
  - POST: `name` only (the "Pick your player → add yourself" path).
- Any other field in the body → 403 `admin_required`, nothing written (not silently dropped: a silent drop reads as a save that worked).
- Rate limits via `express-rate-limit` (`trust proxy` is already set): anonymous player create 10/hour/IP, anonymous player patch 30/hour/IP, `POST /auth/site-password` 20/15 min/IP.
- Remove `console.log('Received request body', …)` and the validated-data log beside it.
- Frontend: no change expected. `EditPlayerModal`, `PlayerForm`, `AddDuesEntryModal` and guest-slot creation are already behind `isAdmin` and send the session cookie. Verify each against the new rules before merge.

### B. Build script
- `build`: `prisma generate && tsc && prisma db push` (no `--accept-data-loss`). The explicit `prisma:push` script keeps the flag for deliberate use.
- Confirm in the Render dashboard that the Web Service build command is `npm run build` and not a hand-typed copy with the flag.

### C. Weekly backup (NUC, no repo change)
- `~/afc-backups/export.cjs` run from `backend/` (Prisma client, read-only): every table to one dated JSON file, gzip, keep the last 12. Directory mode 700 (it holds phone numbers and dues).
- Cron Saturday 14:00 America/Chicago, when the database is awake from the game anyway. About 20 minutes of Neon compute a month. Retry through the Neon cold start.
- Hub: one line in the `JOBS` table ("AFC backup", max age 8 days).
- `pg_dump` is not installed on the NUC, hence JSON. Restore is a script, not a one-liner; acceptable for a 45-game, 82-player dataset.

### D. Static caching (owner, Render dashboard)
Static Site → Settings → Headers, exactly as `render.yaml` documents: `/assets/*` → `public, max-age=31536000, immutable`; `/afc-intro.mp4` → `public, max-age=86400, s-maxage=2592000`. Not a Blueprint sync.

### E. CI and first tests
- `.github/workflows/ci.yml`: on pull request and on push to `main`, `npm ci` + `tsc --noEmit` in `backend/` and `frontend/`, then the tests.
- Tests, smallest useful set: cut A's permission function; the existing pure modules that already have throwaway assertions (`standoutGameLine`, arrivals buckets, the guest-slot and guest-promotion assertion scripts wired in as real tests).
- **Phase 2, separate PR, not this round:** extract the goal patch/rebuild logic out of `GameModuleExpanded.tsx` into pure functions with tests. It is the file where both data-loss bugs happened, so it gets its own review.

### F. Dependencies
`npm audit fix` in `backend/` (non-breaking only). The `zod` major upgrade is left for later; it touches every schema.

### G. Housekeeping
- `backend/.gitignore`: replace the per-script backup lines with one `*-backup-*.json` (+ the existing `dues-*-backup.json`).
- Delete local branches already merged into `main` (list shown before deleting; remote branches untouched, they are shared).

### H. Roster size for 2027
`ROSTER_BY_YEAR` in `stats.ts` ends at 2026. Add 2027 once the owner gives the number.

### I. Guests promised vs brought
Deferred on 2026-08-07 until about 6 games had host attribution. Prod on 2026-11-12: 25 guest visits, 20 with a host, across 7 games; 60 RSVP rows promise 90 guests in total. Build the read-side roll-up per host (promised from `GameRsvp.guestCount`, brought from `GuestVisit.hostPlayerId`), admin-only, on the Guests ledger. Only games on or after the first hosted visit count, so missing history is not read as broken promises.

### J. Punctuality
Start has been tapped in 9 of 9 games since 2026-09-06 and 6 have arrival records, so the card is past its 5-game floor. Nothing to build for the card. A seasonal lateness award is possible now; see open question 2.

## Out of scope
Goal-qualifier awards (10 of 40 goals tagged; too thin). Gating the read API behind the site password (see open question 3). Multi-tenancy. Anything in the WhatsApp listener. The `zod` major. The `GameModuleExpanded` extraction (phase 2).

## Constraints
- Shared repo, auto-deploys from `main` on Render. Never merge while a game is being scored (Saturday morning).
- Local `backend/.env` points at production: typecheck with `npx tsc --noEmit`, never `npm run build`.
- No new background job that wakes Neon on a timer, apart from the weekly backup above.
- Prod writes: none in this round. All reads.

## Plan
| PR | Cuts | Touches | Deploys |
|---|---|---|---|
| 1 | A, B, F, G (gitignore) | backend only | Web Service |
| 2 | E | `.github/`, test files | nothing at runtime |
| 3 | H, I (+ J if chosen) | backend + frontend | both |
| — | C | NUC only | — |
| — | D | Render dashboard (owner) | — |

Each PR is a branch off `origin/main`, `tsc` clean in both packages, verified against the live API after deploy (`/health` commit, then a 403 probe for PR 1 using a field-less no-op that cannot change data).

## Risks
- A legitimate anonymous flow I have not found gets a 403. Mitigation: grep every `createPlayer` / `updatePlayer` call site (7 found) and test each rule; the 403 names the field, so a miss is obvious and quick to fix.
- An admin with an expired session sees "admin required" on an edit that used to work silently. That is correct behaviour but new.
- `prisma db push` without the flag also fails on some harmless changes (for example adding a required column with no default). Intended: stop and decide.
- Rate limits count by IP; a whole team on the field's Wi-Fi shares one. Limits are set well above a game day's real use.

## Open questions
1. 2027 roster size for `ROSTER_BY_YEAR`?
2. Lateness award: build one for the yearly report (mirrors "Lack of Stamina", 5-game floor), or leave punctuality as a card only?
3. Site password: it gates the screen, not the data (names, photos and rosters are readable from the API without it; phone numbers are not exposed). Accept that as the casual gate it was meant to be, or gate the read API too? Recommendation: accept.
4. Anonymous members can add their own phone when none is set; changing or clearing one becomes admin-only. OK?
5. Direct merge to `main` as usual, or pull requests for Campbell to see? Either way he should hear about cut A before it deploys.
