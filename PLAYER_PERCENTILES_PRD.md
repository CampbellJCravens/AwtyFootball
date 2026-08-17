# Player Percentiles PRD — horizontal percentile bars on the player page

**Status:** BUILT 2026-08-17 on `feat/player-percentiles` — all six bars, threshold 8,
own-profile-only. All questions resolved. Both packages `tsc --noEmit` clean, frontend prod
build passes, 28 assertions green against the real season.
**NOT merged, NOT deployed, NOT browser-smoked.**
**Date:** 2026-08-17
**App:** Awty Football Club (awtyfootballclub.com)
**Related:** `MATCH_ANALYTICS_PRD.md` (shipped 2026-08-17), `OWN_GOALS_AND_TURNOUT_PRD.md`
(empirical-Bayes shrinkage precedent), `RSVP_RELIABILITY_PRD.md`

---

## Problem

A player's profile shows totals and a handful of ranks. Neither answers the question people
actually have — *am I any good at this, relative to everyone else?* A rank of 7 means nothing
without knowing whether that is 7 of 9 or 7 of 45, and `getRank` returns the rank without the
denominator, so the frontend literally cannot say.

The data to answer it already exists. Nothing needs collecting.

## Decisions already made (owner, 2026-08-17)

1. **Horizontal percentile bars, not a radar.** Chosen over a spider graph: this is a
   mobile-first app on 375pt screens, and six labelled axes on a web is cramped. Bars also
   dodge the two radar traps — correlated axes inflating area, and area changing with axis
   order.
2. **Only generated for players with enough play time**, so the bars are a longstanding-player
   feature rather than something that renders noise for a one-game guest.
3. **Built as a reusable service**, because the owner expects to leverage the same percentiles
   in admin game views later. The player page is consumer #1, not the owner of the logic.

## Evidence — measured against production, 2026-08-17

**Cohort size by qualification threshold** (32 non-cancelled games, guests excluded):
```
  >= 3 games: 41 players
  >= 5 games: 33 players
  >= 8 games: 27 players   <- CHOSEN
  >=10 games: 24 players
  >=12 games: 21 players
  >=15 games: 16 players
  >=20 games:  9 players
```
WARNING: these were CORRECTED during the build. An earlier draft read 31 / 27 / 11 because
the exploratory analysis counted `teamAssignments` keys directly. See finding 3.

**Metric spread among qualified players** — does a percentile mean anything here?
```
  goals/game           min 0.00  med 0.20  max 1.23   zeros:  4/31
  assists/game         min 0.00  med 0.22  max 0.73   zeros:  3/31
  points/game          min 0.78  med 1.54  max 2.00   zeros:  0/31
  goals allowed/game   min 2.22  med 3.05  max 4.20   zeros:  0/31
  sportsmanship/game   min 0.00  med 0.07  max 0.36   zeros: 10/31
```
Real spread on every metric, so the bars will not all sit at the middle. Two problems visible
already: the zero blocks (below), and sportsmanship (worse than it looks — see finding 1).

## Three findings that shape the design

### 1. 🔴 The metric windows do not match the career window — and it hits longstanding players hardest

Sportsmanship points started being recorded in **May 2026**, fouls in **July 2026**. The code
already knows this (`hasSportsmanshipData` / `hasFoulsData` in `stats.ts` suppress the awards
for earlier periods). But a *career* percentile does not:
```
  total non-cancelled games:                        32
  games BEFORE sportsmanship existed (pre May 2026): 20  (62%)
  games BEFORE fouls existed       (pre Jul 2026):   26  (81%)
```
**62% of all games predate the stat.** And the dilution lands precisely on the people this
feature is being gated for:
```
Most-diluted >=8-game players (share of their games predating sportsmanship):
  Mike Missouri     13 games, 100% in the dead window
  George Tannous    12 games, 100% in the dead window
  Eric Saito        13 games,  92% in the dead window
  Aldo              11 games,  91% in the dead window
  Siegfried Casar   10 games,  90% in the dead window
  Ahmed Elgiar       8 games,  88% in the dead window
```
Computed naively, a longstanding player opens their profile and sees themselves pinned to the
bottom of a sportsmanship bar **for a stat that did not exist while they were playing**. That
is the exact silent-wrongness this codebase keeps designing against, and it would land on the
club's most senior members first.

**So gating must be PER METRIC, not per player.** Each metric declares its own valid window
and its own denominator: sportsmanship/game is sportsmanship points ÷ games played *since May
2026*. A player can clear the overall threshold on 15 career games and still not qualify for
the sportsmanship bar on 2 games in-window — in which case that one bar reads "not enough
games yet" while the others render.

