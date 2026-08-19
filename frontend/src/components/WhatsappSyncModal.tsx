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
  getWhatsappGroups,
  getWhatsappSettings,
  setWhatsappSettings,
  resetWhatsapp,
  pauseWhatsapp,
  resumeWhatsapp,
  getWhatsappPairingCode,
  type WhatsappStatus,
  type WhatsappPoll,
  type UnmatchedVote,
  type WhatsappGroup,
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
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [scopeJid, setScopeJid] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState('');
  const [pairPhone, setPairPhone] = useState('');
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [showPair, setShowPair] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await getWhatsappStatus();
      setStatus(s);
      const [p, u, q, g, settings] = await Promise.all([
        getWhatsappPolls(),
        getUnmatchedVotes(),
        s.linked ? Promise.resolve(null) : getWhatsappQr(),
        s.linked ? getWhatsappGroups().catch(() => []) : Promise.resolve([]),
        getWhatsappSettings().catch(() => ({ groupJid: null, titleFilter: null })),
      ]);
      setPolls(p);
      setUnmatched(u);
      setQr(q);
      setGroups(g);
      setScopeJid(settings.groupJid);
      setTitleFilter(settings.titleFilter ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScopeChange = async (jid: string) => {
    setBusy('scope');
    try {
      await setWhatsappSettings({ groupJid: jid || null });
      setScopeJid(jid || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set scope');
    } finally {
      setBusy(null);
    }
  };

  const handlePairCode = async () => {
    setBusy('pair');
    setError(null);
    setPairCode(null);
    try {
      const code = await getWhatsappPairingCode(pairPhone);
      setPairCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get a code');
    } finally {
      setBusy(null);
    }
  };

  const handleRelink = async () => {
    setBusy('relink');
    setError(null);
    try {
      await resetWhatsapp();
      // The backend needs a moment to drop the old session and emit a new QR.
      setTimeout(refresh, 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to re-link');
    } finally {
      setBusy(null);
    }
  };

  const handlePauseToggle = async () => {
    const resuming = status?.paused === true;
    setBusy('pause');
    setError(null);
    try {
      if (resuming) {
        await resumeWhatsapp();
        setTimeout(refresh, 3500); // reconnecting takes a moment
      } else {
        await pauseWhatsapp();
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change listener state');
    } finally {
      setBusy(null);
    }
  };

  const handleTitleFilterSave = async () => {
    setBusy('title');
    try {
      const saved = await setWhatsappSettings({ titleFilter: titleFilter.trim() || null });
      setTitleFilter(saved.titleFilter ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save title filter');
    } finally {
      setBusy(null);
    }
  };

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
                ) : status.paused ? (
                  <p className="text-sm text-text-secondary font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-text-tertiary inline-block" /> Paused — session kept, not receiving
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

                {/* Stop/start without destroying the session. Re-link below
                    clears auth and needs the account's phone; this does not. */}
                {status?.enabled && (status.linked || status.paused) && (
                  <button
                    onClick={handlePauseToggle}
                    disabled={busy === 'pause'}
                    className="mt-3 w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-emphasis text-sm font-semibold text-text-primary hover:bg-surface-active transition-colors disabled:opacity-60"
                  >
                    {busy === 'pause'
                      ? status.paused ? 'Resuming…' : 'Pausing…'
                      : status.paused ? 'Resume listener' : 'Pause listener'}
                  </button>
                )}
                {status?.paused && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    Messages sent while paused are queued by WhatsApp and delivered on resume.
                  </p>
                )}

                {/* Recovery: when not linked, force a fresh session + QR. */}
                {status?.enabled && !status.linked && !status.paused && (
                  <>
                    <button
                      onClick={handleRelink}
                      disabled={busy === 'relink'}
                      className="mt-3 w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-emphasis text-sm font-semibold text-text-primary hover:bg-surface-active transition-colors disabled:opacity-60"
                    >
                      {busy === 'relink' ? 'Re-linking…' : qr ? 'Generate a new QR' : 'Re-link device (get QR)'}
                    </button>

                    {/* Phone-only linking: type a code into WhatsApp instead of scanning. */}
                    {!showPair ? (
                      <button
                        onClick={() => setShowPair(true)}
                        className="mt-2 w-full text-xs font-medium text-gold hover:underline"
                      >
                        No second screen? Link with a code instead
                      </button>
                    ) : (
                      <div className="mt-3 rounded-xl border border-border-emphasis bg-surface-raised p-3">
                        <p className="text-xs text-text-secondary mb-2">
                          Enter the WhatsApp number you're linking, get a code, then in WhatsApp:
                          <span className="text-text-primary"> Settings → Linked Devices → Link a Device → "Link with phone number instead"</span> and type the code.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            value={pairPhone}
                            onChange={(e) => setPairPhone(e.target.value)}
                            placeholder="e.g. +1 713 628 9439"
                            className="flex-1 min-w-0 px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                          />
                          <button
                            onClick={handlePairCode}
                            disabled={busy === 'pair'}
                            className="px-3 py-2 bg-gold text-text-on-accent text-sm font-bold rounded-lg hover:bg-gold-hover disabled:opacity-50 transition-colors"
                          >
                            {busy === 'pair' ? '…' : 'Get code'}
                          </button>
                        </div>
                        {pairCode && (
                          <div className="mt-3 text-center">
                            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">Your code</p>
                            <p className="text-2xl font-bold tracking-[0.3em] text-text-primary mt-1">{pairCode}</p>
                            <p className="text-[11px] text-text-tertiary mt-1">Type this into WhatsApp within a minute.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Scope: which group to read */}
              {status?.linked && (
                <section>
                  <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase mb-2">Group Scope</p>
                  <p className="text-sm text-text-secondary mb-2">
                    Only read polls from this group. Leave as "All chats" to read everywhere.
                  </p>
                  <select
                    value={scopeJid ?? ''}
                    disabled={busy === 'scope'}
                    onChange={(e) => handleScopeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">All chats (unscoped)</option>
                    {scopeJid && !groups.some((g) => g.jid === scopeJid) && (
                      <option value={scopeJid}>Current group ({scopeJid})</option>
                    )}
                    {groups.map((g) => (
                      <option key={g.jid} value={g.jid}>{g.subject}</option>
                    ))}
                  </select>
                  {groups.length === 0 && (
                    <p className="mt-1 text-xs text-text-tertiary">No groups loaded yet — tap Refresh once linked.</p>
                  )}

                  <p className="text-sm text-text-secondary mt-3 mb-2">
                    Only capture polls whose title contains this text (leave blank for any).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={titleFilter}
                      onChange={(e) => setTitleFilter(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleTitleFilterSave(); }}
                      placeholder="e.g. Soccer Saturday"
                      className="flex-1 min-w-0 px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button
                      onClick={handleTitleFilterSave}
                      disabled={busy === 'title'}
                      className="px-3 py-2 bg-surface-raised text-text-primary text-sm font-medium rounded-lg hover:bg-surface-active transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </section>
              )}

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
