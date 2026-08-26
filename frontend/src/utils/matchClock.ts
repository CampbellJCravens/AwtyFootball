/**
 * Played time for a match, as the sum of its play segments. A segment opens at
 * kick-off or at the second-half restart and closes at the break or at now.
 * The half-time break is not football and must not be counted.
 *
 * Deliberately a fold over markers rather than an if-tree for two halves: if
 * the group ever adds water breaks and plays quarters, that is two more markers
 * here and nothing else changes.
 */

export interface MatchClockInput {
  startedAt: Date | null;
  /** First halfTime event. Games predating the restart button can hold duplicates. */
  halfTimeAt: Date | null;
  secondHalfAt: Date | null;
  gameOverAt: Date | null;
  now: Date;
}

/**
 * What a half-time break is assumed to have cost on a game that recorded one
 * but never recorded a restart — i.e. everything played before the restart
 * button existed (owner, 2026-08-22). Their real break length is unknowable, so
 * this is an ESTIMATE standing in for a measurement: it makes old games roughly
 * comparable to new ones instead of reading five minutes long forever.
 *
 * Applied only where a halfTime event exists. A game with no break recorded is
 * left alone rather than assumed to have taken one.
 */
export const ASSUMED_BREAK_MS = 5 * 60000;

/**
 * The legacy branch matters more than it looks. EVERY game played before the
 * restart button existed has a halfTime and no restart, so treating that shape
 * as "on a break" would freeze every finished game at its half-time whistle.
 * A finished game with no restart is measured kick-off to full time, less the
 * assumed break, and never less than the first half — which is time the players
 * are known to have been on the pitch.
 */
export function playedMs(input: MatchClockInput): number {
  const { startedAt, halfTimeAt, secondHalfAt, gameOverAt, now } = input;
  if (!startedAt) return 0;

  const start = startedAt.getTime();
  const end = (gameOverAt ?? now).getTime();

  if (!halfTimeAt) return Math.max(0, end - start);

  const firstHalf = Math.max(0, halfTimeAt.getTime() - start);
  if (!secondHalfAt) {
    if (!gameOverAt) return firstHalf;
    return Math.max(firstHalf, Math.max(0, end - start) - ASSUMED_BREAK_MS);
  }

  return firstHalf + Math.max(0, end - secondHalfAt.getTime());
}

/**
 * True when the elapsed figure rests on the assumed break rather than a
 * recorded restart, so a display can mark it as an estimate.
 */
export function isEstimated(input: Pick<MatchClockInput, 'halfTimeAt' | 'secondHalfAt' | 'gameOverAt'>): boolean {
  return !!input.halfTimeAt && !input.secondHalfAt && !!input.gameOverAt;
}

/** True while the break is running: half time recorded, no restart, not over. */
export function isOnBreak(input: Pick<MatchClockInput, 'halfTimeAt' | 'secondHalfAt' | 'gameOverAt'>): boolean {
  return !!input.halfTimeAt && !input.secondHalfAt && !input.gameOverAt;
}

/**
 * Football convention: minutes keep counting past 60 rather than rolling into
 * an hours field, so a game in its 87th minute reads "87:04".
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
