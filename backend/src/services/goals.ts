// A goal record's `team` is the team CREDITED with the score. For an own goal
// that is the scorer's opponent, so every scoreline/clean-sheet/goals-allowed
// calculation stays correct without knowing about own goals at all. What must
// never happen is crediting the scorer's own tally — hence these predicates.
// Use them at every site that counts goals *for a player*.

export interface GoalLike {
  scorerId: string;
  ownGoal?: boolean;
}

export const isScoringGoal = (g: GoalLike) => !g.ownGoal;
export const isOwnGoal = (g: GoalLike) => g.ownGoal === true;

// A goal's weight on the SCORELINE. Normal goals are 1; a golden goal carries
// the weight that ends the game (n+1 to the trailing team). Player credit is
// always 1 and must never read this — see goalsBy below.
export interface WeightedGoalLike {
  team?: 'color' | 'white' | null;
  value?: number;
}

export const goalValue = (g: WeightedGoalLike) =>
  typeof g.value === 'number' && g.value > 0 ? g.value : 1;

/**
 * A team's score. Use this EVERYWHERE a scoreline is derived — counting records
 * with `.filter(g => g.team === t).length` silently reads a weighted golden
 * goal as 1, which makes results, clean sheets and the match report disagree
 * with each other. There is no valid reason to count goal records for a score.
 */
export const scoreFor = (goals: WeightedGoalLike[], team: 'color' | 'white') =>
  goals.reduce((sum, g) => (g.team === team ? sum + goalValue(g) : sum), 0);

export const goalsBy = (goals: GoalLike[], playerId: string) =>
  goals.filter(g => g.scorerId === playerId && isScoringGoal(g)).length;

export const ownGoalsBy = (goals: GoalLike[], playerId: string) =>
  goals.filter(g => g.scorerId === playerId && isOwnGoal(g)).length;
