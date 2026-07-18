# Shareable Summary Reports — PRD

Compact, image-first summary reports the admin can drop straight into the
WhatsApp group. Three reports: **after-game**, **monthly**, **yearly**.

## Decisions (locked)
- **Delivery:** client-side canvas, forking `frontend/src/utils/renderRsvpImage.ts`.
  No new runtime deps, no server-side rendering.
- **Access:** admin-only (matches the existing `isAdmin`-gated game controls).
- **Cadence:** one game every Saturday → after-game report is **per match**
  (no multi-game aggregation).
- **MotM label:** "Man of the Match" = most goal involvements (goals + assists),
  guests excluded, ties surface all winners, omitted when no goals.
- **Sportsmanship:** monthly/yearly only — NOT on the after-game image.

## Status
- ✅ **After-game report — BUILT** (branch `feat-summary-reports`, not deployed).
  - `frontend/src/utils/renderMatchReportImage.ts` — canvas → PNG renderer.
  - `GameModuleExpanded.tsx` — `handleShareMatchReport` builds report data from
    in-memory goals (no extra fetch); admin-only "Share Report" button in the
    sticky game-tab footer, beside "Report Stats".
  - Share via Web Share API (files); download fallback on unsupported browsers.
  - Verified via node-canvas harness: normal game, 0-0 draw (MotM omitted),
    MotM tie. Typecheck + prod build clean. **Live browser smoke pending.**

- ✅ **Monthly report — BUILT** (same branch, not deployed).
  - Shared canvas helpers extracted to `frontend/src/utils/reportCanvas.ts`
    (COLORS, FONT_STACK, loadImage, roundRect, truncateToWidth, canvasToPngBlob);
    match renderer refactored onto it (verified byte-identical output).
  - `renderMonthlyReportImage.ts` — portrait 448px "highlights" card: crest,
    Player-of-the-Month hero, 2-col award tiles (Top Scorer/Assister/Goal
    Contributor/Defender/Sportsman + Highest-Scoring Game), slim full-width
    Top Duo banner. Grid auto-spans its last tile full-width on odd counts so
    there's never an empty card-sized cell. Null awards skipped; ties list all.
  - Backend `/api/stats/monthly` extended: `highestScoringGame` (most total
    goals that month → date + score) and `awards.topTrio` (best trio by PPG,
    min 2 games together). Top Trio is computed but **deferred to the yearly
    report** — not shown on the monthly image.
  - `HomeTab.tsx` — admin-only "Share Report" button under the month selector
    (`useAuth().isAdmin`), builds report data from the already-fetched
    `/api/stats/monthly` response. Web Share + download fallback.
  - Verified via harness: full set, and edge (even tiles + no duo + POTM tie).
    Typecheck + build clean. **Live browser smoke pending.**

- ✅ **Yearly report — BUILT** (same branch, not deployed).
  - Backend `GET /api/stats/yearly?year=&limit=` — full-season aggregation:
    marquee winners (Player of the Year = POINTS, Golden Boot, Playmaker, Iron
    Man = appearances, Top Defender, Sportsman), top-N leaderboards (points,
    goals, assists, G+A, appearances, PPG, win %, sportsmanship, defensive
    rating), Best Duo (goal combos) + Best Trio (PPG, min 3 games together),
    highest-scoring game, availableYears.
  - `renderYearlyReportImage.ts` — portrait 448px "Season in Review": crest,
    Player-of-the-Year hero, marquee award tiles, leaderboard sections (each
    full-width, top-N split into two rank columns), Best Duo/Trio banners.
  - `Stats.tsx` — admin-only year selector + "Yearly" share button in the
    STATS HUB header. Ships **core+attacking @ top-5** (Goals, Assists, G+A,
    Points, Appearances + Duo/Trio). "Everything" set (adds Win%/PPG/
    Sportsmanship/Top Defender/Sportsman) is supported by the backend/renderer
    and can be turned on later.
  - Verified via harness (core top-5/top-8 + everything). FE+BE typecheck +
    build clean. **Live browser smoke pending.**

## Deploy note
The Highest-Scoring Game (monthly) and the entire yearly report depend on the
new `/api/stats/*` backend code, so they only work after a **Render deploy** —
a frontend-only Netlify push is not enough for those.

## Out of scope
Server-side/auto-posting to WhatsApp; editable captions; PDF; multi-language.
