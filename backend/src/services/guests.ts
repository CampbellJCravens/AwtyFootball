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
  // Set once she has joined: the Player she became and the dues year the
  // per-game meter stopped in. Null for a guest who is still a guest.
  promotedPlayerId: string | null;
  promotedYear: number | null;
}

// Dues ledger. The GUEST is the unit of collection (owner decision 2026-08-07):
// one row per guest, sorted by appearances. The usual host rides along as
// context for who to nudge — it is not a second thing to total up.
//
// A guest occupying two slots in one game (left and came back) counts once:
// dues follow appearances, not slots.
export async function computeGuestLedger(): Promise<GuestLedgerRow[]> {
  const [visits, games, promotions] = await Promise.all([
    prisma.guestVisit.findMany({ include: { guest: { select: { name: true } } } }),
    prisma.game.findMany({ select: { id: true, createdAt: true } }),
    prisma.guest.findMany({
      where: { promotedPlayerId: { not: null } },
      select: { id: true, promotedPlayerId: true, promotedYear: true },
    }),
  ]);

  const promotionByGuestId = new Map(promotions.map(p => [p.id, p]));

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
    // Joining stops the per-game meter for the dues year she joined in and
    // every year after — membership replaces it. Years BEFORE that still bill:
    // a debt from last year is not forgiven by joining this year.
    const promoted = isUnnamed ? null : promotionByGuestId.get(key) ?? null;
    let billableVisits = 0;
    for (const [year, count] of visitsByDuesYear) {
      if (promoted?.promotedYear != null && year >= promoted.promotedYear) continue;
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
      promotedPlayerId: promoted?.promotedPlayerId ?? null,
      promotedYear: promoted?.promotedYear ?? null,
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

/** A GuestN pool slot, e.g. "Guest3". Matched on name because that is what the
 * rest of the app keys guests off; nothing here writes Player.name. */
const isGuestSlotName = (name: string) => /^Guest\s*\d+$/i.test(name.trim());

/**
 * The slot a guest occupies in a game, claiming the next free one if she has
 * none yet.
 *
 * Auto-assigning is the owner's call (2026-09-17): a named guest who voted is
 * coming, and making an admin place her by hand every week is the friction this
 * was meant to remove. It returns null when every slot is taken, which is a real
 * state, not an error — the caller leaves the vote unattributed rather than
 * evicting somebody.
 */
export async function ensureGuestSlot(gameId: string, guestId: string): Promise<string | null> {
  const existing = await prisma.guestVisit.findFirst({ where: { gameId, guestId } });
  if (existing) return existing.slotPlayerId;

  const pool = (await prisma.player.findMany({ select: { id: true, name: true } }))
    .filter(p => isGuestSlotName(p.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (pool.length === 0) return null;

  const taken = new Set(
    (await prisma.guestVisit.findMany({ where: { gameId }, select: { slotPlayerId: true } }))
      .map(v => v.slotPlayerId),
  );
  const free = pool.find(p => !taken.has(p.id));
  if (!free) return null;

  // @@unique([gameId, slotPlayerId]) makes the race harmless: if another request
  // claimed the slot first, take whatever it left her.
  try {
    await prisma.guestVisit.create({ data: { gameId, slotPlayerId: free.id, guestId } });
    return free.id;
  } catch {
    const retry = await prisma.guestVisit.findFirst({ where: { gameId, guestId } });
    return retry?.slotPlayerId ?? null;
  }
}

/** Slot player id for each guest phone that voted, claiming slots as needed. */
export async function slotsForGuestPhones(gameId: string, phones: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (phones.length === 0) return out;
  const guests = await prisma.guest.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  });
  for (const g of guests) {
    const slot = await ensureGuestSlot(gameId, g.id);
    if (slot) out.set(g.phone!, slot);
  }
  return out;
}

// ── Guest becomes a member ────────────────────────────────────────────────────
//
// Guests are a trial funnel — two free games a year, then an uncapped per-game
// rate whose whole purpose is to make joining the cheaper choice. The dues
// report already flags `shouldConvert`; this is the action behind that flag.
//
// Owner decisions (2026-09-17):
//  · membership REPLACES the guest balance for the year she joins (and after);
//    earlier dues years still bill, because joining now does not forgive a debt
//    from last year.
//  · money already paid as a guest CREDITS against her member dues.
//  · `Player.memberSince` is her FIRST APPEARANCE, not the year she joined —
//    she has been turning up, and that is what tenure means here. The year she
//    joined is kept separately as `Guest.promotedYear`; both facts are wanted.
//  · history attribution is NOT rewritten. Past games already display her name
//    (`displayName` resolves it per game from GuestVisit), so nothing needs to
//    change for them to read correctly, and rewriting teamAssignments/goals
//    inside stored per-game JSON is how orphaned player ids happened before.
//  · a game in progress is left as played; membership starts from the next one.

export interface PromotionPlan {
  guestId: string;
  guestName: string;
  duesYear: number;
  /** Existing player to attach to, or null when a new one is created. */
  attachPlayerId: string | null;
  playerName: string;
  memberSince: number | null;
  phone: string | null;
  visitsRetiredFromBilling: number;
  billableVisitsRemaining: number; // earlier dues years, still owed
  paymentsCredited: { count: number; total: string };
  memberAmount: string;
  /** Same name as an existing player — the caller has to choose. */
  nameClashPlayerIds: string[];
  blocked: string | null;
}

export class PromotionBlocked extends Error {}

/**
 * What promoting this guest would do. The write below runs off this same plan,
 * so the confirm screen and the transaction cannot disagree.
 */
export async function planPromotion(
  guestId: string,
  duesYear: number,
  opts: { attachPlayerId?: string | null } = {},
): Promise<PromotionPlan> {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw new PromotionBlocked('no_such_guest');
  if (guest.promotedPlayerId) throw new PromotionBlocked('already_a_member');

  const config = await prisma.duesYearConfig.findUnique({ where: { duesYear } });
  if (!config) throw new PromotionBlocked('dues_year_not_open');

  const ledger = (await computeGuestLedger()).find(r => r.guestId === guestId);
  const visitsByYear = await visitYearsForGuest(guestId);
  const retired = [...visitsByYear.entries()]
    .filter(([year]) => year >= duesYear)
    .reduce((n, [, count]) => n + count, 0);

  const payments = await prisma.duesPayment.findMany({ where: { guestId, duesYear, playerId: null } });
  const total = payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));

  const attach = opts.attachPlayerId ?? null;
  if (attach) {
    const target = await prisma.player.findUnique({ where: { id: attach } });
    if (!target) throw new PromotionBlocked('no_such_player');
  }

  // A number is one person. Refuse rather than move it off somebody else.
  if (guest.phone) {
    const holder = await prisma.player.findFirst({ where: { phone: guest.phone } });
    if (holder && holder.id !== attach) throw new PromotionBlocked(`phone_held_by:${holder.name}`);
  }

  const clashes = attach
    ? []
    : (await prisma.player.findMany({ where: { name: guest.name }, select: { id: true } })).map(p => p.id);

  const firstSeen = ledger?.firstSeen ? new Date(ledger.firstSeen) : null;

  return {
    guestId,
    guestName: guest.name,
    duesYear,
    attachPlayerId: attach,
    playerName: guest.name,
    memberSince: firstSeen ? duesYearOf(firstSeen) : duesYear,
    phone: guest.phone,
    visitsRetiredFromBilling: retired,
    billableVisitsRemaining: ledger?.billableVisits ?? 0,
    paymentsCredited: { count: payments.length, total: total.toFixed(2) },
    memberAmount: new Prisma.Decimal(config.memberAmount).toFixed(2),
    nameClashPlayerIds: clashes,
    blocked: null,
  };
}

