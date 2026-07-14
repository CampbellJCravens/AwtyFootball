import { useCallback, useEffect, useState } from 'react';
import type { Game } from '../api/games';
import type { Player } from '../api/players';
import {
  getWhatsappStatus,
  getWhatsappQr,
  getWhatsappPolls,
  linkPoll,
  getUnmatchedVotes,
  resolveUnmatched,
  type WhatsappStatus,
  type WhatsappPoll,
  type UnmatchedVote,
} from '../api/whatsapp';

interface Props {
  games: Game[];
  players: Player[];
  onClose: () => void;
}

const gameLabel = (g: { gameNumber: number | null; createdAt: string }) => {
  const d = new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return g.gameNumber != null ? `Game ${g.gameNumber} · ${d}` : d;
};

export default function WhatsappSyncModal({ games, players, onClose }: Props) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [polls, setPolls] = useState<WhatsappPoll[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await getWhatsappStatus();
      setStatus(s);
      const [p, u, q] = await Promise.all([
        getWhatsappPolls(),
        getUnmatchedVotes(),
        s.linked ? Promise.resolve(null) : getWhatsappQr(),
      ]);
      setPolls(p);
      setUnmatched(u);
      setQr(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While waiting to link, poll for the QR / linked state every few seconds.
  useEffect(() => {
    if (status?.linked) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [status?.linked, refresh]);

  const handleLink = async (pollMessageId: string, gameId: string) => {
    if (!gameId) return;
    setBusy(pollMessageId);
    try {
      await linkPoll(pollMessageId, gameId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link poll');
    } finally {
      setBusy(null);
    }
  };

  const handleResolve = async (phone: string, playerId: string) => {
    if (!playerId) return;
    setBusy(phone);
    try {
      await resolveUnmatched(phone, playerId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl border border-border shadow-modal w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h3 className="text-lg font-semibold text-text-primary">WhatsApp Sync</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold" />
            </div>
          ) : (
            <>
              {/* Connection */}
              <section>
                <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase mb-2">Connection</p>
                {!status?.enabled ? (
                  <p className="text-sm text-text-secondary">
                    The listener is <span className="font-semibold">disabled</span>. Set{' '}
                    <code className="text-xs bg-surface-raised px-1 py-0.5 rounded">WHATSAPP_LISTENER_ENABLED=true</code>{' '}
                    on the backend and redeploy to enable it.
                  </p>
                ) : status.linked ? (
                  <p className="text-sm text-success font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success inline-block" /> Linked and listening
                  </p>
                ) : qr ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-text-secondary text-center">
                      Open WhatsApp → Linked Devices → Link a Device, and scan:
                    </p>
                    <img src={qr} alt="WhatsApp QR code" className="w-56 h-56 rounded-lg bg-white p-2" />
                    <p className="text-xs text-text-tertiary">Waiting for scan…</p>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">Waiting for a QR code from the backend…</p>
                )}
              </section>

              {/* Captured polls */}
              <section>
                <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase mb-2">
                  Captured Polls ({polls.length})
                </p>
                {polls.length === 0 ? (
                  <p className="text-sm text-text-tertiary">
                    None yet. Post a poll in the group (after linking) and it'll appear here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {polls.map((poll) => (
                      <div key={poll.pollMessageId} className="bg-surface-raised rounded-xl p-3 border border-border">
                        <p className="text-sm font-medium text-text-primary truncate">{poll.question}</p>
                        <p className="text-xs text-text-tertiary mb-2">
                          {poll.voteCount} vote{poll.voteCount === 1 ? '' : 's'}
                          {poll.game ? ` · linked to ${gameLabel(poll.game)}` : ' · not linked'}
                        </p>
                        <select
                          value={poll.gameId ?? ''}
                          disabled={busy === poll.pollMessageId}
                          onChange={(e) => handleLink(poll.pollMessageId, e.target.value)}
                          className="w-full px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">{poll.gameId ? 'Change game…' : 'Link to game…'}</option>
                          {games.map((g) => (
                            <option key={g.id} value={g.id}>{gameLabel(g)}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Unmatched votes */}
              <section>
                <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase mb-2">
                  Unmatched Numbers ({unmatched.length})
                </p>
                {unmatched.length === 0 ? (
                  <p className="text-sm text-text-tertiary">Every voter is mapped to a player. 🎉</p>
                ) : (
                  <div className="space-y-3">
                    {unmatched.map((v) => (
                      <div key={`${v.pollMessageId}-${v.phone}`} className="bg-surface-raised rounded-xl p-3 border border-border">
                        <p className="text-sm font-medium text-text-primary">
                          {v.pushName || `+${v.phone}`}
                        </p>
                        <p className="text-xs text-text-tertiary mb-2">
                          +{v.phone} · voted “{v.optionText}” · {v.question}
                        </p>
                        <select
                          defaultValue=""
                          disabled={busy === v.phone}
                          onChange={(e) => handleResolve(v.phone, e.target.value)}
                          className="w-full px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                        >
                          <option value="">Assign to player…</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 p-4 border-t border-border flex-shrink-0">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 bg-surface-raised text-text-primary text-sm font-medium rounded-xl hover:bg-surface-active transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gold text-text-on-accent text-sm font-bold rounded-xl hover:bg-gold-hover transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
