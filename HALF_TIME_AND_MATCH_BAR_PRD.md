# PRD — Half Time, the Playing Clock, and the Match Bar

Status: **DRAFT — awaiting sign-off.** Nothing built.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-22

Follow-on to `GAME_CLOCK_AND_GOLDEN_GOAL_PRD.md` (built and deployed 2026-08-15).
That PRD introduced kick-off, arming, and the weighted decider; this one fixes
what half time does to all three. Decision mockup:
https://claude.ai/code/artifact/c97e7e8c-b68b-4a48-8c7f-7b907d4ca0b8

---

## Problem

Three gaps, all sitting on the same control row.

1. **Half Time never finishes.** `handleRecordGameEvent('halfTime')` appends an
   event and nothing else changes — the button stays live, so it can be tapped
   again, and again, each tap writing another event. Nothing records when play
   resumed, so the app cannot tell a break from a match still running.
2. **The clock counts the break as football.** Elapsed time is
   `now − startedAt`, flat. A twelve-minute half-time break is twelve minutes of
   match time the group never played, and every threshold hanging off that
   number inherits the error.
3. **Arming golden goal happens somewhere else.** It appears as a prompt card
   that interrupts at 80 minutes and can be dismissed, after which there is no
   way back to it. The one thing the admin needs at the end of a match is the
   one thing not on the control row.

## Decisions (owner, 2026-08-22)

These are settled. Recorded so the build doesn't re-litigate them.

1. **Layout: Option A — one slot.** Start 2nd Half takes the slot Half Time
   vacates. The row stays 50/50 with Game Over, which therefore holds the same
   position and the same width for the entire match. Rejected: the 67/33 variant
   that spans both vacated slots — it shrinks Game Over exactly when it matters
   and makes tap-by-position unsafe mid-match.
2. **Golden Goal joins the bar** and is the only way to arm. It appears **once
   80 minutes of play have elapsed** and not before. Both current entry points
   go away: the 80-minute prompt card and the underlined link beside the clock
   (`GameModuleExpanded.tsx:1247-1251`).

   ⚠️ **This knowingly reverses the 2026-08-15 decision** that arming should not
   be gated on the threshold, whose stated reason was that the group often
   doesn't play a full 90. Owner was shown the consequence twice and chose the
   clean single-entry row anyway (2026-08-22): a match that winds up before 80
   minutes of play can no longer be armed at all. **If short games start losing
   their decider, this is the line to revisit** — the cheap fix is restoring the
   clock link, and the better one is lowering the threshold, not adding a second
   control.
3. **The clock stops at half time** and restarts on Start 2nd Half.
4. **Halves only.** Quarters may follow later, to account for water breaks —
   *not* for injury time. The clock must be built so quarters are an addition,
   not a rewrite, but no quarter logic ships here.
5. **The restart timestamp will feed match analytics — in the next PRD, not
   this one.** Ship the event, accumulate real games, change the numbers later.

## Success criteria

- Tapping Half Time records exactly one `halfTime` event, and the button is gone
  from the row immediately afterwards.
- A second `halfTime` event cannot be created by tapping. (Legacy games that
  already have duplicates keep them and still render.)
- Start 2nd Half appears in the vacated slot, records a `secondHalfStart` event,
  and then vanishes, leaving Game Over.
- The displayed clock does not advance between the two taps, and resumes from
  the value it held.
- With a 10-minute break, a match reads ~10 minutes lower at full time than the
  same match would read today.
- Golden Goal appears on the row once 80 minutes of *play* have elapsed, arms
  behind a confirm with the same frozen `n` and `trailing` values it uses today,
  and leaves the row once armed. It cannot be dismissed — it stays until armed
  or the game ends.
- Deleting a `halfTime` event in Game Summary restores the Half Time button with
  no separate undo path.
- Every one of the ~30 existing games with a `halfTime` event and no restart
  renders an unchanged clock.

## The clock, precisely

Today: `elapsed = (gameOverAt ?? now) − startedAt`.

Proposed: elapsed is the **sum of play segments**. A segment opens at kick-off
or at a restart, and closes at a pause or at the current instant.

