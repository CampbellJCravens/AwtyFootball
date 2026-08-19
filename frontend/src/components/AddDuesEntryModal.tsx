import { useMemo, useState, FormEvent } from 'react';
import { Player, createPlayer } from '../api/players';
import { DuesMemberRow, addDuesEntry } from '../api/dues';

interface AddDuesEntryModalProps {
  duesYear: number;
  memberAmount: string;
  members: DuesMemberRow[]; // who is already in the year
  players: Player[];
  onClose: () => void;
  onSaved: () => void;
  onSwitchYear: (year: number) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

// Months left in the dues year, mirroring monthsRemainingInDuesYear on the
// server. This drives the hint only — the amount that gets stored is whatever
// is in the field when you save, so the two can never disagree about money.
const monthsRemaining = (iso: string) => 12 - new Date(`${iso}T12:00:00`).getMonth();

const PRORATA_MONTHS = 3;

export default function AddDuesEntryModal({
  duesYear, memberAmount, members, players, onClose, onSaved, onSwitchYear,
}: AddDuesEntryModalProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Player | null>(null);
  const [newName, setNewName] = useState('');
  const [joinedAt, setJoinedAt] = useState(today());
  const [amount, setAmount] = useState(Number(memberAmount).toFixed(2));
  const [touchedAmount, setTouchedAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = monthsRemaining(joinedAt);
  const isProrata = left <= PRORATA_MONTHS;
  const suggestion = useMemo(() => {
    const full = Number(memberAmount);
    return isProrata ? ((full * left) / 12).toFixed(2) : full.toFixed(2);
  }, [memberAmount, isProrata, left]);

  // The date is what decides the amount, so moving it re-prices — until the
  // amount is typed in by hand, at which point the owner's figure wins.
  const setDate = (iso: string) => {
    setJoinedAt(iso);
    if (!touchedAmount) {
      const l = monthsRemaining(iso);
      const full = Number(memberAmount);
      setAmount((l <= PRORATA_MONTHS ? (full * l) / 12 : full).toFixed(2));
    }
  };

  const inYear = useMemo(() => new Set(members.map(m => m.playerId)), [members]);

  // Returning members are the common case here, so prior members are offered
  // alongside current ones rather than hidden. GuestN slots are per-game
  // placeholders and are never billable.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter(p => !inYear.has(p.id) && !/^Guest\d+$/.test(p.name))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.onRoster) - Number(a.onRoster) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [players, inYear, query]);

  const alreadyIn = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 3);
  }, [members, query]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!picked && !newName.trim()) { setError('Pick someone, or type a name to add them.'); return; }
    if (Number.isNaN(amountNum) || amountNum < 0) { setError('Amount must be a non-negative number.'); return; }

    setSaving(true);
    setError(null);
    try {
      const playerId = picked
        ? picked.id
        : (await createPlayer({ name: newName.trim() })).id;
      await addDuesEntry(duesYear, {
        playerId,
        amountOwed: amountNum.toFixed(2),
        joinedAt: new Date(`${joinedAt}T12:00:00`).toISOString(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add them');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Add to {duesYear} dues</h2>
            <p className="text-sm text-text-tertiary">
              A new member, or someone coming back. They go back on the roster too.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Who</label>
            {picked ? (
              <div className="flex items-center gap-2 bg-surface-raised border border-border-emphasis rounded-xl px-3 py-2.5">
                <span className="text-sm font-medium text-text-primary flex-1 truncate">{picked.name}</span>
                {!picked.onRoster && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-info-bg text-info">returning</span>
                )}
                <button type="button" onClick={() => setPicked(null)} className="text-xs text-text-tertiary hover:text-text-primary">
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text" value={query} onChange={e => { setQuery(e.target.value); setNewName(e.target.value); }}
                  placeholder="Search, or type a new name"
                  autoFocus
                  className="w-full bg-surface-raised border border-border-emphasis rounded-xl px-3 py-2.5 text-text-primary text-sm outline-none focus:border-accent placeholder:text-text-tertiary"
                />
                {alreadyIn.length > 0 && (
                  <p className="text-[11px] text-warning mt-1.5">
                    Already on the {duesYear} bill: {alreadyIn.map(m => m.name).join(', ')}
                  </p>
                )}
                <div className="mt-1.5 space-y-1">
                  {candidates.map(p => (
                    <button
                      key={p.id} type="button" onClick={() => { setPicked(p); setQuery(''); setNewName(''); }}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-surface-raised hover:bg-surface-hover"
                    >
                      <span className="text-sm text-text-primary flex-1 truncate">{p.name}</span>
                      {!p.onRoster && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-info-bg text-info">returning</span>
                      )}
                      {p.isAlumni && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface text-text-tertiary">alumni</span>
                      )}
                    </button>
                  ))}
                  {query.trim() && candidates.length === 0 && (
                    <p className="text-[11px] text-text-tertiary px-1">
                      No match — “{query.trim()}” will be created as a new player.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Joined</label>
            <input
              type="date" value={joinedAt} onChange={e => setDate(e.target.value)}
              className="w-full bg-surface-raised border border-border-emphasis rounded-xl px-3 py-2.5 text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Owed</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={amount}
                onChange={e => { setAmount(e.target.value); setTouchedAmount(true); }}
                className="w-full bg-surface-raised border border-border-emphasis rounded-xl pl-7 pr-3 py-2.5 text-text-primary tabular-nums outline-none focus:border-accent"
              />
            </div>
            {isProrata ? (
              <p className="text-[11px] text-warning mt-1.5">
                Only {left} month{left === 1 ? '' : 's'} left in {duesYear} — your call. Suggested ${suggestion} against
                the ${Number(memberAmount).toFixed(2)} full rate.
              </p>
            ) : (
              <p className="text-[11px] text-text-tertiary mt-1.5">
                Full rate — {left} months left in {duesYear}.
              </p>
            )}
          </div>

          {/* The last three months of a year are exactly when collection for the
              next one opens, so billing the stub is usually the wrong call. */}
          {isProrata && (
            <button
              type="button"
              onClick={() => { onSwitchYear(duesYear + 1); onClose(); }}
              className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover"
            >
              Bill them for {duesYear + 1} instead
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-raised text-text-secondary border border-border-emphasis hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-text-on-accent disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
