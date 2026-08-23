# PRD — Pairing Variety and Mid-Game Rebalance

Status: **DRAFT — awaiting sign-off.** Nothing built.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-23

Two small cuts from the same conversation. Cut 1 is what the owner asked for;
cut 2 is what the data turned up while checking his question. They share no code
and can ship independently, in either order.

---

## Cut 1 — Pairing variety panel

### Problem

The owner's stated principle: *"you have to learn to play through adversity to
understand how to play with different teammates."* Teams are picked on the
touchline from memory, so the same people end up together week after week by
habit — the opposite of that principle, and nobody notices because nobody is
tracking it. He wants to see, before Saturday, which pairs have gone longest
without sharing a team, so he can deliberately put them together.

**Explicitly NOT a strength balancer.** Ability ratings were considered and
rejected on 2026-08-22: the games are already competitive (37% finish within a
goal, mean margin 2.27 over 30 games), a hidden number ranking friends by
ability is socially corrosive, and a test for losing driving attrition came back
negative. Do not resurrect it.

### Success criteria

- Friday evening, the admin opens the RSVP tab and sees a short list of pairs
  worth putting together on Saturday, drawn from who has actually responded.
- The list changes week to week as pairings are used up.
- No player is scored, ranked, or compared on ability anywhere in the feature.
- Nothing is shown to non-admins.

### Placement (owner, 2026-08-23)

Admin-only, in the **RSVP section, directly beneath the turnout projection**.
The projection says how many are coming; this says who to put with whom. Both
are pre-match admin prep, and neither is public — the projection is already
`requireAdmin` for the self-fulfilling-prophecy reason, and this inherits that.

### How the pairing score works

Source data: `Game.teamAssignments` (playerId → `color` | `white`) across all
tracked games. Two players "played together" in a game when both appear and
share a side. No new tables; this is a read-side rollup.

For each candidate pair, compute:

- `sharedGames` — games where both were on the same side
- `coAttended` — games where both played at all, same side or not
- `lastTogether` — date of the most recent shared side, or null for never
- `togetherRate` = `sharedGames / coAttended`

Rank by **longest time since last together**, with never-together first, but
require `coAttended >= 4` so the list surfaces genuine avoidance rather than two
people who have simply never both shown up. That threshold is the whole trick:
without it the list fills with newcomers and one-off guests, which is noise.

Display per row: the two names, "never on the same side" or "last together 14
Jun", and `sharedGames / coAttended` so the admin can judge for himself.

**Candidates** = players with an RSVP of `yes` or `maybe` for the upcoming game.
Guests (`/^Guest\d+$/`) excluded — no durable identity to track. Show the top
**5** pairs; the panel is a nudge, not a roster.

### Scope

**In.** The rollup, the admin panel under the turnout projection, the
`coAttended >= 4` floor, exclusion of guests and of anyone not on the current
roster.

**Out.** Auto-assigning teams. Trios or larger groupings. Any ability rating.
Any change to how teams are actually picked — this suggests, the human decides.
Showing it to players.

### Constraints and traps

- ⚠️ **`teamAssignments` holds orphaned player IDs.** Three UUIDs with 6–9 games
  each have no matching `Player` row, and one currently lands in the top five by
  win rate. Join through `Player` and drop anything unmatched, or the panel will
  suggest pairing someone with a deleted account. See the standing gotcha on
  orphaned IDs in the memory notes.
- **Players who left mid-game still sit in `teamAssignments`** — `handleLeave`
  records a `leave` in `teamChanges` without removing the assignment. For this
  feature that is *fine and preferable*: they did share a side, however briefly.
  Noted so nobody "fixes" it here.
- Compute inline on request, memoised, invalidated on Game writes. **Add no
  background poller** — that rule is what caused the 29 Jul Neon burn. The scan
  is ~30 games × ~20 players; trivial.
- Pair counts are O(n²) per game but n ≈ 20, so ~190 pairs per game, ~6k total.
  Nothing needs optimising.

### Plan

| Phase | Work | Verify |
| --- | --- | --- |
| 1 | `services/pairing.ts` — the rollup and ranking | Stubbed unit check: never-together ranks first, the `coAttended` floor excludes thin pairs, orphaned IDs are dropped |
| 2 | `GET /api/stats/pairing-variety?gameId=` behind `requireAdmin` | curl returns 401 unauthenticated |
| 3 | Panel under `TurnoutProjection` in the RSVP section | `tsc --noEmit` both packages; frontend prod build |
| 4 | Owner eyeball against a real Saturday | Do the suggested pairs match his own sense of who never plays together? |

Estimate: half a day to a day. Phase 4 is the real test — if the list reads as
obvious or wrong, the ranking rule is wrong, not the idea.

### Resolved (owner, 2026-08-23)

1. **Candidates are `yes` + `maybe`.** Friday is too early for a firm list, and a
   Maybe who converts still needs a side. Three of the fourteen respondents on
   the validation run were Maybes.
2. **Pairs fall off the list naturally** as `lastTogether` resets. No extra state.
3. **Five rows.**
4. **Keep the "joined at the hip" line** — the inverse ranking, free from the
   same numbers. It produced the sharpest output of the validation run
   (Morgan-Sean + Campbell, 9 of 10 games on the same side) and reads as one dim
   line under the list, not a second panel.