```
segments = fold(events):
  open   at startedAt
  close  at halfTime
  open   at secondHalfStart
  close  at (gameOverAt ?? now)
elapsed = Σ (close − open)
```

Written as a fold over an ordered event list rather than an if-tree for two
halves. Quarters later mean adding two more markers to the same fold — which is
decision 4 honoured at its full cost, roughly ten lines, and no more.

**Three cases, because history is not uniform:**

| Events present | Game state | Elapsed |
| --- | --- | --- |
| `halfTime` + `secondHalfStart` | any | `(halfTime − start) + (end − restart)` |
| `halfTime`, no restart | live | frozen at `halfTime − start` — a real break |
| `halfTime`, no restart | `gameOver` present | `end − start`, unchanged — **legacy** |

The third row is the one that matters. Every game played before this ships has a
`halfTime` and no restart, and the naive rule would either freeze those clocks
forever or silently subtract a break that was never measured. Legacy games must
render exactly as they do today; the new arithmetic applies only to games that
have a restart event, or that are live right now.

Where duplicate `halfTime` events already exist, the **first** one wins,
matching `tempo.ts:74` and `achievements.ts:122`, which both use `.find`.

### What moves as a consequence

`elapsedMinutes` currently drives three things. Two of them shift.

- **Golden goal offer, 80 min** (`GOLDEN_GOAL_PROMPT_MINUTES`) — now 80 minutes
  of play. Fires later in wall-clock terms by the length of the break. This is
  the point of the change: a long half-time break used to eat into the 80.
- **Full-time nudge, 90 min** (`FULL_TIME_PROMPT_MINUTES`, 20-minute snooze) —
  same shift, same reasoning. Confirm you want the nudge on play time too; the
  alternative is to leave it on wall clock, which I do not recommend, because
  then two thresholds on one screen mean two different things by the same word.
- **Clock display** — the visible change.

Nothing on the backend reads the display clock. `tempo.ts` and
`achievements.ts` work from raw event timestamps, so pausing is a frontend
concern and **no historical analytic moves in this cut.** That is what makes
decision 5 cheap to defer.

## The bar, state by state

Admin only, as now. Never more than three buttons.

| State | Row |
| --- | --- |
| Before kick-off | `Start Game` · `Half Time` · `Game Over` |
| First half, < 80 min | `Half Time` · `Game Over` |
| First half, ≥ 80 min | `Half Time` · `Golden Goal` · `Game Over` |
| Half-time break | `Start 2nd Half` · `Game Over` |
| Second half, < 80 min | `Game Over` |
| Second half, ≥ 80 min | `Golden Goal` · `Game Over` |
| Armed | `Game Over` |
| Full time | nothing |

Golden Goal's condition is today's `canArmGolden` — started, not over, not
already armed — **plus** `elapsedMinutes >= 80`. Since 80 minutes of play can
only be reached after the break in any normal match, the three-button row is the
uncommon case: it needs a game that passed 80 without half time being tapped.

**Every state is derived from `gameEvents` and `startedAt`.** No new boolean
state, no flags to keep in sync — which is what makes deleting an event in Game
Summary restore the button it belongs to, for free.

`Start 2nd Half` is styled `bg-success`, the green Start Game uses: both start
play. Gold stays reserved for Game Over, the button that ends something.

**Game Over stays tappable in every state**, including the break. Matches get
abandoned, and a row that traps the admin is worse than a game recorded with a
half time and no restart.

## Scope

**In.** The `secondHalfStart` event type end to end; segment-sum clock with the
legacy fallback; the bar's derived states; Golden Goal on the bar with a confirm
step; Game Summary label, time-edit, and delete support for the new event;
removal of *both* existing arm entry points — the 80-minute prompt card and the
underlined link beside the clock.

**Out.** Quarters and water breaks. Any change to `tempo.ts`, `achievements.ts`,
or match analytics. Pausing for injuries or stoppages. Auto-stamping full time.
Backfilling restart times onto historical games — unknowable, and inventing them
would poison the analytics change that comes next.

## Constraints and traps