### 3. Deleted players leave orphaned ids in every game they played

`Game.teamAssignments` is a JSON string column with **no foreign key**, so deleting a Player
leaves their id sitting in every game they appeared in. Found during the build:

```
Player rows in DB: 69      pids in games NOT in the Player table: 20
four heaviest orphans: 31, 25, 13 and 9 games
players whose name contains "Guest": 0
```

The 31-game orphan is the single most-appearing id in the whole dataset. These are the
**GuestN slot players**, since deleted: two of the four are confirmed against
`GuestVisit.slotPlayerId`, and a reusable per-game guest slot showing up in 31 of 32 games is
exactly the expected profile.

**Two consequences:**

1. **Guest exclusion by name no longer works, and no longer needs to.** Every guest-exclusion
   site in this app string-matches `Guest` on `Player.name`, but there are now zero such rows
   — the slots are excluded by *absence* instead. Any code that iterates `teamAssignments`
   keys **without joining to the Player table** will silently rank four deleted guest slots as
   the club's most dedicated members. `computePercentiles` joins, which is why it is correct.
2. **It invalidated my own first analysis.** The cohort figures above originally read
   31 / 27 / 11 because the exploratory script counted keys. The service disagreed with the
   script, and the service was right.

### 2. Ties need an explicit rule, or a third of the club shares last place

10 of 31 qualified players have exactly **zero** sportsmanship per game. Under a naive
"count how many you beat" percentile they all land at the 0th percentile, which reads as
"worst in the club" for ten people who are merely un-scored. Same shape, smaller, on goals
(4 zeros) and assists (3).

**Rule: midrank (average rank across the tied block).** Ten players tied at the bottom of 31
sit at roughly the 15th percentile together, not the 0th. The UI must also label a tie
honestly rather than implying separation that isn't there.

## Success criteria

1. A qualified player's profile shows percentile bars whose values can be reproduced by hand
   from the numbers in this document, over the same window.
2. An unqualified player's profile shows a clear "not enough games yet" state — not an empty
   chart, not zeros, and not a collapsed bar that reads as "bad".
3. A metric whose data window a player does not clear shows that state **for that bar alone**,
   while their other bars render.
4. `goals allowed` reads correctly as a *defensive* metric: the player conceding least is at
   the top of the bar, not the bottom.
5. Percentiles are computed against the **qualified cohort only** — an unqualified player
   never appears in anyone else's denominator.
6. A tied block of players receives identical percentiles, and no tied player is shown at 0.
7. The percentile service is callable with an arbitrary player set and window, so an admin
   game view can reuse it without touching the player-page code.
8. No schema change. `tsc --noEmit` clean in both packages; frontend prod build passes.

## Scope

### In

**A. `backend/src/services/percentiles.ts` — the reusable core**
- A metric registry: each entry declares `id`, `label`, `higherIsBetter`, `validFrom` (null =
  all time), and how to derive value + denominator from a player's games.
- `computePercentiles(games, players, { minGames, metrics, window })` → per player, per metric:
  `{ value, percentile, cohortSize, qualified, reason? }`.
- Midrank tie handling. Cohort = qualified players only.
- **Empirical-Bayes shrinkage toward the cohort mean for rate metrics**, reusing the m=5
  pattern already established in `services/turnout.ts` rather than inventing a second
  approach. An 8-game player who scored 10 goals should not top the club on 1.23 goals/game
  with the same confidence as a 30-game player at 0.9.

**B. Six metrics on the player page**

| Bar | Metric | Direction | Window |
|---|---|---|---|
| Scoring | goals per game | higher better | all time |
| Creating | assists per game | higher better | all time |
| Winning | points per game | higher better | all time |
| Defence | goals allowed per game | **lower better** | all time |
| Sportsmanship | net sportsmanship per game | higher better | **from May 2026** |
| Availability | games played ÷ games since first appearance | higher better | per player |

Availability is deliberately tenure-relative: it measures *turning up while you were around*,
so a 2025 regular who left is not punished against a 2026 regular.

**C. Frontend `PercentileBars.tsx`**
- Hand-rolled, no charting dependency. The bundle is already 646KB against Vite's 500KB
  warning; adding Recharts for this would be a poor trade.
- Each row: label, the player's actual value, and a bar filled to the percentile with a median
  marker so "average" is visible rather than implied.
- Per-bar and whole-block empty states per criteria 2 and 3.

### Out

- **A radar/spider chart.** Explicitly replaced by this, for the reasons above.
- **Any new data collection or schema change.** Everything is derived.
- **Percentiles for guests.** The `GuestN` pool is excluded from player metrics everywhere.
- **Season-scoped percentiles** in v1 — career only. Adding a season toggle later is a window
  parameter on the same service, which is exactly why the service takes one.
