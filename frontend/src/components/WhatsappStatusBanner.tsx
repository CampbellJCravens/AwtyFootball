import { useEffect, useState } from 'react';
import { getWhatsappStatus } from '../api/whatsapp';

interface Props {
  onOpenSync: () => void;
}

/**
 * Admin-only warning shown at the top of the app in either of the two states
 * that stop RSVPs reaching the app:
 *
 *   disconnected - the listener is enabled but has no session.
 *   dropping     - the listener is connected and votes ARE arriving, but for a
 *                  poll that was never captured, so every one is discarded.
 *
 * The second state is the one that went unnoticed for two weeks (8 + 15 Aug
 * 2026) because the old health check only ever asked whether a socket existed.
 * Polls periodically.
 */
export default function WhatsappStatusBanner({ onOpenSync }: Props) {
  const [problem, setProblem] = useState<'disconnected' | 'dropping' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const s = await getWhatsappStatus();
        if (cancelled) return;
        if (!s.enabled) setProblem(null);
        else if (!s.linked || s.connectionState !== 'open') setProblem('disconnected');
        else if (s.orphanVoteCount > 0) setProblem('dropping');
        else setProblem(null);
      } catch {
        // Not admin / not signed in → don't show anything.
        if (!cancelled) setProblem(null);
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!problem) return null;

  const message = problem === 'disconnected'
    ? "WhatsApp listener disconnected — votes aren't being captured. Tap to re-link."
    : "WhatsApp votes are arriving for a poll that was never captured, and are being dropped. Tap for details.";

  return (
    <button
      onClick={onOpenSync}
      className="w-full flex items-center gap-2 px-4 py-2 bg-error-bg border-b border-error-border text-error text-sm font-medium text-left"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.68 20h18.64a1 1 0 00.87-1.44l-8.48-14.7a1 1 0 00-1.72 0z" />
      </svg>
      <span className="flex-1">{message}</span>
    </button>
  );
}
