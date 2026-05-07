import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { Player } from '../api/players';
import {
  Rsvp,
  RsvpStatus,
  fetchRsvps,
  submitRsvp,
  adminSetRsvp,
  clearRsvp,
} from '../api/rsvps';
import { useAuth } from '../contexts/AuthContext';
import { usePlayerIdentity } from '../hooks/usePlayerIdentity';
import PlayerPickerModal from './PlayerPickerModal';

interface GameRsvpSectionProps {
  gameId: string;
  gameNumber: number | null;
  gameDate: string;
  players: Player[];
  onPlayersChanged?: () => void;
}

const STATUS_LABEL: Record<RsvpStatus, string> = { yes: 'In', maybe: 'Maybe', no: 'Out' };
const STATUS_COLOR: Record<RsvpStatus, string> = {
  yes: '#22c55e',
  maybe: '#f59e0b',
  no: '#ef4444',
};
const STATUS_TEXT: Record<RsvpStatus, string> = {
  yes: 'text-green-400',
  maybe: 'text-gold',
  no: 'text-red-400',
};

const GUEST_MAX = 10;

// Hash playerId → hue 0-360 so player avatars without a picture stay
// recognisable across renders.
function toneFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  return Math.abs(hash) % 360;
}

interface AvatarSubject {
  id: string;
  name: string;
  pictureUrl?: string | null;
  isGuest?: boolean;
}

function PlayerAvatar({
  subject,
  size = 22,
  ring,
}: {
  subject: AvatarSubject;
  size?: number;
  ring?: string;
}) {
  const baseStyle: CSSProperties = { width: size, height: size };
  if (ring) baseStyle.boxShadow = `0 0 0 2px ${ring}`;

  if (!subject.isGuest && subject.pictureUrl) {
    return (
      <img
        src={subject.pictureUrl}
        alt={subject.name}
        className="rounded-full object-cover flex-shrink-0"
        style={baseStyle}
      />
    );
  }

  const initial = subject.isGuest ? '+' : subject.name.charAt(0).toUpperCase();
  const tone = subject.isGuest ? 60 : toneFromId(subject.id);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{
        ...baseStyle,
        fontSize: Math.max(9, Math.floor(size * 0.42)),
        background: subject.isGuest
          ? 'rgba(245, 158, 11, 0.6)'
          : `oklch(0.55 0.07 ${tone})`,
      }}
    >
      {initial}
    </div>
  );
}

