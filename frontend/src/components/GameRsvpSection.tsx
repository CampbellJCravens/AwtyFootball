import { CSSProperties, useCallback, useEffect, useState } from 'react';
import { RsvpStatus, GamePoll, GamePollEntry, fetchGamePoll } from '../api/rsvps';

interface GameRsvpSectionProps {
  gameId: string;
  // Bump to force a refetch (e.g. after an admin links a number to a player).
  refreshSignal?: number;
}

const STATUS_LABEL: Record<RsvpStatus, string> = { yes: 'In', maybe: 'Maybe', no: 'Out' };
const STATUS_COLOR: Record<RsvpStatus, string> = { yes: '#22c55e', maybe: '#f59e0b', no: '#ef4444' };
const STATUS_TEXT: Record<RsvpStatus, string> = { yes: 'text-green-400', maybe: 'text-gold', no: 'text-red-400' };

// Hash a key → hue so avatars without a picture stay recognisable across renders.
function toneFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  return Math.abs(hash) % 360;
}

function EntryAvatar({ entry, size = 22, ring }: { entry: GamePollEntry; size?: number; ring?: string }) {
  const baseStyle: CSSProperties = { width: size, height: size };
  if (ring) baseStyle.boxShadow = `0 0 0 2px ${ring}`;

  if (entry.pictureUrl) {
    return (
      <img
        src={entry.pictureUrl}
        alt={entry.name}
        className="rounded-full object-cover flex-shrink-0"
        style={baseStyle}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{
        ...baseStyle,
        fontSize: Math.max(9, Math.floor(size * 0.42)),
        background: `oklch(0.55 0.07 ${toneFromId(entry.key)})`,
      }}
    >
      {entry.name.charAt(0).toUpperCase()}
    </div>
  );
}

function AvatarPile({ entries, max = 6, size = 20, ring = 'var(--color-bg-surface)' }: {
  entries: GamePollEntry[]; max?: number; size?: number; ring?: string;
}) {
  const shown = entries.slice(0, max);
  const extra = Math.max(0, entries.length - max);
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((e) => <EntryAvatar key={e.key} entry={e} size={size} ring={ring} />)}
      {extra > 0 && (
        <div
          className="rounded-full flex items-center justify-center bg-surface-active text-text-primary font-semibold flex-shrink-0"
          style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.36)), boxShadow: `0 0 0 2px ${ring}` }}
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
              <>{' · '}<span className="text-gold">+{guestCount} guest{guestCount === 1 ? '' : 's'}</span></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function PollBar({ status, entries, total }: { status: RsvpStatus; entries: GamePollEntry[]; total: number }) {
  const color = STATUS_COLOR[status];
  const pct = total > 0 ? (entries.length / total) * 100 : 0;
  const minPct = entries.length > 0 ? Math.max(pct, 8) : 0;
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface)' }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{ width: `${minPct}%`, background: `linear-gradient(90deg, ${color}30, ${color}12)` }}
      />
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="relative px-3.5 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={`text-[15px] font-bold ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status]}</span>
          <div className="mt-1.5 min-h-[22px]">
            {entries.length > 0 ? (
              <AvatarPile entries={entries} max={6} size={20} />
            ) : (
              <span className="text-[11px] text-text-tertiary">No votes yet</span>
            )}
          </div>
        </div>
        <div className="text-2xl font-bold text-text-primary tabular-nums leading-none shrink-0">{entries.length}</div>
      </div>
    </div>
  );
}

function AttendeeRow({ entry, status }: { entry: GamePollEntry; status: RsvpStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface/60" style={{ borderLeft: `2px solid ${color}` }}>
      <EntryAvatar entry={entry} size={28} />
      <span className="text-[13px] text-text-primary truncate flex-1">
        {entry.name}
        {!entry.linked && <span className="text-[10px] text-text-tertiary ml-1">(unlinked)</span>}
      </span>
      {status === 'yes' && entry.guestCount > 0 && (
        <span className="text-[10px] font-semibold text-gold bg-gold/15 px-1.5 py-0.5 rounded">+{entry.guestCount}</span>
      )}
    </li>
  );
}

export default function GameRsvpSection({ gameId, refreshSignal }: GameRsvpSectionProps) {
  const [poll, setPoll] = useState<GamePoll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPoll(await fetchGamePoll(gameId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load poll');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !poll) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold" />
      </div>
    );
  }

  if (error) {
    return <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>;
  }

  if (!poll) return null;

  const buckets: { status: RsvpStatus; entries: GamePollEntry[] }[] = [
    { status: 'yes', entries: poll.in },
    { status: 'maybe', entries: poll.maybe },
    { status: 'no', entries: poll.out },
  ];
  const total = poll.counts.in + poll.counts.maybe + poll.counts.out;

  return (
    <div className="space-y-4">
      <TotalComingHero inCount={poll.counts.in} guestCount={poll.guestTotal} />

      <p className="text-[11px] text-text-tertiary text-center -mt-1">
        {poll.source === 'poll' ? 'Results from the WhatsApp poll' : 'Saved RSVPs'} · view only
      </p>

      <div className="space-y-2.5">
        {buckets.map((b) => <PollBar key={b.status} status={b.status} entries={b.entries} total={total} />)}
      </div>

      {total === 0 ? (
        <p className="text-xs text-text-tertiary text-center py-2">
          No votes yet. Votes from the WhatsApp poll appear here automatically.
        </p>
      ) : (
        <div className="space-y-3">
          {buckets.map((b) => b.entries.length > 0 && (
            <div key={b.status}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                  {STATUS_LABEL[b.status]}
                  <span className="text-text-tertiary"> · {b.entries.length}</span>
                  {b.status === 'yes' && poll.guestTotal > 0 && (
                    <span className="text-gold"> · +{poll.guestTotal} guest{poll.guestTotal === 1 ? '' : 's'}</span>
                  )}
                </p>
              </div>
              <ul className="space-y-1">
                {b.entries.map((e) => <AttendeeRow key={e.key} entry={e} status={b.status} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
