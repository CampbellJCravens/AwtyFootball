import { Player } from '../api/players';

interface GamePlayerCardProps {
  player: Player;
  onTeamSelect: (playerId: string, team: 'color' | 'white') => void;
  selectedTeam?: 'color' | 'white' | null;
}

export default function GamePlayerCard({ player, onTeamSelect, selectedTeam }: GamePlayerCardProps) {
  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-3 mb-3 flex items-center gap-3">
      {/* Profile Picture */}
      <div className="flex-shrink-0">
        {player.pictureUrl ? (
          <img
            src={player.pictureUrl}
            alt={player.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-gray-600"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white text-lg font-semibold">
            {getInitial(player.name)}
          </div>
        )}
      </div>

      {/* Player Name */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium text-gray-100 truncate">{player.name}</h3>
      </div>

      {/* Team Buttons - circular color swatches */}
      <div className="flex gap-3 flex-shrink-0">
        <button
          onClick={() => onTeamSelect(player.id, 'color')}
          className={`w-9 h-9 rounded-full border-2 transition-all ${
            selectedTeam === 'color'
              ? 'bg-black border-blue-400 shadow-lg shadow-blue-500/40'
              : 'bg-black border-gray-500 hover:border-blue-300'
          }`}
          aria-label="Select Color Team"
          data-tooltip="Color Team"
        />
        <button
          onClick={() => onTeamSelect(player.id, 'white')}
          className={`w-9 h-9 rounded-full border-2 transition-all ${
            selectedTeam === 'white'
              ? 'bg-gray-300 border-blue-400 shadow-lg shadow-blue-500/40'
              : 'bg-gray-500 border-gray-400 hover:border-blue-300'
          }`}
          aria-label="Select White Team"
          data-tooltip="White Team"
        />
      </div>
    </div>
  );
}

