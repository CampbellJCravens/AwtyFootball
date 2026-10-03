const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface Guest {
  id: string;
  name: string;
  lastSeen: string | null; // most recent game they appeared in; drives ordering
}

export interface GuestLedgerRow {
  guestId: string | null; // null = the aggregate row for unnamed guests
  name: string;
  visits: number;
  billableVisits: number | null; // visits beyond the free trial; null on the unnamed row
  firstSeen: string | null;
  lastSeen: string | null;
  usualHostId: string | null;
  usualHostVisits: number;
  promotedPlayerId: string | null; // set once they joined; the Player they became
  promotedYear: number | null;     // dues year the per-game meter stopped in
  formerPlayerId?: string | null;
}

export async function fetchGuests(): Promise<Guest[]> {
  const response = await fetch(`${API_BASE_URL}/guests`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch guests');
  return response.json();
}

export async function fetchGuestLedger(): Promise<GuestLedgerRow[]> {
  const response = await fetch(`${API_BASE_URL}/guests/ledger`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch guest ledger');
  return response.json();
}

export interface RenameConflict {
  conflict: true;
  guestId: string;
  name: string;
  visits: number;
}

export interface RenameResult {
  id: string;
  name: string;
  merged: boolean;
}

/**
 * Rename a guest identity. A name that already belongs to another guest comes
 * back as a conflict rather than merging silently — merging moves their visits
 * and their dues, so the caller confirms it by re-sending with merge: true.
 */
export async function renameGuest(
  guestId: string,
  name: string,
  merge = false,
): Promise<RenameResult | RenameConflict> {
  const response = await fetch(`${API_BASE_URL}/guests/${guestId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, merge }),
  });
  if (response.status === 409) return response.json();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to rename guest');
  }
  return response.json();
}

export interface PromotionPlan {
  guestId: string;
  guestName: string;
  duesYear: number;
  attachPlayerId: string | null;
  playerName: string;
  memberSince: number | null;
  phone: string | null;
  visitsRetiredFromBilling: number;
  billableVisitsRemaining: number;
  paymentsCredited: { count: number; total: string };
  memberAmount: string;
  nameClashPlayerIds: string[];
}

export interface PromotionRefused {
  error: string;
  playerIds?: string[];
}

/** What converting this guest would change — the confirm screen reads this. */
export async function fetchPromotionPlan(
  guestId: string,
  duesYear: number,
  attachPlayerId?: string | null
): Promise<PromotionPlan | PromotionRefused> {
  const q = new URLSearchParams({ duesYear: String(duesYear) });
  if (attachPlayerId) q.set('attachPlayerId', attachPlayerId);
  const res = await fetch(`${API_BASE_URL}/guests/${guestId}/promotion?${q}`, { credentials: 'include' });
  const body = await res.json();
  if (!res.ok) return body as PromotionRefused;
  return body as PromotionPlan;
}

export async function promoteGuest(
  guestId: string,
  duesYear: number,
  opts: { attachPlayerId?: string | null; acknowledgeNameClash?: boolean } = {}
): Promise<{ playerId: string; created: boolean } | PromotionRefused> {
  const res = await fetch(`${API_BASE_URL}/guests/${guestId}/promote`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duesYear, ...opts }),
  });
  const body = await res.json();
  if (!res.ok) return body as PromotionRefused;
  return body;
}
