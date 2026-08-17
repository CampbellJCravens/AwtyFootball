# Match Analytics PRD — competitive balance, match tempo, roster churn

**Status:** BUILT 2026-08-17 on `feat/match-analytics` — all three phases. Both packages
`tsc --noEmit` clean, frontend prod build passes, 41 assertions green against the real
season. **NOT merged, NOT deployed, NOT browser-smoked.**
**Date:** 2026-08-17
**App:** Awty Football Club (awtyfootballclub.com)
**Related:** `OWN_GOALS_AND_TURNOUT_PRD.md` (turnout projection, admin-only by decision),
`GAME_CLOCK_AND_GOLDEN_GOAL_PRD.md` (shipped — `startedAt`, `gameEvents`), `CLUB_DUES_PRD.md`

---

## Problem

The app collects a temporal layer it does not read. Every goal carries a `timestamp`, every
team change carries a `timestamp`, and `gameEvents` carries `halfTime` / `gameOver`. **The
only consumer of goal timestamps in the entire backend is three lines in
`services/achievements.ts`** (comeback and game-winner detection). No leaderboard, no report,
no stats endpoint reads them.

Separately, nothing in the app measures whether the *games themselves are any good* — whether
the teams are balanced, whether matches are close, whether anyone is drifting away from the
club. Every existing metric is about individual accumulation (goals, assists, points,
appearances). That is a real gap for a club whose actual product is a good Saturday game.

## Evidence — measured against production, 2026-08-17

Everything below is computed from live data, not assumed. `GET /api/games` (33 games,
32 non-cancelled, 2025-12-13 → 2026-08-15) and `GET /api/players`.

**The timestamps are real, not save-time artifacts:**
```
span between first and last goal timestamp, per game
  median 75.0 min (n=29)
  spans 40–120 min (live entry):  25
  spans under 5 min (batch entry): 1
games with BOTH halfTime + gameOver anchors: 29 of 32
```

**Competitive balance today:**
```
FINAL MARGIN  median 2  mean 2.44  max 7
  margin 0: 5    one-goal games:  5 (16%)
  margin 1: 5    blowouts (4+):   7 (22%)
  margin 2: 9    ties:            5
  margin 3: 6
  margin 4+: 7   lead changes: 44% of games have >=1
                 comeback wins: 13
```

**Match tempo today:**
```
1st half        107 goals  59%
2nd half early   38 goals  21%
2nd half late    37 goals  20%
```

**Roster churn today (70 non-guest players fielded, 41 with 5+ games):**
```
REGULARS ON ROSTER, NOT SEEN 28+ DAYS: 6
  Arsany Fahim      5 games   last 2026-03-07  160d
  George Tannous   12 games   last 2026-04-25  111d
  Mike Missouri    13 games   last 2026-04-25  111d
  Ahmed Elgiar      8 games   last 2026-05-23   84d
  Brandon Johnson  14 games   last 2026-07-11   35d
  Robert Peresich  16 games   last 2026-07-18   28d
days-since-last for regulars: median 7  p75 21  max 160
```

## Two data-quality findings that shape the design

**1. `gameOver` is not trustworthy; `halfTime` is.**
```
halfTime → gameOver duration (min)
  min 1  p25 47  median 55  p75 60  max 482   n=29
  over 50 min: 19 of 29
first-goal → halfTime (proxy for 1st-half length): median 45 min
```
A 482-minute second half and a 1-minute second half in the same dataset mean `gameOver` is
tapped whenever someone remembers — sometimes hours later, sometimes at the whistle. `halfTime`
behaves sanely and is the anchor this PRD uses. Only 3 of 188 goals fall after `gameOver`, so
it is not *wrong*, just late.

**Owner's intent 2026-08-17: a ceiling that isolates "someone forgot to end the game", with a
real tap always winning when it arrives at a sensible time.** That intent is right. The
proposed number — 100 minutes — is not, and the distribution says so plainly.

**Total match length (anchor → `gameOver` tap), all 30 games with both, sorted:**
```
4  28  34  59  66  69  71  73  73  75  86  88  89  99  99
101  102  104  105  105  108  110  112  114  115  115  115  115  124  536
                                    median 100   p75 112   p90 115
```
There is **one** forgotten game (536 min) and a dense, entirely plausible cluster of 14 games
between 101 and 124 — a pickup game that kicks off late and gets tapped at 115 is normal, not
an incident. **A 100-minute ceiling would clamp 15 of 30 games**, i.e. half the season,
truncating real football to catch a single outlier.

