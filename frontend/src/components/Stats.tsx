import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';
import ChemistrySection from './ChemistrySection';

interface StatsProps {
  players: Player[];
  games: Game[];
  onPlayerClick?: (playerId: string) => void;
}

export default function Stats({ players, games, onPlayerClick }: StatsProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gold italic">STATS HUB</h2>
          <p className="text-text-tertiary text-sm">Performance Data</p>
        </div>

        {/* Player Rankings */}
        <div className="bg-surface rounded-xl border border-border p-3 mb-6 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <h3 className="text-lg font-semibold text-text-primary">Player Rankings</h3>
          </div>
          <OverallStatsTable players={players} games={games} onPlayerClick={onPlayerClick} />
        </div>

        {/* Chemistry */}
        <ChemistrySection />
      </div>
    </div>
  );
}
