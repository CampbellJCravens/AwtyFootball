import { scoreFor, goalValue, type WeightedGoalLike } from './goals';

/**
 * How competitive a game was. Deliberately a BUCKET, not a 0-100 index: a
 * composite score invites arguing about the weights and communicates less than
 * a word. See MATCH_ANALYTICS_PRD.md.
 *
 * Every metric here describes a GAME. None is ever attributed to a player — the
 * app does not record who picked the teams, so attributing a blowout to a person
 * would be blaming someone who may not have caused it.
 */
export type MatchQuality = 'classic' | 'close' | 'competitive' | 'oneSided';

export const MATCH_QUALITY_LABEL: Record<MatchQuality, string> = {
  classic: 'Classic',
  close: 'Close',
  competitive: 'Competitive',
  oneSided: 'One-sided',
};

export interface TimedGoal extends WeightedGoalLike {
  timestamp?: string;
}

export interface MatchBalance {
  colorScore: number;
  whiteScore: number;
  margin: number;
  totalGoals: number;
  leadChanges: number;
  /** The winner trailed at some point. Null for a draw. */
  comeback: boolean | null;
  tie: boolean;
  quality: MatchQuality;
}

/**
 * Lead changes counts transitions between one team leading and the OTHER team
 * leading. Going level is not a lead change on its own — otherwise every
 * equaliser scores twice, once for levelling and once for the retake, and a
 * 3-3 draw reads as more volatile than a genuine comeback win.
 */
export function computeBalance(goals: TimedGoal[]): MatchBalance {
  const ordered = goals
    .filter(g => g.team === 'color' || g.team === 'white')
    .slice()
    .sort((a, b) => String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')));

  let color = 0;
  let white = 0;
  let leader: 'color' | 'white' | null = null;
  let leadChanges = 0;
  const led = new Set<'color' | 'white'>();

  for (const g of ordered) {
    if (g.team === 'color') color += goalValue(g);
    else white += goalValue(g);

    const now = color > white ? 'color' : white > color ? 'white' : null;
    if (now) {
      if (leader !== null && now !== leader) leadChanges++;
      leader = now;
      led.add(now);
    }
  }

  const colorScore = scoreFor(goals, 'color');
  const whiteScore = scoreFor(goals, 'white');
  const margin = Math.abs(colorScore - whiteScore);
  const tie = colorScore === whiteScore;
  const winner = tie ? null : colorScore > whiteScore ? 'color' : 'white';

  const quality: MatchQuality =
    margin <= 1 && leadChanges >= 1 ? 'classic'
      : margin <= 1 ? 'close'
        : margin <= 3 ? 'competitive'
          : 'oneSided';

  return {
    colorScore,
    whiteScore,
    margin,
    totalGoals: colorScore + whiteScore,
    leadChanges,
    comeback: winner === null ? null : Array.from(led).some(t => t !== winner),
    tie,
    quality,
  };
}

export interface BalanceSummary {
  games: number;
  medianMargin: number;
  meanMargin: number;
  ties: number;
  oneGoalGames: number;
  blowouts: number;
  comebacks: number;
  gamesWithLeadChange: number;
  byQuality: Record<MatchQuality, number>;
}

export function summariseBalance(balances: MatchBalance[]): BalanceSummary {
  const margins = balances.map(b => b.margin).sort((a, b) => a - b);
  const median = margins.length === 0 ? 0
    : margins.length % 2 === 1 ? margins[(margins.length - 1) / 2]
      : (margins[margins.length / 2 - 1] + margins[margins.length / 2]) / 2;

  const byQuality: Record<MatchQuality, number> = { classic: 0, close: 0, competitive: 0, oneSided: 0 };
  for (const b of balances) byQuality[b.quality]++;

  return {
    games: balances.length,
    medianMargin: median,
    meanMargin: margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 100) / 100 : 0,
    ties: balances.filter(b => b.tie).length,
    oneGoalGames: balances.filter(b => b.margin === 1).length,
    blowouts: balances.filter(b => b.margin >= 4).length,
    comebacks: balances.filter(b => b.comeback === true).length,
    gamesWithLeadChange: balances.filter(b => b.leadChanges >= 1).length,
    byQuality,
  };
}

/**
 * Game of the Season: the tightest game, tie-broken by drama then by goals.
 * A draw is not automatically the winner — a 0-0 is tight and dull, so lead
 * changes and total goals do the separating.
 */
export function pickGameOfTheSeason<T extends { balance: MatchBalance }>(games: T[]): T | null {
  const played = games.filter(g => g.balance.totalGoals > 0);
  if (played.length === 0) return null;
  return played.slice().sort((a, b) =>
    a.balance.margin - b.balance.margin
    || b.balance.leadChanges - a.balance.leadChanges
    || b.balance.totalGoals - a.balance.totalGoals
  )[0];
}