export interface PromotionResult {
  playerId: string;
  created: boolean;
  rosterEntryId: string;
  creditedPaymentIds: string[];
}

/** Everything in one transaction: a half-promotion is a split identity. */
export async function promoteGuest(
  guestId: string,
  duesYear: number,
  opts: { attachPlayerId?: string | null; acknowledgeNameClash?: boolean } = {},
): Promise<PromotionResult> {
  const plan = await planPromotion(guestId, duesYear, opts);
  if (plan.nameClashPlayerIds.length && !opts.acknowledgeNameClash) {
    throw new PromotionBlocked(`name_taken:${plan.nameClashPlayerIds.join(',')}`);
  }

  return prisma.$transaction(async tx => {
    const player = plan.attachPlayerId
      ? await tx.player.update({
          where: { id: plan.attachPlayerId },
          data: {
            onRoster: true,
            memberSince: plan.memberSince,
            ...(plan.phone ? { phone: plan.phone } : {}),
          },
        })
      : await tx.player.create({
          data: {
            name: plan.playerName,
            onRoster: true,
            memberSince: plan.memberSince,
            ...(plan.phone ? { phone: plan.phone } : {}),
          },
        });

    // The number moves to the member path; leaving it on the guest would have
    // two rows claiming one human's votes.
    await tx.guest.update({
      where: { id: guestId },
      data: {
        phone: null,
        promotedPlayerId: player.id,
        promotedAt: new Date(),
        promotedYear: duesYear,
      },
    });

    // Credit what she paid as a guest. guestId is KEPT for provenance: the dues
    // report reads `if (playerId) … else if (guestId)`, so setting playerId
    // credits the member and stops crediting the guest, with no double count.
    const toCredit = await tx.duesPayment.findMany({
      where: { guestId, duesYear, playerId: null },
      select: { id: true },
    });
    if (toCredit.length) {
      await tx.duesPayment.updateMany({
        where: { id: { in: toCredit.map(p => p.id) } },
        data: { playerId: player.id },
      });
    }

    // Without a roster entry she lands in "unrostered payments" instead of the
    // member table. Full member amount (owner 2026-09-17); discounts stay a
    // human decision recorded in `note`.
    const entry = await tx.duesRosterEntry.upsert({
      where: { duesYear_playerId: { duesYear, playerId: player.id } },
      update: {},
      create: {
        duesYear,
        playerId: player.id,
        amountOwed: new Prisma.Decimal(plan.memberAmount),
        joinedAt: new Date(),
        note: `Converted from guest (${plan.guestName})`,
      },
    });

    return {
      playerId: player.id,
      created: !plan.attachPlayerId,
      rosterEntryId: entry.id,
      creditedPaymentIds: toCredit.map(p => p.id),
    };
  });
}

/** Appearances per dues year for one guest. */
async function visitYearsForGuest(guestId: string): Promise<Map<number, number>> {
  const visits = await prisma.guestVisit.findMany({ where: { guestId }, select: { gameId: true } });
  const games = await prisma.game.findMany({
    where: { id: { in: [...new Set(visits.map(v => v.gameId))] } },
    select: { id: true, createdAt: true },
  });
  const out = new Map<number, number>();
  for (const g of games) {
    const year = duesYearOf(g.createdAt);
    out.set(year, (out.get(year) ?? 0) + 1);
  }
  return out;
}
