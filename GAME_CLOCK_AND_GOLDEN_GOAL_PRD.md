# PRD — Game Clock and Golden Goal

Status: **Phase 0 SIGNED OFF 2026-08-15 — cleared to build, not yet built.**
Phases 1-3 remain draft pending Q4/Q5/Q6. Two in-game features, requested 2026-08-08.
Owner: Morgan-Sean (product) / Campbell (repo review)
Date: 2026-08-08

**Sequencing note.** This is a different domain from `CLUB_DUES_PRD.md` and shares
no code with it. Dues has a hard October deadline; this does not. Recommend it
lands *after* the dues cut is smoked, or in a gap while waiting on a dues answer
— but not interleaved, because the two touch different files and interleaving
them makes both harder to review.

---

## Problem

Two gaps, one of which is a prerequisite for the other.

1. **Nobody records when a game actually starts.** `Game.createdAt` is the game
   *date* and is used as such everywhere, but it is the row-creation timestamp,
   not kick-off. Nothing in the app knows how long a game has been running.
2. **Games run long and end arbitrarily.** Past ~80 minutes the game needs a
   way to finish decisively rather than trailing off, and the group already has
   a house rule for it — but it is applied from memory, in the moment, with
   someone doing arithmetic on a pitch.

## Business rules (owner, 2026-08-08)

- A **game start button** records kick-off.
- Once a game passes **80 minutes**, prompt: **"Golden goal?"** with yes/no.
- If yes, the deciding goal resolves the game:
  - **Losing team scores** → it counts as **n+1**, where `n` is the goal
    difference at the moment golden goal was armed.
  - **Winning team scores** → it counts as **+1**.

The effect is that either side can end it, and the trailing team's goal is
worth exactly enough to put them one ahead.

## The rule — CONFIRMED 2026-08-08

**The deciding goal is *worth* n+1 to the scoreline.** One scoring event ends
the game; 5–3 becomes 5–6. Owner confirmed.

**Golden goals get their own category — "The Decider" (owner, 2026-08-08)**, icon
a golden football, following the Highlander's 🗡️ precedent. Renamed from "Golden
Goal Boot" to avoid colliding with the existing GOLDEN BOOT top-scorer award.

**Credit is split, confirmed 2026-08-08:**

- **The scoreline** gets **n+1**.
- **The player's regular goal total** gets **exactly 1** — so no leaderboard,
  Golden Boot race, chemistry pairing or MOTM calculation is skewed.
- **A separate golden-goal count** tracks how many a player has scored. **That
  column is what drives The Decider achievement**, not the regular goal total.

Follow-ups that fall out of this:

- **Is `n` frozen when golden goal is armed, or live at the moment of the
  goal?** They differ only if a goal is scored between arming and the decider,
  which is possible if the prompt is answered and play continues. *Recommend
  frozen at arming* — it's what everyone agreed to, and a value that silently
  moves is the kind of thing that causes an argument at full time.
- **Does the game auto-end?** Under (A) the next goal decides it either way, so
  the app should close the game out rather than wait to be told.
- **What if it's a draw when armed?** `n = 0`, so a goal to either side is worth
  +1 and wins. That works, but confirm it's the intent.

## The trap: scoreline credit is not player credit

A golden goal worth 3 must add **3 to the team score** and **1 to the scorer's
season total**. If it credits 3 goals to the player, every leaderboard, Golden
Boot, chemistry pairing and MOTM calculation inherits an inflated number — and
one freak 5–3 comeback would distort a season.

This is the same shape as the own-goal work: `Game.goals` records are read at
**~10 sites that credit `scorerId`** into a player's total (enumerated in
`OWN_GOALS_AND_TURNOUT_PRD.md`). Those sites count *records*, so a goal record
carrying a `value: 3` is naturally worth 1 to the player and 3 to the scoreline
**only if the scoreline is computed separately**. Verify how the scoreline is
derived today before writing anything — if it also counts records, it needs the
weighting added in exactly one place.

## The Decider — how it sits alongside what already exists

- ✅ **Name resolved.** `goldenBoot` is already a live yearly award
  (`stats.ts:795`, rendered "GOLDEN BOOT" in `Stats.tsx:68`) for most goals in a
  year. The new category is **The Decider**, so the two never read as variants
  of each other. Golden Boot keeps its current meaning, untouched.
