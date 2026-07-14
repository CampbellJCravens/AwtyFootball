// Admin API client for the WhatsApp poll listener.
// See docs/whatsapp-poll-listener-spec.md.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface WhatsappStatus {
  enabled: boolean;
  linked: boolean;
  hasQr: boolean;
}

export interface WhatsappPoll {
  pollMessageId: string;
  question: string;
  gameId: string | null;
  game: { id: string; gameNumber: number | null; createdAt: string } | null;
  linkedBy: string | null;
  voteCount: number;
  createdAt: string;
}

export interface UnmatchedVote {
  phone: string;
  pushName: string | null;
  pollMessageId: string;
  question: string;
  gameId: string | null;
  optionText: string;
}

const opts = (extra?: RequestInit): RequestInit => ({
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...extra,
});

export async function getWhatsappStatus(): Promise<WhatsappStatus> {
  const res = await fetch(`${API_BASE_URL}/whatsapp/status`, opts());
  if (!res.ok) throw new Error('Failed to fetch WhatsApp status');
  return res.json();
}

/** Returns the QR data URL to scan, or null if already linked / none pending. */
export async function getWhatsappQr(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/whatsapp/qr`, opts());
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Failed to fetch WhatsApp QR');
  const data = await res.json();
  return data.dataUrl as string;
}

export async function getWhatsappPolls(): Promise<WhatsappPoll[]> {
  const res = await fetch(`${API_BASE_URL}/whatsapp/polls`, opts());
  if (!res.ok) throw new Error('Failed to fetch polls');
  return res.json();
}

export async function linkPoll(pollMessageId: string, gameId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/whatsapp/polls/${encodeURIComponent(pollMessageId)}/link`,
    opts({ method: 'POST', body: JSON.stringify({ gameId }) })
  );
  if (!res.ok) throw new Error('Failed to link poll');
}

export async function getUnmatchedVotes(gameId?: string): Promise<UnmatchedVote[]> {
  const url = gameId
    ? `${API_BASE_URL}/whatsapp/unmatched?gameId=${encodeURIComponent(gameId)}`
    : `${API_BASE_URL}/whatsapp/unmatched`;
  const res = await fetch(url, opts());
  if (!res.ok) throw new Error('Failed to fetch unmatched votes');
  return res.json();
}

export interface WhatsappGroup {
  jid: string;
  subject: string;
}

export async function getWhatsappGroups(): Promise<WhatsappGroup[]> {
  const res = await fetch(`${API_BASE_URL}/whatsapp/groups`, opts());
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function getWhatsappScope(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/whatsapp/scope`, opts());
  if (!res.ok) throw new Error('Failed to fetch scope');
  const data = await res.json();
  return data.groupJid ?? null;
}

export async function setWhatsappScope(groupJid: string | null): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/whatsapp/scope`,
    opts({ method: 'POST', body: JSON.stringify({ groupJid }) })
  );
  if (!res.ok) throw new Error('Failed to set scope');
}

export async function resolveUnmatched(phone: string, playerId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/whatsapp/unmatched/resolve`,
    opts({ method: 'POST', body: JSON.stringify({ phone, playerId }) })
  );
  if (!res.ok) throw new Error('Failed to resolve vote');
}