- **Admin game-view consumers.** The service is built to be reused; no second consumer ships
  in this PRD.
- **Comparing two players side by side.** Natural follow-up, not v1.

## Constraints

- **No new background poller** — the governing rule from the July compute-burn work. Inline
  compute plus a module-level memo, matching turnout and reliability.
- No schema change; if that ever changes, use the `prisma migrate diff` pre-flight then a
  **bare** `npx prisma db push`.
- **Never run `npm run build` in `backend/` locally** — it pushes the schema to production.
  Use `npx tsc --noEmit`.
- Mobile-first: the block must read on a 375pt screen. Six rows of label + value + bar fits;
  the labels must not compete with the value for width (cf. the 291px stat-row incident).
- Render auto-deploys from `main`; the backend Web Service must redeploy, not just the static
  site.
- Browser smoke remains the standing unmet risk on this repo.

## Plan

1. `services/percentiles.ts` with the metric registry, midrank ties, shrinkage, per-metric
   windows and qualification.
2. Verification harness against the real 32-game season: cohort sizes must match the Evidence
   table, tie blocks must share a percentile, and the sportsmanship window must exclude
   pre-May-2026 games from the denominator.
3. Extend `GET /api/stats/player/:id` with a `percentiles` block **and the cohort denominator**
   (the missing piece that makes today's `ranks` unusable).
4. `PercentileBars.tsx` + mount on `PlayerProfile.tsx`.
5. `tsc --noEmit` both packages, frontend prod build, then owner browser smoke.

## Open questions

- **Q1. RESOLVED (owner): 8 games** → 27 qualified players (corrected from 31, see finding 3).
  Cohort granularity is ~3.7 percentile points, which is fine.
- **Q2. RESOLVED (defaulted, unchallenged): yes**, one threshold for both. Keeps the
  denominator honest.
- **Q3. RESOLVED (owner): all six as specced**, Defence included. Rationale for keeping the
  caveat on record: goals allowed is a team outcome attributed to an individual, though the
  app already publishes it as `defensiveRating`, so it is not new exposure.
- **Q4. RESOLVED 2026-08-17 (owner): OWN PROFILE ONLY, for now.** A signed-in user sees
  percentile bars on their own linked player's profile and nowhere else. Rationale kept
  because it is the reason not to widen this casually: the app already publishes leaderboards
  and a Dirtiest Player award, so per-player ranking is established — but a leaderboard only
  shows the top, whereas a percentile bar tells everyone exactly how far down they are, for
  every player, permanently. That is a change in kind, not degree.
  **Assumed unless corrected: admins see all players' bars**, consistent with admins already
  seeing Reliability and Churn, which are far more sensitive. One line to change if wrong.
  **Implementation note:** the gate is `user.playerId === player.id || isAdmin`. It must be
  enforced **server-side** in the `/player/:id` payload, not merely hidden in the UI — a
  client-side-only gate ships everyone's percentiles to every browser.
- **Q5. RESOLVED (defaulted, unchallenged): median.** It falls at exactly 50% on a percentile
  scale by construction, which makes the reference line honest rather than decorative.
- **Q6. RESOLVED 2026-08-17 (owner): gates on the SUBJECT's data sufficiency.** "Longstanding"
  described the expected *effect* — enough games for the numbers to mean something, which in
  practice is longstanding players — not a viewer-tenure permission. The PRD as written is
  correct: qualification is about whether a player has enough data, and tenure is the
  by-product. No account-age check anywhere.

## Smallest viable cut

The service, the API field, and **four bars** — Scoring, Creating, Winning, Availability. All
four are all-time metrics with no data-window problem, so the whole of finding 1 can be
deferred with them. Add Defence and Sportsmanship once the per-metric window machinery has
proven itself on a metric where being wrong is cheap.


## Built — deviations and things found

- **Sportsmanship qualifies only 7 players.** Only 12 games fall inside its window, so at a
  threshold of 8 just seven players clear it. The bar renders with `vs 7 players` printed
  beside it rather than hiding that, but a percentile out of seven is coarse and will stay
  that way until roughly November 2026. Worth revisiting then, not now.
- **One accent for every bar, never red-for-low.** Position already encodes magnitude, and
  colouring a low bar red adds a value judgement the data does not support — on the one page
  a player cannot avoid looking at.
- **Values are printed, not hovered.** Phone-first: a tooltip you have to press for is a
  tooltip nobody reads.
- **Cohort size is printed per bar**, because it varies by metric (27 vs 7) and a percentile
  is meaningless without its denominator.
