/**
 * In-memory record of what the listener has actually observed.
 *
 * Exists because `isWhatsappLinked()` reported `ok` straight through two
 * entirely-dropped weeks (8 Aug + 15 Aug 2026): it only checks that a socket
 * object exists, never that anything was received. These counters answer the
 * question that actually matters — "is it ingesting?" — and they are held in
 * memory on purpose, so the public health endpoint can be polled by a monitor
 * without waking the Neon compute. See WHATSAPP_CAPTURE_RELIABILITY_PRD.md.
 *
 * Everything here resets on restart. That is fine: the failure this is built to
 * catch shows up within hours of a poll being posted, not across weeks.
 */

export type ConnectionState = 'connecting' | 'open' | 'closed';

const startedAt = new Date().toISOString();

let connectionState: ConnectionState = 'connecting';
let lastMessageAt: string | null = null;
let lastVoteAt: string | null = null;
let lastPollCapturedAt: string | null = null;
let lastPollCapturedTitle: string | null = null;
let lastCaptureFailureAt: string | null = null;
let lastCaptureFailure: string | null = null;

// pollMessageId -> votes we had to discard because that poll was never
// captured. Cleared for a poll if it is captured later, since those votes
// become replayable at that point.
const orphanVotes = new Map<string, { count: number; lastAt: string }>();

const now = () => new Date().toISOString();

export function noteConnectionState(state: ConnectionState): void {
  connectionState = state;
}

export function noteMessageSeen(): void {
  lastMessageAt = now();
}

export function noteVoteSeen(): void {
  lastVoteAt = now();
}

export function notePollCaptured(title: string, pollMessageId: string): void {
  lastPollCapturedAt = now();
  lastPollCapturedTitle = title;
  orphanVotes.delete(pollMessageId);
}

export function noteCaptureFailure(title: string, err: unknown): void {
  lastCaptureFailureAt = now();
  lastCaptureFailure = `${title}: ${err instanceof Error ? err.message : String(err)}`;
}

export function noteOrphanVote(pollMessageId: string): void {
  const prior = orphanVotes.get(pollMessageId);
  orphanVotes.set(pollMessageId, { count: (prior?.count ?? 0) + 1, lastAt: now() });
}

export interface ListenerActivity {
  connectionState: ConnectionState;
  startedAt: string;
  lastMessageAt: string | null;
  lastVoteAt: string | null;
  lastPollCapturedAt: string | null;
  lastPollCapturedTitle: string | null;
  lastCaptureFailureAt: string | null;
  lastCaptureFailure: string | null;
  orphanVoteCount: number;
  orphanPollCount: number;
  lastOrphanVoteAt: string | null;
}

export function getActivity(): ListenerActivity {
  let orphanVoteCount = 0;
  let lastOrphanVoteAt: string | null = null;
  for (const { count, lastAt } of orphanVotes.values()) {
    orphanVoteCount += count;
    if (!lastOrphanVoteAt || lastAt > lastOrphanVoteAt) lastOrphanVoteAt = lastAt;
  }
  return {
    connectionState,
    startedAt,
    lastMessageAt,
    lastVoteAt,
    lastPollCapturedAt,
    lastPollCapturedTitle,
    lastCaptureFailureAt,
    lastCaptureFailure,
    orphanVoteCount,
    orphanPollCount: orphanVotes.size,
    lastOrphanVoteAt,
  };
}
