import { useCallback, useEffect, useState } from 'react';
import type { Player } from '../api/players';
import { getUnmatchedVotes, resolveUnmatched, type UnmatchedVote } from '../api/whatsapp';

interface Props {
  gameId: string;
  players: Player[];
  onResolved?: () => void;
}

/**
 * Admin-only flag surfaced on a game's RSVP tab: WhatsApp poll votes for this
 * game from numbers not yet linked to a player. Resolve inline (assign a number
 * to a player) and the vote is attributed into this game's RSVPs.
 */
export default function WhatsappUnmatchedFlag({ gameId, players, onResolved }: Props) {
  const [unmatched, setUnmatched] = useState<UnmatchedVote[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUnmatched(await getUnmatchedVotes(gameId));
    } catch {
      // Non-admins get 403 here — just render nothing.
      setUnmatched([]);
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (phone: string, playerId: string) => {
    if (!playerId) return;
    setBusy(phone);
    setError(null);
    try {
      await resolveUnmatched(phone, playerId);
      await load();
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link number');
    } finally {
      setBusy(null);
    }
  };

  if (unmatched.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-warning bg-warning-bg p-3">
      <p className="text-sm font-semibold text-warning flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.68 20h18.64a1 1 0 00.87-1.44l-8.48-14.7a1 1 0 00-1.72 0z" />
        </svg>
        {unmatched.length} WhatsApp vote{unmatched.length === 1 ? '' : 's'} from unlinked number{unmatched.length === 1 ? '' : 's'}
      </p>
      <p className="text-xs text-text-tertiary mt-0.5 mb-2">Link each number to a player to count their vote.</p>

      {error && <p className="text-xs text-error mb-2">{error}</p>}

      <div className="space-y-2">
        {unmatched.map((v) => (
          <div key={`${v.pollMessageId}-${v.phone}`} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary truncate">{v.pushName || `+${v.phone}`}</p>
              <p className="text-xs text-text-tertiary truncate">+{v.phone} · voted "{v.optionText}"</p>
            </div>
            <select
              defaultValue=""
              disabled={busy === v.phone}
              onChange={(e) => handleResolve(v.phone, e.target.value)}
              className="px-2 py-1.5 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent max-w-[45%]"
            >
              <option value="">Link to…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