- ✅ **Credit resolved.** 1 regular goal + 1 in the golden-goal column;
  the column drives the achievement.
### Dagger → Decider as a tier pair (owner, 2026-08-08)

**The Dagger = your first golden goal. The Decider = several.** That matches the
idiom already in `achievements.ts` — `first_goal` → `goals_10`, `first_assist` →
`assists_10`, `first_own_goal` → `own_goals_3`. Clean fit.

🔴 **But redefining The Dagger un-awards everyone who currently holds it.**
Today `game_winner` / "The Dagger" is *"Score a game-winning goal"*, driven by
`gameWinningGoals` (`achievements.ts:86,140,328`) — accumulated from real match
history going back years. Repoint it at golden goals and every current holder
drops to 0, because no golden goal has ever been recorded. People lose a badge
they earned, and `UserAchievementSeen` rows point at an achievement that
silently changed meaning.

**RESOLVED 2026-08-08 (owner): rename the existing one to "Game Winner", and add
the two new golden-goal achievements.** Nobody loses a badge; the Dagger name
moves to where the owner wants it.

### The three achievements

| id | Name | Earned by | Target | Status |
|---|---|---|---|---|
| `game_winner` | **Game Winner** *(was "The Dagger")* | a game-winning goal — `gameWinningGoals` | 1 | rename only |
| `first_golden_goal` | **The Dagger** | your first golden goal | 1 | new |
| `golden_goals_3` | **The Decider** | 3 golden goals | 3 | new |

**🔴 `game_winner`'s id must not change** — only its `name`. `UserAchievementSeen`
is keyed `@@id([userId, achievementId])` on the id string
(`schema.prisma:166-173`, written at `auth.ts:18` and `stats.ts:975-985`).
Keeping the id preserves everyone's seen-state. Changing it would re-fire the
"new achievement" notification for every existing holder — not destructive, since
the badge itself is recomputed live from `gameWinningGoals`, but a pointless
notification storm.

**Why target 3 for The Decider.** It matches the existing tier idiom
(`own_goals_3`, `comeback_3`, `win_streak_3`, `clean_sheets_3`, `awards_3`) and
suits the rarity: at most one golden goal per game, only in games that run past
80 minutes and are close enough to arm. A target of 10 would be unreachable for
years.

### Sequencing — why the rename doesn't ship on its own

The rename is a one-line display change and independently safe, but shipping it
before the new achievements exist would leave the app with **no Dagger at all**
until Phase 2 lands. All three go together, in Phase 3 below.

### Seasonal vs lifetime — "all of these are per season" is half right

- ✅ **Golden Boot is seasonal.** Confirmed: `goldenBoot: marquee(goals)` sits
  inside the year-scoped stats endpoint (`stats.ts:795`), computed over
  `yearGames`. Most goals in a season, exactly as you said. Same for Playmaker,
  Iron Man, Top Defender, Sportsman.
- ❌ **Achievements are lifetime, not seasonal.** `goals`, `assists` and
  `gameWinningGoals` accumulate across *all* games with no year filter, and an
  unlocked achievement stays unlocked. The Highlander is the sole hybrid — won
  per year, held for life, with a `reigning` flag for the current champion.

So the app already has two distinct concepts: **awards** are seasonal and
recomputed; **achievements** are lifetime and permanent. A per-season
achievement would re-lock every January, which nothing else does.

**RESOLVED 2026-08-08 (owner) — take both:**

- **The two achievements are LIFETIME**, matching every other achievement in the
  app. Once earned, never lost.
- **Plus a new seasonal award: most golden goals in a season**, sitting beside
  Golden Boot in the yearly awards block (`stats.ts` `awards`, rendered in
  `Stats.tsx`). Follows the existing `marquee(...)` pattern, so it is a one-line
  addition once the golden-goal count exists per player per year.

Award name still unnamed — *Clutch*, *Sudden Death*, *Ice in the Veins*. Not
blocking; can be decided when the tile is built.

## Data model

Additive only, no migration risk. `Game.goals` is already a JSON string column,
so the goal record change needs no schema work at all.

```prisma
// on Game
  startedAt DateTime?  // kick-off; null = not started. NOT the game date —
                       // createdAt remains the date, unchanged, everywhere.
```