- 🔴 **The enum ships first.** `backend/src/schemas/game.ts:30` validates events
  against `z.enum(['halfTime','gameOver','goldenGoalArmed'])`. A frontend that
  writes `secondHalfStart` against an old backend fails validation for the
  **whole game save** — goals and stats included — mid-match, on the sideline.
  Backend deploys and is confirmed live before the frontend goes out. Render
  builds the two services independently, so this is a real ordering risk, not a
  theoretical one.
- **No migration.** `Game.gameEvents` is a JSON string column. Nothing to push.
- `achievements.ts:16` re-declares the event union and must widen with it, even
  though it only ever reads `halfTime`.
- **The full-time nudge is currently suppressed while the golden prompt shows**
  (`GameModuleExpanded.tsx:307`, `!showGoldenPrompt`). Deleting the prompt card
  removes that anchor; the clause needs re-pointing at "golden goal is offered
  but not yet armed" or the two prompts collide at 90 minutes.
- **Headless.** I cannot browser-smoke this. First live use is the smoke test,
  same as the clock itself — which is still un-smoked from 2026-08-15, so this
  build is also that build's first real exercise.

## Plan

| Phase | Work | Verify |
| --- | --- | --- |
| 0 | Widen the zod enum and the `achievements.ts` union. Deploy backend alone. | Confirm the live API accepts a `secondHalfStart` event before any UI can send one. |
| 1 | Segment-sum clock with the three-case rule. | Unit-check the fold against all three cases plus a duplicate-`halfTime` game, stubbed — no DB. |
| 2 | Derived bar states, `Start 2nd Half`, `Golden Goal` on the row, prompt card removed, Game Summary strings. | `tsc --noEmit` both packages; frontend prod build. |
| 3 | Owner smoke on a live match. | Checklist below. |

Estimate: phases 0–2 are a few hours. One file carries almost all of it
(`GameModuleExpanded.tsx`), and the row markup is already duplicated in that
file — see the two-line stat row lesson from 2026-08-09.

**Smoke checklist (owner, on the pitch):** kick off → clock runs → Half Time →
button swaps to Start 2nd Half and the clock freezes → wait a minute → clock
still frozen → Start 2nd Half → clock resumes from where it stopped → button
gone → past 80 min of play, Golden Goal appears → tap it → confirm names the
margin and team → arm → button gone, banner shows → Game Over → clock frozen at
full time. Then: delete the half-time event in Game Summary and confirm Half
Time comes back.

## Resolved (owner, 2026-08-22)

All five open questions answered — recommendations accepted as written.

1. **Golden Goal availability: option (c).** Bar only, at 80 minutes, both
   existing entry points deleted. Folded into decision 2 above, with its
   trade-off recorded there.
2. **Arming takes a confirm step.** The button opens a short confirm naming the
   effect — "next goal wins by 3 for White" — reusing the prompt card's copy
   before that card is deleted. One tap is faster; one tap is also how you arm
   the wrong `n` by fumbling the row.
3. **The full-time nudge moves to play time,** with the 90-minute threshold and
   20-minute snooze intact. Two thresholds on one screen now mean the same thing
   by the same word.
4. **The Golden Goal button does not stay on the bar after arming.** No disarm
   control — because **Game Over already is one**, for the case that matters.
   `isDecider()` is `!!armedEvent && !gameOverAt` (`GameModuleExpanded.tsx:341`),
   so recording full time stops any further goal being weighted, while goals
   already scored keep their multiplier: `value` is computed at scoring time and
   frozen onto the goal record (`:890-891`), never recomputed. A disarm button
   would therefore be redundant with Game Over when the intent is "stop the
   golden rule", and *wrong* when the intent is "I armed that by mistake, we're
   still playing" — which needs the match to continue. That second case is
   already served by deleting the `goldenGoalArmed` event in Game Summary, after
   which the derived row puts the Golden Goal button back on its own.
5. **The break gets no separate line in Game Summary.** "Half Time" followed by
   "2nd half started" already reads as a break.

## Open questions

None. Ready to build on sign-off.

## Sign-off

- [ ] Owner approves scope and the four open questions
- [ ] Phase 0 confirmed live before phase 2 ships
- [ ] Owner smoke on a live match