The natural break in this data is between **124 and 536**. Nothing lives in that gap.

**Compounding factor:** for 29 of 30 games the anchor is the *first goal*, not kick-off, because
`startedAt` exists on one game. So these figures **understate** true match length by however
long it took to score. Once `startedAt` becomes the anchor every number here shifts up, making
a 100-minute ceiling tighter still.

**Recommendation: 150 minutes.** It isolates the one blatant incident with enormous margin,
never touches a legitimate game, and survives the anchor shift from first-goal to kick-off.
100 does not serve the stated purpose; 150 does. **Owner's call — flagged, not overridden.**

**The ceiling only fixes the late end.** It cannot repair a `gameOver` tapped *early*: game 26
has a 1-minute second half and game 24 a 4-minute total. Clamping does nothing for those, so
the rule is to **exclude games whose second half is under 20 minutes from tempo aggregates**
and report the exclusion count rather than silently dropping them. A floor constant would
invent data; exclusion does not.

**2. RSVP response latency is unrecoverable — do not build it.**
The obvious adjacent idea (who commits early vs who waits until Friday) is dead. Probing
`GameRsvp` in production, most games have every RSVP stamped at **one distinct minute** —
those are the 414 rows backfilled from screenshots in July 2026, which overwrote the real
response times. Only games 29 (14 distinct minutes) and 31 (3) have any spread. Historical
latency does not exist and cannot be reconstructed; prospective capture is additionally gated
on the WhatsApp listener, which is currently capturing nothing. **Explicitly out of scope.**

## The design risk that governs public surfacing

The owner chose to make the turnout projection **entirely admin-only** to kill a
self-fulfilling prophecy at source. The same lens has to be applied here, and it lands
differently on each of the three families:

- **Balance metrics describe a GAME, not a person.** "This was a 2-goal game with one lead
  change" implicates nobody. Safe to publish.
- **Balance metrics attributed to a PERSON are toxic and are out of scope.** The app does not
  record who picked the teams, so any per-player balance stat would be attributing an outcome
  to someone who may not have caused it — and "your teams get blown out" is a stat that makes
  a Saturday worse. **Not built, not in a later phase, deliberately.**
- **Churn metrics are about a person's absence and must stay admin-only.** A public "players
  who have gone quiet" list is a callout board. This is the single hardest constraint in the
  PRD and the phase order reflects it.

## Success criteria

1. A match report states how competitive the game was, in one legible phrase, without any
   player being named as responsible.
2. The monthly and yearly reports carry a balance summary (blowout rate, one-goal rate,
   comeback count) computed from real data, matching the numbers in this document when run
   over the same window.
3. Tempo metrics split on `halfTime`, and every match window is bounded by the ceiling N from
   its anchor (Q7a). Games with a second half under 20 minutes are excluded and the excluded
   count is reported, not hidden.
4. At least one new seasonal award and one new lifetime achievement ship, wired into the
   existing award/achievement plumbing with no id collisions and no re-firing of any existing
   holder's notification.
5. The admin sees a "quiet regulars" list matching the six players above, and it is reachable
   nowhere else in the app.
6. No new background poller, no new scheduled job, no schema change in phases 1 and 2.
7. `tsc --noEmit` clean in both packages; frontend prod build passes.

## Scope

### Phase 1 — Competitive balance (public)

**Per game, computed from goals + timestamps:**
- Final margin, lead changes, comeback (did the winner ever trail), tie flag.
- A **Match Quality** label, not a black-box score. Legible definition:
  `Classic` = margin <= 1 AND >= 1 lead change; `Close` = margin <= 1; `Competitive` =
  margin 2–3; `One-sided` = margin >= 4. Deliberately a bucket, not a 0–100 index — a
  composite number invites arguing about the weights and communicates less.
- Surfaced on the match report PNG and the game detail view.

**Per season, in the yearly/monthly reports:**
- Blowout rate, one-goal rate, tie count, comeback count, median margin.
- **New seasonal award: "Game of the Season"** — the game with the smallest margin, tie-broken
  by most lead changes then most total goals. Attaches to a GAME, not a player.

### Phase 2 — Match tempo (public)

- Goals by half, using `halfTime` as the split. Games without a `halfTime` event are excluded
  from tempo aggregates rather than guessed at.