Inside the existing `Game.goals` JSON records:

```ts
  goldenGoal?: boolean  // this record ended the game under sudden death
  value?: number        // scoreline weight; absent/1 = normal. Player credit
                        // is ALWAYS 1 regardless of value.
```

`goldenGoal` is the category flag the Golden Goal Boot counts; `value` is the
scoreline weight. Keeping them as two fields rather than deriving one from the
other means a 1–1 game's golden goal (`value: 1`) is still categorised, and the
weighting stays inspectable when a scoreline is ever questioned.

**Why not a `Game.endedAt`.** Not asked for, and the golden goal itself marks
the end. Add it only if you want match duration as a stat.

## Scope

**In** — start button and stored kick-off time; elapsed-time display; the 80-minute
prompt; arming golden goal; weighted deciding goal; auto-close on the decider.

**Out** — pause/resume, half-time, stoppage time, retroactively setting kick-off
for historical games, any change to how `createdAt` is used as the game date,
notifications.

## Plan

**Phase 0** — `Game.startedAt` + start button + elapsed clock on the live game
screen. Independently useful and ships alone.

**Phase 1** — 80-minute prompt and golden-goal arming; store `n` at arm time.

**Phase 2** — weighted goal on the decider, auto-close, and the scoreline-vs-player
split verified against the ~10 `scorerId` sites before the UI is touched.

**Phase 3** — the three achievements together (rename `game_winner` to "Game
Winner", add `first_golden_goal` "The Dagger" and `golden_goals_3` "The
Decider"), plus the seasonal most-golden-goals award beside Golden Boot.

**Effort:** Phase 0 an hour or two. All four, most of a day, dominated by
Phase 2's verification rather than its code.

## Risks

| Risk | Mitigation |
|---|---|
| Golden goal inflates a player's season total | Player credit hard-coded to 1 per record; assert it in the verify script |
| Scoreline double-counts the weight | Confirm how the scoreline is derived *before* Phase 2, not during |
| `startedAt` mistaken for the game date | Never read it in date logic; `createdAt` stays authoritative — this rule is load-bearing across the whole app |
| Prompt fires on an abandoned/stale game | Only prompt while the live game screen is open and the game is unfinished |
| Someone forgets to press start | Clock simply reads unknown; the 80-minute prompt can be triggered by hand |

## Open questions

1. ~~**Is the deciding goal worth n+1?**~~ **Yes** (2026-08-08).
2. ~~**Does it also count as a normal goal?**~~ **Yes — exactly 1**, plus a
   separate golden-goal column that drives the achievement (2026-08-08).
3. ~~**Name collision with GOLDEN BOOT?**~~ **Renamed "The Decider"**, golden
   football icon (2026-08-08).
4. **Freeze `n` at arming, or read it live?** *Recommend frozen* — a value that
   moves silently is what causes an argument at full time.
5. **Draw when armed → `n = 0`, so any goal wins by 1.** Confirm that's intended.
6. ~~**Keep "The Dagger" alongside The Decider, or retire it?**~~ **Renamed to
   "Game Winner"; the Dagger name moves to the first golden goal. Both new
   achievements are LIFETIME, plus a separate seasonal most-golden-goals award**
   (2026-08-08). Only the seasonal award's name is still open.
7. **Who can arm it — any editor, or admin only?** The app is open-edit today;
   this ends a game, which is heavier than editing a stat.
8. **Should the 80 minutes be configurable?** One constant either way; only
   worth a setting if the number actually moves.

None of these block Phase 0 (the start button), which is independent.

---

## Sign-off

- [x] Deciding goal is worth n+1 — confirmed 2026-08-08
- [x] Separate category, named **The Decider**, golden football — 2026-08-08
- [x] Credit split: scoreline n+1 · regular goals 1 · own column drives the
      achievement — 2026-08-08
- [x] **Phase 0 cleared to build** — `Game.startedAt` + start button + elapsed
      clock, approved 2026-08-15. Independent of everything below.
- [ ] Q4 (frozen `n`), Q5 (draw case), Q6 (keep The Dagger) answered
- [ ] Data model approved for Phases 1-3 (`goldenGoal`/`value` in the goals JSON;
      `Game.startedAt` is settled under Phase 0)
- [ ] Sequencing agreed — after the dues cut, not interleaved
