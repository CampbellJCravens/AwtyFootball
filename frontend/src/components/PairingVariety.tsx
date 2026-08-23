import { useEffect, useState } from 'react';
import { fetchPairingVariety, PairingVarietyResponse, PairRow } from '../api/stats';

// Admin-only, directly under the turnout projection on the RSVP tab. The
// projection says how many are coming; this says who to put with whom.
//
// It deliberately does not rate anyone. The owner rejected ability ratings on
// 2026-08-22 ("you have to learn to play through adversity to understand how to
// play with different teammates") and this serves that principle instead of
// fighting it: it surfaces habit, so pairing can be a choice.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Dec 20", or "Dec 20 '25" when it isn't this year — an eight-month-old date
// is the whole point of a row, so the year has to be legible.
function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const [y, m, d] = iso.split('-').map(Number);
  const label = `${MONTHS[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label} '${String(y).slice(2)}`;
}

function firstNameish(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 && parts[0].length <= 2 ? parts.slice(0, 2).join(' ') : parts[0];
}

function PairLine({ pair, cold }: { pair: PairRow; cold: boolean }) {
  return (
    <div className="flex items-baseline gap-2 border-t border-border py-2 first:border-t-0">
      <span className="flex-1 min-w-0 truncate text-[13px] text-text-primary">
        {firstNameish(pair.aName)} + {firstNameish(pair.bName)}
      </span>
      <span className={`text-[11px] whitespace-nowrap ${cold ? 'text-gold font-semibold' : 'text-text-secondary'}`}>
        {formatWhen(pair.lastTogether)}
      </span>
      <span className="text-[11px] whitespace-nowrap tabular-nums text-text-tertiary">
        {pair.sharedGames}/{pair.coAttended}
      </span>
    </div>
  );
}

export default function PairingVariety({ gameId }: { gameId: string }) {
  const [data, setData] = useState<PairingVarietyResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    fetchPairingVariety(gameId)
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [gameId]);

  // Silent on failure, matching the projection above: a non-admin gets a 403
  // and should simply see the poll as it looks today.
  if (failed || !data) return null;
  if (data.variety.length === 0) return null;

  // Gold marks only the genuinely cold end. Half the list glowing is not a
  // signal, so this caps at two regardless of how many rows are stale.
  const coldCount = Math.min(2, data.variety.filter(p => !p.lastTogether || p.sharedGames / p.coAttended <= 0.25).length);

  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-baseline gap-2">
        <p className="text-[11px] uppercase tracking-wider text-text-tertiary font-semibold">Worth pairing up</p>
        <p className="ml-auto text-[11px] text-text-tertiary">{data.candidates} replied</p>
      </div>

      <div className="mt-1.5">
        {data.variety.map((pair, i) => (
          <PairLine key={`${pair.aId}-${pair.bId}`} pair={pair} cold={i < coldCount} />
        ))}
      </div>

      {data.stuck.length > 0 && (
        <p className="mt-2.5 border-t border-dashed border-border pt-2 text-[11px] leading-relaxed text-text-tertiary">
          Joined at the hip:{' '}
          {data.stuck.map((p, i) => (
            <span key={`${p.aId}-${p.bId}`}>
              {i > 0 && ' · '}
              <span className="text-text-secondary">
                {firstNameish(p.aName)} + {firstNameish(p.bName)} {p.sharedGames} of {p.coAttended}
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
