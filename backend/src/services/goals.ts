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

export const goalsBy = (goals: GoalLike[], playerId: string) =>
  goals.filter(g => g.scorerId === playerId && isScoringGoal(g)).length;

export const ownGoalsBy = (goals: GoalLike[], playerId: string) =>
  goals.filter(g => g.scorerId === playerId && isOwnGoal(g)).length;