- **Match-length ceiling** (N minutes, see Q7a). Effective end = `min(gameOver ?? ∞, anchor + N)`;
  anchor = `startedAt` if present, else first goal. Goals past the cap clamp to the cap rather
  than being dropped — a goal is real even when the clock marker is not.
- **Late-goal share** measured against the capped second-half window.
- Time-to-first-goal: **accrues forward only**, gated on `startedAt`, which currently exists on
  1 of 33 games. Renders as "not enough data yet" until a threshold (proposed: 8 games) is met.
- **New lifetime achievements** (ids are permanent once shipped — see Constraints):
  - `first_half_hat_trick` — three goals in one half. Name TBD.
  - `late_show_5` — 5 career goals in the second half. Name TBD.
- **Fix, not a metric:** make `gameOver` reliable going forward — auto-stamp it when a game is
  finalised, or prompt for it. Without this, no future "final ten minutes" metric is possible.

### Phase 3 — Roster churn (ADMIN ONLY)

- Per player: first appearance, last appearance, games played, days since last seen.
- **Quiet regulars** list: `>= 5 games AND onRoster = true AND days-since-last >= 28`.
  Thresholds match the existing `MIN_GAMES = 5` floor in ReliabilityTab.
- Feeds the dues and roster workflows — several of the six above are plausible Former-marking
  candidates, which is a dues-year decision, not an automatic one.
- Derived live. **No `dismissed` flag in v1** — that is the one thing here that would need a
  schema change, and it should wait until the list proves annoying rather than be pre-built.

### Out

- **Per-player or per-team-picker balance attribution.** Reasoned above. Not a later phase.
- **RSVP response latency.** Data destroyed by the July backfill.
- **Public churn surfacing.** Admin-only, permanently.
- **Guest conversion / promised-vs-brought.** Already deferred on its own trigger (~6 games of
  host attribution, ~mid/late Sep 2026). Untouched by this PRD.
- **A 0–100 composite "match rating".** Buckets instead, per Phase 1.
- **Any absolute minute-of-game metric on historical games.** No reliable kick-off anchor
  exists before `startedAt`.
- **Anything requiring a new poller, cron, or scheduled recompute.**

## Constraints

- **Governing rule: add no new background poller.** Inline compute plus a module-level memo
  invalidated on Game writes, matching the turnout design. `/api/stats/reliability` already
  does an uncached full scan per admin load at this data size (32 games / 83 players / 509
  rsvps) with no burn implication.
- **Achievement ids: changing one re-notifies existing holders. It does NOT unlock it for
  anyone new.** Verified in code 2026-08-17: `earnedAchievementIds()` is
  `achievements.filter(a => a.current >= a.target)` — unlock is computed live from the
  player's stats, and `UserAchievementSeen` has no say in it. That table is purely a
  "has this popup been shown" ledger keyed `@@id([userId, achievementId])`, so a renamed id
  looks unseen and the popup fires once more for people who already qualify.
  **Measured blast radius: at most 8 people.** Only 8 of 24 `User` rows have a linked
  `playerId`, and `/me/new-achievements` returns `[]` immediately for anyone unlinked — so an
  unlinked user cannot receive a popup at all. 69 `UserAchievementSeen` rows exist across
  those 8.
  **Consequence for this PRD: renaming is cheap, not forbidden.** Worst case is ≤8 duplicate
  popups, one per person, once. Pick ids you like; don't contort a name to avoid a rename.
- **`AwardSection` always renders**, with a `noQualifierMessage`. A conditional award (Game of
  the Season in a month with no games) must be wrapped in a conditional, as own goals had to be.
- **Awards are seasonal, achievements are lifetime.** Confirmed against the code: `goldenBoot`
  sits in the year-scoped endpoint; `goals`/`assists` accumulate across all years and never
  re-lock. New awards go in the year-scoped endpoint; new achievements do not.
- **No schema change in phases 1–2.** If phase 3 ever needs one, use the established
  `prisma migrate diff --from-url … --to-schema-datamodel …` pre-flight, then a **bare**
  `npx prisma db push` (no `--accept-data-loss`, which is the safety catch).
- **Never run `npm run build` in `backend/` locally** — it runs `prisma db push
  --accept-data-loss` against the production `DATABASE_URL`. Use `npx tsc --noEmit`.
