import { Prisma } from '@prisma/client';
import prisma from '../prisma';

// Guests who actually turned up, tracked across games so a repeat visitor
// resolves to one identity — that identity is what the dues ledger counts.
//
// Deliberately separate from the GuestN pool Players: those are per-game slots
// reused by different humans, and their `Player.name` is the string six other
// call sites match on to exclude guests from player metrics. Nothing here ever
// touches `Player.name`.

export interface GuestVisitInput {
  slotPlayerId: string;
  guestName: string | null;
  hostPlayerId: string | null;
}

export interface GuestVisitDto {
  slotPlayerId: string;
  guestId: string | null;
  guestName: string | null;
  hostPlayerId: string | null;
}

export const normalizeGuestName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

// Replaces a game's guest visits wholesale, resolving each supplied name to a
// Guest first. Wholesale replacement matches how the game's other fields save:
// the client owns the full picture and the auto-save ships all of it.
export async function replaceGuestVisits(
  tx: Prisma.TransactionClient,
  gameId: string,
  visits: GuestVisitInput[],
): Promise<void> {
  const guestIdByNormalized = new Map<string, string>();

  for (const visit of visits) {
    const name = visit.guestName?.trim();
    if (!name) continue;
    const normalizedName = normalizeGuestName(name);
    if (guestIdByNormalized.has(normalizedName)) continue;

    const guest = await tx.guest.upsert({
      where: { normalizedName },
      update: { name },
      create: { name, normalizedName },
    });
    guestIdByNormalized.set(normalizedName, guest.id);
  }

  await tx.guestVisit.deleteMany({ where: { gameId } });

  if (visits.length === 0) return;

  await tx.guestVisit.createMany({
    data: visits.map(visit => {
      const name = visit.guestName?.trim();
      return {
        gameId,
        slotPlayerId: visit.slotPlayerId,
        guestId: name ? guestIdByNormalized.get(normalizeGuestName(name))! : null,
        hostPlayerId: visit.hostPlayerId,
      };
    }),
  });
}

export async function getGuestVisits(gameId: string): Promise<GuestVisitDto[]> {
  const rows = await prisma.guestVisit.findMany({
    where: { gameId },
    include: { guest: { select: { name: true } } },
  });

  return rows.map(row => ({
    slotPlayerId: row.slotPlayerId,
    guestId: row.guestId,
    guestName: row.guest?.name ?? null,
    hostPlayerId: row.hostPlayerId,
  }));
}

export interface GuestSummary {
  id: string;
  name: string;
  lastSeen: string | null;
}

// Guests most-recently-seen first, so the details modal can offer the people
// actually doing the rounds before anything is typed.
export async function listGuests(): Promise<GuestSummary[]> {
  const guests = await prisma.guest.findMany({
    select: {
      id: true,
      name: true,
      visits: { select: { game: { select: { createdAt: true } } } },
    },
  });

  return guests
    .map(g => {
      const latest = g.visits.reduce<Date | null>(
        (max, v) => (!max || v.game.createdAt > max ? v.game.createdAt : max),
        null
      );
      return { id: g.id, name: g.name, lastSeen: latest?.toISOString() ?? null };
    })
    .sort((a, b) => {
      if (a.lastSeen && b.lastSeen) return b.lastSeen.localeCompare(a.lastSeen);
      if (a.lastSeen) return -1;
      if (b.lastSeen) return 1;
      return a.name.localeCompare(b.name);
    });
}

export interface GuestLedgerRow {
  guestId: string | null; // null = the aggregate row for unnamed guests
  name: string;
  visits: number;
  firstSeen: string | null;
  lastSeen: string | null;
  usualHostId: string | null;
  usualHostVisits: number;
}

// Dues ledger. The GUEST is the unit of collection (owner decision 2026-08-07):
// one row per guest, sorted by appearances. The usual host rides along as
// context for who to nudge — it is not a second thing to total up.
//
// A guest occupying two slots in one game (left and came back) counts once:
// dues follow appearances, not slots.
export async function computeGuestLedger(): Promise<GuestLedgerRow[]> {
  const [visits, games] = await Promise.all([
    prisma.guestVisit.findMany({ include: { guest: { select: { name: true } } } }),
    prisma.game.findMany({ select: { id: true, createdAt: true } }),
  ]);

  const gameDates = new Map(games.map(g => [g.id, g.createdAt]));

  const byGuest = new Map<string, {
    name: string;
    gameIds: Set<string>;
    hostCounts: Map<string, Set<string>>;
  }>();

  for (const visit of visits) {
    const key = visit.guestId ?? '__unnamed__';
    if (!byGuest.has(key)) {
      byGuest.set(key, {
        name: visit.guest?.name ?? 'Unnamed',
        gameIds: new Set(),
        hostCounts: new Map(),
      });
    }
    const entry = byGuest.get(key)!;
    entry.gameIds.add(visit.gameId);

    if (visit.hostPlayerId) {
      if (!entry.hostCounts.has(visit.hostPlayerId)) entry.hostCounts.set(visit.hostPlayerId, new Set());
      entry.hostCounts.get(visit.hostPlayerId)!.add(visit.gameId);
    }
  }

  const rows: GuestLedgerRow[] = [];

  for (const [key, entry] of byGuest) {
    const dates = [...entry.gameIds]
      .map(id => gameDates.get(id))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());

    let usualHostId: string | null = null;
    let usualHostVisits = 0;
    for (const [hostId, hostGames] of entry.hostCounts) {
      if (hostGames.size > usualHostVisits) {
        usualHostId = hostId;
        usualHostVisits = hostGames.size;
      }
    }

    rows.push({
      guestId: key === '__unnamed__' ? null : key,
      name: entry.name,
      visits: entry.gameIds.size,
      firstSeen: dates[0]?.toISOString() ?? null,
      lastSeen: dates[dates.length - 1]?.toISOString() ?? null,
      usualHostId,
      usualHostVisits,
    });
  }

  // Named guests by appearances descending; the unnamed aggregate always sits
  // last so it reads as a reconciliation line, not a person to chase.
  return rows.sort((a, b) => {
    if (a.guestId === null) return 1;
    if (b.guestId === null) return -1;
    return b.visits - a.visits || a.name.localeCompare(b.name);
  });
}
