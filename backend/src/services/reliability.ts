import prisma from '../prisma';

// Per-player RSVP reliability across *tracked* games (a game with a non-empty
// Color/White roster = "who showed up"). Guests (the GuestN pool players) are
// excluded — they aren't real members. Guest *headcounts* (guestCount on a
// player's own "yes") are rolled up separately for the guest-frequency view.
//
// Shared by GET /api/stats/reliability and the turnout projection so both read
// one definition of the four response buckets.

const safeParseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

export const isGuestPool = (name: string) => /^Guest\d+$/.test(name.trim());

export type RsvpBucket = 'yes' | 'maybe' | 'no' | 'silent';

export interface ReliabilityPlayer {
  id: string;
  name: string;
  pictureUrl: string | null;
  responded: number;
  committed: number;
  showed: number;
  showedWhenCommitted: number;
  noShow: number;
  maybed: number;
  converted: number;
  declined: number;
  reversed: number;
  silent: number;
  ghost: number;
  guestsBrought: number;
  gamesWithGuests: number;
  responseRate: number | null;
  showWhenCommittedRate: number | null;
  convertRate: number | null;
  reversalRate: number | null;
  ghostRate: number | null;
  attendanceRate: number | null;
  guestAttachRate: number | null;
}

export interface ReliabilityResult {
  totalTrackedGames: number;
  summary: {
    avgResponses: number;
    avgTurnout: number;
    guestsIndicated: number;
    guestsShown: number;
    baseRates: {
      yes: number;
      maybe: number;
      no: number;
      silent: number;
      n: { yes: number; maybe: number; no: number; silent: number };
    };
  };
  // Turnout per tracked game, ascending. Two scales, and mixing them is a bug:
  //  - turnoutHistory       = non-guest only. Matches the Poisson-binomial,
  //                           whose universe is rostered players.
  //  - turnoutHistoryTotal  = every body on the roster, guests included. This
  //                           is what "how many turned up" means to a human,
  //                           and what the headline projection is measured in.
  turnoutHistory: number[];
  turnoutHistoryTotal: number[];
  players: ReliabilityPlayer[];
}

