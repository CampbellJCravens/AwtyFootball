import { useMemo, useState } from 'react';
import { Player, createPlayer } from '../api/players';

interface PlayerPickerModalProps {
  players: Player[];
  onPick: (playerId: string) => void;
  onClose: () => void;
  onPlayerCreated?: () => void; // Lets the caller refresh its players list
  title?: string;
  subtitle?: string;
}

export default function PlayerPickerModal({
  players,
  onPick,
  onClose,
  onPlayerCreated,
  title = 'Who are you?',
  subtitle = 'Pick yourself from the list so we know who you are. We\'ll remember this on this device.',
}: PlayerPickerModalProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(p => p.name.toLowerCase().includes(q));
  }, [players, query]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('Please enter your name');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createPlayer({ name });
      onPlayerCreated?.();
      onPick(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create player');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full border border-border max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            <p className="text-xs text-text-tertiary mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors flex-shrink-0 ml-2"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode === 'pick' ? (
          <>
            <div className="p-4 border-b border-border">
              <input
                type="text"
                placeholder="Search by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-4 py-2 border border-border-emphasis rounded-xl outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-base bg-surface-raised text-text-primary placeholder-text-muted"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="text-center py-6 text-text-tertiary text-sm">
                  No players match "{query}".
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map(p => (
                    <li key={p.id}>
                      <button
                        onClick={() => onPick(p.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                      >
                        {p.pictureUrl ? (
                          <img src={p.pictureUrl} alt={p.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-text-tertiary flex-shrink-0">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-text-primary text-sm font-medium">{p.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-border">
              <button
                onClick={() => { setMode('create'); setError(null); }}
                className="w-full px-4 py-2 border-2 border-dashed border-border-emphasis text-text-secondary rounded-xl font-medium hover:bg-surface-hover transition-colors text-sm"
              >
                + I'm new here, add me
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Your name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="e.g. Campbell"
                className="w-full px-4 py-2 border border-border-emphasis rounded-xl outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-base bg-surface-raised text-text-primary placeholder-text-muted"
                autoFocus
                disabled={creating}
              />
              <p className="text-xs text-text-tertiary mt-2">
                You can add a profile picture later from your profile page.
              </p>
            </div>
            {error && (
              <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setMode('pick'); setError(null); }}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-surface-raised text-text-primary text-sm font-medium rounded-xl hover:bg-surface-active disabled:cursor-not-allowed transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 px-4 py-2 bg-accent text-text-on-accent text-sm font-medium rounded-xl hover:bg-accent-hover disabled:bg-surface-active disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating…' : 'Create & continue'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
