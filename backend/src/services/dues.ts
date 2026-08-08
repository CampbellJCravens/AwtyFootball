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

export type DuesStatus = 'exempt' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface DuesPaymentDto {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  note: string | null;
}

export interface DuesMemberRow {
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

export interface DuesYearReport {
  duesYear: number;
  targetAmount: string;
  memberAmount: string;
  guestGameRate: string;
  openedAt: string | null;
  members: DuesMemberRow[];
  guests: DuesGuestRow[];
  totals: {
    billed: number;
    exempt: number;
    paidInFull: number;
    partPaid: number;
    unpaid: number;
    amountBilled: string;
    amountCollected: string;
    amountOutstanding: string; // sum of positive balances only
    amountOverpaid: string;
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

export const classify = (owed: Prisma.Decimal, paid: Prisma.Decimal): DuesStatus => {
  if (owed.isZero()) return 'exempt';
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
      playerId: entry.playerId,
      name: player?.name ?? '(deleted player)',
      onRoster: player?.onRoster ?? false,
      isAlumni: player?.isAlumni ?? false,
      memberSince: player?.memberSince ?? null,
      amountOwed: money(owed),
      amountPaid: money(paid),
      balance: money(owed.minus(paid)),
      status: classify(owed, paid),
      exemption: entry.exemption,
      note: entry.note,
      joinedAt: entry.joinedAt?.toISOString() ?? null,
      payments: paymentsByPlayer.get(entry.playerId) ?? [],
    };
  });

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
  let exempt = 0, paidInFull = 0, partPaid = 0, unpaid = 0;

  for (const m of members) {
    amountBilled = amountBilled.plus(m.amountOwed);
    amountCollected = amountCollected.plus(m.amountPaid);
    const balance = D(m.balance);
    if (balance.isPositive()) amountOutstanding = amountOutstanding.plus(balance);
    else amountOverpaid = amountOverpaid.plus(balance.abs());
    if (m.status === 'exempt') exempt++;
    else if (m.status === 'paid' || m.status === 'overpaid') paidInFull++;
    else if (m.status === 'partial') partPaid++;
    else unpaid++;
  }

  return {
    duesYear,
    targetAmount: money(D(config.targetAmount)),
    memberAmount: money(memberAmount),
    guestGameRate: money(rate),
    openedAt: config.openedAt?.toISOString() ?? null,
    members,
    guests,
    totals: {
      billed: members.length - exempt,
      exempt,
      paidInFull,
      partPaid,
      unpaid,
      amountBilled: money(amountBilled),
      amountCollected: money(amountCollected),
      amountOutstanding: money(amountOutstanding),
      amountOverpaid: money(amountOverpaid),
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

  const created = await prisma.duesRosterEntry.createMany({
    data: billable.map(p => ({
      duesYear,
      playerId: p.id,
      amountOwed: p.isAlumni ? new Prisma.Decimal(0) : config.memberAmount,
      exemption: p.isAlumni ? 'alumni' : null,
    })),
    skipDuplicates: true,
  });

  if (!config.openedAt) {
    await prisma.duesYearConfig.update({ where: { duesYear }, data: { openedAt: new Date() } });
  }

  return { added: created.count, alreadyPresent: already.size };
};

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
