import { useEffect, useMemo, useState } from 'react';
import { Player } from '../api/players';
import { GuestLedgerRow, fetchGuestLedger } from '../api/guests';

interface GuestLedgerTabProps {
  players: Player[];
}

type SortKey = 'visits' | 'name' | 'lastSeen';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

// Guest appearances, for chasing dues. The guest is the unit of collection —
// one row per person, sorted by how often they've turned up. "Usual host" is
// context for who to nudge, not a second thing to total.
export default function GuestLedgerTab({ players }: GuestLedgerTabProps) {
  const [rows, setRows] = useState<GuestLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('visits');

  useEffect(() => {
    fetchGuestLedger()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load guest ledger'))
      .finally(() => setLoading(false));
  }, []);

  const playerNames = useMemo(
    () => new Map(players.map(p => [p.id, p.name])),
    [players]
  );

  // The unnamed aggregate always sinks to the bottom whatever the sort — it
  // reconciles the count, it isn't someone you can chase.
  const sorted = useMemo(() => {
    const named = rows.filter(r => r.guestId !== null);
    const unnamed = rows.filter(r => r.guestId === null);
    const cmp = (a: GuestLedgerRow, b: GuestLedgerRow) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'lastSeen') return (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '');
      return b.visits - a.visits || a.name.localeCompare(b.name);
    };
    return [...named.sort(cmp), ...unnamed];
  }, [rows, sortKey]);

  const namedTotal = useMemo(
    () => rows.filter(r => r.guestId !== null).reduce((s, r) => s + r.visits, 0),
    [rows]
  );
  const unnamedTotal = useMemo(
    () => rows.filter(r => r.guestId === null).reduce((s, r) => s + r.visits, 0),
    [rows]
  );

  if (loading) return <div className="text-center py-8 text-text-tertiary text-sm">Loading guests…</div>;
  if (error) return <div className="p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">{error}</div>;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        No guest appearances recorded yet. Name a guest when you add them to a team and they'll show up here.
      </div>
    );
  }

  const sortButton = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
        sortKey === key ? 'bg-accent text-text-on-accent' : 'bg-surface-raised text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-xl bg-surface/40 px-3 py-2.5">
        <p className="text-[11px] text-text-tertiary">
          Appearances by guest across all games. A guest in two slots in one game still counts once.
          <strong className="text-text-secondary"> Billable = visits beyond the first 2 free games.</strong>
          {' '}Unnamed visits can't count toward anyone's trial, so they never become billable.
          {unnamedTotal > 0 && ` ${namedTotal} named · ${unnamedTotal} unnamed.`}
        </p>
      </div>

      <div className="flex gap-1.5">
        {sortButton('visits', 'Most visits')}
        {sortButton('lastSeen', 'Recent')}
        {sortButton('name', 'Name')}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-tertiary text-[11px] uppercase tracking-wide">
              <th className="text-left font-medium py-2 pr-2">Guest</th>
              <th className="text-right font-medium py-2 px-2">Visits</th>
              <th className="text-right font-medium py-2 px-2" title="Visits beyond the 2 free trial games">Billable</th>
              <th className="text-left font-medium py-2 px-2 whitespace-nowrap">First</th>
              <th className="text-left font-medium py-2 px-2 whitespace-nowrap">Last</th>
              <th className="text-left font-medium py-2 pl-2">Usual host</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.guestId ?? '__unnamed__'}
                className={`border-t border-border ${row.guestId === null ? 'text-text-tertiary italic' : ''}`}
              >
                <td className="py-2 pr-2 text-text-primary font-medium">{row.name}</td>
                <td className="py-2 px-2 text-right tabular-nums text-text-secondary">{row.visits}</td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold text-gold">
                  {row.billableVisits === null ? '—' : row.billableVisits}
                </td>
                <td className="py-2 px-2 text-text-secondary whitespace-nowrap">{fmtDate(row.firstSeen)}</td>
                <td className="py-2 px-2 text-text-secondary whitespace-nowrap">{fmtDate(row.lastSeen)}</td>
                <td className="py-2 pl-2 text-text-secondary">
                  {row.usualHostId ? (
                    <>
                      {playerNames.get(row.usualHostId) ?? 'Unknown'}
                      {row.usualHostVisits < row.visits && (
                        <span className="text-text-tertiary text-xs"> ({row.usualHostVisits})</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
