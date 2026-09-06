// Punctuality — when each player actually joined the game.
//
// The mirror of services/departures.ts, and it reads the same JSON column. The
// difference is what counts as evidence: a departure is recorded by an explicit
// 'leave', whereas arriving ON TIME records nothing at all. Being in
// teamAssignments with no 'join' row IS the on-time record, so the common case
// costs no storage and needs no tap.
//
// Two clock facts drive every rule below, both measured 2026-09-05:
//   - startedAt exists on 4 of 36 games (from #33). A game without it is
//     UNMEASURABLE and contributes nothing — never "everyone was on time",
//     which would silently reward forgetting to tap Start.
//   - halfTime is recorded on 32 of 36 games; secondHalfStart on only 2. The
//     second-half boundary therefore keys off halfTime and must stay that way.

// Minutes after kick-off still counted as on time. The owner's call
// (2026-09-05): he opened at 5, the argument for 10 is that anyone arriving
// during the warm-up misses no play, and he settled on 8.
export const GRACE_MINUTES = 8;

// 🔴 The cutoff exists to stop the past lying. Games #33-#36 already carry a
// startedAt but predate 'join' capture, so every player in them has no join row
// — which this service would otherwise read as "was there at kick-off" and
// score as a flawless 100%. That is absence of evidence rendered as evidence of
// punctuality, and it would quietly inflate the first month of the metric.
//
// Only games kicking off from here on are measured. MUST be on or after the day
// the capture deploys; move it forward, never back.
export const TRACKING_FROM = new Date('2026-09-06T00:00:00Z');

// Same floor as departures and the Reliability tab. Without it the first weeks
// hand "worst punctuality" to whoever appeared once and was late once.
export const MIN_GAMES = 5;

export type ArrivalBucket = 'kickoff' | 'grace' | 'firstHalf' | 'secondHalf';

export interface ArrivalChangeLike {
  playerId: string;
  type: string;
  timestamp?: string | Date | null;
}

export interface ArrivalEventLike {
  type: string;
  timestamp?: string | Date | null;
}

export interface ArrivalGameLike {
  startedAt?: Date | string | null;
  teamAssignments: Record<string, 'color' | 'white'>;
  teamChanges: ArrivalChangeLike[];
  gameEvents: ArrivalEventLike[];
}

export interface ArrivalRow {
  playerId: string;
  measuredGames: number; // games with a usable clock that they appeared in
  kickoff: number;
  grace: number;
  firstHalf: number;
  secondHalf: number;
  late: number;              // firstHalf + secondHalf — the ones that cost play
  onTimeRate: number | null; // (kickoff + grace) / measuredGames
}

const isGuestName = (name: string) => /^Guest\d+$/.test(name.trim());

/**
 * Whether a game can be scored for punctuality at all: it needs a kick-off, and
 * that kick-off must be from TRACKING_FROM on. The single source of truth for
 * the question — callers must not re-implement "has a startedAt", or the games
 * count on the card drifts away from the rows in it.
 */
export function isMeasurableGame(startedAt: Date | string | null | undefined): boolean {
  const t = toTime(startedAt);
  return t !== null && t >= TRACKING_FROM.getTime();
}

const toTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Which bucket a join at `joinedAt` falls in. Exported for the report line and
 * so the boundary rules are testable without building a whole game.
 */
export function bucketFor(
  joinedAt: number,
  startedAt: number,
  halfTimeAt: number | null,
): ArrivalBucket {
  // A halfTime BEFORE the grace window closes would otherwise make a punctual
  // arrival read as second half. Real games can't do this; corrupt timestamps
  // can, and the grace window is the more specific claim, so it wins.
  if (joinedAt <= startedAt + GRACE_MINUTES * 60_000) return 'grace';
  if (halfTimeAt !== null && joinedAt >= halfTimeAt) return 'secondHalf';
  return 'firstHalf';
}

/**
 * Per-player arrival counts over the given games.
 *
 * `players` supplies names, so the GuestN pool drops out. Ids with no player
 * row are skipped: teamChanges is JSON with no foreign key and still holds
 * slots for players who have since been deleted — counting its keys directly
 * ranks deleted guest slots as the club's most dedicated members.
 */
export function computeArrivals(
  games: ArrivalGameLike[],
  players: Array<{ id: string; name: string }>,
): ArrivalRow[] {
  const byId = new Map(players.map(p => [p.id, p]));
  const eligible = (playerId: string) => {
    const p = byId.get(playerId);
    return !!p && !isGuestName(p.name);
  };

  const rows = new Map<string, ArrivalRow>();
  const row = (playerId: string): ArrivalRow => {
    let r = rows.get(playerId);
    if (!r) {
      r = {
        playerId, measuredGames: 0, kickoff: 0, grace: 0,
        firstHalf: 0, secondHalf: 0, late: 0, onTimeRate: null,
      };
      rows.set(playerId, r);
    }
    return r;
  };

  for (const game of games) {
    // No clock, no measurement — the rule that keeps a forgotten Start tap from
    // reading as a perfectly punctual squad — plus nothing from before capture
    // existed. Both live in isMeasurableGame so the card's games count and its
    // rows can never disagree.
    const startedAt = toTime(game.startedAt);
    if (startedAt === null || !isMeasurableGame(game.startedAt)) continue;

    const halfTimeAt = (game.gameEvents ?? [])
      .filter(e => e.type === 'halfTime')
      .map(e => toTime(e.timestamp))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b)[0] ?? null;

    // EARLIEST join per player, not the last. A player who arrives late, leaves
    // and is re-added later would otherwise be scored on the re-add — the claim
    // being made is "when did they first turn up".
    const joinedAt = new Map<string, number>();
    for (const change of game.teamChanges ?? []) {
      if (change.type !== 'join' || !eligible(change.playerId)) continue;
      const t = toTime(change.timestamp);
      if (t === null) continue;
      const prev = joinedAt.get(change.playerId);
      if (prev === undefined || t < prev) joinedAt.set(change.playerId, t);
    }

    for (const playerId of Object.keys(game.teamAssignments ?? {})) {
      if (!eligible(playerId)) continue;
      const r = row(playerId);
      r.measuredGames++;

      const joined = joinedAt.get(playerId);
      // No join row on someone who played = they were already on a team when
      // the whistle went.
      const bucket = joined === undefined ? 'kickoff' : bucketFor(joined, startedAt, halfTimeAt);
      r[bucket]++;
      if (bucket === 'firstHalf' || bucket === 'secondHalf') r.late++;
    }
  }

  return [...rows.values()]
    .map(r => ({
      ...r,
      onTimeRate: r.measuredGames > 0 ? (r.kickoff + r.grace) / r.measuredGames : null,
    }))
    .sort((a, b) => b.measuredGames - a.measuredGames);
}
