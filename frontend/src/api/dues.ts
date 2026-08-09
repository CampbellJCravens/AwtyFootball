const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Money crosses the wire as fixed-2 strings, not numbers: the backend keeps it
// in Decimal so installments always reconcile, and parsing to float here would
// throw that away at the last step.

export type DuesStatus = 'exempt' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

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
    amountOutstanding: string;
    amountOverpaid: string;
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
  data: { amountOwed?: string; exemption?: string | null; note?: string | null }
) => req<unknown>(`/dues/entry/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) });

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
