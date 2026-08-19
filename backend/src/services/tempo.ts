/**
 * When goals actually happen. Built on `halfTime`, which the data shows is
 * reliable; NOT on `gameOver`, which is tapped whenever someone remembers —
 * measured range 1 to 482 minutes after half-time. See MATCH_ANALYTICS_PRD.md.
 */

/**
 * Longest a match may be considered to have run, from its anchor. Beyond this
 * nobody ended the game; they went home. Measured on 30 real games: one genuine
 * incident at 536 min, and a legitimate cluster topping out at 124 — so this is
 * set well clear of real football rather than at the median.
 *
 * NOT enforced by a timer. There is no scheduler and no background poller in
 * this app by design; the ceiling is applied when the data is read.
 */
export const MATCH_CEILING_MINUTES = 150;

/** Below this a second half did not happen — `gameOver` was tapped early. */
export const MIN_SECOND_HALF_MINUTES = 20;

export interface TempoGoal {
  timestamp?: string;
  team?: 'color' | 'white' | null;
}

export interface TempoInput {
  startedAt?: Date | string | null;
  goals: TempoGoal[];
  events: { type: string; timestamp: string }[];
}

export type TempoExclusion = 'noHalfTime' | 'noGoals' | 'shortSecondHalf';

export interface MatchTempo {
  firstHalfGoals: number;
  secondHalfGoals: number;
  /** Goals in the last 20% of the (bounded) second half. */
  lateGoals: number;
  secondHalfMinutes: number;
  /** True when the ceiling, not a real tap, ended the window. */
  ceilingApplied: boolean;
}

const ms = (v: Date | string) => new Date(v).getTime();

/**
 * The anchor a match is measured from: kick-off when the start button was used,
 * otherwise the first goal. The fallback is a floor, not an equivalent — it
 * cannot see the time before the first goal — so anything derived from it
 * understates elapsed time and must not be published as a kick-off-relative
 * figure.
 */
export function matchAnchor(input: TempoInput): number | null {
  if (input.startedAt) return ms(input.startedAt);
  const stamped = input.goals.map(g => g.timestamp).filter((t): t is string => !!t).sort();
  return stamped.length ? ms(stamped[0]) : null;
}

/**
 * Effective end of the match. A real `gameOver` wins whenever it lands under the
 * ceiling; past that it is treated as forgotten and the ceiling stands.
 */
export function effectiveEnd(input: TempoInput): number | null {
  const anchor = matchAnchor(input);
  if (anchor === null) return null;
  const ceiling = anchor + MATCH_CEILING_MINUTES * 60000;
  const over = input.events.find(e => e.type === 'gameOver');
  if (!over) return ceiling;
  const tapped = ms(over.timestamp);
  return tapped > ceiling ? ceiling : tapped;
}

export function computeTempo(input: TempoInput): MatchTempo | { excluded: TempoExclusion } {
  const half = input.events.find(e => e.type === 'halfTime');
  if (!half) return { excluded: 'noHalfTime' };

  const goals = input.goals.filter(g => g.timestamp);
  if (goals.length === 0) return { excluded: 'noGoals' };

  const halfMs = ms(half.timestamp);
  const end = effectiveEnd(input);
  if (end === null) return { excluded: 'noGoals' };

  const secondHalfMs = end - halfMs;
  const secondHalfMinutes = secondHalfMs / 60000;
  if (secondHalfMinutes < MIN_SECOND_HALF_MINUTES) return { excluded: 'shortSecondHalf' };

  const anchor = matchAnchor(input)!;
  const ceilingApplied = end === anchor + MATCH_CEILING_MINUTES * 60000;

  let first = 0;
  let second = 0;
  let late = 0;
  for (const g of goals) {
    const t = ms(g.timestamp!);
    if (t <= halfMs) { first++; continue; }
    second++;
    // A goal past the window is clamped, never dropped: the goal is real even
    // when the clock marker around it is not.
    const frac = Math.min((t - halfMs) / secondHalfMs, 1);
    if (frac >= 0.8) late++;
  }

  return {
    firstHalfGoals: first,
    secondHalfGoals: second,
    lateGoals: late,
    secondHalfMinutes: Math.round(secondHalfMinutes * 10) / 10,
    ceilingApplied,
  };
}

export interface TempoSummary {
  games: number;
  excluded: Record<TempoExclusion, number>;
  firstHalfGoals: number;
  secondHalfGoals: number;
  lateGoals: number;
  firstHalfShare: number;
  lateShare: number;
  ceilingApplied: number;
}

/** Excluded games are counted and reported, never silently dropped. */
export function summariseTempo(inputs: TempoInput[]): TempoSummary {
  const excluded: Record<TempoExclusion, number> = { noHalfTime: 0, noGoals: 0, shortSecondHalf: 0 };
  let games = 0, first = 0, second = 0, late = 0, ceiling = 0;

  for (const input of inputs) {
    const t = computeTempo(input);
    if ('excluded' in t) { excluded[t.excluded]++; continue; }
    games++;
    first += t.firstHalfGoals;
    second += t.secondHalfGoals;
    late += t.lateGoals;
    if (t.ceilingApplied) ceiling++;
  }

  const total = first + second;
  return {
    games,
    excluded,
    firstHalfGoals: first,
    secondHalfGoals: second,
    lateGoals: late,
    firstHalfShare: total ? Math.round((first / total) * 100) : 0,
    lateShare: total ? Math.round((late / total) * 100) : 0,
    ceilingApplied: ceiling,
  };
}
