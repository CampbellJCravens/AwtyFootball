# Early Departures — "Lack of Stamina" — PRD

**Status:** DRAFT. Open questions RESOLVED by owner 2026-08-29. Awaiting build go-ahead.
**Drafted:** 2026-08-29
**Trigger:** owner asked whether the monthly report tracks "players that quit before the end of the game", and asked for it on monthly + yearly reports. Owner adds: **a lot of players asked for this at today's game.**

---

## Problem

Players leave before full time. Nothing surfaces it, so a player who reliably
plays 45 of 90 minutes is indistinguishable from one who plays every minute —
in the reports, in Reliability, and in the standings his team still counted him
against the roster.

The data to answer this **already exists and always has**: `Game.teamChanges`
carries `{ playerId, timestamp, team, type: 'leave' }`. There are **51 leave
events across 18 of 35 games** (2 in 2025, 49 in 2026). No schema change is
needed to count departures.

What does **not** exist is the ability to say *when* somebody left.

---

## Owner rulings (2026-08-29) — settled, do not re-litigate

1. **Leaving at half time COUNTS.** Rationale, and it is the right one: a
   departure at the break still forces a rebalance and changes the dynamic of
   the second half. The cost lands on the people who stayed either way, so the
   metric measures the cost, not the excuse. *(This overrules the draft's
   recommendation to exclude break-leavers.)*
2. **It goes on the shared monthly and yearly reports** — not admin-only. The
   feature was requested by the players themselves, which removes the
   self-fulfilling-prophecy concern that made the turnout projection admin-only.
3. **Category name: "Lack of Stamina."**

---

## The data finding that still shapes the build

Departure **timing** requires a match clock, which requires `Game.startedAt`.
The start button only shipped 2026-08-22.

| | count |
|---|---|
| Games total | 35 |
| Games with a roster (tracked) | 34 |
| Games with `startedAt` | **3** |
| Leave events total | **51** |
| Leave events with a computable match minute | **4** (all game #35) |

So a "left at 62' — played 71% of the match" view has **one game of data** and is
out of scope for this cut. **The count does not need it** and works across all
51 events going back to 2025.

Sample shape, now that break-leaves count: roughly **half of the 51 events sit
within ~3 minutes of the `halfTime` marker**, and all 4 of game #35's were
inside the break. Under ruling 1 these are all in, which means the metric has
plenty of signal from day one rather than a thin tail.

Current leaders across all history: **Jon Schwarz 11 · Mike Missouri 6 · David
Ramos 5.** Everyone else is 1–2.

---

## Success criteria

1. Monthly and yearly reports show a **Lack of Stamina** entry using all 51
   historical events, not just post-22-Aug ones.
2. The metric has a denominator: departures per game *played*, so an
   ever-present regular is not out-ranked by someone who appeared twice and
   left once. Raw count shown alongside.
3. Guests (`/^Guest\d+$/`) excluded, matching every other player metric.
4. A period with no departures renders **nothing** — no dead row on a quiet
   month, matching the own-goal conditional pattern.
5. No new background poller, no schema migration, no new always-on compute.

---

## Scope

### In
- **`backend/src/services/departures.ts`** — per player: `departures`,
  `gamesPlayed`, `departureRate`. Wired into the existing month/year stat
  payloads.
- **Break vs mid-half split computed and stored, but NOT shown.** Costs nothing
  (`atBreak` = timestamp between `halfTime` and `secondHalfStart`, or within
  3 min of `halfTime` when no restart event exists; else `midHalf`; no
  `halfTime` event = counted, unsplit). Ruling 1 puts both in the headline
  number, but keeping the split means changing that later is a display change,
  not a re-derivation.
- **Monthly report:** a "Lack of Stamina" line in the existing stats block —
  the month's departure count and the 1–3 players it came from.
- **Yearly report:** same, season-scoped.

### Out (deliberately)
- ❌ **Match-minute / %-of-match-played timing.** Deferred on DATA, not effort.
  **Trigger to revisit: ~6 games with `startedAt` AND a leave event** (matches
  Reliability's existing `MIN_GAMES = 5` floor) → early October 2026. The fold
  already exists at `frontend/src/utils/matchClock.ts`, needs porting backend.
- ❌ Retroactive backfill of `startedAt` on the 32 games that lack it. There is
  nothing to derive it from; inventing kick-off times to populate a stat is how
  the 482-minute game happened.
- ❌ Feeding departures into the turnout projection or the Reliability
  show-rate. Separate metric, separate cut.
- ❌ Achievements, in either direction. A "played every minute" badge needs the
  timing data that does not exist yet.
- ❌ A per-player exemption for standing "first half only" arrangements. Ruling 1
  says the cost lands on the team regardless, so an exemption would contradict
  it. Revisit only if a named case actually looks wrong on a report.

---

## Constraints

- `teamChanges` is a JSON string column with **no FK** — resolve player ids
  against `Player` or deleted/`GuestN` slots leak in as names.
- Reports are canvas PNG renderers
  (`frontend/src/utils/renderMonthlyReportImage.ts`, `renderYearlyReportImage.ts`)
  — every addition costs vertical space and must be laid out, not appended.
- `type: 'leave'` is also how an admin corrects a mis-added player. Some of the
  51 are data cleanup, not departures, and **there is no way to tell them apart
  after the fact.** Accepted as noise. Worth a `reason` field only if the
  reports start showing entries the owner knows are wrong.
- The 2025 sample is 2 events; the 2025 yearly view will read as ~0. Honest,
  not broken.

---

## Plan

**Phase 1 — rollup (small):** `departures.ts` + wiring into the month/year stat
payloads. Verify against the 51 known events and the three known leaders.

**Phase 2 — display:** the "Lack of Stamina" line on each report, behind the
own-goals-style conditional.

**Phase 3 — deferred:** timing, once ~6 clocked games exist.

Phases 1+2 are one sitting. No migration. No deploy risk beyond the reports.

---

## Remaining open question

**Monthly report layout:** what gets cut to make room for the Lack of Stamina
line, or does the canvas grow? This is the only thing that blocks Phase 2 —
Phase 1 can be built without an answer.

---

## Naming note (owner said "or something like that")

"Lack of Stamina" is recorded as the decision and will be built as such. One
alternative worth 10 seconds of thought before it ships to 55 people: the
owner's own rationale is about **rebalancing cost**, not fitness — and some
departures are a work call, not a fitness ceiling. An inverse, positively-framed
column ("Ironman", "Went the Distance") ranks the people who stayed and conveys
identical information without asserting a cause. Owner's call; no work depends
on it until Phase 2.

---

## Rejected

- **Inferring departure minute from surrounding goals.** Correlating a leave
  timestamp to nearby goal timestamps gives a position in the *scoring*
  sequence, not the clock, and low-scoring games give nothing.
- **Adding `Game.endedAt`.** `gameOver` already exists as an event; a second
  source of truth for the same moment is how the clock got confusing the first
  time.
