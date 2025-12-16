import { Player } from '../api/players';
import GamePlayerCard from './GamePlayerCard';

interface ActivePlayersSectionProps {
  players: Player[];
  playerTeams: Record<string, 'color' | 'white'>;
  onTeamSelect: (playerId: string, team: 'color' | 'white') => void;
  onAddGuest: (team: 'color' | 'white') => void;
  onRemoveFromTeam: (playerId: string) => void;
  onSwapTeam: (playerId: string) => void;
  onGoalClick: (player: Player) => void;
}

export default function ActivePlayersSection({ players, playerTeams, onTeamSelect, onAddGuest, onRemoveFromTeam, onSwapTeam, onGoalClick }: ActivePlayersSectionProps) {
  const colorTeamPlayers = players
    .filter(player => playerTeams[player.id] === 'color')
    .sort((a, b) => a.name.localeCompare(b.name));
  const whiteTeamPlayers = players
    .filter(player => playerTeams[player.id] === 'white')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-100 mb-4">Teams</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Color Team Column */}
        <div className="bg-gray-900 rounded-lg p-4 min-h-[200px] max-h-[400px] flex flex-col relative">
          <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
            <h4 className="text-white font-medium text-center flex-1">Color Team ({colorTeamPlayers.length})</h4>
            <button
              onClick={() => onAddGuest('color')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              data-tooltip="Add Guest"
            >
              Add Guest
            </button>
          </div>
              <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
                {colorTeamPlayers.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    Add players to this team in the Choose Teams module above
                  </p>
                ) : (
                  colorTeamPlayers.map((player) => (
                <div key={player.id} className="bg-gray-800 rounded-lg p-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {player.pictureUrl ? (
                      <img
                        src={player.pictureUrl}
                        alt={player.name}
                        className="w-8 h-8 rounded-full object-cover border border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-white text-sm truncate flex-1 min-w-0 mr-2">{player.name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      {/* Goal Icon (Soccer Ball + Goal) */}
                      <button
                        onClick={() => onGoalClick(player)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
                        aria-label="Goal"
                        data-tooltip="Goal"
                      >
                        <svg
                          className="w-6 h-6 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Goal posts - white for dark background */}
                          <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          {/* Soccer ball - white with darker pattern */}
                          <circle cx="12" cy="12" r="4" fill="currentColor"/>
                          <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(0, 0, 0, 0.6)" stroke="rgba(0, 0, 0, 0.8)" strokeWidth="0.3"/>
                        </svg>
                      </button>
                      {/* Swap Icon */}
                      <button
                        onClick={() => onSwapTeam(player.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
                        aria-label="Swap"
                        data-tooltip="Swap Team"
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                          />
                        </svg>
                      </button>
                      {/* Remove Icon (X) */}
                      <button
                        onClick={() => onRemoveFromTeam(player.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-700 active:bg-red-600 transition-colors"
                        aria-label="Remove"
                        data-tooltip="Remove from Team"
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* White Team Column */}
        <div className="bg-gray-800 border-2 border-gray-600 rounded-lg p-4 min-h-[200px] max-h-[400px] flex flex-col relative">
          <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
            <h4 className="text-gray-100 font-medium text-center flex-1">White Team ({whiteTeamPlayers.length})</h4>
            <button
              onClick={() => onAddGuest('white')}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-300 text-gray-100 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              data-tooltip="Add Guest"
            >
              Add Guest
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
            {whiteTeamPlayers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                Add players to this team in the Choose Teams module above
              </p>
            ) : (
              whiteTeamPlayers.map((player) => (
                <div key={player.id} className="bg-gray-800 rounded-lg p-2 border border-gray-700 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {player.pictureUrl ? (
                      <img
                        src={player.pictureUrl}
                        alt={player.name}
                        className="w-8 h-8 rounded-full object-cover border border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-gray-100 text-sm truncate flex-1 min-w-0 mr-2">{player.name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      {/* Goal Icon (Soccer Ball + Goal) */}
                      <button
                        onClick={() => onGoalClick(player)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-600 active:bg-gray-300 transition-colors"
                        aria-label="Goal"
                        data-tooltip="Goal"
                      >
                        <svg
                          className="w-6 h-6 text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Goal posts - dark for light background */}
                          <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          {/* Soccer ball - dark with lighter pattern */}
                          <circle cx="12" cy="12" r="4" fill="currentColor"/>
                          <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(255, 255, 255, 0.6)" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="0.3"/>
                        </svg>
                      </button>
                      {/* Swap Icon */}
                      <button
                        onClick={() => onSwapTeam(player.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-600 active:bg-gray-300 transition-colors"
                        aria-label="Swap"
                        data-tooltip="Swap Team"
                      >
                        <svg
                          className="w-4 h-4 text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                          />
                        </svg>
                      </button>
                      {/* Remove Icon (X) */}
                      <button
                        onClick={() => onRemoveFromTeam(player.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 active:bg-red-200 transition-colors"
                        aria-label="Remove"
                        data-tooltip="Remove from Team"
                      >
                        <svg
                          className="w-4 h-4 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

