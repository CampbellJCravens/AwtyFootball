import { useEffect, useMemo, useState } from 'react';
import { fetchReliability, ReliabilityPlayer } from '../api/stats';

const MIN_GAMES = 5; // "In" votes needed before the reliability % is meaningful

type SortKey = 'reliability' | 'noShow' | 'ghost' | 'response';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

// Reliability colour: green = dependable, amber = shaky, red = flaky.
const relColor = (rate: number | null) => {
  if (rate === null) return 'text-text-tertiary';
  if (rate >= 0.9) return 'text-emerald-400';
  if (rate >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
};

export default function ReliabilityTab() {
  const [players, setPlayers] = useState<ReliabilityPlayer[]>([]);
  const [totalTracked, setTotalTracked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('reliability');

  useEffect(() => {
    fetchReliability()
      .then(data => { setPlayers(data.players); setTotalTracked(data.totalTrackedGames); })
      .catch(() => setError('Could not load reliability stats.'))
      .finally(() => setLoading(false));
  }, []);

  // Reliability needs per-person RSVPs. Until players start RSVPing in the app
  // (or an admin backfills from a screenshot), there's no In/Out data to score.
  const hasRsvpData = useMemo(() => players.some(p => p.responded > 0), [players]);

  // Attendance leaderboard — works today, straight from the Color/White rosters.
  const attendance = useMemo(
    () => [...players].filter(p => p.showed > 0).sort((a, b) => b.showed - a.showed),
    [players]
  );

  const guestBoard = useMemo(
    () => players.filter(p => p.guestsBrought > 0).sort((a, b) => b.guestsBrought - a.guestsBrought),
    [players]
  );
  const totalGuests = useMemo(() => players.reduce((s, p) => s + p.guestsBrought, 0), [players]);
  const maxGuests = guestBoard[0]?.guestsBrought ?? 0;

  const reliabilityRows = useMemo(() => {
    const filtered = qualifiedOnly ? players.filter(p => p.committed >= MIN_GAMES) : players;
    const sorted = [...filtered];
    const nullLast = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
    switch (sortKey) {
      case 'reliability': sorted.sort((a, b) => nullLast(a.showWhenCommittedRate) - nullLast(b.showWhenCommittedRate)); break;
      case 'noShow':      sorted.sort((a, b) => b.noShow - a.noShow); break;
      case 'ghost':       sorted.sort((a, b) => b.ghost - a.ghost); break;
      case 'response':    sorted.sort((a, b) => nullLast(a.responseRate) - nullLast(b.responseRate)); break;
    }
    return sorted;
  }, [players, qualifiedOnly, sortKey]);

  if (loading) return <p className="text-text-tertiary text-center py-8 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-center py-8 text-sm">{error}</p>;

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => setSortKey(k)}
      className={`py-1.5 px-1 font-semibold cursor-pointer select-none whitespace-nowrap text-right ${
        sortKey === k ? 'text-gold' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}{sortKey === k ? ' ▾' : ''}
    </th>
  );

  const maxShowed = attendance[0]?.showed ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Attendance (live today) ── */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-0.5">Attendance</h3>
        <p className="text-[11px] text-text-tertiary mb-3">
          Who actually shows up, from the Color/White roster across{' '}
          <span className="text-gold font-semibold">{totalTracked}</span> tracked game{totalTracked === 1 ? '' : 's'}. Admin-only.
        </p>
        {attendance.length === 0 ? (
          <p className="text-text-tertiary text-center py-6 text-sm">No roster data yet.</p>
        ) : (
          <div className="space-y-1">
            {attendance.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-[12px] text-text-primary truncate w-32 shrink-0">{p.name}</span>
                <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400/80"
                    style={{ width: `${maxShowed ? (p.showed / maxShowed) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-text-secondary w-20 text-right shrink-0 tabular-nums">
                  {p.showed} · {pct(p.attendanceRate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Guests / Invites ── */}
      {guestBoard.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-0.5">Guests / Invites</h3>
          <p className="text-[11px] text-text-tertiary mb-3">
            <span className="text-gold font-semibold">{totalGuests}</span> guest head{totalGuests === 1 ? '' : 's'} invited.
            Who brings extra people, and how often.
          </p>
          <div className="space-y-1">
            {guestBoard.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-[12px] text-text-primary truncate w-32 shrink-0">{p.name}</span>
                <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gold/80"
                    style={{ width: `${maxGuests ? (p.guestsBrought / maxGuests) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-text-secondary w-24 text-right shrink-0 tabular-nums">
                  {p.guestsBrought} · {p.gamesWithGuests} game{p.gamesWithGuests === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reliability (fills as in-app RSVPs accrue) ── */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-0.5">Reliability</h3>
        <p className="text-[11px] text-text-tertiary mb-3">
          <span className="text-gold font-semibold">Rely%</span> = showed ÷ said-In ·{' '}
          <span className="font-semibold">No-show</span> = said In, didn't come ·{' '}
          <span className="font-semibold">Ghost</span> = came without saying In.
        </p>

        {!hasRsvpData ? (
          <div className="p-3 rounded-lg border border-gold/40 bg-gold/5 text-[12px] text-text-secondary">
            No in-app RSVP data yet. Reliability starts filling once players RSVP via the app link
            (already in the WhatsApp share) — or when an admin backfills a game from a screenshot using
            the poll's per-player controls. Attendance above works from rosters in the meantime.
          </div>
        ) : (
          <>
            <button
              onClick={() => setQualifiedOnly(v => !v)}
              className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                qualifiedOnly
                  ? 'bg-gold text-text-on-accent'
                  : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {qualifiedOnly ? `Min ${MIN_GAMES} "In" votes` : 'Showing everyone'}
            </button>
            {reliabilityRows.length === 0 ? (
              <p className="text-text-tertiary text-center py-6 text-sm">
                No players with {MIN_GAMES}+ "In" votes yet — tap the filter to show everyone.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-gold">
                      <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Player</th>
                      <Th k="reliability" label="Rely%" />
                      <Th k="noShow" label="No-show" />
                      <Th k="ghost" label="Ghost" />
                      <Th k="response" label="Resp%" />
                    </tr>
                  </thead>
                  <tbody>
                    {reliabilityRows.map(p => (
                      <tr key={p.id} className="border-b border-border hover:bg-surface-hover even:bg-surface-hover/40">
                        <td className="py-1.5 px-1 text-text-primary truncate max-w-[120px]">{p.name}</td>
                        <td className={`py-1.5 px-1 text-right font-semibold ${relColor(p.showWhenCommittedRate)}`}>
                          {pct(p.showWhenCommittedRate)}
                          <span className="text-text-tertiary font-normal text-[10px] ml-0.5">/{p.committed}</span>
                        </td>
                        <td className={`py-1.5 px-1 text-right ${p.noShow > 0 ? 'text-red-400 font-medium' : 'text-text-tertiary'}`}>
                          {p.noShow || '—'}
                        </td>
                        <td className={`py-1.5 px-1 text-right ${p.ghost > 0 ? 'text-blue-400' : 'text-text-tertiary'}`}>
                          {p.ghost || '—'}
                        </td>
                        <td className="py-1.5 px-1 text-right text-text-secondary">{pct(p.responseRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
