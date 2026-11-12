import { useEffect, useState } from 'react';
import { fetchGuestHosting, GuestHosting } from '../api/guests';

// Guests each member said they'd bring (the +1/+2 on their RSVP) against the
// guests recorded with them as host. Collapsed by default; the summary line
// carries the totals.
export default function GuestHostingCard() {
  const [data, setData] = useState<GuestHosting | null>(null);

  useEffect(() => {
    fetchGuestHosting().then(setData).catch(() => setData(null));
  }, []);

  if (!data || !data.since || data.rows.length === 0) return null;

  const promised = data.rows.reduce((n, r) => n + r.promised, 0);
  const brought = data.rows.reduce((n, r) => n + r.brought, 0);
  const since = new Date(data.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <details className="border border-border rounded-xl bg-surface/40 px-3 py-2.5">
      <summary className="cursor-pointer text-[11px] font-semibold text-text-primary uppercase tracking-wide">
        Guests promised vs brought · {promised} promised · {brought} brought
      </summary>
      <p className="mt-2 text-[11px] text-text-tertiary">
        {data.games} games since {since}, when hosts started being recorded. Promised is the +1/+2 on a
        member's own RSVP; brought is guests recorded with them as host.
        {data.unhostedVisits > 0 && ` ${data.unhostedVisits} guest visit${data.unhostedVisits === 1 ? '' : 's'} had no host recorded and count for nobody.`}
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-text-tertiary">
            <th className="py-1 font-medium">Host</th>
            <th className="py-1 text-right font-medium">Promised</th>
            <th className="py-1 text-right font-medium">Brought</th>
            <th className="py-1 text-right font-medium">Kept</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.playerId} className="border-t border-border/60 text-text-secondary">
              <td className="py-1 text-text-primary">{r.name}</td>
              <td className="py-1 text-right tabular-nums">{r.promised}</td>
              <td className="py-1 text-right tabular-nums">
                {r.brought}
                {r.unannounced > 0 && <span className="text-text-tertiary"> ({r.unannounced} unannounced)</span>}
              </td>
              <td className="py-1 text-right tabular-nums">
                {r.gamesPromised > 0 ? `${r.gamesKept}/${r.gamesPromised}` : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
