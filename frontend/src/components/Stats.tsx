import { useState, useMemo, useCallback } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';
import ChemistrySection from './ChemistrySection';
import LegacyStatsTable from './LegacyStatsTable';
import FieldStatsTab from './FieldStatsTab';
import ReliabilityTab from './ReliabilityTab';
import { useAuth } from '../contexts/AuthContext';
import { fetchYearlyStats, MonthlyAward } from '../api/stats';
import { renderYearlyReportImage, YearlyReportData, YearlyAwardItem, YearlyLeaderboard } from '../utils/renderYearlyReportImage';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface StatsProps {
  players: Player[];
  games: Game[];
  onPlayerClick?: (playerId: string) => void;
  currentPlayerId?: string | null;
}

// Guests and dues moved out to their own admin-only nav tab — this hub is
// performance data, and the money had no business being filed under it.
type StatsView = 'players' | 'pairings' | 'groups' | 'legacy' | 'field' | 'reliability';

export default function Stats({ players, games, onPlayerClick, currentPlayerId }: StatsProps) {
  const { isAdmin } = useAuth();
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

  const [reportYear, setReportYear] = useState<number | null>(null);
  const [sharingYear, setSharingYear] = useState(false);
  const effReportYear = reportYear ?? availableYears[0] ?? new Date().getFullYear();

  // Build + share the yearly "Season in Review" PNG (core+attacking, top 5).
  const handleShareYearly = useCallback(async (year: number) => {
    try {
      setSharingYear(true);
      const data = await fetchYearlyStats(year, 5);
      if (data.gamesPlayed === 0) {
        alert(`No games recorded in ${year}.`);
        return;
      }
      const names = (aw: MonthlyAward[] | null | undefined) => aw && aw.length ? aw.map(a => a.player.name).join(' · ') : '';
      const tile = (aw: MonthlyAward[] | null | undefined, label: string, fmt: (a: MonthlyAward) => string): YearlyAwardItem | null =>
        aw && aw.length ? { label, names: names(aw), value: fmt(aw[0]) } : null;

      const playerOfTheYear = tile(data.awards.playerOfTheYear, 'PLAYER OF THE YEAR', a => `${a.value} pt${a.value === 1 ? '' : 's'}`);
      const awardTiles = [
        tile(data.awards.goldenBoot, 'GOLDEN BOOT', a => `${a.value} goal${a.value === 1 ? '' : 's'}`),
        tile(data.awards.theDecider, 'THE DECIDER', a => `${a.value} golden goal${a.value === 1 ? '' : 's'}`),
        tile(data.awards.playmaker, 'PLAYMAKER', a => `${a.value} assist${a.value === 1 ? '' : 's'}`),
        tile(data.awards.ironMan, 'IRON MAN', a => `${a.value} game${a.value === 1 ? '' : 's'}`),
        tile(data.awards.sportsman, 'SPORTSMAN', a => `${a.value} SP`),
      ].filter((x): x is YearlyAwardItem => x !== null);

      const lb = (title: string, entries: { player: { name: string }; value: number }[]): YearlyLeaderboard =>
        ({ title, rows: entries.map((e, i) => ({ rank: i + 1, name: e.player.name, value: String(e.value) })) });
      const leaderboards = [
        lb('GOALS', data.leaderboards.goals),
        lb('ASSISTS', data.leaderboards.assists),
        lb('GOAL INVOLVEMENTS (G+A)', data.leaderboards.goalInvolvements),
        lb('POINTS', data.leaderboards.points),
        lb('APPEARANCES', data.leaderboards.appearances),
        lb('SPORTSMANSHIP', data.leaderboards.sportsmanship),
      ].filter(l => l.rows.length > 0);

      const banners: YearlyAwardItem[] = [];
      const duo = data.bestDuo?.[0];
      if (duo) banners.push({ label: 'BEST DUO', names: `${duo.players[0].name} & ${duo.players[1].name}`, value: `${duo.value} goal combo${duo.value === 1 ? '' : 's'}` });
      const trio = data.bestTrio?.[0];
      if (trio) banners.push({ label: 'BEST TRIO', names: trio.players.map(p => p.name).join(' · '), value: `${trio.value} PPG` });

      const reportData: YearlyReportData = {
        year: data.year, gamesPlayed: data.gamesPlayed, totalGoals: data.totalGoals,
        playerOfTheYear, awardTiles, leaderboards, banners,
      };

      const blob = await renderYearlyReportImage(reportData);
      const file = new File([blob], `awty-${data.year}-season.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${data.year} Season in Review` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      alert(`Couldn't create the yearly report: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSharingYear(false);
    }
  }, []);

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
    { id: 'field', label: 'Field' },
    // Admin-only: RSVP reliability (who says In and actually shows).
    ...(isAdmin ? [{ id: 'reliability' as const, label: 'Reliability' }] : []),
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold text-gold italic">STATS HUB</h2>
            <p className="text-text-tertiary text-sm">Performance Data</p>
          </div>
          {isAdmin && availableYears.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={effReportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value))}
                className="bg-surface border border-border text-text-primary text-xs font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => handleShareYearly(effReportYear)}
                disabled={sharingYear}
                className="px-3 py-1.5 bg-surface-raised text-text-primary text-xs font-bold rounded-lg border border-gold/60 hover:bg-surface-active active:bg-surface-active disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {sharingYear ? (
                  'Rendering…'
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Yearly
                  </>
                )}
              </button>
            </div>
          )}
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
            <OverallStatsTable players={players} games={filteredGames} onPlayerClick={onPlayerClick} currentPlayerId={currentPlayerId} />
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

        {activeView === 'field' && (
          <FieldStatsTab />
        )}

        {activeView === 'reliability' && isAdmin && (
          <ReliabilityTab />
        )}
      </div>
    </div>
  );
}
