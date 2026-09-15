/**
 * Which side a player was actually on when something happened.
 *
 * `Game.teamAssignments` holds ONE team per player, so a player who swapped
 * mid-game has their whole game attributed to the side they finished on. Goals
 * conceded before the swap are charged to the team they joined, and goals
 * conceded after are counted as though they had been there throughout. Measured
 * across every swap ever recorded: 8 of 11 change the conceded count, and one
 * denies a clean sheet that was really kept (Manny Suarez, game #13).
 *
 * GOVERNING RULE (owner, 2026-08-23) — fix the ADDITIVE metrics, leave the
 * CATEGORICAL ones alone. Goals conceded and clean sheets happen at instants
 * and become time-aware. Win/loss, games played, and "shared a side" for
 * chemistry and pairing describe the whole game and stay on the final team:
 * a player who swapped at 40 minutes did not win four tenths of a game.
 * Do not quietly extend this helper to those. See SWAP_ATTRIBUTION_PRD.md.
 */

import { goalValue, type WeightedGoalLike } from './goals';

export type Side = 'color' | 'white';

export interface SwapLike {
  playerId: string;
  type: string;
  timestamp?: string | Date | null;
  previousTeam?: Side | null;
  newTeam?: Side | null;
  // Why a 'leave' happened; read by services/departures.ts. Nothing in this
  // file uses it, but it rides along on the same records.
  reason?: string;
}

export interface TimedGoalLike extends WeightedGoalLike {
  timestamp?: string | Date | null;
}

const ms = (v: string | Date): number => new Date(v).getTime();

/**
 * The side `playerId` was on at `when`.
 *
 * Walks backwards from the final assignment, which is the only value that can
 * be trusted because it is what the map actually holds: among that player's
 * swaps recorded AFTER `when`, the earliest one's `previousTeam` is where they
 * were standing. Two swaps in a game need no special case — the earliest later
 * swap is still the right answer.
 *
 * Falls back to the final team, never to a guess:
 * - `when` missing → final team. An undated goal dropped from a conceded count
 *   would improve someone's record using absent data, which is worse than the
 *   bug being fixed.
 * - swap missing a timestamp or either side → ignored, same reasoning.
 * - player not in the game → null, exactly as today.
 */
export function teamAtMoment(
  finalTeam: Side | null | undefined,
  teamChanges: SwapLike[] | null | undefined,
  playerId: string,
  when: string | Date | null | undefined,
): Side | null {
  if (!finalTeam) return null;
  if (!when || !teamChanges || teamChanges.length === 0) return finalTeam;

  const at = ms(when);
  if (!Number.isFinite(at)) return finalTeam;

  let earliestLater: { at: number; previousTeam: Side } | null = null;
  for (const change of teamChanges) {
    if (change.type !== 'swap') continue;
    if (change.playerId !== playerId) continue;
    if (!change.timestamp || !change.previousTeam || !change.newTeam) continue;
    const changedAt = ms(change.timestamp);
    if (!Number.isFinite(changedAt) || changedAt <= at) continue;
    if (!earliestLater || changedAt < earliestLater.at) {
      earliestLater = { at: changedAt, previousTeam: change.previousTeam };
    }
  }

  return earliestLater ? earliestLater.previousTeam : finalTeam;
}

/** True when this player has a usable swap in this game — i.e. the cheap path is unsafe. */
export function hasSwap(teamChanges: SwapLike[] | null | undefined, playerId: string): boolean {
  if (!teamChanges) return false;
  return teamChanges.some(
    c => c.type === 'swap' && c.playerId === playerId && !!c.timestamp && !!c.previousTeam && !!c.newTeam,
  );
}

/**
 * Goals conceded by `playerId`, counting each goal against whichever side they
 * were on at that moment.
 *
 * `weight` keeps each call site's existing semantics rather than unifying them:
 * the achievements sites count goals (`() => 1`), the leaderboard sites use the
 * scoreline weight (`goalValue`). A golden goal worth 3 is one goal conceded in
 * one place and three in another, and this is not the change that reconciles
 * that.
 */
export function concededBy(
  goals: TimedGoalLike[],
  finalTeam: Side | null | undefined,
  teamChanges: SwapLike[] | null | undefined,
  playerId: string,
  weight: (goal: TimedGoalLike) => number = () => 1,
): number {
  if (!finalTeam) return 0;

  let conceded = 0;
  for (const goal of goals) {
    if (!goal.team) continue;
    const side = teamAtMoment(finalTeam, teamChanges, playerId, goal.timestamp);
    if (side && goal.team !== side) conceded += weight(goal);
  }
  return conceded;
}

/** `concededBy` with the scoreline weight, for the leaderboard sites. */
export function concededWeighted(
  goals: TimedGoalLike[],
  finalTeam: Side | null | undefined,
  teamChanges: SwapLike[] | null | undefined,
  playerId: string,
): number {
  return concededBy(goals, finalTeam, teamChanges, playerId, goalValue);
}
