const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export type RsvpStatus = 'yes' | 'maybe' | 'no';

export interface Rsvp {
  id: string;
  gameId: string;
  playerId: string;
  status: RsvpStatus;
  guestCount: number;
  setByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchRsvps(gameId: string): Promise<Rsvp[]> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch RSVPs');
  return res.json();
}

// Read-only poll view derived from WhatsApp votes (linked players + unlinked
// numbers). No phone numbers are returned.
export interface GamePollEntry {
  key: string;
  name: string;
  pictureUrl: string | null;
  guestCount: number;
  linked: boolean;
  playerId: string | null;
}

export interface GamePoll {
  in: GamePollEntry[];
  maybe: GamePollEntry[];
  out: GamePollEntry[];
  counts: { in: number; maybe: number; out: number };
  guestTotal: number;
}

export async function fetchGamePoll(gameId: string): Promise<GamePoll> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps/poll`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch poll');
  return res.json();
}

// Admin: post a standard-format poll to the WhatsApp group for this game.
export async function createGamePoll(gameId: string): Promise<{ pollMessageId: string; title: string }> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps/create-poll`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to create poll');
  }
  return res.json();
}

export async function submitRsvp(
  gameId: string,
  playerId: string,
  status: RsvpStatus,
  guestCount: number
): Promise<Rsvp> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, status, guestCount }),
  });
  if (!res.ok) throw new Error('Failed to save RSVP');
  return res.json();
}

// Admin: override another player's RSVP
export async function adminSetRsvp(
  gameId: string,
  playerId: string,
  status: RsvpStatus,
  guestCount: number
): Promise<Rsvp> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps/${playerId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, guestCount }),
  });
  if (!res.ok) throw new Error('Failed to override RSVP');
  return res.json();
}

// Clear an RSVP. Used both for self-clear (tap same option twice) and for
// admin clearing anyone via the row controls — the backend route is public.
export async function clearRsvp(gameId: string, playerId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps/${playerId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) throw new Error('Failed to clear RSVP');
}

// Admin: reset the whole poll — clear every RSVP for a game.
export async function resetRsvps(gameId: string): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE_URL}/games/${gameId}/rsvps`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to reset poll');
  return res.json();
}
