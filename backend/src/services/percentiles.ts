/**
 * Where a player sits against everyone else, per metric.
 *
 * Built as a reusable core, not welded to the player page: it takes an arbitrary
 * game set, player set and metric list, so an admin game view can call it later
 * without touching the profile code. See PLAYER_PERCENTILES_PRD.md.
 *
 * Two rules exist because getting them wrong is silently unfair:
 *
 * 1. Each metric declares its OWN valid window. Sportsmanship began in May 2026
 *    and fouls in July 2026, and 62% of all games predate sportsmanship — so a
 *    career average would pin the club's most senior players to the bottom of a
 *    bar measuring a stat that did not exist while they played. The denominator
 *    is games in the metric's window, and qualification is per metric.
 *
 * 2. Ties share a percentile via MIDRANK. Ten of thirty-one qualified players
 *    have exactly zero sportsmanship; ranking them "count how many you beat"
 *    puts all ten at the 0th percentile, reading as worst-in-club for people who
 *    are merely un-scored.
 */
import { isScoringGoal, scoreFor } from './goals';

/** Prior strength for empirical-Bayes shrinkage, matching services/turnout.ts. */
export const PRIOR_M = 5;

/** Games needed before a player is ranked, or counts toward anyone's denominator. */
export const DEFAULT_MIN_GAMES = 8;

export interface PercentileGame {
  createdAt: Date;
  field: string | null;
  teamAssignments: Record<string, 'color' | 'white'>;
  goals: { scorerId: string; assisterId: string | null; team: 'color' | 'white' | null; ownGoal?: boolean; value?: number }[];
  sportsmanship: Record<string, number>;
  fouls: Record<string, number>;
}

export interface PercentilePlayer {
  id: string;
  name: string;
}

/** Per player, per game: the numerator this metric accumulates. */
type Contribution = (ctx: {
  game: PercentileGame;
  playerId: string;
  team: 'color' | 'white';
}) => number;

export interface MetricDef {
  id: string;
  label: string;
  /** False inverts the ranking — conceding fewest is best, not worst. */
  higherIsBetter: boolean;
  /** Null = all time. Otherwise the metric did not exist before this date. */
  validFrom: Date | null;
  contribution: Contribution;
  /** How the raw rate reads to a human, e.g. "0.42 per game". */
  unit: string;
  /**
   * Rate metrics shrink toward the cohort mean; share metrics (availability)
   * are already bounded and are not shrunk twice.
   */
  shrink: boolean;
}

// Sportsmanship points started being recorded in May 2026; fouls in July 2026.
// stats.ts already suppresses the awards before those dates — this is the same
// fact, expressed as a metric window.
export const SPORTSMANSHIP_FROM = new Date(Date.UTC(2026, 4, 1));

export const DEFAULT_METRICS: MetricDef[] = [
  {
    id: 'scoring', label: 'Scoring', higherIsBetter: true, validFrom: null, unit: 'goals per game', shrink: true,
    contribution: ({ game, playerId }) =>
      game.goals.filter(g => g.scorerId === playerId && isScoringGoal(g)).length,
  },
  {
    id: 'creating', label: 'Creating', higherIsBetter: true, validFrom: null, unit: 'assists per game', shrink: true,
    contribution: ({ game, playerId }) => game.goals.filter(g => g.assisterId === playerId).length,
  },
  {
    id: 'winning', label: 'Winning', higherIsBetter: true, validFrom: null, unit: 'points per game', shrink: true,
    contribution: ({ game, team }) => {
      const c = scoreFor(game.goals, 'color');
      const w = scoreFor(game.goals, 'white');
      if (c === w) return 1;
      return (team === 'color' ? c > w : w > c) ? 3 : 0;
    },
  },
  {
    id: 'defence', label: 'Defence', higherIsBetter: false, validFrom: null, unit: 'goals allowed per game', shrink: true,
    contribution: ({ game, team }) =>
      team === 'color' ? scoreFor(game.goals, 'white') : scoreFor(game.goals, 'color'),
  },
  {
    id: 'sportsmanship', label: 'Sportsmanship', higherIsBetter: true, validFrom: SPORTSMANSHIP_FROM,
    unit: 'net points per game', shrink: true,
    contribution: ({ game, playerId }) => (game.sportsmanship[playerId] || 0) - (game.fouls[playerId] || 0),
  },
];

export interface MetricResult {
  id: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  /** Null when the player does not qualify for this metric. */
  value: number | null;
  percentile: number | null;
  /** Cohort median of the raw value — the marker the bar is drawn against. */
  cohortMedian: number | null;
  cohortSize: number;
  /** Games in this metric's window; the denominator that was actually used. */
  games: number;
  qualified: boolean;
  /** Why not, when qualified is false. */
  reason?: 'notEnoughGames' | 'noCohort';
}

export interface PlayerPercentiles {
  playerId: string;
  /** Clears the threshold on at least one metric. */
  qualified: boolean;
  minGames: number;
  metrics: MetricResult[];
}

const played = (games: PercentileGame[]) => games.filter(g => g.field !== 'cancelled');

