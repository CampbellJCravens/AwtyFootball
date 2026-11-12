import prisma from '../prisma';

// Guests promised vs guests brought, per host.
//
// Promised is the +1/+2 on a member's own RSVP (GameRsvp.guestCount). Brought is
// who actually turned up with a host recorded (GuestVisit.hostPlayerId). The two
// were never compared before because host attribution only started in August
// 2026: counting earlier games would read every old promise as broken when the
// truth is nobody was writing hosts down. So the window opens at the first game
// that has a hosted visit, and only games that were actually played count.

export interface HostingRow {
  playerId: string;
  name: string;
  promised: number;      // guests said to be coming, over the window
  brought: number;       // guests recorded against this host
  gamesPromised: number; // games where they promised at least one
  gamesKept: number;     // of those, games where they brought at least as many
  unannounced: number;   // guests brought in games where they promised none
}

export interface HostingResult {
  since: string | null;  // date of the first game with a hosted visit
  games: number;         // played games in the window
  unhostedVisits: number; // guest visits in the window with no host recorded
  rows: HostingRow[];
}

export function rollupGuestHosting(input: {
  games: { id: string; createdAt: Date; played: boolean }[];
  rsvps: { gameId: string; playerId: string; status: string; guestCount: number }[];
  visits: { gameId: string; hostPlayerId: string | null }[];
  players: { id: string; name: string }[];
}): HostingResult {
  const gameById = new Map(input.games.map(g => [g.id, g]));
  const hostedGameDates = input.visits
    .filter(v => v.hostPlayerId && gameById.has(v.gameId))
    .map(v => gameById.get(v.gameId)!.createdAt.getTime());
  if (hostedGameDates.length === 0) return { since: null, games: 0, unhostedVisits: 0, rows: [] };

  const since = Math.min(...hostedGameDates);
  const inWindow = new Set(
    input.games.filter(g => g.played && g.createdAt.getTime() >= since).map(g => g.id),
  );
  const names = new Map(input.players.map(p => [p.id, p.name]));

  // game|player -> { promised, brought }
  const cells = new Map<string, { playerId: string; promised: number; brought: number }>();
  const cell = (gameId: string, playerId: string) => {
    const key = `${gameId}|${playerId}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { playerId, promised: 0, brought: 0 }));
    return c;
  };
  for (const r of input.rsvps) {
    if (!inWindow.has(r.gameId) || r.status !== 'yes' || r.guestCount <= 0) continue;
    cell(r.gameId, r.playerId).promised += r.guestCount;
  }
  let unhostedVisits = 0;
  for (const v of input.visits) {
    if (!inWindow.has(v.gameId)) continue;
    if (!v.hostPlayerId) { unhostedVisits++; continue; }
    cell(v.gameId, v.hostPlayerId).brought++;
  }

  const rows = new Map<string, HostingRow>();
  for (const c of cells.values()) {
    const name = names.get(c.playerId);
    if (!name) continue; // a host id whose player has since been deleted
    let r = rows.get(c.playerId);
    if (!r) {
      rows.set(c.playerId, (r = {
        playerId: c.playerId, name, promised: 0, brought: 0, gamesPromised: 0, gamesKept: 0, unannounced: 0,
      }));
    }
    r.promised += c.promised;
    r.brought += c.brought;
    if (c.promised > 0) {
      r.gamesPromised++;
      if (c.brought >= c.promised) r.gamesKept++;
    } else {
      r.unannounced += c.brought;
    }
  }

  return {
    since: new Date(since).toISOString(),
    games: inWindow.size,
    unhostedVisits,
    rows: [...rows.values()].sort(
      (a, b) => b.promised + b.brought - (a.promised + a.brought) || a.name.localeCompare(b.name),
    ),
  };
}

export async function computeGuestHosting(): Promise<HostingResult> {
  const [games, rsvps, visits, players] = await Promise.all([
    prisma.game.findMany({ select: { id: true, createdAt: true, teamAssignments: true } }),
    prisma.gameRsvp.findMany({
      where: { guestCount: { gt: 0 } },
      select: { gameId: true, playerId: true, status: true, guestCount: true },
    }),
    prisma.guestVisit.findMany({ select: { gameId: true, hostPlayerId: true } }),
    prisma.player.findMany({ select: { id: true, name: true } }),
  ]);
  return rollupGuestHosting({
    games: games.map(g => ({
      id: g.id,
      createdAt: g.createdAt,
      played: !!g.teamAssignments && g.teamAssignments !== '{}',
    })),
    rsvps,
    visits,
    players,
  });
}
