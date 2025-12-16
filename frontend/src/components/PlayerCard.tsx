import { Player } from '../api/players';

interface PlayerCardProps {
  player: Player;
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  showDelete?: boolean; // Only admins can delete
}

export default function PlayerCard({ player, onEdit, onDelete, showDelete = true }: PlayerCardProps) {
  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-md shadow-gray-900/50 p-4 mb-4 flex items-center gap-4 border border-gray-700">
      {/* Profile Picture */}
      <div className="flex-shrink-0">
        {player.pictureUrl ? (
          <img
            src={player.pictureUrl}
            alt={player.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-600"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-white text-2xl font-semibold">
            {getInitial(player.name)}
          </div>
        )}
      </div>

      {/* Player Name */}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-gray-100 truncate">{player.name}</h3>
      </div>

      {/* Edit and Delete Buttons */}
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => onEdit(player)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
          aria-label="Edit player"
          data-tooltip="Edit"
        >
          <svg
            className="w-5 h-5 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        {showDelete && (
          <button
            onClick={() => onDelete(player)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-900/30 active:bg-red-900/50 transition-colors"
            aria-label="Delete player"
            data-tooltip="Delete"
          >
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

