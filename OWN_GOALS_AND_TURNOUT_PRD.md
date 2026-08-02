# PRD — Own Goals + RSVP Turnout Projection

Status: **BUILT** 2026-08-01 — Feature 1, Phase 1 (ghost split) and the turnout
projection are all implemented, typechecked and both prod builds pass. Not
deployed; not committed. Browser smoke outstanding.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-01

Two independent features, shipped as two PRs. Feature 1 has no schema
migration; Feature 2 has no schema migration either. Neither touches Prisma.

---

# Feature 1 — Own Goals

## Problem

Two own goals happened on 1 Aug 2026 and there is nowhere to put them. Today
an admin has three bad options: log it as a goal for a player on the team that
benefited (wrong scorer, inflates their G), log it against the scorer (wrong
scoreline), or drop it (wrong scoreline). All three corrupt the record.

## Decisions (from sign-off 2026-08-01)

- Own goals get their **own OG column**. No effect on the scorer's G or A.
- On the **month view**, the OG element renders **only if that month has own
  goals**. Zero own goals → the section does not exist. (Applied consistently:
  the OG column on the season table also hides when the loaded scope has none,
  so the table doesn't carry a permanently empty column.)
- Sportsmanship / fouls are **untouched** by own goals.
- Month view gets **both** a leaderboard **and** an award section (wooden
  spoon), each conditional on the month having at least one own goal.
- **Achievements ship too** — see "Achievements" below.

## Correcting the 1 Aug 2026 game

Confirmed by the owner: the two own goals were entered as **normal goals
credited to a player on the benefiting team**. So the **scoreline is already
correct** — only the attribution is wrong. Two players currently each carry a
goal they did not score.

The fix per goal is therefore a re-attribution, not a flag flip:

| Field | Now | After |
|---|---|---|
| `scorerId` | a player on the benefiting team | the player who put it in their own net |
| `team` | benefiting team | **unchanged** |
| `assisterId` | whatever was entered | `null` |
| `ownGoal` | absent | `true` |

Because `team` doesn't move, the scoreline, clean sheets and `goalsAllowed` for
that game are untouched by the correction. Two players lose a phantom goal;
two players gain an OG. This is exactly what the `EditGoalscorerModal` own-goal
toggle is for — the owner does it in the UI, no script, no direct DB write.

⚠️ If either of those phantom goals had an assister recorded, that assist is
also phantom and gets cleared. Worth eyeballing the 1 Aug timeline before
correcting.

## Data model — no migration

`Game.goals` is a JSON-encoded string column, so the goal record is extended
in place:

```ts
{ scorerId, assisterId: null, timestamp, team, ownGoal: true }
```

- `scorerId` = the player who put it in their own net.
- `team` = the team **credited** with the goal, i.e. the *opposite* of the
  scorer's team assignment. This is the key choice: the scoreline, clean
  sheets, `goalsAllowed`, Top Defender, highest-scoring-game and the match
  report all derive from `goals.filter(g => g.team === …)` and therefore stay
  correct with **zero changes**.
- `assisterId` is always `null` — there is no assist on an own goal.
- `ownGoal` absent/undefined on every existing goal → falsy → fully
  backward-compatible. No Prisma migration, no `ALTER TABLE`, no Neon write.

Zod: add `ownGoal: z.boolean().optional()` to `goalSchema`
(`backend/src/schemas/game.ts`). Mirror on `Goal` in `frontend/src/api/games.ts`.

## Success criteria

- Admin can record an own goal in one tap from the player row, no assist prompt.
- The scoreline moves for the **benefiting** team.
- The scorer's G, G+A, Top Scorer and Top Goal Contributor are **unaffected**.
- A new OG column appears on the season stats table when any own goal exists in
  scope, and is absent otherwise.
- The monthly view shows an own-goal section only in months that have one.
- Game timeline and the shareable match report read `Name (OG)`, credited to
  the correct team.
- Today's two own goals are correctable to the new representation without
  re-entering the game.

## The real cost: every site that credits `scorerId`

The team-credit path needs no change. The **player-credit** path needs an
`ownGoal` guard at each of these, or a player gets credited for scoring on
themselves:

| # | Site | What it credits |
|---|---|---|
| 1 | `backend/src/routes/stats.ts:94` | player profile `goalsScored` |
| 2 | `backend/src/routes/stats.ts:211` | `pGoals` (partner stats) |
| 3 | `backend/src/routes/stats.ts:432` | monthly `goals` + `goalInvolvements` |
| 4 | `backend/src/routes/stats.ts:676` | yearly `goals` + `goalInvolvements` |
| 5 | `backend/src/routes/stats.ts:871` | player awards |
| 6 | `backend/src/routes/games.ts:356` | Google Sheets export `Goals` |
| 7 | `frontend/src/components/OverallStatsTable.tsx:170` | season G / G+A |
| 8 | `backend/src/services/achievements.ts:99` | achievement goal counts |
| 9 | `frontend/src/utils/renderMatchReportImage.ts:29` | scorer list + MotM line |
| 10 | `frontend/src/components/GameModuleExpanded.tsx:283` | Man of the Match |

Safe without changes (they all require a non-null `assisterId`, which an own
goal never has): chemistry duos (`stats.ts:290`, `:518`, `:711`, `:904`) and
`PartnersStatsTable.tsx`.

Implementation note: introduce one shared predicate rather than ten inline
`!g.ownGoal` checks — a `isScoringGoal(g)` helper in each of the backend and
frontend goal-handling modules. Ten scattered negations is how site #11 gets
missed next time someone adds a leaderboard.

## Scope

**In**
- `goalSchema` + `Goal` interface gain `ownGoal?: boolean`.
- Own-goal button in the player row (`ActivePlayersSection.tsx`), admin-only,
  beside the existing Goal button. Distinct icon (ball, red/warning tint).
  Writes `team` = opposite of the scorer's assignment, no assist modal.
- `StatStack` OG badge on the player row, red.
- Timeline entry in `GameModuleExpanded` — `Name (own goal)`, shown on the
  credited team's side.
- `EditGoalscorerModal` gains an **own goal** toggle, so today's two can be
  fixed in place and future mis-entries are correctable.
- OG guard at all 10 sites above.
- Season table: `ownGoals` in `PlayerStats`, OG column + sortable, rendered
  only when `Σ ownGoals > 0` across loaded games.
- Monthly: `ownGoals` on `PlayerStat`, `leaderboards.ownGoals` via the existing
  `getLeaderboard` (which already drops zero values and returns `[]`), plus a
  conditionally-rendered section in `HomeTab` gated on
  `data.leaderboards.ownGoals.length > 0`.
- Monthly **award**: `ownGoalOfTheMonth` via the existing `getTop`, rendered as
  an `AwardSection` — but unlike every other award it must be wrapped in
  `{data.awards.ownGoalOfTheMonth && ( … )}` rather than relying on
  `noQualifierMessage`. Every current `AwardSection` always renders and shows a
  "nobody qualified" line; that is exactly the behaviour we do *not* want here.
- Achievements (below).
- Match report image: `(OG)` suffix on the credited team's scorer list.

**Out**
- Yearly view OG leaderboard (add later if it earns its place).
- Any OG effect on sportsmanship, fouls, or points.
- Backfilling own goals from historical games before 1 Aug 2026.

## Achievements

Added to the ladder in `backend/src/services/achievements.ts` (~line 304),
matching the existing jokey register ("R9? Or Manny Suarez?", "Ted Lasso",
"They Had Us in the First Half"):

| id | name | description | target |
|---|---|---|---|
| `first_own_goal` | **Wrong Net** | Score an own goal | 1 |
| `own_goals_3` | **Sponsored by the Opposition** | Score 3 own goals | 3 |

Requires an `ownGoals` counter in the per-player achievement aggregation, which
is the same `isScoringGoal` inversion used elsewhere — count goals where
`g.ownGoal && g.scorerId === playerId`.

⚠️ **Tone check:** achievements fire `AchievementUnlockedModal`, a celebratory
pop-up. Two players will get a congratulatory modal for scoring on themselves
the moment the 1 Aug correction is applied. Assumed intentional and funny; flag
now if it isn't, because it is not separable from shipping the achievement.

⚠️ **Retroactivity:** achievements are computed from game history, not stored
as events, so these unlock retroactively across all games — but since no game
before 1 Aug has `ownGoal` data, in practice only the two 1 Aug players unlock
`first_own_goal`. Nobody can reach `own_goals_3` for a long while.

## Constraints

- Zero migration is a hard requirement while the Neon compute allowance is
  still being recovered (see Risks).
- `ownGoal` is additive to a JSON blob, so a stale frontend reading a new goal
  simply ignores the flag and shows a normal goal — degrades safely, no crash.
- Guests (`GuestN` players) can score own goals; they're already excluded from
  the stats tables by name filter, so no special handling.

## Plan

1. Schema + types (`goalSchema`, `Goal`) — 15 min.
2. `isScoringGoal` helper + the 10 guards. Backend first, frontend second.
3. Recording UI: button, badge, timeline, no-assist path.
4. `EditGoalscorerModal` toggle → correct the 1 Aug game.
5. Season OG column (conditional) + monthly OG leaderboard (conditional).
6. Match report `(OG)`.
7. `tsc` + prod build gate, browser smoke on mobile + desktop, one PR.

---

# Feature 2 — RSVP Turnout Projection

## Problem

The RSVP page shows raw poll counts: 12 In, 5 Maybe, 3 Out. That is not the
question anyone is actually asking, which is *"are we going to have a game?"*
The counts systematically mislead in both directions — committed players flake,
and more people turn out than respond. The existing Reliability tab already
proves this: `summary.avgTurnout` exceeds `summary.avgResponses` every week,
and the gap is ghosts (show without RSVPing) plus guests.

Everything needed to answer it properly is already captured and unused.

## Decisions (from sign-off 2026-08-01)

- **Both** views ship: an aggregate projection **panel** and a **per-player**
  likelihood.
- **REVISED 2026-08-01 — the whole thing is admin-only.** The earlier decision
  put the aggregate panel on the public RSVP view; the owner reversed it to
  shut down the self-fulfilling-prophecy risk at the source. If the group never
  sees a low projection, a low projection cannot depress turnout.
- The model must **explicitly account for ghosts** — non-responders are a
  positive contribution to expected turnout, not a zero.
- **`MIN` headcount is cut** — see below; the data doesn't support it.

### What admin-only buys, beyond the prophecy fix

Worth noting because it removes real complexity and risk:

- **One gate, not two.** `requireAdmin` on the whole endpoint. No
  split-payload logic that returns different shapes to different callers — the
  exact pattern where a refactor later leaks per-player flake rates onto a
  public page.
- **No leak surface.** Nothing to audit against the shareable match/monthly
  PNGs, which are pasted straight into the group chat.
- **Compute drops to near-zero.** A handful of admin page loads a week instead
  of every member checking the poll — see the compute section.
- **It matches where the data already lives.** The Reliability tab is already
  `requireAdmin`; this is the same data answering a forward-looking question,
  so it belongs behind the same gate. Strong argument for putting the panel
  *on the Reliability tab* rather than the RSVP page — see open question 3.

## The model

Every non-guest roster player sits in exactly one bucket for the game:
`yes` / `maybe` / `no` / `no-response`. Each contributes an independent
Bernoulli show-probability.

### Per-bucket base rates (league-wide, over tracked games)

A *tracked game* is one with a non-empty `teamAssignments` roster — the same
definition the Reliability endpoint already uses. *Showed* = appears on a
roster.

| Bucket | Base rate | Name for "showed anyway" | Status today |
|---|---|---|---|
| `yes` | showed ∧ committed ÷ committed | — (that's just reliability) | ✅ already computed |
| `maybe` | showed ∧ maybe ÷ maybe | **converted** | ❌ **must be added** |
| `no` | showed ∧ said-no ÷ said-no | **reversal** | ❌ **must be added** |
| `no-response` | showed ∧ no RSVP row ÷ no RSVP row | **ghost** | ⚠️ **must be split out** |

### Terminology — corrected 2026-08-01 (owner)

**A `maybe` who turns up is NOT a ghost.** They told the group something; they
just hedged. A **ghost** is someone who said *nothing at all* and turned up.
Only the `no-response` bucket is ghosting. A `maybe` who shows has *converted*;
someone who said Out and came anyway is a *reversal*.

This is not just naming. **The shipped Reliability tab is currently wrong by
this definition.** `stats.ts:1261` computes:

```ts
if (!committedThis && onRoster) ghost++;
```

`committedThis` is `status === 'yes'`, so that counter lumps maybe-and-came,
no-and-came, and said-nothing-and-came into one column labelled **"Ghost"** in
`ReliabilityTab.tsx:137`. Players who reliably say Maybe and reliably turn up
are being shown to admins as ghosts right now. Fixing this is Phase 1 and it
stands on its own merits regardless of whether the projection ever ships.

Splitting the counter three ways is the single most important change in this
feature — as a *predictor*, "said Maybe and came" and "said nothing and came"
carry completely different weight, and averaging them destroys both signals.

### Per-player estimate — shrinkage, not raw rates

A raw per-player rate is worthless at low N: one player who said In once and
came reads as 100%. Use empirical-Bayes shrinkage toward the bucket base rate:

```
p̂(player, bucket) = (showed_in_bucket + m · base_bucket) / (n_in_bucket + m)
```

with prior strength `m = 5` (tunable). At `n = 0` this returns exactly the
league base rate; it converges on the player's own rate as their sample grows.
This is what stops the feature from libelling a newcomer.

### Aggregate

```
E[turnout] = Σ_p p̂_p  +  E[guests]
Var        = Σ_p p̂_p (1 − p̂_p)          # Poisson-binomial
E[guests]  = guestsIndicated_this_game × (summary.guestsShown / summary.guestsIndicated)
```

`P(turnout ≥ MIN)` is computed **exactly** by Poisson-binomial DP — O(n²) over
~40 players is nothing, and it avoids a normal approximation that would be
poor in exactly the tail we care about. Displayed range is `E ± 1·SD` (~68%).

### `MIN` is CUT — the data says it's a dead number (2026-08-01)

Owner asked what the point of a minimum headcount was. Checked against the real
season. **Total bodies per tracked game (guests included), 30 games:**

```
14,15,16,18,18,18,19,19,19,19,20,20,20,20,22,22,22,22,22,23,23,24,24,24,24,25,26,26,26,28
min 14 · p10 16 · median 22 · max 28
games below 12: 0 / 30
games below 14: 0 / 30
```

⚠️ **Two turnout scales exist and mixing them is a bug** (found and fixed during
the build): non-guest-only turnout runs min 11 / median 17, while total bodies
runs min 14 / median 22. The Poisson-binomial is over rostered players
(non-guest); everything the panel *displays* is total bodies. The threshold is
therefore shifted by the expected guests before being evaluated against the
distribution.

**Turnout has never once been below 14 this season.** `P(≥12)` would read 99.9%
every single week for the rest of time. It is a number that answers a question
the club does not have — and a permanently-green metric trains people to stop
reading the panel at all.

`MIN` is therefore **cut from the design.** Good call; it was my proposal and
the data doesn't support it.

### What replaces it

The spread is the story: **14 to 28 is a 2× swing**, and knowing on Thursday
whether Saturday looks like 16 or 26 is genuinely actionable for team sizes.
So the panel leads with magnitude, not a threshold:

1. **Projected turnout + range** — `19 expected · likely 16–22`. The core
   deliverable, no arbitrary bar required.
2. **Delta vs the season median** — `4 below your usual 22`. This is the
   informative comparison and it *self-calibrates*: it stays meaningful as the
   club grows or shrinks, with no constant to maintain and no November ritual
   like `ROSTER_BY_YEAR`.
3. **A "thin week" flag, on the bottom decile only** — fires when the
   projection falls below the season p10 (18 this year, computed not
   hard-coded). Historically that's 2 of 27 games, so it stays rare enough to
   mean something when it appears. This is the one place a probability earns
   its keep: `P(turnout < p10)`, still by exact Poisson-binomial.

Note today's game (1 Aug) came in at 18 — bottom decile. The flag would have
fired, which is a decent sanity check that the threshold is set somewhere real.

### Honesty guards

- Every figure shows **N** (tracked games behind it).
- Below `MIN_TRACKED_GAMES` (propose 6), the hero renders a plain
  "not enough history yet — N games tracked" state and **no percentage**. A
  confident-looking number off 3 games is worse than no number.
- The per-player badge shows the shrinkage: a player with `n = 0` in their
  bucket is visibly marked as "league average", not as a personal read.

## Compute strategy — no scheduler at all (revised 2026-08-01)

Owner asked whether there's a better way than the Saturday 05:00 cron to
minimise compute. **Yes: don't schedule anything.** A weekly cron is *strictly
worse for Neon than nothing*, because it wakes the compute on a timer whether
or not a single person looks at the page. Zero scheduled wakes beats one.

### Why the "heavy scan" framing was wrong

I overstated the cost in the first draft. The actual dataset:

| Table | Rows |
|---|---|
| `Game` | 27 tracked (2026) |
| `Player` | 83 |
| `GameRsvp` | ~414+ |

That is nothing — a few hundred rows, milliseconds to scan. And the decisive
detail: **`GET /api/stats/reliability` already does this exact full scan, with
no caching, on every single admin page load today** (`stats.ts:1217-1221`,
three unbounded `findMany` calls) and it has never been implicated in the
compute burn. The projection is the same query shape. There is nothing here
that needs precomputing.

### The design

- **No cron. No `TurnoutSnapshot` table. No scheduler.**
- Compute inline in the request, reusing the same three `findMany` calls the
  reliability endpoint already makes.
- **Module-level in-process memo**, invalidated on any `Game` or `GameRsvp`
  write. A web-service restart just recomputes once on first hit.
- Arithmetic (shrinkage + Poisson-binomial DP) is pure CPU and never touches
  the DB.

### Neon cost: zero additional awake-time

Neon bills **wall-clock awake time** and suspends after 5 idle minutes. The
29 Jul blowout was a **background loop** querying every ~2.5 min forever — it
never let the compute sleep. It was not user traffic, and it was not scans.

Every hit to this feature rides a request in which the compute is *already*
awake (the admin is loading a page that queries anyway). The governing rule is
therefore simply: **add no new background poller.** This design adds none. The
Saturday cron would have added exactly one.

Now that the panel is admin-only (below), it's hit a handful of times a week by
one or two people, which makes even the memo close to unnecessary — it's in
there for tidiness, not for Neon.

## Success criteria

- Admin-only panel: projected turnout, a likely range, the delta vs the season
  median, and a thin-week flag on the bottom decile — with the
  In / Maybe / Out / no-reply contribution breakdown, ghosts named correctly.
- Admin-only per-player % beside each name.
- Projection accounts for ghosts (silence → showed) as a positive expected
  contribution, and counts converted Maybes separately.
- **Non-admins receive nothing** — the endpoint is `requireAdmin`, so there is
  no payload to leak and nothing merely hidden in the DOM.
- The public RSVP view renders **exactly as it does today**, unchanged.
- **No new background poller**; no scheduled Neon wake-ups.

## Scope

**In**
- Backend: extend the reliability aggregation to compute the four bucket base
  rates and per-player per-bucket counts; split `ghost` three ways.
- Backend: `GET /api/games/:gameId/turnout`, **`requireAdmin`** — aggregate
  projection + `players[]` in one payload. Single gate, no split shapes.
- Backend: in-process memo invalidated on `Game`/`GameRsvp` writes. No cron,
  no snapshot table — see the compute section.
- Frontend: `TurnoutProjection` panel, rendered only for admins. Placement per
  open question 3.
- Frontend: per-player % beside each name, same admin gate.
- Reliability tab: surface the new maybe/no/silence show rates, which are
  interesting on their own.

**Out (for now)**
- **Field / venue effect on turnout.** `FieldStat.location` and the
  stadium-vs-grass split exist and it is tempting. With the current number of
  tracked games this is overfitting a coin flip — it would produce a
  confident-looking number with no predictive content. Revisit at 20+ tracked
  games per venue.
- Weather, seasonality, holiday and opponent effects. Same reasoning.
- Time-decay weighting (recent games counting more). Defensible, but it cuts
  the effective sample further at exactly the moment the sample is smallest.
  Phase 2.
- Any notification or nudge triggered by a low projection.
- Predicting *which* specific players will no-show as a published list.

## Constraints

- **Sample size is the binding constraint, not the maths.** Verified
  2026-08-01: **27 tracked games** in 2026 with a roster. That is a usable but
  thin base — enough for league-wide bucket rates, thin for per-player ones,
  which is exactly what the shrinkage prior is for. The build must degrade
  gracefully and self-suppress below the threshold rather than assume a rich
  history.
- Attendance proxy is still roster placement, inherited from the Reliability
  PRD: a player present but never placed on a team doesn't count as shown.
- Everything here is admin-only, so no constraint on what the public view may
  imply about a named person.
- Guests are anonymous headcounts attributed to the inviting player.

## Plan

- **Phase 1 — base rates + the ghost fix.** Split `ghost` into
  ghost / converted / reversal, correct the mislabelled Reliability tab column,
  add the maybe/no/silence rates. Small, **fixes a live bug**, independently
  useful, and it reveals the true sample size before anything is built on top
  of it. Not blocked by the listener — it reads data that already exists.
  **Ship and read the numbers before Phase 2.**
- **Phase 2 — projection endpoint.** Shrinkage estimator + Poisson-binomial DP
  + `requireAdmin` + in-process memo. Unit-test the DP against a brute-force
  enumeration for small n.
- **Phase 3 — UI.** Admin panel, then the per-player badge.

Each phase: `tsc` + prod build gate, browser smoke mobile + desktop.

## Risks

- 🔴 **THE BLOCKER: the RSVP data tap is currently switched off.** Verified
  live 2026-08-01: `GET /api/whatsapp/health` → `{"status":"disabled",
  "linked":false}`. `status: "disabled"` means `WHATSAPP_LISTENER_ENABLED` is
  no longer `true` — the listener has been **turned off by env var**, which is
  almost certainly *how* the Neon burn was stopped (no listener, no 2.5-min
  poll loop, compute sleeps). Effective and pragmatic.

  But the WhatsApp listener is the thing that writes `GameRsvp` rows, and
  `GameRsvp` is the **entire input** to this feature. With it disabled, no new
  RSVP data is arriving at all. A turnout model built on a frozen dataset will
  look fine in dev and be worthless in production. Feature 2 is therefore
  blocked on one of:
    1. re-enabling the listener (which needs `fix/neon-compute-burn` **merged**
       first, or the burn returns), or
    2. the admin keying RSVPs in manually / via the screenshot-backfill script,
       accepting that the data is only as fresh as someone's effort.

  This must be resolved before Phase 2. Phase 1 (the ghost split) is still
  worth doing immediately — it fixes a live mislabelling bug on data that
  already exists.

- 🟠 **Neon: incident resolved, root cause NOT merged.** Prod is confirmed back
  up (`/api/players` → 200 in 2.0s, 2026-08-01). But `origin/main` is still at
  `c14bc97` (27 Jul) and contains none of the fix — `pruneSessionInterval` is
  absent from `main` and present only on `origin/fix/neon-compute-burn`. So the
  *incident* can be closed; the **branch cannot**. The session-pruning burn
  (~65 CU-h/mo on its own, independent of the listener) is still in the code
  that's running. Re-enabling the listener without merging first re-creates the
  original failure.

- ✅ **Social risk — mitigated.** A public per-player flake percentage would be
  corrosive in a club WhatsApp group. Everything is now behind `requireAdmin`,
  so there is no public payload at all.

- ✅ **Self-fulfilling projection — mitigated at the source** (owner decision,
  2026-08-01). The group never sees the projection, so a low projection cannot
  depress turnout. Residual risk is human: an admin who *relays* a low number
  into the group chat recreates the problem by hand. Worth a line of copy on
  the panel itself — "admin only, don't paste this into the group" — since the
  share-to-WhatsApp habit is already well established in this app.

## Resolved (2026-08-01)

1. ✅ **`MIN` is CUT.** Proposed 12, then checked the data: turnout has never
   been below 14 in 27 games. `P(≥12)` = 99.9% forever. Replaced by projected
   headcount + range + delta-vs-median + a bottom-decile thin-week flag.
2. ✅ **Month view gets both** the OG leaderboard and a wooden-spoon award
   section, plus two achievements.
3. ✅ **1 Aug own goals** were logged as goals credited to a player on the
   benefiting team — scoreline correct, attribution wrong. Correction path
   documented above.
4. ✅ **Ghost ≠ maybe-who-showed.** Terminology corrected; exposed a live bug in
   the shipped Reliability tab.
5. ✅ **Compute:** no scheduler, no snapshot table. Inline + in-process memo.
   The Saturday cron was considered and rejected — it would have been the only
   scheduled Neon wake in the design.
6. ✅ **Visibility: admin-only, entire feature.** Reverses the earlier
   hero-public decision; kills the self-fulfilling-prophecy risk at the source.

## Open questions

1. **Prior strength `m`.** Proposed 5. Higher = more conservative, everyone
   reads closer to league average, fewer unfair reads, less signal. Worth one
   look at real data in Phase 1 before locking.
2. **Does a `maybe` get its own line in the breakdown?** Proposed: yes, with
   its own expected contribution, never folded into "In" — consistent with the
   corrected terminology.
3. **Where does the admin panel live?** Now that nothing is public, putting it
   on the RSVP page is no longer obviously right. *Recommend:* the
   **Reliability tab**, which is already `requireAdmin` and already holds this
   exact data — the panel becomes its forward-looking counterpart, and the
   public RSVP view stays untouched with zero conditional rendering. The
   counter-argument is context: the projection is most useful sitting next to
   the poll you're reading. Owner's call.
4. **How does the RSVP data tap get turned back on?** See the blocker. This is
   a decision about the listener and the unmerged branch, not about this
   feature, but Feature 2 cannot ship useful output until it's answered.


---

# Build report — 2026-08-01

## Validation

`backend/scripts/verify-turnout.ts` — 27 assertions, all pass. Poisson-binomial
DP checked against brute-force subset enumeration for n≤6; distribution sums to
1 at n=45; shrinkage verified (a 1-for-1 player reads 83%, not 100%).

`backend/scripts/backtest-turnout.ts` — replays all 27 games that have RSVP data:

| | MAE | within ±1sd |
|---|---|---|
| **Model** | **2.65** | 18/27 = 67% (68% expected) |
| Naive "count the In votes" | 4.48 | — |

**41% more accurate than counting In votes**, and the uncertainty band is
essentially perfectly calibrated. Mean bias +0.64 (slightly over-predicts).
Caveat: base rates are fit in-sample, including the game being predicted.

Live check on game 31 (1 Aug): projected **19**, range 17–21, actual **18**.

## What the real data showed

Base rates over 30 tracked games:

| They said | Show rate | n |
|---|---|---|
| In | 85.0% | 387 |
| Maybe | 47.3% | 74 |
| Out | 0.0% | 10 |
| **Nothing** | **9.2%** | 1599 |

The ghost mislabelling was real and material — the worst-affected player showed
as "Ghost = 12" when 8 of those were converted Maybes (i.e. they said Maybe and
turned up); another read 12 with 7 converted. Both are reliable attenders the
tab currently presents to admins as ghosts.

**Guests show up more than they're flagged**: 119 shown vs 75 indicated. A
flagged × conversion multiplier would have collapsed to zero on the many weeks
nobody flags anyone, so the model uses flagged + the season's average unflagged
surplus (≈1.5/game) instead.

## Known limitation

The `silent` bucket denominator is 1599 (≈55 players × 30 games), which includes
players who were never active in a given period. This dilutes the league ghost
prior. Per-player shrinkage dominates for anyone with real history, so the effect
is small, but a "reliability universe" restricted to a player's active window is
the obvious Phase 2 refinement — it was open question 1 in the original
`RSVP_RELIABILITY_PRD.md` and remains open.

## Repo landmine found

`backend`'s `npm run build` is `prisma generate && tsc && prisma db push
--accept-data-loss` — it pushes schema to whatever `DATABASE_URL` is in `.env`,
which locally is **production**. Harmless here (no schema change; Prisma reported
"already in sync"), but any future local build with an edited `schema.prisma`
would push it straight to prod.
