import { ReactNode, useEffect, useMemo, useState } from 'react';
import { fetchReliability, ReliabilityPlayer } from '../api/stats';

const MIN_GAMES = 5; // "In" votes needed before the reliability % is meaningful

type SortKey = 'reliability' | 'noShow' | 'ghost' | 'response';
type SortDir = 'asc' | 'desc';
type SectionId = 'attendance' | 'guests' | 'reliability';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

const relColor = (rate: number | null) => {
  if (rate === null) return 'text-text-tertiary';
  if (rate >= 0.9) return 'text-emerald-400';
  if (rate >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
};

function Section({
  title, subtitle, open, onToggle, children,
}: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl bg-surface/40 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          {subtitle && <p className="text-[11px] text-text-tertiary mt-0.5">{subtitle}</p>}
        </div>
        <svg
          className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export default function ReliabilityTab() {
  const [players, setPlayers] = useState<ReliabilityPlayer[]>([]);
  const [totalTracked, setTotalTracked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('reliability');
  const [sortDir, setSortDir] = useState<SortDir>('asc'); // asc = worst-first, the actionable end
  const [open, setOpen] = useState<Record<SectionId, boolean>>({ attendance: true, guests: true, reliability: true });

  const toggle = (id: SectionId) => setOpen(o => ({ ...o, [id]: !o[id] }));

  useEffect(() => {
    fetchReliability()
      .then(data => { setPlayers(data.players); setTotalTracked(data.totalTrackedGames); })
      .catch(() => setError('Could not load reliability stats.'))
      .finally(() => setLoading(false));
  }, []);

  const hasRsvpData = useMemo(() => players.some(p => p.responded > 0), [players]);

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
    const dir = sortDir === 'asc' ? 1 : -1;
    const nullLast = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
    const cmp: Record<SortKey, (a: ReliabilityPlayer, b: ReliabilityPlayer) => number> = {
      reliability: (a, b) => nullLast(a.showWhenCommittedRate) - nullLast(b.showWhenCommittedRate),
      noShow:      (a, b) => a.noShow - b.noShow,
      ghost:       (a, b) => a.ghost - b.ghost,
      response:    (a, b) => nullLast(a.responseRate) - nullLast(b.responseRate),
    };
    return [...filtered].sort((a, b) => cmp[sortKey](a, b) * dir);
  }, [players, qualifiedOnly, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  if (loading) return <p className="text-text-tertiary text-center py-8 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-center py-8 text-sm">{error}</p>;

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => onSort(k)}
      className={`py-1.5 px-1 font-semibold cursor-pointer select-none whitespace-nowrap text-right ${
        sortKey === k ? 'text-gold' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const maxShowed = attendance[0]?.showed ?? 0;

  return (
    <div className="space-y-3">
      <Section
        title="Attendance"
        subtitle={`Who shows up, from rosters across ${totalTracked} game${totalTracked === 1 ? '' : 's'}. Admin-only.`}
        open={open.attendance}
        onToggle={() => toggle('attendance')}
      >
        {attendance.length === 0 ? (
          <p className="text-text-tertiary text-center py-4 text-sm">No roster data yet.</p>
        ) : (
          <div className="space-y-1">
            {attendance.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-[12px] text-text-primary truncate w-32 shrink-0">{p.name}</span>
                <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${maxShowed ? (p.showed / maxShowed) * 100 : 0}%` }} />
                </div>
                <span className="text-[11px] text-text-secondary w-20 text-right shrink-0 tabular-nums">
                  {p.showed} · {pct(p.attendanceRate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {guestBoard.length > 0 && (
        <Section
          title="Guests / Invites"
          subtitle={`${totalGuests} guest head${totalGuests === 1 ? '' : 's'} invited — who brings extra people.`}
          open={open.guests}
          onToggle={() => toggle('guests')}
        >
          <div className="space-y-1">
            {guestBoard.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-[12px] text-text-primary truncate w-32 shrink-0">{p.name}</span>
                <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gold/80" style={{ width: `${maxGuests ? (p.guestsBrought / maxGuests) * 100 : 0}%` }} />
                </div>
                <span className="text-[11px] text-text-secondary w-24 text-right shrink-0 tabular-nums">
                  {p.guestsBrought} · {p.gamesWithGuests} game{p.gamesWithGuests === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Reliability"
        subtitle="Rely% = showed ÷ said-In · No-show = said In, no-show · Ghost = came without saying In."
        open={open.reliability}
        onToggle={() => toggle('reliability')}
      >
        {!hasRsvpData ? (
          <div className="p-3 rounded-lg border border-gold/40 bg-gold/5 text-[12px] text-text-secondary">
            No in-app RSVP data yet. Reliability fills once players RSVP via the app link, or an admin backfills
            a game from a screenshot. Attendance above works from rosters in the meantime.
          </div>
        ) : (
          <>
            <button
              onClick={() => setQualifiedOnly(v => !v)}
              className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                qualifiedOnly ? 'bg-gold text-text-on-accent' : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {qualifiedOnly ? `Min ${MIN_GAMES} "In" votes` : 'Showing everyone'}
            </button>
            {reliabilityRows.length === 0 ? (
              <p className="text-text-tertiary text-center py-4 text-sm">No players with {MIN_GAMES}+ "In" votes yet — tap the filter to show everyone.</p>
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
                        <td className={`py-1.5 px-1 text-right ${p.noShow > 0 ? 'text-red-400 font-medium' : 'text-text-tertiary'}`}>{p.noShow || '—'}</td>
                        <td className={`py-1.5 px-1 text-right ${p.ghost > 0 ? 'text-blue-400' : 'text-text-tertiary'}`}>{p.ghost || '—'}</td>
                        <td className="py-1.5 px-1 text-right text-text-secondary">{pct(p.responseRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
