import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  games?: Game[];
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  onPlayerClick?: (player: Player) => void;
  showActions?: boolean;
}

export default function PlayerList({ players, games = [], onEdit, onDelete, onPlayerClick, showActions = true }: PlayerListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Compute per-player stats from games
  const playerStats = useMemo(() => {
    const stats = new Map<string, { gp: number; goals: number; assists: number }>();
    games.forEach(game => {
      if (!game.teamAssignments) return;
      const playersInGame = new Set<string>(Object.keys(game.teamAssignments));
      playersInGame.forEach(pid => {
        if (!stats.has(pid)) stats.set(pid, { gp: 0, goals: 0, assists: 0 });
        stats.get(pid)!.gp++;
      });
      game.goals?.forEach(goal => {
        if (stats.has(goal.scorerId)) stats.get(goal.scorerId)!.goals++;
        if (goal.assisterId && stats.has(goal.assisterId)) stats.get(goal.assisterId)!.assists++;
      });
    });
    return stats;
  }, [games]);

  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = players.filter(player =>
      player.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [players, searchQuery]);

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-text-tertiary">
        <p className="text-lg">No players yet.</p>
        <p className="text-sm mt-2">Use the + button to add players!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search Bar */}
      <div className="mb-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
        />
      </div>

      {filteredAndSortedPlayers.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary">
          <p className="text-lg">No players found matching "{searchQuery}"</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {filteredAndSortedPlayers.map((player) => {
              const stats = playerStats.get(player.id);
              return (
                <PlayerCard
                  key={player.id}
                  player={player}
                  gp={stats?.gp ?? 0}
                  goals={stats?.goals ?? 0}
                  assists={stats?.assists ?? 0}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onClick={onPlayerClick ? () => onPlayerClick(player) : undefined}
                  showActions={showActions}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
