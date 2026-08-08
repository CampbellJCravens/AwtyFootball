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
