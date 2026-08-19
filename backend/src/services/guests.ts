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

export interface RenameConflict {
  conflict: true;
  guestId: string;
  name: string;
  visits: number;
}

/**
 * Rename a guest identity, or merge it into an existing one.
 *
 * This lives on the GUEST, not on a game's slot, and that is the whole point:
 * `GuestVisit.slotPlayerId` points at a GuestN pool Player, and those get
 * deleted — as of 2026-08-17 both existing visits reference slot players that no
 * longer exist, so their chips cannot render in-game and the names were
 * unreachable for editing. The Guest identity survives all of that.
 *
 * `normalizedName` is unique because a split identity is a silently wrong dues
 * count. So a rename that collides is not an error to swallow — it is a merge
 * the caller has to opt into, and merging moves DUES as well as visits, since
 * dues follow the guest.
 */
export async function renameGuest(
  guestId: string,
  rawName: string,
  opts: { merge?: boolean } = {},
): Promise<{ id: string; name: string; merged: boolean } | RenameConflict> {
  const name = rawName.trim();
  if (!name) throw new Error('empty_name');
  const normalizedName = normalizeGuestName(name);

  const target = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!target) throw new Error('not_found');

  const clash = await prisma.guest.findUnique({ where: { normalizedName } });

  // Same person, different capitalisation or spacing — a plain relabel.
  if (!clash || clash.id === guestId) {
    const updated = await prisma.guest.update({
      where: { id: guestId },
      data: { name, normalizedName },
    });
    return { id: updated.id, name: updated.name, merged: false };
  }

  if (!opts.merge) {
    const visits = await prisma.guestVisit.count({ where: { guestId: clash.id } });
    return { conflict: true, guestId: clash.id, name: clash.name, visits };
  }

  // Merge: everything pointing at the renamed guest moves onto the existing one,
  // then the now-empty identity goes. One transaction — a half-merge would leave
  // the dues split across two rows, which is the exact failure this prevents.
  await prisma.$transaction(async tx => {
    await tx.guestVisit.updateMany({ where: { guestId }, data: { guestId: clash.id } });
    await tx.duesPayment.updateMany({ where: { guestId }, data: { guestId: clash.id } });
    await tx.guest.delete({ where: { id: guestId } });
    await tx.guest.update({ where: { id: clash.id }, data: { name } });
  });

  return { id: clash.id, name, merged: true };
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

// A guest's first two games each dues year are free — the trial that lets them
// see whether they like the group. Everything after is charged per game. The
// allowance RESETS each dues year, so a guest who comes twice a year is never
// billed.
export const FREE_TRIAL_VISITS = 2;

// The dues year IS the calendar year (owner, 2026-08-08). Collection for the
// year ahead opens in October and is allowed to run through December, but that
// is a payment window, not the boundary: a game in Oct 2026 belongs to dues
// year 2026, which was paid for back in late 2025.
export const DUES_COLLECTION_OPENS_MONTH = 10; // October, 1-indexed
export const DUES_COLLECTION_CLOSES_MONTH = 12; // December, soft deadline

export const duesYearOf = (date: Date): number => date.getFullYear();

export interface GuestLedgerRow {
  guestId: string | null; // null = the aggregate row for unnamed guests
  name: string;
  visits: number;
  // Games chargeable at the per-game rate: visits beyond the free trial,
  // summed across dues years because the allowance resets annually. Null on
  // the unnamed aggregate, where the count spans unknown people and deducting
  // one trial from the pile would be meaningless.
  billableVisits: number | null;
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

    const isUnnamed = key === '__unnamed__';

    // The trial resets annually, so the allowance is deducted once per dues
    // year rather than once ever. Someone who turns up twice every year is
    // never billable; deducting a single lifetime trial would have billed them
    // for every year but their first.
    const visitsByDuesYear = new Map<number, number>();
    for (const gameId of entry.gameIds) {
      const date = gameDates.get(gameId);
      if (!date) continue;
      const year = duesYearOf(date);
      visitsByDuesYear.set(year, (visitsByDuesYear.get(year) ?? 0) + 1);
    }
    let billableVisits = 0;
    for (const count of visitsByDuesYear.values()) {
      billableVisits += Math.max(0, count - FREE_TRIAL_VISITS);
    }

    rows.push({
      guestId: isUnnamed ? null : key,
      name: entry.name,
      visits: entry.gameIds.size,
      billableVisits: isUnnamed ? null : billableVisits,
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
