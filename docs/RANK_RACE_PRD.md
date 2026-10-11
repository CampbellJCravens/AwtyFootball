# Rank Race chart (Stats ▸ Players) — PRD

Status: SIGNED OFF + BUILT 2026-10-11 (branch feat/rank-race, not merged)

## Problem
The Players table shows where everyone stands *now*. It can't show how the top of the table moved during the season: who climbed, who fell, who held #1 and for how long.

## Proposal
A "Rank race" card on **Stats ▸ Players**, above the table: a bump chart of the **top 10 after every game**.
- **x** = each game in the selected period, in date order (labelled by date).
- **y** = rank 1–10, with #1 at the top.
- **One line per player** who reached the top 10 at any point; lines leave the chart when the player drops below 10.
- Players' names at the right edge, at their final rank. Tap a line or name to highlight it and fade the rest; your own line (signed-in player) is gold.
- **Follows the existing period filter:** a year = that season game by game; **All Time** = cumulative since tracking began (first game in 2025). With a month selected it shows that month's games.

## Ranking rules (identical to the table)
Ranks come from the same calculation as the Players table: points = 3 per win, 1 per tie, the same tiebreakers, and the same 3-game qualification (only players with ≥ 3 games played up to that point are ranked). To guarantee the chart and table never disagree, the table's stats calculation moves into a shared function used by both.

## Data reality
Per-game data exists only for games tracked in the app: **2025 (3 games) and 2026**. "Legacy" seasons (pre-2025) are season totals only and can't be charted game by game. A season's first two games have nobody qualified yet, so the chart starts at the third game.

## Scope
**In:** frontend only (`Stats.tsx`, new `RankRaceChart.tsx`, shared stats util extracted from `OverallStatsTable.tsx`). Inline SVG, no new dependency. Mobile-first (375 pt), horizontally scrollable when there are many games.
**Out:** backend changes; Legacy seasons; animation/replay.

## Engine vs vertical
AFC-only. No simulator or other-app impact.

## Open questions
1. **Metric:** Points only, or chips to switch (Points · G+A · Goals · Assists · Wins)? Proposed: chips, default Points.
2. **Who gets a line:** everyone who was ever top 10 (proposed), or only the final top 10?
3. **"Every year and yearly":** read as *each season* plus *All Time cumulative*. Correct?

## Decisions (owner, 2026-10-11)
1. Metric chips (Points · G+A · Goals · Assists · Wins), default Points.
2. A line for everyone who was ever top 10.
3. Periods = each season + All Time (follows the existing filter).

## As built
- `utils/playerStats.ts`: the Players table's stats calculation, value lookup and tiebreakers, moved verbatim (the table now imports them), plus `compareStats()`.
- `components/RankRaceChart.tsx`: collapsible card above the Players table. Current top 10 get distinct colours (gold = you); players who dropped out are thin grey. Rank labels pinned left; the plot scrolls sideways and opens on the latest game. Tap a line or legend name to highlight it.
- Checked against live data (read-only API): 2026 = 38 games, 36 steps, 17 players ever top 10, #1 changed hands 8 times; final ranks equal the table (Lammy 70, Manny 62, Franco 52, Morgan-Sean 45, David 44). 2025 (3 games) shows the "not enough games" note.
