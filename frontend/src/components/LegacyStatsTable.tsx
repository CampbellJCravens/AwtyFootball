import { useState, useEffect, useMemo } from 'react';
import { fetchLegacyStats, LegacyPlayerStat } from '../api/stats';

interface LegacyStatsTableProps {
  onPlayerClick?: (playerId: string) => void;
}

type SortColumn = 'goals' | 'assists' | 'goalInvolvements' | 'wins';

export default function LegacyStatsTable({ onPlayerClick }: LegacyStatsTableProps) {
  const [stats, setStats] = useState<LegacyPlayerStat[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>('goalInvolvements');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchLegacyStats(selectedSeason);
        setStats(data.stats);
        if (data.seasons.length > 0) setSeasons(data.seasons);
      } catch (err) {
        console.error('Failed to load legacy stats:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedSeason]);

  const getStatValue = (entry: LegacyPlayerStat, col: SortColumn): number => {
    const t = selectedSeason === 'all' ? entry.totals : (entry.seasons[selectedSeason] || { goals: 0, assists: 0, wins: 0 });
    if (col === 'goalInvolvements') return t.goals + t.assists;
    return t[col];
  };

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      let cmp = getStatValue(b, sortColumn) - getStatValue(a, sortColumn);
      if (cmp === 0) cmp = getStatValue(b, 'goalInvolvements') - getStatValue(a, 'goalInvolvements');
      return sortDir === 'asc' ? -cmp : cmp;
    });
  }, [stats, sortColumn, sortDir, selectedSeason]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('desc'); }
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return null;
    return <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) return <p className="text-text-tertiary text-center py-8">Loading...</p>;

  return (
    <div>
      <p className="text-[11px] text-text-tertiary mb-3">Aggregate season totals only. No per-game detail available.</p>

      {/* Season filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setSelectedSeason('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            selectedSeason === 'all'
              ? 'bg-gold text-text-on-accent'
              : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
          }`}
        >
          All Legacy
        </button>
        {seasons.map(s => (
          <button
            key={s}
            onClick={() => setSelectedSeason(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedSeason === s
                ? 'bg-gold text-text-on-accent'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="text-text-tertiary text-center py-8 text-sm">No legacy stats found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-gold">
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold w-6">Rk</th>
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold">Player</th>
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold cursor-pointer hover:text-accent w-10" onClick={() => handleSort('goals')}>G<SortIcon col="goals" /></th>
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold cursor-pointer hover:text-accent w-10" onClick={() => handleSort('assists')}>A<SortIcon col="assists" /></th>
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold cursor-pointer hover:text-accent w-10" onClick={() => handleSort('goalInvolvements')}>G+A<SortIcon col="goalInvolvements" /></th>
                <th className="py-1.5 px-1 text-left text-text-secondary font-semibold cursor-pointer hover:text-accent w-10" onClick={() => handleSort('wins')}>W<SortIcon col="wins" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const s = selectedSeason === 'all' ? entry.totals : (entry.seasons[selectedSeason] || { goals: 0, assists: 0, wins: 0 });
                return (
                  <tr key={entry.player.id} className="border-b border-border hover:bg-surface-hover even:bg-surface-hover/50">
                    <td className="py-1.5 px-1 text-text-secondary text-[11px]">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="py-1.5 px-1">
                      <div className="flex items-center gap-1.5">
                        {entry.player.pictureUrl ? (
                          <img src={entry.player.pictureUrl} alt={entry.player.name} className="w-6 h-6 rounded-full object-cover border border-border-emphasis flex-shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-surface-active flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                            {getInitial(entry.player.name)}
                          </div>
                        )}
                        <span
                          className={`font-medium truncate text-text-primary text-[11px] ${onPlayerClick ? 'cursor-pointer hover:underline' : ''}`}
                          onClick={onPlayerClick ? () => onPlayerClick(entry.player.id) : undefined}
                        >
                          {entry.player.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 px-1 text-text-secondary">{s.goals}</td>
                    <td className="py-1.5 px-1 text-text-secondary">{s.assists}</td>
                    <td className="py-1.5 px-1 text-text-secondary">{s.goals + s.assists}</td>
                    <td className="py-1.5 px-1 text-text-secondary">{s.wins}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