- Deploy is Render auto-from-`main`; backend changes need the Web Service to redeploy, not just
  the static site. Browser smoke remains the standing unmet risk on this repo (headless NUC).
- Guest pool (`/^Guest\d+$/`) excluded from all player-level metrics, as everywhere else.
- Cancelled games (`field === 'cancelled'`) excluded from all aggregates.

## Plan

1. **`services/matchQuality.ts`** — pure functions over the existing game shape: margin, lead
   changes, comeback, bucket label. Unit-tested against the 32 real games; the aggregate must
   reproduce the Evidence numbers exactly.
2. Wire per-game balance into the game detail payload and the match report canvas.
3. Season aggregates into `/api/stats/yearly` and `/api/stats/monthly`; add `gameOfTheSeason`
   to the year-scoped `awards` block, wrapped conditionally.
4. **`services/tempo.ts`** — half-split goal distribution, late-goal share, `halfTime`-anchored
   only. Games without the anchor excluded and counted as excluded, not silently dropped.
5. Two new achievements in `services/achievements.ts` with final ids agreed at sign-off.
6. `gameOver` reliability fix (auto-stamp on finalise).
7. **`services/churn.ts`** + an admin-only Churn view. Not in any public payload — verified by
   grepping the public response shapes, not assumed.
8. `tsc --noEmit` both packages, frontend prod build, then owner browser smoke.

## Open questions

- **Q1.** Match Quality buckets — are `Classic / Close / Competitive / One-sided` the right
  four, and are the cut-points right? Run against the 32 real 2026 games the split is
  **Classic 6 · Close 4 · Competitive 15 · One-sided 7**. That is a reasonable spread with no
  bucket collapsing to zero, but the naming is a club-culture call, not a technical one.
- **Q2.** Should "Game of the Season" have a monthly sibling ("Game of the Month")? Cheap —
  same computation, different window — but it adds an award slot to every monthly report,
  including thin months.
- **Q3.** Final ids and display names for the two new achievements. **Downgraded from a
  one-way door:** renaming later costs ≤8 duplicate popups (see Constraints), so this is a
  naming preference, not an irreversible commitment. Placeholders stand until you pick.
- **Q4.** Is a 28-day quiet threshold right? Median gap for a regular is 7 days and p75 is 21,
  so 28 is roughly the 80th percentile — it surfaces 6 people. A 21-day threshold would surface
  more and nag; 42 would surface ~4 and miss Robert.
- **Q5.** Should the churn list distinguish "lapsed" from "left"? Six names are shown above,
  but two (Tannous, Missouri) are 111 days out and may simply be gone — which is a dues-year
  Former-marking decision, not an analytics one. Recommend the list stays purely descriptive
  and links to the existing roster tooling rather than proposing an action.
- **Q6.** Phase 2's time-to-first-goal is dark until `startedAt` accrues. Ship the tempo phase
  without it and add it later, or hold the whole phase? Recommend ship without.
- **Q7. RESOLVED 2026-08-17 (owner).** The ceiling is a fallback for forgotten games, and a
  real `gameOver` tap always wins when it lands at a sensible time. Two consequences worth
  stating, because the obvious implementation gets both wrong:
  - **⚠️ A literal timer would violate this repo's governing rule.** "Auto-stamp at N minutes"
    implies a background job counting down, and *add no new background poller* is the rule that
    came out of the July compute-burn work. Implement it **lazily** instead: `gameOver` is
    never written by a timer; the effective match end is `min(gameOver ?? ∞, anchor + N)`
    computed at read time, optionally persisted when the game is next finalised. No poller, no
    timer, and no clock running on a server for a game nobody is watching.
  - **This makes the "overwrite" requirement free.** Because nothing is ever stamped early,
    there is no premature value to overwrite — a real tap simply *is* the value whenever it is
    under the ceiling. The requirement is satisfied by construction rather than by logic.
- **Q7a. NEW — what is N?** Owner proposed 100; measured data says that clamps 15 of 30 real
  games. Recommend **150**. See the Evidence section. This is the one number still to confirm.

## Smallest viable cut

**Phase 1 only, and only the per-game label plus the season aggregate.** That is one pure
service, one report line, and one award. It proves whether the club cares about game-quality
framing at all before any achievement ids become permanent or any admin view gets built. If
the reaction is a shrug, phases 2 and 3 are not worth the deploys.
