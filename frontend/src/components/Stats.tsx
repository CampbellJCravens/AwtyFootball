import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';
import ChemistrySection from './ChemistrySection';
import LegacyStatsTable from './LegacyStatsTable';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface StatsProps {
  players: Player[];
  games: Game[];
  onPlayerClick?: (playerId: string) => void;
}

type StatsView = 'players' | 'pairings' | 'groups' | 'legacy';

export default function Stats({ players, games, onPlayerClick }: StatsProps) {
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<StatsView>('players');

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

  const views: { id: StatsView; label: string }[] = [
    { id: 'players', label: 'Players' },
    { id: 'pairings', label: 'Pairings' },
    { id: 'groups', label: 'Groups' },
    { id: 'legacy', label: 'Legacy' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gold italic">STATS HUB</h2>
          <p className="text-text-tertiary text-sm">Performance Data</p>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 mb-4 bg-surface-hover/50 rounded-lg p-1">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeView === v.id
                  ? 'bg-gold text-text-on-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Time filter - only for players view */}
        {activeView === 'players' && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
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
        )}

        {/* Content */}
        {activeView === 'players' && (
          <div className="overflow-hidden">
            <OverallStatsTable players={players} games={filteredGames} onPlayerClick={onPlayerClick} />
          </div>
        )}

        {activeView === 'pairings' && (
          <ChemistrySection defaultType="duos" showTypes={['duos', 'goalPartners']} onPlayerClick={onPlayerClick} />
        )}

        {activeView === 'groups' && (
          <ChemistrySection defaultType="trios" showTypes={['trios', 'squads']} onPlayerClick={onPlayerClick} />
        )}

        {activeView === 'legacy' && (
          <LegacyStatsTable onPlayerClick={onPlayerClick} />
        )}
      </div>
    </div>
  );
}
