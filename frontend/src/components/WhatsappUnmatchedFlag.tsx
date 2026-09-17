import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Player } from '../api/players';
import { fetchGuests, type Guest } from '../api/guests';
import { getUnmatchedVotes, resolveUnmatched, type UnmatchedVote } from '../api/whatsapp';

interface Props {
  gameId: string;
  players: Player[];
  /** Slot player id -> the guest's name in THIS game, for labelling the slots. */
  guestNamesBySlot?: Record<string, string | null>;
  onResolved?: () => void;
}

/** A GuestN pool slot rather than a person. */
const isGuestSlot = (name: string) => /^Guest\s*\d+$/i.test(name.trim());

/**
 * Admin-only flag surfaced on a game's RSVP tab: WhatsApp poll votes for this
 * game from numbers not yet linked to a player. Resolve inline (assign a number
 * to a player) and the vote is attributed into this game's RSVPs.
 */
export default function WhatsappUnmatchedFlag({ gameId, players, guestNamesBySlot, onResolved }: Props) {
  const [unmatched, setUnmatched] = useState<UnmatchedVote[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { members, slots } = useMemo(() => ({
    members: players.filter((p) => !isGuestSlot(p.name)),
    slots: players.filter((p) => isGuestSlot(p.name)),
  }), [players]);

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

  useEffect(() => {
    fetchGuests().then(setGuests).catch(() => setGuests([]));
  }, []);

  // value is "p:<playerId>" or "g:<guestId>" — a guest is not a player, and
  // linking her number to the GuestN slot she sat in would bind it permanently
  // to a slot somebody else uses next week.
  const handleResolve = async (phone: string, value: string) => {
    if (!value) return;
    const [kind, id] = [value.slice(0, 1), value.slice(2)];
    setBusy(phone);
    setError(null);
    try {
      await resolveUnmatched(phone, kind === 'g' ? { guestId: id } : { playerId: id });
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
      <p className="text-xs text-text-tertiary mt-0.5 mb-2">
        Link each number to a member or a named guest to count their vote. A guest keeps her own
        number, and is given a free guest slot in each game she votes for.
      </p>

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
              {guests.length > 0 && (
                <optgroup label="Guests">
                  {guests.map((g) => (
                    <option key={g.id} value={`g:${g.id}`}>{g.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Members">
                {members.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                ))}
              </optgroup>
              {slots.length > 0 && (
                <optgroup label="Guest slots (this game only)">
                  {slots.map((p) => {
                    const named = guestNamesBySlot?.[p.id];
                    return (
                      <option key={p.id} value={`p:${p.id}`}>
                        {named ? `${p.name} · ${named}` : p.name}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