export async function computeReliability(): Promise<ReliabilityResult> {
  const [players, games, rsvps] = await Promise.all([
    prisma.player.findMany({ select: { id: true, name: true, pictureUrl: true } }),
    prisma.game.findMany({ select: { id: true, teamAssignments: true } }),
    prisma.gameRsvp.findMany({ select: { gameId: true, playerId: true, status: true, guestCount: true } }),
  ]);

  // Tracked game = one with at least one player on a team.
  const rosterByGame = new Map<string, Set<string>>();
  for (const g of games) {
    const roster = Object.keys(safeParseJSON<Record<string, string>>(g.teamAssignments, {}));
    if (roster.length > 0) rosterByGame.set(g.id, new Set(roster));
  }
  const totalTrackedGames = rosterByGame.size;

  // RSVPs keyed by game+player, restricted to tracked games.
  const rsvpByKey = new Map<string, { status: string; guestCount: number }>();
  for (const r of rsvps) {
    if (rosterByGame.has(r.gameId)) {
      rsvpByKey.set(`${r.gameId}:${r.playerId}`, { status: r.status, guestCount: r.guestCount });
    }
  }

  // Four mutually exclusive response buckets per tracked game. Splitting these
  // matters: "said Maybe and came" and "said nothing and came" are completely
  // different signals, and the old single `ghost` counter averaged them into
  // mush. Only silence → showed is GHOSTING. A Maybe who shows has CONVERTED;
  // someone who said Out and came anyway is a REVERSAL.
  const result: ReliabilityPlayer[] = players
    .filter(p => !isGuestPool(p.name))
    .map(p => {
      let responded = 0, committed = 0, showed = 0, showedWhenCommitted = 0;
      let noShow = 0, guestsBrought = 0, gamesWithGuests = 0;
      let maybed = 0, converted = 0;
      let declined = 0, reversed = 0;
      let silent = 0, ghost = 0;

      for (const [gameId, roster] of rosterByGame) {
        const r = rsvpByKey.get(`${gameId}:${p.id}`);
        const onRoster = roster.has(p.id);

        if (r) responded++;

        switch (r?.status) {
          case 'yes':
            committed++;
            guestsBrought += r.guestCount;
            if (r.guestCount > 0) gamesWithGuests++;
            if (onRoster) showedWhenCommitted++; else noShow++;
            break;
          case 'maybe':
            maybed++;
            if (onRoster) converted++;
            break;
          case 'no':
            declined++;
            if (onRoster) reversed++;
            break;
          default:
            silent++;
            if (onRoster) ghost++;
        }

        if (onRoster) showed++;
      }

      const frac = (num: number, den: number) => (den > 0 ? num / den : null);

      return {
        id: p.id,
        name: p.name,
        pictureUrl: p.pictureUrl,
        responded,
        committed,
        showed,
        showedWhenCommitted,
        noShow,
        maybed,
        converted,
        declined,
        reversed,
        silent,
        ghost,
        guestsBrought,
        gamesWithGuests,
        // Fractions 0-1 (or null when the denominator is 0). Frontend formats %.
        responseRate: frac(responded, totalTrackedGames),
        showWhenCommittedRate: frac(showedWhenCommitted, committed),
        convertRate: frac(converted, maybed),
        reversalRate: frac(reversed, declined),
        ghostRate: frac(ghost, silent),
        attendanceRate: frac(showed, totalTrackedGames),
        guestAttachRate: frac(gamesWithGuests, committed),
      };
    });

  // Season reconciliation: responses vs actual turnout, and indicated vs
  // actual guests. Guests sit on the roster as "GuestN" entries, so a game's
  // real turnout excludes them and guest slots = guests who actually showed.
  const nameById = new Map(players.map(p => [p.id, p.name]));
  let guestSlots = 0, realTurnout = 0, responsesTotal = 0, guestsIndicated = 0;
  const turnoutHistory: number[] = [];
  const turnoutHistoryTotal: number[] = [];
  for (const [, roster] of rosterByGame) {
    let gameTurnout = 0;
    for (const pid of roster) {
      if (isGuestPool(nameById.get(pid) || '')) guestSlots++;
      else { realTurnout++; gameTurnout++; }
    }
    turnoutHistory.push(gameTurnout);
    turnoutHistoryTotal.push(roster.size);
  }
  turnoutHistory.sort((a, b) => a - b);
  turnoutHistoryTotal.sort((a, b) => a - b);

  for (const r of rsvps) {
    if (rosterByGame.has(r.gameId)) {
      responsesTotal++;
      if (r.status === 'yes') guestsIndicated += r.guestCount;
    }
  }

  // League-wide show-rate per response bucket. These are the priors the
  // turnout projection shrinks each player's own rate toward.
  const totals = result.reduce(
    (a, p) => ({
      committed: a.committed + p.committed,
      showedWhenCommitted: a.showedWhenCommitted + p.showedWhenCommitted,
      maybed: a.maybed + p.maybed,
      converted: a.converted + p.converted,
      declined: a.declined + p.declined,
      reversed: a.reversed + p.reversed,
      silent: a.silent + p.silent,
      ghost: a.ghost + p.ghost,
    }),
    { committed: 0, showedWhenCommitted: 0, maybed: 0, converted: 0, declined: 0, reversed: 0, silent: 0, ghost: 0 }
  );
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

  return {
    totalTrackedGames,
    turnoutHistory,
    turnoutHistoryTotal,
    summary: {
      avgResponses: totalTrackedGames ? responsesTotal / totalTrackedGames : 0,
      avgTurnout: totalTrackedGames ? realTurnout / totalTrackedGames : 0,
      guestsIndicated,
      guestsShown: guestSlots,
      baseRates: {
        yes: rate(totals.showedWhenCommitted, totals.committed),
        maybe: rate(totals.converted, totals.maybed),
        no: rate(totals.reversed, totals.declined),
        silent: rate(totals.ghost, totals.silent),
        // Denominators, so the frontend can show how thin each prior is.
        n: { yes: totals.committed, maybe: totals.maybed, no: totals.declined, silent: totals.silent },
      },
    },
    players: result,
  };
}

// In-process memo. The underlying scan is a few hundred rows and the identical
// scan already runs uncached on every reliability page load, so this is tidiness
// rather than a Neon necessity — but it costs nothing. Deliberately NOT a cron:
// a scheduled job would wake Neon's compute on a timer whether or not anyone is
// looking, which is strictly worse than computing on demand.
let memo: { at: number; value: ReliabilityResult } | null = null;
const MEMO_MS = 5 * 60 * 1000;

export async function getReliability(): Promise<ReliabilityResult> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const value = await computeReliability();
  memo = { at: Date.now(), value };
  return value;
}

export function invalidateReliability(): void {
  memo = null;
}

// Single-point invalidation. Registered here rather than called at each write
// site so a future write path can't silently serve a stale projection — there
// are already ~10 places that mutate Game or GameRsvp.
const MUTATIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

prisma.$use(async (params, next) => {
  const result = await next(params);
  if ((params.model === 'Game' || params.model === 'GameRsvp') && MUTATIONS.has(params.action)) {
    invalidateReliability();
  }
  return result;
});
