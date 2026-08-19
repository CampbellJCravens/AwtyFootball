/**
 * Who has quietly stopped coming.
 *
 * ADMIN ONLY, permanently. A public "players who have gone quiet" list is a
 * callout board, and the point of this is to prompt a private word or a
 * roster decision — not to publish someone's absence. Nothing here may be
 * added to a public payload. See MATCH_ANALYTICS_PRD.md.
 */

/** Matches the MIN_GAMES floor the Reliability tab already uses. */
export const REGULAR_MIN_GAMES = 5;
export const QUIET_DAYS = 28;

export interface ChurnGame {
  createdAt: Date;
  field: string | null;
  teamAssignments: Record<string, 'color' | 'white'>;
}

export interface ChurnPlayer {
  id: string;
  name: string;
  onRoster: boolean;
}

export interface ChurnRow {
  playerId: string;
  name: string;
  games: number;
  firstSeen: string;
  lastSeen: string;
  daysSinceLastSeen: number;
  onRoster: boolean;
  quiet: boolean;
}

const DAY = 86400000;

export function computeChurn(
  games: ChurnGame[],
  players: ChurnPlayer[],
  now: Date = new Date(),
): { rows: ChurnRow[]; quiet: ChurnRow[]; asOf: string } {
  const byId = new Map(players.map(p => [p.id, p]));
  const played = games
    .filter(g => g.field !== 'cancelled')
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const appearances = new Map<string, Date[]>();
  for (const g of played) {
    for (const pid of Object.keys(g.teamAssignments || {})) {
      const p = byId.get(pid);
      // The GuestN pool is excluded from every player metric in this app.
      if (!p || p.name.includes('Guest')) continue;
      if (!appearances.has(pid)) appearances.set(pid, []);
      appearances.get(pid)!.push(g.createdAt);
    }
  }

  // Measured against the last game played, not wall-clock: mid-week every
  // regular would otherwise drift toward "quiet" for no reason.
  const lastGame = played.length ? played[played.length - 1].createdAt : now;

  const rows: ChurnRow[] = [];
  for (const [pid, dates] of appearances) {
    const p = byId.get(pid)!;
    dates.sort((a, b) => a.getTime() - b.getTime());
    const last = dates[dates.length - 1];
    const days = Math.round((lastGame.getTime() - last.getTime()) / DAY);
    rows.push({
      playerId: pid,
      name: p.name,
      games: dates.length,
      firstSeen: dates[0].toISOString(),
      lastSeen: last.toISOString(),
      daysSinceLastSeen: days,
      onRoster: p.onRoster,
      quiet: dates.length >= REGULAR_MIN_GAMES && p.onRoster && days >= QUIET_DAYS,
    });
  }

  rows.sort((a, b) => b.daysSinceLastSeen - a.daysSinceLastSeen || b.games - a.games);
  return {
    rows,
    quiet: rows.filter(r => r.quiet),
    asOf: lastGame.toISOString(),
  };
}
