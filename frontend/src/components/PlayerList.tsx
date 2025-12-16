import { useState, useMemo } from 'react';
import { Player } from '../api/players';
import PlayerCard from './PlayerCard';

interface PlayerListProps {
  players: Player[];
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  showDelete?: boolean; // Only admins can delete
}

export default function PlayerList({ players, onEdit, onDelete, showDelete = true }: PlayerListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = players.filter(player =>
      player.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [players, searchQuery]);

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No players yet.</p>
        <p className="text-sm mt-2">Add your first player above!</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-700 text-gray-100 placeholder-gray-500"
        />
      </div>

      {filteredAndSortedPlayers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No players found matching "{searchQuery}"</p>
        </div>
      ) : (
        filteredAndSortedPlayers.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onEdit={onEdit}
            onDelete={onDelete}
            showDelete={showDelete}
          />
        ))
      )}
    </div>
  );
}

