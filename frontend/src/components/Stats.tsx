import { Player } from '../api/players';
import { Game } from '../api/games';
import OverallStatsTable from './OverallStatsTable';

interface StatsProps {
  players: Player[];
  games: Game[];
}

export default function Stats({ players, games }: StatsProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 pt-2 pb-6 flex-1 flex flex-col min-h-0 w-full">
        <OverallStatsTable players={players} games={games} />
      </div>
    </div>
  );
}

