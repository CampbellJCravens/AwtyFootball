# PRD — Time-Aware Attribution for Swapped Players

Status: **BUILT — phases 1-4 complete, awaiting deploy verification.**
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-23

Follow-on to `PAIRING_VARIETY_PRD.md`, which surfaced this while building the
rebalance prompt and deliberately did not fix it: changing historical numbers
must not ride along inside a UI nudge.

---

## Problem

A player who switches sides mid-game has their **entire game attributed to
whichever side they finished on.**

`achievements.ts:95` reads `game.teamAssignments[playerId]` — a flat map holding
one team per player per game. Two consequences, and only one of them is the
obvious one:

- **Double-credit is impossible.** One team, one result, one clean-sheet check.
  There is no "clutch for both sides" outcome; the structure forbids it. This
  was the owner's first concern and it is already safe.
- **Misattribution is real.** Goals conceded before the swap are counted against
  the side the player joined, and goals conceded after are counted as if they
  had been there all along.

### Measured, not theoretical

Every swap ever recorded (11, across all seasons), current attribution versus
time-aware:

| Game | Player | Swap | Conceded now → actual | Clean sheet |
| --- | --- | --- | --- | --- |
| #13 | Manny Suarez | white→color | 1 → **0** | **false → true** |
| #18 | Josh Jackson | white→color | 4 → **7** | — |
| #32 | Bayo Tojuola | color→white | 7 → **4** | — |
| #20 | Aihab Aboukheir | color→white | 3 → **1** | — |
| #30 | *(deleted player)* | white→color | 4 → **3** | — |
| #2 | Eric Saito | color→white | 5 → **4** | — |
| #5 | Brian Buhr | white→color | 6 → **7** | — |
| #5 | *(deleted player)* | white→color | 6 → **7** | — |

**8 of 11 swaps change the conceded count. One flips a clean sheet.** Manny
Suarez kept a clean sheet in game #13 and the app says he didn't — that one is
a player being denied something he earned, which is the case worth fixing on
its own.

The errors run in both directions: Bayo is charged three goals he wasn't on the
pitch for, Josh is spared three he was. `goalsAllowed` drives **Top Defender**
(`games*3 − goalsAllowed`), so both distort an award.

## The governing principle

**Fix the additive metrics. Leave the categorical ones alone.**

- **Additive / time-decomposable** — goals conceded, and therefore clean sheets.
  A goal happens at an instant, and the player was demonstrably on one side at
  that instant. These become time-aware.
- **Categorical / whole-game** — win/loss/draw, games played, "shared a side"
  for chemistry and pairing. These have no honest time-sliced answer: a player
  who spent 40 minutes on each side did not win 0.4 of a game. **These stay on
  the final team and get documented as doing so.**

This split is what keeps the change small and explicable. Anything that can be
summed over moments gets summed over moments; anything that describes the game
as a whole keeps describing the game as a whole.

## Success criteria

- Manny Suarez's clean sheet in #13 appears.
- Bayo Tojuola's `goalsAllowed` for #32 drops from 7 to 4; Josh Jackson's for
  #18 rises from 4 to 7.
- No player's games-played, win/loss record, goals, or assists move at all.
- A game with no recorded swap produces byte-identical numbers to today — which
  is every game but eleven.
- Untimestamped goals never silently vanish from a conceded count.

## Design

One helper, used everywhere team membership is read for an additive metric:

```
teamAtMoment(game, playerId, when) -> 'color' | 'white' | null
```

Built from `teamAssignments[playerId]` walked **backwards** through that game's
`teamChanges` of type `swap`: start from the final team, and for each swap later
than `when`, undo it. Backwards because the final assignment is the only value
we can trust — it is what the map actually holds.

**Rules that keep it safe:**

- **A goal with no timestamp is attributed to the final team**, exactly as today.
  Dropping it from the conceded count would quietly improve someone's record
  using missing data, which is worse than the bug being fixed.
- **A swap with no timestamp is ignored** — the same reasoning.
- Swaps are applied in timestamp order; a player who swaps twice is handled by
  the same walk with no special case.
- `null` (player not in the game) behaves as it does now.

## Blast radius

Reads of `teamAssignments` classified by whether they read the **value** (which
side) or only the **key** (who played):

