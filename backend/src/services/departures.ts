// Lack of Stamina — players who leave before full time.
//
// The source has been recorded all along: teamChanges rows of type 'leave'.
// Nothing here needs a match clock, which matters because startedAt only exists
// from 2026-08-22 and departure timing is therefore not yet computable.
//
// Two rules decide whether a departure counts, and both are deliberate:
//
//   1. Leaving at HALF TIME still counts. It forces a rebalance and changes the
//      second half either way, so the metric measures the cost to the people who
//      stayed rather than the excuse of the person leaving (owner 2026-08-29).
//   2. An UNTAGGED departure counts. Only an explicit excusing reason — injured,
//      family, work — removes it. Requiring somebody to volunteer 'quit' would
//      make this read zero forever.

export type LeaveReason = 'injured' | 'family' | 'work' | 'quit';

// Structurally compatible with attribution.ts's SwapLike, which types `type` as
// a bare string and knows nothing about reasons.
export interface DepartureChangeLike {
  playerId: string;
  type: string;
  reason?: string;
}

export interface DepartureGameLike {
  teamAssignments: Record<string, 'color' | 'white'>;
  teamChanges: DepartureChangeLike[];
}

export interface DepartureRow {
  playerId: string;
  departures: number;   // counted only
  excused: number;      // injured / family / work, shown nowhere yet
  gamesPlayed: number;
  rate: number;         // departures / gamesPlayed
}

// Reasons that clear a player of the departure. 'quit' is absent on purpose: it
// records that somebody actually asked, and scores the same as a blank.
const EXCUSED: ReadonlySet<string> = new Set<LeaveReason>(['injured', 'family', 'work']);

export const isExcusedLeave = (reason?: string) => !!reason && EXCUSED.has(reason);

// Same floor the Reliability tab uses. Load-bearing rather than cosmetic: on the
// 2026 data, dropping it hands the award to two players who appeared once and
// left once, at a rate of 100%.
export const MIN_GAMES = 5;

const isGuestName = (name: string) => /^Guest\d+$/.test(name);

/**
 * Per-player departure counts over the given games.
 *
 * `players` supplies names (to drop the GuestN pool) and the exemption flag.
 * Ids with no player row are skipped — teamChanges is JSON with no foreign key,
 * so it still holds slots for players who have since been deleted.
 */
export function computeDepartures(
  games: DepartureGameLike[],
  players: Array<{ id: string; name: string; staminaExempt?: boolean }>,
): DepartureRow[] {
  const byId = new Map(players.map(p => [p.id, p]));
  const counted = new Map<string, number>();
  const excused = new Map<string, number>();
  const played = new Map<string, number>();

  const eligible = (playerId: string) => {
    const p = byId.get(playerId);
    return !!p && !isGuestName(p.name) && !p.staminaExempt;
  };

  for (const game of games) {
    for (const playerId of Object.keys(game.teamAssignments ?? {})) {
      if (!eligible(playerId)) continue;
      played.set(playerId, (played.get(playerId) ?? 0) + 1);
    }
    // ONE departure per player per game, not one per event. A game can hold two
    // leave rows for the same player — a double tap, or a leave, rejoin and
    // leave again (Jon Schwarz has exactly this in game #5). Counting events
    // would let a rate exceed 100%, and "left early in N of M games" is the
    // claim being made anyway. A game counts unless EVERY leave in it is
    // excused, so one untagged departure is not laundered by a tagged one.
    const seen = new Map<string, boolean>();
    for (const change of game.teamChanges ?? []) {
      if (change.type !== 'leave' || !eligible(change.playerId)) continue;
      const stillCounts = !isExcusedLeave(change.reason);
      seen.set(change.playerId, (seen.get(change.playerId) ?? false) || stillCounts);
    }
    for (const [playerId, stillCounts] of seen) {
      const bucket = stillCounts ? counted : excused;
      bucket.set(playerId, (bucket.get(playerId) ?? 0) + 1);
    }
  }

  const ids = new Set([...counted.keys(), ...excused.keys()]);
  return [...ids]
    .map(playerId => {
      const departures = counted.get(playerId) ?? 0;
      const gamesPlayed = played.get(playerId) ?? 0;
      return {
        playerId,
        departures,
        excused: excused.get(playerId) ?? 0,
        gamesPlayed,
        rate: gamesPlayed > 0 ? departures / gamesPlayed : 0,
      };
    })
    // Kept when only excused departures exist: the row still carries a true
    // `excused` count, and staminaAward applies the departures > 0 test itself.
    .filter(r => r.departures > 0 || r.excused > 0);
}

/**
 * The award winners: worst departure RATE among players over the games floor.
 * Returns every player tied on the same rate, matching how the other awards
 * hand out ties, and an empty array when the period has no qualifying
 * departures — the reports render nothing rather than an empty tile.
 */
export function staminaAward(rows: DepartureRow[]): DepartureRow[] {
  const qualified = rows.filter(r => r.gamesPlayed >= MIN_GAMES && r.departures > 0);
  if (qualified.length === 0) return [];
  const worst = Math.max(...qualified.map(r => r.rate));
  return qualified
    .filter(r => r.rate === worst)
    .sort((a, b) => b.departures - a.departures);
}
