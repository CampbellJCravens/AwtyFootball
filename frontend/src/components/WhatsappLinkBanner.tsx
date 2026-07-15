import { useCallback, useEffect, useState } from 'react';
import { fetchGameLinkStatus, type GameLinkStatus } from '../api/rsvps';
import { linkPoll } from '../api/whatsapp';

interface Props {
  gameId: string;
  onLinked: () => void;
}

/**
 * Admin banner (shown on a recent game's RSVP tab) prompting to link a WhatsApp
 * poll when the game has none. Lets the admin link a captured poll right here
 * instead of going to the WhatsApp Sync panel. Renders nothing once linked.
 */
export default function WhatsappLinkBanner({ gameId, onLinked }: Props) {
  const [status, setStatus] = useState<GameLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchGameLinkStatus(gameId));
    } catch {
      setStatus(null); // non-admins get 403 → render nothing
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  const handleLink = async (pollMessageId: string) => {
    if (!pollMessageId) return;
    setBusy(true);
    setError(null);
    try {
      await linkPoll(pollMessageId, gameId);
      await load();
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link poll');
    } finally {
      setBusy(false);
    }
  };

  // Already linked (or not loaded / not admin) → nothing to show.
  if (!status || status.linkedPollId) return null;

  return (
    <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 p-3">
      <p className="text-sm font-semibold text-text-primary">No WhatsApp poll linked to this game</p>
      {status.candidates.length > 0 ? (
        <>
          <p className="text-xs text-text-secondary mt-0.5 mb-2">Link the poll for this game so its votes show up here.</p>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => handleLink(e.target.value)}
            className="w-full px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Link a poll…</option>
            {status.candidates.map((c) => (
              <option key={c.pollMessageId} value={c.pollMessageId}>
                {c.question} ({c.voteCount} vote{c.voteCount === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="text-xs text-text-secondary mt-0.5">
          Once the poll is posted in WhatsApp it'll auto-link by its date, or appear here to link manually.
        </p>
      )}
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
