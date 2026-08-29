/**
 * Structural, not imported from api/stats: this file describes a game in words
 * and has no reason to depend on the transport layer. StandoutGame satisfies it.
 */
export interface StandoutGameLike {
  colorScore: number;
  whiteScore: number;
  qualityLabel: string;
  leadChanges: number;
  comeback?: boolean | null;
  tie?: boolean;
  goldenDecided?: boolean;
}

/**
 * The one-line description under Game of the Month / Game of the Season.
 *
 * Two facts are deliberately absent. Total goals is the two halves of the
 * scoreline added together, and the margin is already visible in the score, so
 * printing either beside "3–4" tells the reader nothing they cannot see.
 *
 * `settled by golden goal` SUPPRESSES `won from behind`, because it implies it:
 * only the trailing team's decider carries extra weight, so a golden goal can
 * change the result only when the side that was behind scored it.
 *
 * Order is priority order. The value renders as a single line — about 374px at
 * 13px on the full-width tile — so the least important tokens are dropped
 * rather than left to truncate mid-word.
 */
const MAX_CHARS = 57;

export function standoutGameLine(g: StandoutGameLike): string {
  const parts = [
    `${g.colorScore}–${g.whiteScore}`,
    g.qualityLabel,
    ...(g.goldenDecided ? ['settled by golden goal'] : g.comeback ? ['won from behind'] : []),
    ...(g.leadChanges ? [`${g.leadChanges} lead change${g.leadChanges === 1 ? '' : 's'}`] : []),
    ...(g.tie ? ['finished level'] : []),
  ];
  // Never drop the score or the quality label: those two are the description.
  while (parts.length > 2 && parts.join(' · ').length > MAX_CHARS) parts.pop();
  return parts.join(' · ');
}