function AvatarPile({
  subjects,
  max = 6,
  size = 22,
  ring = 'var(--color-bg-surface)',
}: {
  subjects: AvatarSubject[];
  max?: number;
  size?: number;
  ring?: string;
}) {
  const shown = subjects.slice(0, max);
  const extra = Math.max(0, subjects.length - max);
  return (
    <div className="flex items-center -space-x-2">
      {shown.map(s => (
        <PlayerAvatar key={s.id} subject={s} size={size} ring={ring} />
      ))}
      {extra > 0 && (
        <div
          className="rounded-full flex items-center justify-center bg-surface-active text-text-primary font-semibold flex-shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(9, Math.floor(size * 0.36)),
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

function TotalComingHero({ inCount, guestCount }: { inCount: number; guestCount: number }) {
  const total = inCount + guestCount;
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold text-text-primary tabular-nums leading-none">{total}</span>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-semibold leading-none">
            {total === 1 ? 'player coming' : 'players coming'}
          </p>
          <p className="text-xs text-text-secondary mt-1.5">
            {inCount} in
            {guestCount > 0 && (
              <>
                {' · '}
                <span className="text-gold">+{guestCount} guest{guestCount === 1 ? '' : 's'}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function IdentityPill({
  player,
  onPick,
}: {
  player: Player | null;
  onPick: () => void;
}) {
  if (!player) {
    return (
      <button
        onClick={onPick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-surface border border-border-emphasis hover:bg-surface-hover transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-text-tertiary text-lg font-bold">?</div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold leading-none">You're voting as</p>
          <p className="text-[14px] font-semibold text-text-primary leading-tight mt-1">Pick your player</p>
        </div>
        <span className="text-[11px] font-medium text-gold px-2.5 py-1.5 rounded-lg bg-gold/10 border border-gold/30">
          Pick
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface border border-border">
      <PlayerAvatar subject={player} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold leading-none">You're voting as</p>
        <p className="text-[14px] font-semibold text-text-primary leading-tight mt-0.5 truncate">{player.name}</p>
      </div>
      <button
        onClick={onPick}
        className="text-[11px] font-medium text-text-secondary px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-hover transition-colors flex-shrink-0"
      >
        Switch
      </button>
    </div>
  );
}

function GuestStepper({
  guests,
  onChange,
}: {
  guests: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative flex items-center justify-between px-3.5 py-2 bg-base/60 border-t border-border/60">
      <span className="text-[12px] font-medium text-text-secondary">
        {guests === 0 ? 'Bringing guests?' : `+ ${guests} guest${guests === 1 ? '' : 's'}`}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onChange(Math.max(0, guests - 1)); }}
          disabled={guests === 0}
          className="w-7 h-7 rounded-full bg-surface-raised hover:bg-surface-active text-text-primary disabled:opacity-30 flex items-center justify-center font-bold text-[14px] transition-colors"
          aria-label="Decrease guests"
        >
          −
        </button>
        <span className="min-w-[20px] text-center text-[14px] font-bold tabular-nums text-text-primary">{guests}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onChange(Math.min(GUEST_MAX, guests + 1)); }}
          disabled={guests >= GUEST_MAX}
          className="w-7 h-7 rounded-full bg-surface-raised hover:bg-surface-active text-text-primary disabled:opacity-30 flex items-center justify-center font-bold text-[14px] transition-colors"
          aria-label="Increase guests"
        >
          +
        </button>
      </div>
    </div>
  );
}

interface PollBarProps {
  status: RsvpStatus;
  total: number;
  voters: AvatarSubject[];
  mine: boolean;
  count: number;            // can differ from voters.length when ghost guests are added
  onVote: () => void;
  justVoted: boolean;
  guestSuffix?: number;     // shown as "12+3" when mine is yes with guests
}

function PollBarFilled({ status, total, voters, mine, count, onVote, justVoted, guestSuffix }: PollBarProps) {
  const color = STATUS_COLOR[status];
  const baseCount = voters.length; // for percentage math, real RSVPs only
  const pct = total > 0 ? (baseCount / total) * 100 : 0;
  const minPct = baseCount > 0 ? Math.max(pct, 8) : 0;

  return (
    <button
      onClick={onVote}
      className="relative w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
      style={{
        border: `${mine ? 2 : 1}px solid ${mine ? color : 'var(--color-border-default)'}`,
        background: 'var(--color-bg-surface)',
        boxShadow: mine ? `0 0 0 4px ${color}25` : 'none',
      }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{
          width: `${minPct}%`,
          background: `linear-gradient(90deg, ${color}30, ${color}12)`,
          animation: justVoted ? 'pulse 0.6s ease' : undefined,
        }}
      />
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />

      <div className="relative px-3.5 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[15px] font-bold ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status]}</span>
            {mine && (
              <span
                className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                style={{ background: color, color: '#0a0a0a' }}
              >
                Your vote
              </span>
            )}
          </div>
          <div className="mt-1.5 min-h-[22px]">
            {voters.length > 0 ? (
              <AvatarPile subjects={voters} max={6} size={20} />
            ) : (
              <span className="text-[11px] text-text-tertiary">No votes yet — be first</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-text-primary tabular-nums leading-none">
            {count}
            {guestSuffix && guestSuffix > 0 ? (
              <span className="text-base text-gold">+{guestSuffix}</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function AttendeeRow({
  player,
  status,
  guests,
  mine,
  adminMode,
  setByAdmin,
  onAdminEdit,
  onAdminClear,
}: {
  player: Player;
  status: RsvpStatus;
  guests: number;
  mine: boolean;
  adminMode: boolean;
  setByAdmin: boolean;
  onAdminEdit: () => void;
  onAdminClear: () => void;
}) {
  const color = STATUS_COLOR[status];
  return (
    <li
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface/60"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <PlayerAvatar subject={player} size={28} />
      <span className="text-[13px] text-text-primary truncate flex-1">
        {player.name}
        {mine && <span className="text-[10px] text-text-tertiary ml-1">(you)</span>}
      </span>
      {status === 'yes' && guests > 0 && (
        <span className="text-[10px] font-semibold text-gold bg-gold/15 px-1.5 py-0.5 rounded">
          +{guests}
        </span>
      )}
      {setByAdmin && (
        <span className="text-[9px] uppercase tracking-wider text-text-tertiary" title="Set by an admin">
          admin
        </span>
      )}
      {adminMode && (
        <div className="flex items-center gap-1">
          <button
            onClick={onAdminEdit}
            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary hover:bg-surface-active transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onAdminClear}
            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary hover:bg-surface-active transition-colors"
            aria-label="Clear RSVP"
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}

export default function GameRsvpSection({
  gameId,
  gameNumber: _gameNumber,
  gameDate: _gameDate,
  players,
  onPlayersChanged,
}: GameRsvpSectionProps) {
  const { isAdmin } = useAuth();
  const { player: identityPlayer, setIdentity, clearIdentity } = usePlayerIdentity(players);

  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [pendingRsvp, setPendingRsvp] = useState<{ status: RsvpStatus; guestCount: number } | null>(null);

  const [adminMode, setAdminMode] = useState(false);
  const [adminEditingPlayerId, setAdminEditingPlayerId] = useState<string | null>(null);
  const [showNoResponses, setShowNoResponses] = useState(false);

  const [justVoted, setJustVoted] = useState<RsvpStatus | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [guestCount, setGuestCount] = useState(0);

  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);

  const loadRsvps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchRsvps(gameId);
      setRsvps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RSVPs');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { loadRsvps(); }, [loadRsvps]);

  // Sync the local guest counter when our identity's RSVP appears/changes
  useEffect(() => {
    if (!identityPlayer) return;
    const myRsvp = rsvps.find(r => r.playerId === identityPlayer.id);
    setGuestCount(myRsvp?.guestCount ?? 0);
  }, [identityPlayer, rsvps]);

  const myRsvp = identityPlayer ? rsvps.find(r => r.playerId === identityPlayer.id) ?? null : null;

  // Bucket RSVPs by status, keep insertion order for the avatar pile (oldest
  // first feels right — first responders show first).
  const grouped: Record<RsvpStatus, Rsvp[]> = { yes: [], maybe: [], no: [] };
  for (const r of rsvps) {
    if (r.status === 'yes' || r.status === 'maybe' || r.status === 'no') grouped[r.status].push(r);
  }

  const yesGuestsTotal = grouped.yes.reduce((s, r) => s + (r.guestCount || 0), 0);
  const total = rsvps.length;

  const respondedIds = new Set(rsvps.map(r => r.playerId));
  const notResponded = players.filter(p => !respondedIds.has(p.id));

  const subjectsFor = (status: RsvpStatus, opts?: { withMyGuests?: boolean }): AvatarSubject[] => {
    const base = grouped[status]
      .map(r => playerMap.get(r.playerId))
      .filter((p): p is Player => !!p)
      .map(p => ({ id: p.id, name: p.name, pictureUrl: p.pictureUrl }));
    if (status === 'yes' && opts?.withMyGuests && identityPlayer && myRsvp?.status === 'yes' && guestCount > 0) {
      const ghosts: AvatarSubject[] = Array.from({ length: guestCount }).map((_, i) => ({
        id: `__guest-${identityPlayer.id}-${i}`,
        name: `Guest ${i + 1}`,
        isGuest: true,
      }));
      return [...base, ...ghosts];
    }
    return base;
  };

  const handleVote = async (status: RsvpStatus) => {
    if (!identityPlayer) {
      setPendingRsvp({ status, guestCount: status === 'yes' ? guestCount : 0 });
      setShowPicker(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setJustVoted(status);
    setTimeout(() => setJustVoted(null), 700);
    try {
      // Tapping the option you've already picked clears your vote entirely.
      if (myRsvp?.status === status) {
        await clearRsvp(gameId, identityPlayer.id);
        setRsvps(prev => prev.filter(r => r.playerId !== identityPlayer.id));
        setGuestCount(0);
        return;
      }
      const guests = status === 'yes' ? guestCount : 0;
      const updated = await submitRsvp(gameId, identityPlayer.id, status, guests);
      setRsvps(prev => {
        const idx = prev.findIndex(r => r.playerId === updated.playerId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save RSVP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestChange = async (n: number) => {
    setGuestCount(n);
    if (!identityPlayer || myRsvp?.status !== 'yes') return;
    setSubmitting(true);
    try {
      const updated = await submitRsvp(gameId, identityPlayer.id, 'yes', n);
      setRsvps(prev => prev.map(r => r.playerId === updated.playerId ? updated : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update guests');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickerPicked = async (playerId: string) => {
    setIdentity(playerId);
    setShowPicker(false);
    if (pendingRsvp) {
      const intent = pendingRsvp;
      setPendingRsvp(null);
      setSubmitting(true);
      try {
        const updated = await submitRsvp(gameId, playerId, intent.status, intent.guestCount);
        setRsvps(prev => {
          const idx = prev.findIndex(r => r.playerId === updated.playerId);
          if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
          return [...prev, updated];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save RSVP');
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Admin actions
  const handleAdminSet = async (playerId: string, status: RsvpStatus, guests: number) => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await adminSetRsvp(gameId, playerId, status, guests);
      setRsvps(prev => {
        const idx = prev.findIndex(r => r.playerId === updated.playerId);
        if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
        return [...prev, updated];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to override RSVP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminClear = async (playerId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await clearRsvp(gameId, playerId);
      setRsvps(prev => prev.filter(r => r.playerId !== playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear RSVP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/?game=${gameId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  };

  // Build the "In" block voters, optionally appending my ghost guests.
  const yesVoters = subjectsFor('yes', { withMyGuests: true });
  const maybeVoters = subjectsFor('maybe');
  const noVoters = subjectsFor('no');

  return (
    <div className="space-y-4">
      {/* Total players coming — front-and-center summary */}
      <TotalComingHero inCount={grouped.yes.length} guestCount={yesGuestsTotal} />

      {/* Identity */}
      <IdentityPill
        player={identityPlayer}
        onPick={() => { clearIdentity(); setShowPicker(true); }}
      />

      {/* Poll bars */}
      <div className="space-y-2.5">
        {/* In block (with optional inline guest stepper) */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            border: `${myRsvp?.status === 'yes' ? 2 : 1}px solid ${myRsvp?.status === 'yes' ? STATUS_COLOR.yes : 'var(--color-border-default)'}`,
            background: 'var(--color-bg-surface)',
            boxShadow: myRsvp?.status === 'yes' ? `0 0 0 4px ${STATUS_COLOR.yes}25` : 'none',
          }}
        >
          <PollBarFilled
            status="yes"
            total={total}
            voters={yesVoters}
            mine={myRsvp?.status === 'yes'}
            count={grouped.yes.length}
            onVote={() => handleVote('yes')}
            justVoted={justVoted === 'yes'}
            // No personal guest suffix here — the hero shows the total, and
            // per-player +N badges in the attendee list cover individual guests.
          />
          {myRsvp?.status === 'yes' && (
            <GuestStepper guests={guestCount} onChange={handleGuestChange} />
          )}
        </div>

        <PollBarFilled
          status="maybe"
          total={total}
          voters={maybeVoters}
          mine={myRsvp?.status === 'maybe'}
          count={grouped.maybe.length}
          onVote={() => handleVote('maybe')}
          justVoted={justVoted === 'maybe'}
        />
        <PollBarFilled
          status="no"
          total={total}
          voters={noVoters}
          mine={myRsvp?.status === 'no'}
          count={grouped.no.length}
          onVote={() => handleVote('no')}
          justVoted={justVoted === 'no'}
        />
      </div>

      {error && (
        <div className="p-2 bg-error-bg border border-error-border rounded-lg text-error text-xs">{error}</div>
      )}

      {/* Admin row (hidden for non-admins) */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInvite}
            className="flex-1 px-3 py-2 rounded-xl bg-surface border border-border text-[12px] font-semibold text-text-primary flex items-center justify-center gap-2 hover:bg-surface-hover transition-colors"
          >
            {copiedLink ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.8 10.2a4 4 0 00-5.6 0l-4 4a4 4 0 105.6 5.6l1.1-1.1m-.7-4.9a4 4 0 005.6 0l4-4a4 4 0 00-5.6-5.6l-1.1 1.1" />
                </svg>
                Copy invite
              </>
            )}
          </button>
          <button
            onClick={() => { setAdminMode(m => !m); setAdminEditingPlayerId(null); }}
            className={`px-3 py-2 rounded-xl border text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
              adminMode
                ? 'bg-gold border-gold text-text-on-accent'
                : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8L17.6 3.6z" />
            </svg>
            {adminMode ? 'Done' : 'Admin'}
          </button>
        </div>
      )}

      {/* Attendee groups */}
      <div className="space-y-3">
        {(['yes', 'maybe', 'no'] as RsvpStatus[]).map(s => (
          grouped[s].length > 0 && (
            <div key={s}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                  {STATUS_LABEL[s]}
                  <span className="text-text-tertiary"> · {grouped[s].length}</span>
                  {s === 'yes' && yesGuestsTotal > 0 && (
                    <span className="text-gold"> · +{yesGuestsTotal} guest{yesGuestsTotal === 1 ? '' : 's'}</span>
                  )}
                </p>
              </div>
              <ul className="space-y-1">
                {grouped[s]
                  .map(r => ({ rsvp: r, p: playerMap.get(r.playerId) }))
                  .filter((x): x is { rsvp: Rsvp; p: Player } => !!x.p)
                  .sort((a, b) => a.p.name.localeCompare(b.p.name))
                  .map(({ rsvp, p }) => (
                    <AttendeeRow
                      key={rsvp.id}
                      player={p}
                      status={s}
                      guests={rsvp.guestCount}
                      mine={!!identityPlayer && p.id === identityPlayer.id}
                      adminMode={adminMode}
                      setByAdmin={!!rsvp.setByUserId}
                      onAdminEdit={() => setAdminEditingPlayerId(adminEditingPlayerId === p.id ? null : p.id)}
                      onAdminClear={() => handleAdminClear(p.id)}
                    />
                  ))}
              </ul>
            </div>
          )
        ))}

        {rsvps.length === 0 && !loading && (
          <p className="text-xs text-text-tertiary text-center py-2">No RSVPs yet — be the first.</p>
        )}

        {/* No-response — admin mode only */}
        {adminMode && notResponded.length > 0 && rsvps.length > 0 && (
          <div>
            <button
              onClick={() => setShowNoResponses(v => !v)}
              className="w-full flex items-center justify-between px-1 py-1 text-[10px] uppercase tracking-wider text-text-tertiary font-semibold hover:text-text-secondary transition-colors"
            >
              <span>No response · {notResponded.length}</span>
              <svg
                className={`w-3 h-3 transition-transform ${showNoResponses ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showNoResponses && (
              <ul className="space-y-1 mt-1">
                {notResponded
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(p => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface/60"
                      style={{ borderLeft: '2px solid var(--color-border-default)' }}
                    >
                      <div className="opacity-60">
                        <PlayerAvatar subject={p} size={28} />
                      </div>
                      <span className="text-[13px] text-text-tertiary truncate flex-1">{p.name}</span>
                      <button
                        onClick={() => setAdminEditingPlayerId(adminEditingPlayerId === p.id ? null : p.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary hover:bg-surface-active transition-colors"
                      >
                        Set
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Admin override panel */}
      {isAdmin && adminMode && adminEditingPlayerId && playerMap.get(adminEditingPlayerId) && (
        <AdminOverridePanel
          player={playerMap.get(adminEditingPlayerId)!}
          existing={rsvps.find(r => r.playerId === adminEditingPlayerId) || null}
          submitting={submitting}
          onSubmit={(status, guests) => {
            handleAdminSet(adminEditingPlayerId, status, guests);
            setAdminEditingPlayerId(null);
          }}
          onCancel={() => setAdminEditingPlayerId(null)}
        />
      )}

      {showPicker && (
        <PlayerPickerModal
          players={players}
          onPick={handlePickerPicked}
          onClose={() => { setShowPicker(false); setPendingRsvp(null); }}
          onPlayerCreated={() => { onPlayersChanged?.(); }}
          title={pendingRsvp ? 'First — who are you?' : 'Pick your player'}
          subtitle={pendingRsvp
            ? "We need to know which player to RSVP for. We'll remember on this device."
            : "We'll remember this on this device. Sign in from your profile to sync across devices."}
        />
      )}
    </div>
  );
}

function AdminOverridePanel({
  player,
  existing,
  submitting,
  onSubmit,
  onCancel,
}: {
  player: Player;
  existing: Rsvp | null;
  submitting: boolean;
  onSubmit: (status: RsvpStatus, guests: number) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<RsvpStatus>(existing?.status ?? 'yes');
  const [guests, setGuests] = useState<number>(existing?.guestCount ?? 0);

  return (
    <div className="p-3 rounded-xl border border-gold/40 bg-surface">
      <p className="text-[11px] text-text-tertiary mb-2">
        Set RSVP for <span className="text-text-primary font-semibold">{player.name}</span>
      </p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {(['yes', 'maybe', 'no'] as RsvpStatus[]).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors"
            style={{
              borderColor: status === s ? STATUS_COLOR[s] : 'var(--color-border-default)',
              background: status === s ? `${STATUS_COLOR[s]}25` : 'var(--color-bg-surface-raised)',
              color: status === s ? STATUS_COLOR[s] : 'var(--color-text-primary)',
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {status === 'yes' && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-text-secondary">Guests:</label>
          <input
            type="text"
            inputMode="numeric"
            value={String(guests)}
            onChange={(e) => setGuests(Math.max(0, Math.min(GUEST_MAX, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)))}
            className="w-16 px-2 py-1 bg-surface-raised border border-border rounded-lg text-sm text-text-primary outline-none"
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 px-3 py-1.5 text-xs bg-surface-raised text-text-primary rounded-lg hover:bg-surface-active disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(status, status === 'yes' ? guests : 0)}
          disabled={submitting}
          className="flex-1 px-3 py-1.5 text-xs bg-gold text-text-on-accent rounded-lg hover:bg-gold-hover disabled:opacity-50 transition-colors font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
}
