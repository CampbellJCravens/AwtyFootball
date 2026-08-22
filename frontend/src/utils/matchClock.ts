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
 * The legacy branch matters more than it looks. EVERY game played before the
 * restart button existed has a halfTime and no restart, so treating that shape
 * as "on a break" would freeze every finished game at its half-time whistle. A
 * finished game with no restart is therefore measured the old way — kick-off to
 * full time — and reads exactly as it always has.
 */
export function playedMs(input: MatchClockInput): number {
  const { startedAt, halfTimeAt, secondHalfAt, gameOverAt, now } = input;
  if (!startedAt) return 0;

  const start = startedAt.getTime();
  const end = (gameOverAt ?? now).getTime();

  if (!halfTimeAt) return Math.max(0, end - start);

  const firstHalf = Math.max(0, halfTimeAt.getTime() - start);
  if (!secondHalfAt) return gameOverAt ? Math.max(0, end - start) : firstHalf;

  return firstHalf + Math.max(0, end - secondHalfAt.getTime());
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
