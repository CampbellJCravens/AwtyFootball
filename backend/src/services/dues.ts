import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { duesYearOf, computeGuestLedger } from './guests';

// Club dues. The dues year IS the calendar year; October-December is a
// collection window for the year ahead, not the boundary (a payment recorded in
// Nov 2026 is a 2027 payment, a game played in Nov 2026 is a 2026 game).
//
// Money is Decimal end to end and is never rounded before a subtraction: three
// float installments summed against a float total is exactly where a cent goes
// missing, and the person mid-installment is the one most likely to check.
// Amounts leave this module as fixed-2 strings for the same reason.

export const PAYMENT_METHODS = ['venmo', 'cash', 'paypal', 'zelle', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Joining with this much of the season left or less makes the amount the
// owner's discretion rather than the full rate.
export const PRORATA_MONTHS_REMAINING = 3;

export type DuesStatus = 'left' | 'exempt' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface DuesPaymentDto {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  note: string | null;
}

export interface DuesMemberRow {
  entryId: string;
  playerId: string;
  name: string;
  onRoster: boolean;
  isAlumni: boolean;
  memberSince: number | null;
  amountOwed: string;
  amountPaid: string;
  balance: string; // negative = overpaid; deliberately not clamped to zero
  status: DuesStatus;
  exemption: string | null;
  note: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  payments: DuesPaymentDto[];
}

export interface DuesGuestRow {
  guestId: string;
  name: string;
  visits: number;
  billableVisits: number;
  amountOwed: string;
  amountPaid: string;
  balance: string;
  status: DuesStatus;
  shouldConvert: boolean; // balance has passed what membership costs
}

/**
 * A payment recorded against a player who has no roster entry for that year.
 * Before this existed such a payment was invisible: the report built its rows
 * from DuesRosterEntry alone, so the money vanished from the page AND from the
 * collected total. That bites live years too — record a payment for someone you
 * have not added to the roster and it silently disappears — and it is why the
 * imported 2016-2025 history showed nothing at all.
 *
 * Deliberately NOT folded into `members`: those rows carry a real `entryId`
 * that the UI uses for edits, and a synthetic one would produce broken actions.
 * Nothing is owed here, so these never touch billed, outstanding or overpaid —
 * only `amountCollected`, which is the whole point.
 */
export interface UnrosteredPaymentRow {
  playerId: string;
  name: string;
  amountPaid: string;
  payments: DuesPaymentDto[];
}

export interface DuesYearReport {
  duesYear: number;
  targetAmount: string;
  memberAmount: string;
  guestGameRate: string;
  openedAt: string | null;
  members: DuesMemberRow[];
  /** Money received from people with no roster entry for this year. */
  unrostered: UnrosteredPaymentRow[];
  guests: DuesGuestRow[];
  totals: {
    billed: number;
    exempt: number;
    left: number;
    paidInFull: number;
    partPaid: number;
    unpaid: number;
    amountBilled: string;
    amountCollected: string;
    amountOutstanding: string; // sum of positive balances only
    amountOverpaid: string;
    /** Included in amountCollected; excluded from every owed-side figure. */
    amountUnrostered: string;
  };
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const money = (v: Prisma.Decimal) => v.toFixed(2);

export class DuesYearNotConfiguredError extends Error {
  constructor(public readonly duesYear: number) {
    // A missing config row must never read as "everyone owes nothing" — that
    // would show a fully-settled page on a year nobody has opened yet.
    super(`Dues year ${duesYear} has no configuration; open the year before recording payments.`);
    this.name = 'DuesYearNotConfiguredError';
  }
}

// Leaving is a lifecycle state and outranks everything: a leaver is settled by
// definition (amountOwed was set to amountPaid), so they must not be sorted in
// with alumni, and must never appear on the chase list.
//
// Zero owed only means "exempt" when nothing was paid. A payment against a
// zero-owed row used to fall into `exempt` and render as "Not billed" with no
// balance, while still counting toward amountCollected — money recorded, row
// denying it, progress bar disagreeing. That is live today for an alumnus who
// chips in voluntarily, so the fall-through matters beyond the Left work.
export const classify = (
  owed: Prisma.Decimal,
  paid: Prisma.Decimal,
  leftAt?: Date | null
): DuesStatus => {
  if (leftAt) return 'left';
  if (owed.isZero()) return paid.isZero() ? 'exempt' : 'overpaid';
  if (paid.isZero()) return 'unpaid';
  if (paid.lessThan(owed)) return 'partial';
  if (paid.greaterThan(owed)) return 'overpaid';
  return 'paid';
};

// Months left in the dues year at a given date, used to decide whether a
// mid-year joiner is full price or the owner's call.
export const monthsRemainingInDuesYear = (date: Date): number =>
  12 - (date.getMonth() + 1) + 1;

export const isProrataWindow = (date: Date): boolean =>
  monthsRemainingInDuesYear(date) <= PRORATA_MONTHS_REMAINING;

export const getDuesYearConfig = async (duesYear: number) => {
  const config = await prisma.duesYearConfig.findUnique({ where: { duesYear } });
  if (!config) throw new DuesYearNotConfiguredError(duesYear);
  return config;
};

export const computeDuesYearReport = async (duesYear: number): Promise<DuesYearReport> => {
  const config = await getDuesYearConfig(duesYear);

  const [entries, payments, players] = await Promise.all([
    prisma.duesRosterEntry.findMany({ where: { duesYear } }),
    prisma.duesPayment.findMany({ where: { duesYear }, orderBy: { paidAt: 'asc' } }),
    prisma.player.findMany(),
  ]);

  const playerMap = new Map(players.map(p => [p.id, p]));

  const paidByPlayer = new Map<string, Prisma.Decimal>();
  const paymentsByPlayer = new Map<string, DuesPaymentDto[]>();
  const paidByGuest = new Map<string, Prisma.Decimal>();

  for (const p of payments) {
    const dto: DuesPaymentDto = {
      id: p.id,
      amount: money(D(p.amount)),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      note: p.note,
    };
    if (p.playerId) {
      paidByPlayer.set(p.playerId, (paidByPlayer.get(p.playerId) ?? ZERO).plus(p.amount));
      const list = paymentsByPlayer.get(p.playerId) ?? [];
      list.push(dto);
      paymentsByPlayer.set(p.playerId, list);
    } else if (p.guestId) {
      paidByGuest.set(p.guestId, (paidByGuest.get(p.guestId) ?? ZERO).plus(p.amount));
    }
  }

  const members: DuesMemberRow[] = entries.map(entry => {
    const player = playerMap.get(entry.playerId);
    const owed = D(entry.amountOwed);
    const paid = paidByPlayer.get(entry.playerId) ?? ZERO;
    return {
      entryId: entry.id,
      playerId: entry.playerId,
      name: player?.name ?? '(deleted player)',
      onRoster: player?.onRoster ?? false,
      isAlumni: player?.isAlumni ?? false,
      memberSince: player?.memberSince ?? null,
      amountOwed: money(owed),
      amountPaid: money(paid),
      balance: money(owed.minus(paid)),
      status: classify(owed, paid, entry.leftAt),
      exemption: entry.exemption,
      note: entry.note,
      joinedAt: entry.joinedAt?.toISOString() ?? null,
      leftAt: entry.leftAt?.toISOString() ?? null,
      payments: paymentsByPlayer.get(entry.playerId) ?? [],
    };
  });

  const rosteredIds = new Set(entries.map(e => e.playerId));
  const unrostered: UnrosteredPaymentRow[] = [...paidByPlayer.entries()]
    .filter(([playerId]) => !rosteredIds.has(playerId))
    .map(([playerId, paid]) => ({
      playerId,
      name: playerMap.get(playerId)?.name ?? '(deleted player)',
      amountPaid: money(paid),
      payments: paymentsByPlayer.get(playerId) ?? [],
    }))
    .sort((a, b) => D(b.amountPaid).minus(D(a.amountPaid)).toNumber() || a.name.localeCompare(b.name));

  members.sort((a, b) => {
    const diff = D(b.balance).minus(D(a.balance));
    if (!diff.isZero()) return diff.isPositive() ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // Guests bill per game beyond the annual free trial, uncapped: the balance is
  // deliberately never limited to what membership costs, because an accruing
  // balance is what makes going yearly the obviously cheaper choice.
  const ledger = await computeGuestLedger();
  const rate = D(config.guestGameRate);
  const memberAmount = D(config.memberAmount);

  const guests: DuesGuestRow[] = ledger
    .filter(row => row.guestId !== null && row.billableVisits !== null)
    .map(row => {
      const owed = rate.times(row.billableVisits!);
      const paid = paidByGuest.get(row.guestId!) ?? ZERO;
      const balance = owed.minus(paid);
      return {
        guestId: row.guestId!,
        name: row.name,
        visits: row.visits,
        billableVisits: row.billableVisits!,
        amountOwed: money(owed),
        amountPaid: money(paid),
        balance: money(balance),
        status: classify(owed, paid),
        shouldConvert: !memberAmount.isZero() && balance.greaterThanOrEqualTo(memberAmount),
      };
    })
    .sort((a, b) => {
      const diff = D(b.balance).minus(D(a.balance));
      return diff.isZero() ? a.name.localeCompare(b.name) : diff.isPositive() ? 1 : -1;
    });

  let amountBilled = ZERO;
  let amountCollected = ZERO;
  // Outstanding is the sum of POSITIVE balances, not billed minus collected.
  // One person overpaying does not settle another person's bill, and reporting
  // it as if it did would understate the chase list.
  let amountOutstanding = ZERO;
  let amountOverpaid = ZERO;
  let exempt = 0, left = 0, paidInFull = 0, partPaid = 0, unpaid = 0;

  for (const m of members) {
    amountBilled = amountBilled.plus(m.amountOwed);
    amountCollected = amountCollected.plus(m.amountPaid);
    const balance = D(m.balance);
    if (balance.isPositive()) amountOutstanding = amountOutstanding.plus(balance);
    else amountOverpaid = amountOverpaid.plus(balance.abs());
    if (m.status === 'left') left++;
    else if (m.status === 'exempt') exempt++;
    else if (m.status === 'paid' || m.status === 'overpaid') paidInFull++;
    else if (m.status === 'partial') partPaid++;
    else unpaid++;
  }

  const amountUnrostered = unrostered.reduce((sum, r) => sum.plus(D(r.amountPaid)), ZERO);
  amountCollected = amountCollected.plus(amountUnrostered);

  return {
    duesYear,
    targetAmount: money(D(config.targetAmount)),
    memberAmount: money(memberAmount),
    guestGameRate: money(rate),
    openedAt: config.openedAt?.toISOString() ?? null,
    members,
    unrostered,
    guests,
    totals: {
      // Leavers are settled and gone; counting them as billed would keep an
      // October number climbing with people who are no longer in the city.
      billed: members.length - exempt - left,
      exempt,
      left,
      paidInFull,
      partPaid,
      unpaid,
      amountBilled: money(amountBilled),
      amountCollected: money(amountCollected),
      amountOutstanding: money(amountOutstanding),
      amountOverpaid: money(amountOverpaid),
      amountUnrostered: money(amountUnrostered),
    },
  };
};

// Snapshot the roster into a dues year. Fixes who was on the hook so the page
// still reads correctly years later, after people have been marked Former.
// Idempotent: re-running adds anyone new without touching existing rows, so an
// amount the owner has already adjusted by hand is never overwritten.
export const openDuesYear = async (duesYear: number) => {
  const config = await getDuesYearConfig(duesYear);
  const [players, existing] = await Promise.all([
    prisma.player.findMany({ where: { onRoster: true } }),
    prisma.duesRosterEntry.findMany({ where: { duesYear }, select: { playerId: true } }),
  ]);

  const already = new Set(existing.map(e => e.playerId));
  // GuestN pool players are per-game slots, not people, and must never be
  // billed. Same string match the rest of the app uses to exclude them.
  const billable = players.filter(p => !already.has(p.id) && !/^Guest\d+$/.test(p.name));

  // Sync roster is the button that actually gets pressed when someone new turns
  // up, so anyone it sweeps in after the year is already open is a mid-year
  // joiner and must be dated as one — otherwise they are indistinguishable from
  // the founding cohort and silently skip the pro-rata question. The first sync
  // of a year runs while openedAt is still null, which is exactly the cohort
  // that should stay null.
  const joinedAt = config.openedAt ? new Date() : null;

  const created = await prisma.duesRosterEntry.createMany({
    data: billable.map(p => ({
      duesYear,
      playerId: p.id,
      amountOwed: p.isAlumni ? new Prisma.Decimal(0) : config.memberAmount,
      exemption: p.isAlumni ? 'alumni' : null,
      joinedAt,
    })),
    skipDuplicates: true,
  });

  if (!config.openedAt) {
    await prisma.duesYearConfig.update({ where: { duesYear }, data: { openedAt: new Date() } });
  }

  return { added: created.count, alreadyPresent: already.size };
};

// What the amount field pre-fills with for a mid-year joiner. Full price until
// the season is nearly over, then a share of the year — offered as an editable
// default, never as a rule: the last three months are explicitly the owner's
// discretion, and whatever gets saved is what is stored.
export const prorataSuggestion = (memberAmount: Prisma.Decimal, joinedAt: Date): Prisma.Decimal => {
  if (!isProrataWindow(joinedAt)) return memberAmount;
  return memberAmount.times(monthsRemainingInDuesYear(joinedAt)).dividedBy(12).toDecimalPlaces(2);
};

// Add one person to a dues year, or bring back someone who left. Until this
// existed the only way onto the bill was Players tab → set Current → Sync
// roster, which billed everyone at full price and never wrote joinedAt.
export const addDuesEntry = async (input: {
  duesYear: number;
  playerId: string;
  amountOwed?: Prisma.Decimal.Value | null;
  joinedAt?: Date | null;
  note?: string | null;
}) => {
  const config = await getDuesYearConfig(input.duesYear);
  const player = await prisma.player.findUnique({ where: { id: input.playerId } });
  if (!player) throw new Error('No such player.');
  if (/^Guest\d+$/.test(player.name)) {
    throw new Error('Guest pool slots are per-game placeholders, not people, and are never billed.');
  }

  const joinedAt = input.joinedAt ?? new Date();
  const owed =
    input.amountOwed !== undefined && input.amountOwed !== null
      ? new Prisma.Decimal(input.amountOwed)
      : player.isAlumni
        ? ZERO
        : prorataSuggestion(D(config.memberAmount), joinedAt);
  if (!owed.isFinite() || owed.isNegative()) {
    throw new Error('amountOwed must be a non-negative number.');
  }

  const existing = await prisma.duesRosterEntry.findUnique({
    where: { duesYear_playerId: { duesYear: input.duesYear, playerId: input.playerId } },
  });

  return prisma.$transaction(async tx => {
    // Reinstating has to restore what they owe, not just accept their money:
    // the Left flip pulled amountOwed down to amountPaid, so a bare payment
    // against that figure would read as settled or overpaid.
    const entry = existing
      ? await tx.duesRosterEntry.update({
          where: { id: existing.id },
          data: {
            amountOwed: owed,
            leftAt: null,
            joinedAt,
            ...(input.note !== undefined && { note: input.note }),
          },
        })
      : await tx.duesRosterEntry.create({
          data: {
            duesYear: input.duesYear,
            playerId: input.playerId,
            amountOwed: owed,
            exemption: player.isAlumni ? 'alumni' : null,
            joinedAt,
            note: input.note ?? null,
          },
        });

    // Being billed for a year and being on the roster are the same statement,
    // so adding someone puts them back on it and next year's sync finds them.
    if (!player.onRoster) {
      await tx.player.update({ where: { id: player.id }, data: { onRoster: true } });
    }
    return entry;
  });
};

// Someone left — in practice, left the city. Dues are kept, not refunded, so
// whatever they paid becomes what they owed: the balance goes to zero, they
// drop off the chase list, and a part-payer does not read as having overpaid
// what was kept. The original bill survives in the note, because the flip
// otherwise destroys the only record of what they were asked for.
// Returns null when there is nothing to do — already left, or not in the year
// the caller meant. The sweep skips those rather than aborting a whole batch
// because one row was already handled.
const applyLeft = async (
  tx: Prisma.TransactionClient,
  entryId: string,
  expectedYear?: number
) => {
  const entry = await tx.duesRosterEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error('No such dues entry.');
  if (entry.leftAt) return null;
  if (expectedYear !== undefined && entry.duesYear !== expectedYear) return null;

  const payments = await tx.duesPayment.findMany({
    where: { duesYear: entry.duesYear, playerId: entry.playerId },
  });
  const paid = payments.reduce((sum, p) => sum.plus(p.amount), ZERO);
  const billed = D(entry.amountOwed);
  const note = [entry.note, `Left — billed $${money(billed)}, kept $${money(paid)}.`]
    .filter(Boolean)
    .join(' · ');

  const updated = await tx.duesRosterEntry.update({
    where: { id: entryId },
    data: { amountOwed: paid, leftAt: new Date(), note },
  });
  await tx.player.update({ where: { id: entry.playerId }, data: { onRoster: false } });
  return updated;
};

export const markPlayerLeft = async (entryId: string) => {
  const row = await prisma.$transaction(tx => applyLeft(tx, entryId));
  if (!row) throw new Error('Already marked as having left.');
  return row;
};

// Closing out a collection: the people who never paid and never said they were
// going are the ones who would otherwise roll silently into next year's bill,
// because staying on the roster is the default and only leaving is an action.
// One transaction, so a failure halfway does not leave the roster half-swept.
export const markManyLeft = async (duesYear: number, entryIds: string[]) =>
  prisma.$transaction(async tx => {
    let left = 0;
    for (const id of entryIds) {
      if (await applyLeft(tx, id, duesYear)) left++;
    }
    return { left, skipped: entryIds.length - left };
  });

export const recordPayment = async (input: {
  duesYear: number;
  playerId?: string | null;
  guestId?: string | null;
  amount: Prisma.Decimal.Value;
  method: string;
  paidAt: Date;
  note?: string | null;
  recordedBy?: string | null;
}) => {
  // playerId xor guestId, enforced here rather than as a DB constraint, matching
  // how this codebase already handles its invariants.
  const hasPlayer = !!input.playerId;
  const hasGuest = !!input.guestId;
  if (hasPlayer === hasGuest) {
    throw new Error('A payment must name exactly one of playerId or guestId.');
  }
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
    throw new Error(`Unknown payment method "${input.method}".`);
  }
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new Error('Payment amount must be greater than zero.');
  }
  // Fails loudly if the year was never opened, rather than filing the payment
  // against a year that does not exist.
  await getDuesYearConfig(input.duesYear);

  return prisma.duesPayment.create({
    data: {
      duesYear: input.duesYear,
      playerId: input.playerId ?? null,
      guestId: input.guestId ?? null,
      amount,
      method: input.method,
      paidAt: input.paidAt,
      note: input.note ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  });
};

export const currentDuesYear = () => duesYearOf(new Date());
