import { useEffect, useMemo, useState } from 'react';
import { Player } from '../api/players';
import { Guest, fetchGuests } from '../api/guests';

const RECENT_LIMIT = 8; // shown before anything is typed
const MATCH_LIMIT = 5;  // shown while typing

interface GuestDetailsModalProps {
  players: Player[];
  isGuestPlayer: (player: Player) => boolean;
  initialName?: string | null;
  initialHostId?: string | null;
  onSave: (details: { guestName: string | null; hostPlayerId: string | null }) => void;
  onSkip: () => void;
  onClose: () => void;
  // Drops the slot off the game entirely. Only passed when editing a guest who
  // is already on a team — while adding one, Close already cancels.
  onRemove?: () => void;
  // Set when the guest has played: the remove is refused and this says why.
  removeBlockedReason?: string | null;
}

// Captures who a guest is and who invited them. Both fields are optional by
// design — this runs on a phone at the side of the pitch mid-setup, so Skip is
// one tap and nothing blocks getting the guest onto a team.
export default function GuestDetailsModal({
  players,
  isGuestPlayer,
  initialName = null,
  initialHostId = null,
  onSave,
  onSkip,
  onClose,
  onRemove,
  removeBlockedReason = null,
}: GuestDetailsModalProps) {
  const [name, setName] = useState(initialName ?? '');
  const [hostId, setHostId] = useState<string | null>(initialHostId);
  const [hostQuery, setHostQuery] = useState('');
  const [knownGuests, setKnownGuests] = useState<Guest[]>([]);
  // Two taps, because the add was one tap and the removal is silent.
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    fetchGuests().then(setKnownGuests).catch(() => setKnownGuests([]));
  }, []);

  // Suggestions exist so a returning guest resolves to their existing identity
  // rather than a near-duplicate — that identity is what the dues count rides on.
  // With nothing typed we offer the most recent guests outright (the API sorts
  // them that way), so a regular is one tap and never gets retyped into a
  // duplicate that would split their dues count.
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return knownGuests.slice(0, RECENT_LIMIT);
    return knownGuests
      .filter(g => g.name.toLowerCase().includes(q) && g.name.toLowerCase() !== q)
      .slice(0, MATCH_LIMIT);
  }, [name, knownGuests]);

  const suggestionLabel = name.trim() ? 'Been before?' : 'Recent guests';

  // Hosts: any non-guest player. Prior members stay selectable — a former
  // member can still bring a mate, and excluding them would just lose the host.
  const { currentRoster, priorMembers } = useMemo(() => {
    const q = hostQuery.trim().toLowerCase();
    const eligible = players
      .filter(p => !isGuestPlayer(p))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      currentRoster: eligible.filter(p => p.onRoster !== false),
      priorMembers: eligible.filter(p => p.onRoster === false),
    };
  }, [players, hostQuery, isGuestPlayer]);

  const handleSave = () => {
    onSave({ guestName: name.trim() || null, hostPlayerId: hostId });
  };

  const hostButton = (p: Player) => (
    <li key={p.id}>
      <button
        onClick={() => setHostId(hostId === p.id ? null : p.id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
          hostId === p.id ? 'bg-surface-active' : 'hover:bg-surface-hover'
        }`}
      >
        {p.pictureUrl ? (
          <img src={p.pictureUrl} alt={p.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-text-tertiary flex-shrink-0">
            {p.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-text-primary text-sm font-medium flex-1">{p.name}</span>
        {hostId === p.id && (
          <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full border border-border max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Guest details</h3>
            <p className="text-xs text-text-tertiary mt-1">Both optional — skip and they still join the team.</p>
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

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-border">
            <label className="block text-sm font-medium text-text-secondary mb-2">Who's this?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ricky"
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-base bg-surface-raised text-text-primary placeholder-text-muted"
              autoFocus
            />
            {suggestions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-text-tertiary mb-1">{suggestionLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setName(g.name)}
                      className="px-2.5 py-1 bg-surface-raised hover:bg-surface-active text-text-primary text-xs rounded-lg transition-colors"
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">Who invited them?</label>
            <input
              type="text"
              value={hostQuery}
              onChange={(e) => setHostQuery(e.target.value)}
              placeholder="Search players…"
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-base bg-surface-raised text-text-primary placeholder-text-muted mb-2"
            />
            {currentRoster.length === 0 && priorMembers.length === 0 ? (
              <div className="text-center py-4 text-text-tertiary text-sm">No players match "{hostQuery}".</div>
            ) : (
              <>
                <ul className="space-y-1">{currentRoster.map(hostButton)}</ul>
                {priorMembers.length > 0 && (
                  <>
                    <p className="text-xs text-text-tertiary mt-3 mb-1 px-3">Prior members</p>
                    <ul className="space-y-1">{priorMembers.map(hostButton)}</ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {onRemove && (
          <div className="px-4 pt-4 border-t border-border">
            {removeBlockedReason ? (
              <p className="text-xs text-text-tertiary text-center leading-relaxed">
                Can't remove — they have {removeBlockedReason} recorded. Clear those first.
              </p>
            ) : (
              <button
                onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
                onBlur={() => setConfirmRemove(false)}
                className={`w-full px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                  confirmRemove
                    ? 'bg-error text-text-on-accent'
                    : 'border border-error-border text-error hover:bg-error-bg'
                }`}
              >
                {confirmRemove ? 'Tap again to remove' : 'Remove from game'}
              </button>
            )}
          </div>
        )}

        <div className={`p-4 flex gap-2 ${onRemove ? '' : 'border-t border-border'}`}>
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2 border border-border-emphasis text-text-secondary rounded-xl font-medium hover:bg-surface-hover transition-colors text-sm"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-accent text-text-on-accent rounded-xl font-medium hover:bg-accent-hover transition-colors text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
