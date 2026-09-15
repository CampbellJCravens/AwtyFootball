// Frontend twin of backend/src/services/goals.ts. Duplicated rather than shared
// because the frontend cannot import backend services; if the weighting rule
// changes, both files change together.

export interface WeightedGoalLike {
  team?: 'color' | 'white' | null;
  value?: number;
}

export const goalValue = (g: WeightedGoalLike) =>
  typeof g.value === 'number' && g.value > 0 ? g.value : 1;

/**
 * A team's score. Use this EVERYWHERE a scoreline is derived — counting records
 * with `.filter(g => g.team === t).length` silently reads a weighted golden
 * goal as 1, which makes the live screen, the stats tables and the match report
 * disagree with each other.
 */
export const scoreFor = (goals: WeightedGoalLike[], team: 'color' | 'white') =>
  goals.reduce((sum, g) => (g.team === team ? sum + goalValue(g) : sum), 0);

// ---- Man of the Match -------------------------------------------------------
// Most goal involvements (goals + assists) wins; own goals never count and
// guests are excluded. Sportsmanship is deliberately NOT an input.
//
// At most two winners. A tie of three or more is settled, in order, by:
//   1. more goals (a goal beats an assist)
//   2. playing for the winning team (skipped on a draw)
//   3. being involved in the decisive goal — the one after which the winner
//      led for good (none on a draw)
//   4. earliest involvement
// A tie of exactly two stands as a shared award.
export type MotmGoal = WeightedGoalLike & {
  scorer: { id: string; name: string };
  assister: { id: string; name: string } | null;
  timestamp: Date | string;
  ownGoal?: boolean;
};
export type MotmWinner = { name: string; goals: number; assists: number };

export function pickMenOfTheMatch(
  goals: MotmGoal[],
  teamOf: (playerId: string) => 'color' | 'white' | undefined,
  isGuest: (name: string) => boolean,
): MotmWinner[] | null {
  const ms = (t: Date | string) => new Date(t).getTime();
  const ordered = [...goals].sort((a, b) => ms(a.timestamp) - ms(b.timestamp));

  type Row = MotmWinner & { id: string; first: number };
  const rows = new Map<string, Row>();
  const bump = (p: { id: string; name: string }, kind: 'goals' | 'assists', at: number) => {
    if (isGuest(p.name)) return;
    const r = rows.get(p.id) ?? { id: p.id, name: p.name, goals: 0, assists: 0, first: at };
    r[kind] += 1;
    r.first = Math.min(r.first, at);
    rows.set(p.id, r);
  };
  for (const g of ordered) {
    const at = ms(g.timestamp);
    if (!g.ownGoal) bump(g.scorer, 'goals', at);   // an own goal is not an involvement
    if (g.assister) bump(g.assister, 'assists', at);
  }

  const top = Math.max(0, ...Array.from(rows.values(), r => r.goals + r.assists));
  if (top === 0) return null;
  const tied = Array.from(rows.values()).filter(r => r.goals + r.assists === top);
  const strip = (r: Row): MotmWinner => ({ name: r.name, goals: r.goals, assists: r.assists });
  if (tied.length <= 2) return tied.sort((a, b) => b.goals - a.goals).map(strip);

  const color = scoreFor(ordered, 'color'), white = scoreFor(ordered, 'white');
  const winner = color > white ? 'color' : white > color ? 'white' : null;

  const decisive = new Set<string>();
  if (winner) {
    let lead = 0, idx = -1;
    ordered.forEach((g, i) => {
      const before = lead;
      if (g.team === winner) lead += goalValue(g);
      else if (g.team) lead -= goalValue(g);
      if (before <= 0 && lead > 0) idx = i;   // last go-ahead = ahead for good
    });
    const d = ordered[idx];
    if (d) {
      if (!d.ownGoal) decisive.add(d.scorer.id);
      if (d.assister) decisive.add(d.assister.id);
    }
  }

  const onWinner = (r: Row) => (winner && teamOf(r.id) === winner ? 1 : 0);
  return tied
    .sort((a, b) =>
      b.goals - a.goals ||
      onWinner(b) - onWinner(a) ||
      (decisive.has(b.id) ? 1 : 0) - (decisive.has(a.id) ? 1 : 0) ||
      a.first - b.first)
    .slice(0, 2)
    .map(strip);
}