| File | Reads | Affected? |
| --- | --- | --- |
| `services/achievements.ts` | 4 value, 1 key | **Yes** — `:111-113` clean sheets, `:228` goalsAllowed |
| `routes/stats.ts` | 8 value | **Partly** — the goalsAllowed/clean-sheet sites only |
| `services/percentiles.ts` | 2 value | **Yes** if a conceded-based metric is among the six bars |
| `services/reliability.ts` | key only | No — presence, not side |
| `services/churn.ts` | key only | No |
| `services/pairing.ts` | value | **No, by decision** — "shared a side" is categorical |

Each affected site is a call-site change, not a rewrite: `teamAssignments[pid]`
becomes `teamAtMoment(game, pid, goal.timestamp)` inside the goal loop.

## Data reality — what can and cannot be fixed

**Only eleven player-games are recoverable, ever.** Before `df43d36`
(2026-08-23) the app recorded no swaps at all — `handleTeamSelect` rewrote the
assignment silently — so every in-app move before that date is invisible and
always will be. The eleven that exist came from sheet import.

This is not an argument against the fix; it is the argument for doing it **now**
rather than later. Swap recording just started, and the rebalance prompt will
make swaps more frequent. Every week this stays unfixed adds player-games that
are wrong on purpose.

Two of the eleven belong to deleted players (orphaned ids in
`teamAssignments`), so their numbers will not surface anywhere.

## Scope

**In.** `teamAtMoment`, its use at the clean-sheet and goalsAllowed sites, the
untimestamped fallbacks, and tests over the eleven real swaps.

**Out.** Win/loss attribution. Games played. Chemistry, duos, pairing variety.
Any UI showing that a player switched. Backfilling swaps that were never
recorded — unknowable, and inventing them would be worse than the bug. Minutes
played, which the app does not track and this must not pretend to.

## Risks

- **A new clean sheet can unlock an achievement.** `clean_sheets_3` "Brick Wall"
  is computed live from stats, so Manny gaining #13 could cross a threshold and
  fire a notification. That is a correct unlock for a clean sheet he really
  kept, and the blast radius is at most 8 people (only 8 `User` rows have a
  linked `playerId`). Worth expecting rather than being surprised by.
- **Top Defender for a past month may change hands.** The award is recomputed on
  read, so a historical month could show a different winner than someone
  remembers. Eight player-games move; whether any month actually flips should be
  measured during the build and reported before merge.
- Nothing here is a schema change. `teamChanges` is JSON on the game row.

## Plan

| Phase | Work | Verify |
| --- | --- | --- |
| 1 | `teamAtMoment` in a service of its own | Unit tests: no swap, one swap, two swaps, untimestamped goal, untimestamped swap, player absent |
| 2 | Wire into the clean-sheet and goalsAllowed sites | Re-run the eleven-swap comparison; expect exactly the table above |
| 3 | Measure whether any monthly Top Defender changes hands | ✅ **ZERO months change hands** — every monthly winner Dec 2025 → Aug 2026 is identical before and after |
| 4 | `tsc --noEmit` both packages, frontend prod build | — |

Estimate: half a day. The measurement in phase 3 is the part worth not rushing.

## Resolved

1. **Win/loss stays on the final team** (owner, 2026-08-23). A player who
   swapped at 40 minutes did not win four tenths of a game, and "which team did
   you end up on" is how everyone remembers it.
2. **Chemistry and pairing stay on the final team** (owner, 2026-08-23). Same
   reasoning, plus a direct cost: counting both sides would reset a swapped
   player's `lastTogether` against a dozen people at once and suppress them from
   the pairing panel for weeks — one swap erasing the signal that panel exists
   to show.
3. ~~Show a swap in Game Summary?~~ **CLOSED by inspection, 2026-08-23 — already
   built.** `GameModuleExpanded.tsx:1704` renders "X swapped from Color to
   White" with a timestamp, editable and deletable like every other entry. It
   simply never fired before, because nothing recorded a swap until `df43d36`.
   Nothing to decide and nothing to build.

## Sign-off

- [x] Owner approved the additive-vs-categorical split, 2026-08-23
- [x] Both open questions answered "leave as is"; the third closed by inspection
- [x] Phase 3 measured and reported: **no month's Top Defender changes hands**
- [ ] Owner browser smoke (headless here)
