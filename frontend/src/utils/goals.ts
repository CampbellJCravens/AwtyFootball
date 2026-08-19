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
