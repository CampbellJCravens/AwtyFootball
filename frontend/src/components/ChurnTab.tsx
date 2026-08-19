import { useEffect, useState } from 'react';
import { fetchChurn, ChurnResponse, ChurnRow } from '../api/stats';

/**
 * Who has quietly stopped turning up.
 *
 * ADMIN ONLY, permanently — mounted behind the same gate as Reliability. This is
 * meant to prompt a private word or a roster decision, not to publish anyone's
 * absence to the club. Do not surface any of it publicly.
 *
 * Deliberately DESCRIPTIVE: it reports and links out. It does not propose
 * marking anyone Former, because that is a dues-year decision with money
 * attached, not something a 28-day timer should suggest.
 */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Row({ row }: { row: ChurnRow }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-border/60 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{row.name}</div>
        <div className="text-[11px] text-text-tertiary">
          {row.games} game{row.games === 1 ? '' : 's'} · last {fmt(row.lastSeen)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-sm font-bold tabular-nums ${row.daysSinceLastSeen >= 84 ? 'text-red-400' : 'text-yellow-400'}`}>
          {row.daysSinceLastSeen}d
        </div>
        <div className="text-[10px] uppercase tracking-wide text-text-tertiary">away</div>
      </div>
    </div>
  );
}

export default function ChurnTab() {
  const [data, setData] = useState<ChurnResponse | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchChurn().then(setData).catch(() => setError("Couldn't load attendance history."));
  }, []);

  if (error) return <p className="text-sm text-text-tertiary px-1">{error}</p>;
  if (!data) return <p className="text-sm text-text-tertiary px-1">Loading…</p>;

  const active = data.rows.filter(r => r.onRoster && !r.quiet);

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-xl bg-surface/40 p-3">
        <h3 className="text-sm font-bold text-text-primary">Quiet regulars</h3>
        <p className="text-[11px] text-text-tertiary mt-0.5">
          On the roster, 5+ games played, not seen in 28 days. Measured against the last game
          played ({fmt(data.asOf)}), not today.
        </p>
        <div className="mt-2">
          {data.quiet.length === 0
            ? <p className="text-sm text-text-tertiary py-2">Nobody has gone quiet. Everyone on the roster has been recently.</p>
            : data.quiet.map(r => <Row key={r.playerId} row={r} />)}
        </div>
        {data.quiet.length > 0 && (
          <p className="text-[11px] text-text-tertiary mt-2 pt-2 border-t border-border/60">
            A long gap is not the same as having left. Marking someone a prior member is a
            roster and dues decision — do it on the Players page when you know.
          </p>
        )}
      </div>

      <div className="border border-border rounded-xl bg-surface/40 overflow-hidden">
        <button onClick={() => setShowAll(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Everyone else on the roster</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">{active.length} players, most recently absent first</p>
          </div>
          <svg className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${showAll ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showAll && <div className="px-3 pb-3">{active.map(r => <Row key={r.playerId} row={r} />)}</div>}
      </div>
    </div>
  );
}
