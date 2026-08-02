import { useEffect, useState } from 'react';
import { fetchTurnout, TurnoutResponse, RsvpBucket } from '../api/stats';

// Admin-only turnout projection. Rendered above the poll on the RSVP tab.
// Deliberately not public: a low projection shown to the group depresses the
// turnout it predicts, and per-player show rates would be corrosive in a chat.

const BUCKET_LABEL: Record<RsvpBucket, string> = {
  yes: 'In',
  maybe: 'Maybe',
  no: 'Out',
  silent: 'No reply',
};

const BUCKET_NOTE: Record<RsvpBucket, string> = {
  yes: 'of those who said In',
  maybe: 'Maybes who convert',
  no: 'said Out, come anyway',
  silent: 'ghosts — show without replying',
};

const BUCKET_COLOR: Record<RsvpBucket, string> = {
  yes: 'text-green-400',
  maybe: 'text-gold',
  no: 'text-red-400',
  silent: 'text-blue-400',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function TurnoutProjection({ gameId }: { gameId: string }) {
  const [data, setData] = useState<TurnoutResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  useEffect(() => {
    let live = true;
    fetchTurnout(gameId)
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [gameId]);

  // Silent on failure — a non-admin hitting this gets a 403 and should simply
  // see the poll exactly as it looks today.
  if (failed || !data) return null;

  if (!data.sufficientData) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-semibold">Turnout projection</p>
        <p className="text-xs text-text-secondary mt-1.5">
          Only {data.totalTrackedGames} tracked game{data.totalTrackedGames === 1 ? '' : 's'} of history — too
          thin to project from. This fills in as more games are tracked.
        </p>
      </div>
    );
  }

  const isThin = data.thinThreshold !== null && data.expected < data.thinThreshold;

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-semibold">Turnout projection</p>
        <span className="text-[9px] uppercase tracking-wider font-bold text-gold border border-gold/40 rounded px-1.5 py-0.5">
          Admin only
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`text-5xl font-bold tabular-nums leading-none ${isThin ? 'text-red-400' : 'text-text-primary'}`}>
          {Math.round(data.expected)}
        </span>
        <div className="flex-1">
          <p className="text-xs text-text-secondary">
            likely {Math.round(data.low)}–{Math.round(data.high)}
          </p>
          {data.seasonMedian !== null && (
            <p className="text-xs text-text-tertiary mt-1">
              {(() => {
                const delta = Math.round(data.expected) - data.seasonMedian;
                if (delta === 0) return `right on your usual ${data.seasonMedian}`;
                return `${Math.abs(delta)} ${delta < 0 ? 'below' : 'above'} your usual ${data.seasonMedian}`;
              })()}
            </p>
          )}
        </div>
      </div>

      {isThin && data.probThin !== null && (
        <p className="mt-2.5 text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-2.5 py-1.5">
          Thin week — {Math.round(data.probThin * 100)}% chance of coming in under {data.thinThreshold},
          your quietest 10% of games. Worth a nudge.
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-border space-y-1">
        {data.breakdown.filter(b => b.count > 0).map(b => (
          <div key={b.bucket} className="flex items-baseline gap-2 text-[11px]">
            <span className={`w-16 shrink-0 font-semibold ${BUCKET_COLOR[b.bucket]}`}>{BUCKET_LABEL[b.bucket]}</span>
            <span className="text-text-tertiary tabular-nums w-8 shrink-0">{b.count}</span>
            <span className="text-text-secondary tabular-nums w-12 shrink-0">→ {round1(b.expected)}</span>
            <span className="text-text-tertiary truncate">
              {Math.round(b.baseRate * 100)}% {BUCKET_NOTE[b.bucket]}
            </span>
          </div>
        ))}
        {data.expectedGuests > 0 && (
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="w-16 shrink-0 font-semibold text-gold">Guests</span>
            <span className="text-text-tertiary tabular-nums w-8 shrink-0">{data.guestsIndicated}</span>
            <span className="text-text-secondary tabular-nums w-12 shrink-0">→ {round1(data.expectedGuests)}</span>
            <span className="text-text-tertiary truncate">
              flagged + {round1(data.unflaggedGuestsPerGame)}/game who never get flagged
            </span>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowPlayers(v => !v)}
        className="mt-2.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
      >
        {showPlayers ? '▾' : '▸'} Per-player likelihood
      </button>

      {showPlayers && (
        <div className="mt-2 space-y-0.5 max-h-64 overflow-y-auto">
          {data.players.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-[11px]">
              <span className="text-text-primary truncate flex-1">{p.name}</span>
              <span className={`shrink-0 ${BUCKET_COLOR[p.bucket]}`}>{BUCKET_LABEL[p.bucket]}</span>
              <span className="text-text-secondary tabular-nums w-9 text-right shrink-0">
                {Math.round(p.probability * 100)}%
              </span>
              {/* n = 0 means the figure is purely the league average for their
                  bucket, not a read on them personally. Say so rather than
                  letting a newcomer look judged. */}
              <span className="text-text-tertiary w-10 text-right shrink-0 text-[9px]">
                {p.n === 0 ? 'avg' : `n=${p.n}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-[10px] text-text-tertiary">
        Based on {data.totalTrackedGames} tracked games. Don't paste this into the group — telling people
        turnout looks low is a good way to make it low.
      </p>
    </div>
  );
}
