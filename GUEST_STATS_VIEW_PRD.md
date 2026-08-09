# PRD — Guest Stats View

Status: **DRAFT — awaiting sign-off.**
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-08

Read-only. No schema change, no data migration, no change to any existing
figure. Distinct from guest → member conversion, which is Phase 3 of
`CLUB_DUES_PRD.md` and mutates historical match records.

---

## Problem

A guest's on-pitch record is invisible, and tapping their name does nothing.

Goals are written against the **`GuestN` slot player**, not the human, and the
slot pool is string-excluded from metrics at roughly nine sites
(`achievements.ts:194,274`, `stats.ts:208,420,561`, `reliability.ts:20`,
`dues.ts:264`, `GameModuleExpanded.tsx:113,332`, `PlayerLinkSetup.tsx:71`).
That exclusion is correct — the slot is refilled by a different person every
week, so an unexcluded `Guest2` would be a fictional composite player polluting
every leaderboard.

Since `GuestVisit` shipped (2026-08-07) the attribution exists: it records which
human held which slot in which game. Nothing surfaces it. The owner found this
by tapping Ricky in the ledger and getting nothing back.

## The coverage problem — read this before approving

Measured in production 2026-08-08:

| | |
|---|---|
| Guest slot appearances across all games | **123** |
| …with a name attached (`GuestVisit` rows) | **3** |
| **Attributable** | **2.4%** |
| Games with any guest attribution | **1 of 32** |

**The other 97.6% is not recoverable.** It is not a backlog to backfill — the
slot genuinely was a different person each week and nobody wrote down who. The
data does not exist.

So this view ships nearly empty and fills up going forward, one game at a time.

**And the data accrues whether or not the view exists.** `GuestVisit` is already
recording every named guest. Building this in November shows exactly as much as
building it today, minus nothing. **There is therefore no urgency and no cost to
waiting** — which matters, because October's dues screens have a fixed deadline
and still have not been clicked by anyone.

*Recommendation: approve the spec, build it after October.*

## Why build it at all

**It is the conversion pitch.** A balance alone — *"Aihab owes $210"* — is a bill.
The same screen with *"7 games, 4 goals, 2 assists, owes $210, membership is
$175"* is an argument for joining. Uncapped guest charging exists to push people
toward membership; this is the other half of that conversation.

Secondary: it makes the ledger row worth tapping, and it gives a returning guest
a record rather than treating them as an anonymous shirt-filler.

## Success criteria

1. Tapping a guest in the ledger opens their record.
2. It shows games played, goals, assists, and a per-game list with date, game
   number, team, and who hosted them.
3. Their dues position sits alongside it: visits, billable visits, owed, paid,
   balance — reusing the existing calculation, not a second one.
4. It states plainly what it cannot know, so a low number never reads as "this
   guest never scored" when it means "nobody recorded who filled that shirt".
5. **Every existing stats figure is unchanged.** Leaderboards, achievements,
   MOTM, chemistry, reliability and field stats are byte-identical before and
   after. This is the acceptance test, not a hope.
6. The "Unnamed" aggregate has no detail view and does not pretend to have one.

## Scope

**In**

- A read-only guest record, opened from a ledger row.
- Games played, goals, assists, per-game breakdown.
- Dues position, read from the existing dues report.
- An explicit note on the attribution horizon.

**Out**

- Any change to the `GuestN` exclusion rules. The nine sites are not touched.
- Guest → member conversion — `CLUB_DUES_PRD.md` Phase 3, and the only part that
  mutates historical records.
- Editing anything from this view.
- A public or guest-facing version; admin-only, like the tab it opens from.
- Backfilling historical attribution. **Impossible, not deferred.**
- Win/loss/draw, sportsmanship, fouls, chemistry — see Q1.

## Where it lives

A modal opened from the guest row in `GuestLedgerTab`, matching
`EditPlayerModal` / `GuestDetailsModal`. A drill-down, not a route: it is
reached from one place and dismissed back to it.

## Derivation

No schema change. Everything joins through data that already exists:

```
GuestVisit(guestId)          -> [(gameId, slotPlayerId)]
Game.goals        (JSON)     -> records where scorerId   == slotPlayerId  => goals
                             -> records where assisterId == slotPlayerId  => assists
Game.teamAssignments (JSON)  -> [slotPlayerId]                            => team
GuestVisit.hostPlayerId                                                   => host
```

Two details that will bite if missed:

- **A guest can hold several slots in one game.** Ricky held Guest2, Guest3 and
  Guest4 in game #31. Goals must be summed across *all* of that guest's slots
  for that game, while **games played counts the game once** — the same
  appearances-not-slots rule the ledger already applies.
- **Own goals must not count as goals.** Once `ownGoal` ships
  (`GAME_CLOCK_AND_GOLDEN_GOAL_PRD.md` and the own-goals work), a guest's own
  goal belongs in an own-goal count, not their tally — the same
  `isScoringGoal` guard the ten player sites need.

## The invariant

This is a **new read path beside the existing ones, never through them.** No
existing query, exclusion or aggregate is modified. A guest must not appear in
any leaderboard, achievement, MOTM, chemistry pairing or reliability
denominator as a result of this feature.

Verification: capture `/api/stats/*` responses before and after, and diff. Any
change is a defect, however plausible it looks.

## Plan

**Phase 1** — `computeGuestRecord(guestId)` in `services/guests.ts` plus
`GET /api/guests/:id/record`, `requireAdmin`. Verified against a stubbed Prisma
before any UI: multi-slot-in-one-game, a guest with zero goals, a guest whose
games predate attribution, and the unnamed aggregate returning nothing.

**Phase 2** — modal, and make the ledger row tappable.

**Effort:** half a day, most of it Phase 1's verification.

## Risks

| Risk | Mitigation |
|---|---|
| A guest leaks into a leaderboard | New read path only; before/after diff of `/api/stats/*` is the acceptance test |
| Multi-slot double-counting | Goals summed across slots, games counted once; explicit assertion using Ricky's real 3-slot game |
| Low numbers read as "never scored" | The view states its horizon in words, not a footnote |
| Own goals inflate a guest's tally | `isScoringGoal` guard, same as the player sites |
| Scope drifts into conversion | Conversion mutates match records and is a different PRD; this one writes nothing |

## Open questions

1. **Goals and assists only, or also W/L/D and sportsmanship?** All are
   derivable. *Recommend G/A plus the game list for the first cut* — it is what
   the conversion conversation needs, and the rest is additive.
2. **Does the guest ever see this?** Admin-only is assumed. A shareable summary
   would be a different feature with a privacy question attached.
3. **Does this row tap later become the entry point for conversion?** If yes,
   the modal is where the button lands and it is worth leaving room now.
4. **Build after October?** *Recommended* — see the coverage section. The data
   accrues either way.

---

## Sign-off

- [ ] Coverage reality (2.4% attributable, ships nearly empty) read and accepted
- [ ] Q1 (which stats) answered
- [ ] Q4 (sequencing vs October) agreed
- [ ] Derivation and the no-leak invariant approved
