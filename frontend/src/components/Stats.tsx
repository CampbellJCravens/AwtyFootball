import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';
import ChemistrySection from './ChemistrySection';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface StatsProps {
  players: Player[];
  games: Game[];
  onPlayerClick?: (playerId: string) => void;
}

export default function Stats({ players, games, onPlayerClick }: StatsProps) {
  const [filterMonth, setFilterMonth] = useState<number | null>(null); // null = all time
  const [filterYear, setFilterYear] = useState<number | null>(null);

  // Derive available months/years from games
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    const months: { month: number; year: number }[] = [];
    for (const g of games) {
      const d = new Date(g.createdAt);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const key = `${y}-${m}`;
      if (!seen.has(key)) { seen.add(key); months.push({ month: m, year: y }); }
    }
    months.sort((a, b) => b.year - a.year || b.month - a.month);
    return months;
  }, [games]);

  const availableYears = useMemo(() => {
    return [...new Set(availableMonths.map(m => m.year))].sort((a, b) => b - a);
  }, [availableMonths]);

  // Filter games by selected month/year
  const filteredGames = useMemo(() => {
    if (filterMonth === null && filterYear === null) return games;
    return games.filter(g => {
      const d = new Date(g.createdAt);
      if (filterYear !== null && d.getFullYear() !== filterYear) return false;
      if (filterMonth !== null && d.getMonth() + 1 !== filterMonth) return false;
      return true;
    });
  }, [games, filterMonth, filterYear]);

  const isAllTime = filterMonth === null && filterYear === null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gold italic">STATS HUB</h2>
          <p className="text-text-tertiary text-sm">Performance Data</p>
        </div>

        {/* Time filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setFilterMonth(null); setFilterYear(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isAllTime
                ? 'bg-gold text-text-on-accent'
                : 'bg-surface border border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            All Time
          </button>
          <select
            value={filterYear ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                setFilterYear(null);
                setFilterMonth(null);
              } else {
                setFilterYear(parseInt(val));
              }
            }}
            className="bg-surface border border-border text-text-primary text-xs font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="">Year</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {filterYear !== null && (
            <select
              value={filterMonth ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setFilterMonth(val === '' ? null : parseInt(val));
              }}
              className="bg-surface border border-border text-text-primary text-xs font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer"
            >
              <option value="">All Months</option>
              {availableMonths
                .filter(m => m.year === filterYear)
                .map(m => (
                  <option key={m.month} value={m.month}>{MONTH_NAMES[m.month - 1]}</option>
                ))}
            </select>
          )}
          {!isAllTime && (
            <span className="text-[11px] text-text-tertiary ml-1">
              {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Player Rankings */}
        <div className="bg-surface rounded-xl border border-border p-3 mb-6 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <h3 className="text-lg font-semibold text-text-primary">Player Rankings</h3>
          </div>
          <OverallStatsTable players={players} games={filteredGames} onPlayerClick={onPlayerClick} />
        </div>

        {/* Chemistry */}
        <ChemistrySection />
      </div>
    </div>
  );
}
