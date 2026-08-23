/**
 * Who keeps missing each other.
 *
 * Reads past team assignments and, for every pair of players responding to an
 * upcoming game, reports how long it has been since they last shared a side.
 * The point is the owner's principle — "you have to learn to play through
 * adversity to understand how to play with different teammates" — made visible
 * on a Friday, so the pairing can be deliberate rather than habitual.
 *
 * ⚠️ This is NOT a strength balancer and must never become one. Ability ratings
 * were considered and rejected on 2026-08-22: the games are already competitive
 * (mean margin 2.27 over 30 games, 37% within a goal), and a hidden number
 * ranking friends by ability is corrosive in a group chat. Nothing here scores
 * a player. See PAIRING_VARIETY_PRD.md.
 */

export interface PairingGame {
  createdAt: Date;
  teamAssignments: Record<string, string>;
}

export interface PairRow {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  /** Games where both played on the same side. */
  sharedGames: number;
  /** Games where both played at all, same side or not. */
  coAttended: number;
  /** ISO date of the last shared side, or null for never. */
  lastTogether: string | null;
}

export interface PairingResult {
  /** Coldest pairs first: never together, then longest since. */
  variety: PairRow[];
  /** The opposite end — pairs that are nearly always on the same side. */
  stuck: PairRow[];
  candidates: number;
  qualifyingPairs: number;
  possiblePairs: number;
}

/**
 * A pair must have shown up together this often before it can be called
 * "never plays together". Without this floor the list fills with newcomers and
 * one-off guests who haven't shared a side because they've barely played —
 * noise wearing the costume of insight. Validated at 4 against real data:
 * 79 of 91 pairs among game #34's respondents clear it.
 */
export const MIN_CO_ATTENDED = 4;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface ComputePairingOptions {
  games: PairingGame[];
  /** Players responding to the upcoming game. */
  candidateIds: string[];
  /**
   * Real, non-guest players by id. Anything absent is dropped wherever it
   * appears — `teamAssignments` holds orphaned ids for deleted players (3 of
   * them, with 6-9 games each), and suggesting a pairing with a deleted account
   * is the obvious way for this panel to look broken.
   */
  nameById: Map<string, string>;
  limit?: number;
  stuckLimit?: number;
}

export function computePairing(opts: ComputePairingOptions): PairingResult {
  const { games, nameById, limit = 5, stuckLimit = 2 } = opts;
  const known = (id: string) => nameById.has(id);
  const candidates = [...new Set(opts.candidateIds)].filter(known);

  const shared = new Map<string, number>();
  const co = new Map<string, number>();
  const last = new Map<string, Date>();

  for (const game of games) {
    const present = Object.keys(game.teamAssignments || {}).filter(known);
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const key = pairKey(present[i], present[j]);
        co.set(key, (co.get(key) ?? 0) + 1);
        if (game.teamAssignments[present[i]] === game.teamAssignments[present[j]]) {
          shared.set(key, (shared.get(key) ?? 0) + 1);
          const prev = last.get(key);
          if (!prev || game.createdAt > prev) last.set(key, game.createdAt);
        }
      }
    }
  }

  const rows: PairRow[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const aId = candidates[i];
      const bId = candidates[j];
      const key = pairKey(aId, bId);
      const coAttended = co.get(key) ?? 0;
      if (coAttended < MIN_CO_ATTENDED) continue;
      const when = last.get(key);
      rows.push({
        aId,
        bId,
        aName: nameById.get(aId)!,
        bName: nameById.get(bId)!,
        sharedGames: shared.get(key) ?? 0,
        coAttended,
        lastTogether: when ? when.toISOString().slice(0, 10) : null,
      });
    }
  }

  // Never together outranks any date; otherwise oldest first. Ties break on the
  // lower share, so 1-of-6 sits above 4-of-7 on the same date.
  const variety = [...rows].sort((x, y) => {
    if (!x.lastTogether && !y.lastTogether) return y.coAttended - x.coAttended;
    if (!x.lastTogether) return -1;
    if (!y.lastTogether) return 1;
    if (x.lastTogether !== y.lastTogether) return x.lastTogether < y.lastTogether ? -1 : 1;
    return x.sharedGames / x.coAttended - y.sharedGames / y.coAttended;
  });

  const stuck = [...rows]
    .filter(r => r.sharedGames > 0)
    .sort((x, y) => {
      const rx = x.sharedGames / x.coAttended;
      const ry = y.sharedGames / y.coAttended;
      if (rx !== ry) return ry - rx;
      return y.coAttended - x.coAttended;
    });

  return {
    variety: variety.slice(0, limit),
    stuck: stuck.slice(0, stuckLimit),
    candidates: candidates.length,
    qualifyingPairs: rows.length,
    possiblePairs: (candidates.length * (candidates.length - 1)) / 2,
  };
}

/**
 * How familiar a player is with a given side, for cut 2's rebalance shortlist:
 * lower is better when choosing who to move, so evening the numbers also serves
 * variety.
 *
 * Returns a RATE in [0,1] — the share of the player's own games spent alongside
 * a typical member of that side — not a raw count. A count would rank by
 * seniority: a regular with 20 games always looks more "familiar" than someone
 * with 3, so the shortlist would quietly single out newcomers to be moved,
 * every week. Normalising by the player's own games played removes that.
 *
 * Returns 0 for a player with no history, which correctly reads as "knows
 * nobody here" — a genuinely good candidate to move.
 */
export function affinityWithSide(
  games: PairingGame[],
  nameById: Map<string, string>,
  playerId: string,
  sideMemberIds: string[],
): number {
  const known = (id: string) => nameById.has(id);
  if (!known(playerId)) return 0;
  const members = sideMemberIds.filter(id => known(id) && id !== playerId);
  if (members.length === 0) return 0;

  let together = 0;
  let played = 0;
  for (const game of games) {
    const team = game.teamAssignments?.[playerId];
    if (!team) continue;
    played++;
    for (const other of members) {
      if (game.teamAssignments[other] === team) together++;
    }
  }
  if (played === 0) return 0;
  return together / (members.length * played);
}
