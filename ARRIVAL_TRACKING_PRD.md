# PRD — Arrival tracking (punctuality)

**Status:** ✅ BUILT 2026-09-05, uncommitted on `main`. 🔴 Never browser-smoked.
**Grace window:** **8 minutes** — owner's call, splitting his 5 and my 10.

**One requirement discovered during the build and NOT in the original draft:**
`TRACKING_FROM` (`services/arrivals.ts`). Games #33–#36 already carry a `startedAt` but
predate `join` capture, so every player in them has no join row — which the service read as
"was there at kick-off" and scored as a flawless **100%**. Absence of evidence rendered as
evidence of punctuality, across 29 players. Caught by running the real endpoint against prod
before shipping, not by the types. Only games kicking off from **2026-09-06** are measured;
the constant must be on or after the deploy day and may only ever move forward.

**Raised:** 2026-09-05 by the owner: *"track when people join a game for individual players
(are they present at the game start, joined within 5 min or 2nd half, etc.) … added to the
reliability tab."*

## Problem

The club has a departures half and no arrivals half. **Lack of Stamina** measures who leaves
early; nothing measures who turns up late — and late arrivals impose the same cost, because
the sides get picked around who is standing there at kick-off.

### What already exists (and what doesn't)

The owner's read was *"some of this data should already be available."* Half right, and the
half that's missing is the important one:

| Piece | State |
|---|---|
| Kick-off reference (`Game.startedAt`) | ✅ Exists — **but only on 4 of 36 games** (#33–#36, from 2026-08-15) |
| Half-time boundary (`halfTime` event) | ✅ Exists on **32 of 36 games** — the best-covered clock signal by far |
| `secondHalfStart` event | ⚠️ Only **2 of 36 games** — too sparse to key anything on |
| Early departures (`teamChanges` type `leave`, timestamped, with reasons) | ✅ Fully built and shipped |
| **When a player joined the roster** | ❌ **Does not exist anywhere** |

`Game.teamAssignments` is a plain `Record<playerId, 'color' \| 'white'>` with **no timestamps**,
and `teamChanges` only knows two types — `z.enum(['leave', 'swap'])` in `schemas/game.ts:40`.
There is no `join`. Nothing in 36 games records when anybody arrived.

**So this is a real build, not a read-side rollup — and none of it can be backfilled.**

## Success criteria

1. Every player on a started game falls into exactly one arrival bucket, with no extra taps
   for the owner beyond what he already does.
2. The Reliability tab shows punctuality per player, over a games floor, alongside the
   existing reliability columns.
3. A game where the clock was never started contributes **nothing** — it never silently
   scores everyone as on time.
4. Guests (`GuestN`) are excluded, like every other player metric.

## Proposed capture — timestamp the tap he already makes

When a latecomer turns up, the owner **already** puts them on a team from the Choose Teams
list. That action is the arrival. It just isn't stamped.

`handleTeamSelect` (`GameModuleExpanded.tsx:773`) already does exactly this for the swap case:

```ts
const previousTeam = playerTeams[playerId];
if (startedAt && previousTeam && previousTeam !== team) recordSwap(playerId, previousTeam, team);
```

Add the mirror: `startedAt && !previousTeam` → record a `teamChanges` row of type **`join`**
with a timestamp. Deselecting removes it again, exactly as `handleReturnToTeam` clears a leave.

**Consequences of this shape, all good:**
- **Zero new taps.** No "mark arrived" button, nothing to remember on a sideline.
- **No schema change.** `teamChanges` is already a JSON string column; this adds a third
  `type` to the zod enum and nothing else.
- **"At kick-off" needs no record at all** — it is the absence of a join row on a player who
  is in `teamAssignments`. The common case costs nothing to store.
- It mirrors the departures design, which also derives from an action already performed.

### Buckets

Keyed off `startedAt` and the **`halfTime`** event (32/36 coverage), *not* `secondHalfStart` (2/36):

| Bucket | Rule |
|---|---|
| **At kick-off** | In `teamAssignments`, no `join` row |
| **Just late** | `join` ≤ 5 min after `startedAt` — warming up, effectively on time |
| **First half** | `join` from 5 min to the `halfTime` event |
| **Second half** | `join` after `halfTime` |

Headline metric: **On-time%** = (at kick-off + just late) ÷ games played, with the raw late
count beside it — the same shape as the existing Rely% column.

## Scope

**In**
- `type: 'join'` in the teamChanges schema, written on a mid-game add, cleared on undo.
- `backend/src/services/arrivals.ts` — per-player bucket counts and on-time rate, mirroring
  `services/departures.ts` including its `MIN_GAMES = 5` floor and guest exclusion.
- Wire into `GET /api/stats/reliability`.
- A **Punctuality card** in the Reliability tab.

**Out**
- Any award or achievement for lateness. Not asked for, and there is no data to seat it on
  for months. Revisit once the card has real numbers.
- Backfill. Impossible — see below.
- Changing how teams are picked, or blocking a start with an incomplete roster.

## Constraints and honest risks

- 🔴 **Ships empty and stays thin for months.** Zero of 36 games carry arrival data. At one
  game a week, the `MIN_GAMES = 5` floor means the card shows **nothing meaningful until
  roughly mid-October, and nothing at all until game #41.** This is the same trade already
  accepted for goal qualifiers — worth taking, but not worth pretending otherwise.
- 🔴 **It depends on a habit that isn't established.** `startedAt` is set on 4 of 36 games.
  Every game where Start isn't tapped is a blank, by design (criterion 3). If the tap doesn't
  become routine, this feature produces nothing regardless of how well it's built.
- ⚠️ **It measures when the admin tapped, not when the player walked up.** Same accuracy
  ceiling the departure timestamps already have. Fine for buckets this coarse; it would not
  support a "minutes late" leaderboard, which is why one isn't proposed.
- 📐 **The Reliability table is already 6 columns on a phone.** A 7th would crowd it, so this
  goes in its own card beside "Guests / Invites" rather than into the table.
- Frontend + backend service; `tsc --noEmit` both sides and `vite build` are the full check.
  🔴 Browser smoke is yours — I'm headless.

## Open questions

1. **Is 5 minutes the right "effectively on time" grace?** It's your number from the request.
   I'd suggest 10 — people who arrive during the warm-up rarely miss any play — but it's a
   judgement about the club, not the code. One constant either way.
2. **Should a late arrival that follows a "Maybe" or a silent RSVP read differently?** There's
   an obvious cross with the ghost/converted columns (a ghost who also turns up 20 minutes late
   is a different animal from a punctual one). Recommend shipping punctuality standalone first
   and looking at the cross once there's data.
3. **Do you want the second-half bucket to count as "played" at all** for the existing
   attendance and Highlander streak metrics? Currently anyone in `teamAssignments` counts fully.
   I'd leave that alone — changing it would silently move historical attendance numbers.