const median = (sorted: number[]): number | null => {
  if (sorted.length === 0) return null;
  const mid = sorted.length / 2;
  return sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Midrank percentile: the share of the cohort strictly worse, plus half the tied
 * block (which includes the player themselves). A tied block therefore sits at
 * the centre of the span it occupies rather than at its floor.
 */
export function midrankPercentile(value: number, cohort: number[], higherIsBetter: boolean): number {
  const better = cohort.filter(v => (higherIsBetter ? v < value : v > value)).length;
  const tied = cohort.filter(v => v === value).length;
  return Math.round(((better + tied / 2) / cohort.length) * 100);
}

/**
 * Availability is tenure-relative on purpose: games played divided by the club
 * games between a player's first and last appearance. It measures turning up
 * while you were around, so a 2025 regular who has since left is not scored
 * against the 2026 calendar they were never part of.
 */
export function availabilityFor(
  playerId: string,
  allGames: PercentileGame[],
): { value: number; games: number } | null {
  const mine = played(allGames)
    .filter(g => g.teamAssignments[playerId])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (mine.length === 0) return null;
  const first = mine[0].createdAt.getTime();
  const last = mine[mine.length - 1].createdAt.getTime();
  const span = played(allGames).filter(g => {
    const t = g.createdAt.getTime();
    return t >= first && t <= last;
  }).length;
  return { value: span > 0 ? mine.length / span : 0, games: mine.length };
}

export function computePercentiles(
  allGames: PercentileGame[],
  players: PercentilePlayer[],
  opts: { minGames?: number; metrics?: MetricDef[] } = {},
): Map<string, PlayerPercentiles> {
  const minGames = opts.minGames ?? DEFAULT_MIN_GAMES;
  const metrics = opts.metrics ?? DEFAULT_METRICS;
  const games = played(allGames);
  // The GuestN pool is excluded from player metrics everywhere in this app.
  const eligible = players.filter(p => !p.name.includes('Guest'));

  type Raw = { value: number; games: number };
  const rawByMetric = new Map<string, Map<string, Raw>>();

  for (const metric of metrics) {
    const window = metric.validFrom
      ? games.filter(g => g.createdAt >= metric.validFrom!)
      : games;
    const per = new Map<string, { total: number; games: number }>();
    for (const game of window) {
      for (const p of eligible) {
        const team = game.teamAssignments[p.id];
        if (!team) continue;
        if (!per.has(p.id)) per.set(p.id, { total: 0, games: 0 });
        const acc = per.get(p.id)!;
        acc.games++;
        acc.total += metric.contribution({ game, playerId: p.id, team });
      }
    }
    const raw = new Map<string, Raw>();
    for (const [pid, acc] of per) raw.set(pid, { value: acc.total / acc.games, games: acc.games });
    rawByMetric.set(metric.id, raw);
  }

  // Availability rides the same machinery but derives its own denominator.
  const availability = new Map<string, Raw>();
  for (const p of eligible) {
    const a = availabilityFor(p.id, games);
    if (a) availability.set(p.id, a);
  }
  rawByMetric.set('availability', availability);

  const allMetrics: MetricDef[] = [...metrics, {
    id: 'availability', label: 'Availability', higherIsBetter: true, validFrom: null,
    unit: 'of games while active', shrink: false, contribution: () => 0,
  }];

  const out = new Map<string, PlayerPercentiles>();
  for (const p of eligible) out.set(p.id, { playerId: p.id, qualified: false, minGames, metrics: [] });

  for (const metric of allMetrics) {
    const raw = rawByMetric.get(metric.id)!;
    const qualifiedIds = [...raw.entries()].filter(([, r]) => r.games >= minGames).map(([pid]) => pid);
    const cohortMean = qualifiedIds.length
      ? qualifiedIds.reduce((s, pid) => s + raw.get(pid)!.value, 0) / qualifiedIds.length
      : 0;

    // Shrink toward the cohort mean so a short sample cannot top the club on a
    // hot streak — same prior strength as the turnout projection.
    const adjusted = new Map<string, number>();
    for (const pid of qualifiedIds) {
      const r = raw.get(pid)!;
      adjusted.set(pid, metric.shrink
        ? (r.value * r.games + cohortMean * PRIOR_M) / (r.games + PRIOR_M)
        : r.value);
    }
    const cohort = [...adjusted.values()];
    const sorted = [...cohort].sort((a, b) => a - b);

    for (const p of eligible) {
      const r = raw.get(p.id);
      const entry = out.get(p.id)!;
      const qualifies = !!r && r.games >= minGames && cohort.length > 0;
      entry.metrics.push({
        id: metric.id,
        label: metric.label,
        unit: metric.unit,
        higherIsBetter: metric.higherIsBetter,
        value: qualifies ? Math.round(adjusted.get(p.id)! * 100) / 100 : null,
        percentile: qualifies ? midrankPercentile(adjusted.get(p.id)!, cohort, metric.higherIsBetter) : null,
        cohortMedian: qualifies ? Math.round((median(sorted) ?? 0) * 100) / 100 : null,
        cohortSize: cohort.length,
        games: r?.games ?? 0,
        qualified: qualifies,
        ...(qualifies ? {} : { reason: cohort.length === 0 ? ('noCohort' as const) : ('notEnoughGames' as const) }),
      });
      if (qualifies) entry.qualified = true;
    }
  }

  return out;
}
