const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Money crosses the wire as fixed-2 strings, not numbers: the backend keeps it
// in Decimal so installments always reconcile, and parsing to float here would
// throw that away at the last step.

// 'left' outranks the rest: a leaver is settled by definition, so they are
// never on the chase list and never counted with alumni.
export type DuesStatus = 'left' | 'exempt' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

export const PAYMENT_METHODS = ['venmo', 'cash', 'paypal', 'zelle', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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
  balance: string; // negative = overpaid
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
  shouldConvert: boolean;
}

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
  /** Payments from people with no roster entry for the year — historical
   *  imports, and anyone paid for before being added to the roster. */
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
    amountOutstanding: string;
    amountOverpaid: string;
    amountUnrostered: string;
  };
}

export interface DuesYearSummary {
  duesYear: number;
  memberAmount: string;
  targetAmount: string;
  guestGameRate: string;
  openedAt: string | null;
}

// A year that was never opened returns 409, which is a real answer ("set it up
// first"), not a failure — the caller distinguishes it from a broken request.
export class DuesYearNotConfigured extends Error {
  constructor(public readonly duesYear: number) {
    super(`Dues year ${duesYear} has not been set up yet.`);
    this.name = 'DuesYearNotConfigured';
  }
}

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    throw new DuesYearNotConfigured(body.duesYear);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

export const fetchDuesReport = (year: number) => req<DuesYearReport>(`/dues?year=${year}`);

export const fetchDuesYears = () => req<DuesYearSummary[]>('/dues/years');

export const saveDuesConfig = (
  year: number,
  config: { targetAmount: string; memberAmount: string; guestGameRate: string }
) => req<DuesYearSummary>(`/dues/${year}/config`, { method: 'PUT', body: JSON.stringify(config) });

export const openDuesYear = (year: number) =>
  req<{ added: number; alreadyPresent: number }>(`/dues/${year}/open`, { method: 'POST' });

export const updateDuesEntry = (
  entryId: string,
  data: {
    amountOwed?: string;
    exemption?: string | null;
    note?: string | null;
    joinedAt?: string | null;
  }
) => req<unknown>(`/dues/entry/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) });

// Put one person on the bill, or bring back someone who left. Omitting
// amountOwed lets the server pick the default, which is the pro-rata suggestion
// inside the last three months of the year and the full rate before that.
export const addDuesEntry = (
  year: number,
  data: { playerId: string; amountOwed?: string; joinedAt?: string; note?: string | null }
) => req<unknown>(`/dues/${year}/entry`, { method: 'POST', body: JSON.stringify(data) });

// They left and the dues are kept: what they owed becomes what they paid.
export const markDuesEntryLeft = (entryId: string) =>
  req<unknown>(`/dues/entry/${entryId}/left`, { method: 'POST' });

// Closing out a collection in one pass. Rows already marked are skipped, not
// counted, so re-running is safe.
export const markDuesEntriesLeft = (year: number, entryIds: string[]) =>
  req<{ left: number; skipped: number }>(`/dues/${year}/sweep`, {
    method: 'POST',
    body: JSON.stringify({ entryIds }),
  });

// October through December, matching DUES_COLLECTION_OPENS/CLOSES_MONTH on the
// server. Used only to decide whether to nudge about the year ahead — no money
// depends on it, so a copy here is cheaper than a round trip.
export const COLLECTION_OPENS_MONTH = 10;
export const COLLECTION_CLOSES_MONTH = 12;

export const isCollectionWindow = (date = new Date()) => {
  const month = date.getMonth() + 1;
  return month >= COLLECTION_OPENS_MONTH && month <= COLLECTION_CLOSES_MONTH;
};

export const recordDuesPayment = (data: {
  duesYear: number;
  playerId?: string;
  guestId?: string;
  amount: string;
  method: string;
  paidAt: string;
  note?: string | null;
}) => req<unknown>('/dues/payments', { method: 'POST', body: JSON.stringify(data) });

export const deleteDuesPayment = (paymentId: string) =>
  req<void>(`/dues/payments/${paymentId}`, { method: 'DELETE' });