### Validated against production, 2026-08-23

Ranking rule run for real against game #34's fourteen respondents before any
build, which is the phase-4 eyeball done early:

| Pair | Last together | Shared / co-attended |
| --- | --- | --- |
| Connor Shannon + Rolando Abreu | 20 Dec 2025 | 1 / 6 |
| Siegfried Casar + Eric Saito | 14 Feb 2026 | 1 / 6 |
| Robert Peresich + Eric Saito | 28 Feb 2026 | 4 / 7 |

79 of 91 possible pairs cleared the 4-game floor. **No pair has never shared a
side** — the coldest is eight months — so the never-together branch is built and
correct but will not appear this week. Mockup:
https://claude.ai/code/artifact/7e796d46-aa96-448a-8bc3-cc01fa1b643a

---

## Cut 2 — Mid-game rebalance prompt

### Problem

Sides go lopsided *during* the game, not at kick-off, and nothing notices.
Reconstructed from `teamChanges` across 30 scored 2026 games:

| | Games |
| --- | --- |
| Uneven as assigned (2+ difference) | 9/30 |
| **Uneven after leaves and swaps** | **14/30** |
| Leaving made it worse | 9/30 |
| Games with any recorded leave | 16/30 (45 departures) |

Games that started level and ended broken: `#15 10v10 → 9v6`,
`#5 12v11 → 11v7`, `#19 11v11 → 11v8`, `#18 11v11 → 11v9`. A pre-match balancer
would not have helped any of them. And 45 leaves across 16 games is likely
under-recorded, so the true figure is worse.

This is the one team-fairness problem the owner's adversity principle does not
cover: playing a man down isn't adversity, it's arithmetic.

### Proposal

When a `leave` is recorded and the resulting gap reaches **2 or more**, show an
inline prompt beside the teams: *"Sides are 11v9 — move someone?"* with a
suggested player and a one-tap swap. Dismissible, non-blocking, admin-only,
consistent with how the full-time nudge already behaves.

**Who to suggest — shortlist, never a single name.** The app offers two or three
players who would even the sides; the admin picks. Arithmetic is automated, the
social call stays human — the same split as cut 1. Ranked by:

1. **Nobody who has already scored or assisted in this game.** Minimises the
   attribution problem below. A hard exclusion, not a tiebreak, unless it would
   empty the shortlist.
2. **Whoever has played least with the receiving side**, reusing cut 1's pair
   rollup — evening the numbers then also serves the variety principle.
3. Tiebreak: most recently added to the larger side, as the least disruptive.

**Explicitly NOT "the best player".** Ratings are dead (see cut 1), and even with
them it would be wrong: moving the strongest player is the most visible and most
arguable act on the pitch, and it is exactly what makes people say the teams are
being rigged.

**Prefer swapping at the break.** With `halfTime` and `secondHalfStart` now
recorded, a swap during the break means the player genuinely played one half per
side and attribution is close to honest. Mid-half is where it gets messy. When
the prompt fires during the break it should say so.

### ⚠️ The attribution problem this makes more frequent

**Not created by this feature — 9 swaps across 8 games already exist in 2026 —
but the prompt would increase the rate, so it is recorded here.**

`achievements.ts:95` reads `game.teamAssignments[playerId]`: a flat map, one team
per player per game. So a swapped player can never be double-credited — one
result, one clean-sheet check, one `goalsAllowed` figure. There is no
"clutch on both sides" outcome; the structure forbids it.

The failure is the opposite one — **the whole game is attributed to whichever
side the player finished on**:

- **Clean sheets** (`achievements.ts:111-113`) count the opponent's goals across
  the entire match against the final team. Swap out of a side that conceded two
  into one that conceded none and you are credited a clean sheet you did not
  keep, which feeds `clean_sheets_3` "Brick Wall".
- **Win / loss** is the final team's result regardless of where the player spent
  the match.
- **`goalsAllowed`** drives Top Defender (`games*3 − goalsAllowed`), same flaw.

Currently only 1 of the 9 swapped players also scored or assisted, so
entanglement is rare today.

**The proper fix is a separate PRD.** Goals carry timestamps and so do swaps, so
clean sheets and `goalsAllowed` *could* be attributed by which side the player
was on when each goal went in. That changes historical numbers and touches
achievements, so it must not ride along with a UI nudge. Same reasoning as
deferring the restart-time analytics.

### Scope

**In.** Gap detection on leave, the prompt, the suggestion, one-tap swap through
the existing `swap` machinery.

**Out.** Auto-swapping without confirmation. Any rebalancing by ability.
Backfilling historical games. Chasing unrecorded departures — if nobody taps
"left", nothing can notice, and that is acceptable.

### Resolved

**Gap threshold is 2.** At 11v9 the game is already noticeably off, and the
prompt is dismissible so a false positive costs one tap.

**Cut 2 is IN**, not deferred (owner, 2026-08-23) — it addresses 47% of games,
the larger of the two problems.

---

## Sign-off

- [x] Owner approved cut 1 scope, all four questions resolved 2026-08-23
- [x] Owner approved cut 2, in scope
- [ ] Owner eyeball on a real Saturday list before it is called done
