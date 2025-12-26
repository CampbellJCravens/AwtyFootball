import { useState } from 'react';
import { Player } from '../api/players';

interface ActivePlayersSectionProps {
  players: Player[];
  playerTeams: Record<string, 'color' | 'white'>;
  leftPlayers: Record<string, boolean>;
  onTeamSelect: (playerId: string, team: 'color' | 'white') => void;
  onAddGuest: (team: 'color' | 'white') => void;
  onRemoveFromTeam: (playerId: string) => void;
  onSwapTeam: (playerId: string) => void;
  onGoalClick: (player: Player) => void;
  onLeaveTeam: (playerId: string) => void;
  onReturnToTeam: (playerId: string) => void;
  isAdmin?: boolean; // Whether user is admin (can modify games)
}

export default function ActivePlayersSection({
  players,
  playerTeams,
  leftPlayers,
  onTeamSelect: _onTeamSelect,
  onAddGuest,
  onRemoveFromTeam: _onRemoveFromTeam,
  onSwapTeam,
  onGoalClick,
  onLeaveTeam,
  onReturnToTeam,
  isAdmin = true,
}: ActivePlayersSectionProps) {
  const [activeTab, setActiveTab] = useState<'color' | 'white'>('color');
  const colorTeamPlayers = players.filter(player => playerTeams[player.id] === 'color');
  const whiteTeamPlayers = players.filter(player => playerTeams[player.id] === 'white');

  const colorActive = colorTeamPlayers
    .filter(player => !leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const colorLeft = colorTeamPlayers
    .filter(player => leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  const whiteActive = whiteTeamPlayers
    .filter(player => !leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const whiteLeft = whiteTeamPlayers
    .filter(player => leftPlayers[player.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-100 mb-4">Teams</h3>
      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-3">
        <button
          onClick={() => setActiveTab('color')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'color'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-300 hover:text-gray-100'
          }`}
        >
          Color ({colorActive.length})
        </button>
        <button
          onClick={() => setActiveTab('white')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'white'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-300 hover:text-gray-100'
          }`}
        >
          White ({whiteActive.length})
        </button>
      </div>

      {/* Content */}
      <div className="bg-gray-900 rounded-lg p-4 min-h-[200px] max-h-[900px] flex flex-col relative border border-gray-700">
        {activeTab === 'color' ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
              <h4 className="text-white font-medium text-center flex-1">Color Team ({colorActive.length})</h4>
              {isAdmin && (
                <button
                  onClick={() => onAddGuest('color')}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                  data-tooltip="Add Guest"
                >
                  Add Guest
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
              {colorActive.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  Add players to this team in the Choose Teams module above
                </p>
              ) : (
                colorActive.map((player) => (
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
                        {isAdmin && (
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
                              <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="12" cy="12" r="4" fill="currentColor"/>
                              <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(0, 0, 0, 0.6)" stroke="rgba(0, 0, 0, 0.8)" strokeWidth="0.3"/>
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
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
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onLeaveTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-800/40 active:bg-amber-700/60 transition-colors"
                            aria-label="Mark player as left"
                            data-tooltip="Player left"
                          >
                            <svg
                              className="w-5 h-5 text-amber-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4m4-4H6m8 0l-3-3m3 3l-3 3"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {colorLeft.length > 0 && (
              <>
                <div className="border-t border-gray-700 my-3" />
                <h5 className="text-sm text-gray-300 mb-2">
                  Players that have left ({colorLeft.length})
                </h5>
                <div className="space-y-2">
                  {colorLeft.map((player) => (
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
                        <span className="text-gray-200 text-sm truncate flex-1 min-w-0 mr-2">{player.name}</span>
                        {isAdmin && (
                          <button
                            onClick={() => onReturnToTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-green-800/40 active:bg-green-700/60 transition-colors"
                            aria-label="Return player"
                            data-tooltip="Return to game"
                          >
                            <svg
                              className="w-4 h-4 text-green-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19V5m0 0l-4 4m4-4l4 4"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 flex-shrink-0 relative z-10">
              <h4 className="text-gray-100 font-medium text-center flex-1">White Team ({whiteActive.length})</h4>
              {isAdmin && (
                <button
                  onClick={() => onAddGuest('white')}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-300 text-gray-100 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                  data-tooltip="Add Guest"
                >
                  Add Guest
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 relative z-0">
              {whiteActive.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">
                  Add players to this team in the Choose Teams module above
                </p>
              ) : (
                whiteActive.map((player) => (
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
                        {isAdmin && (
                          <button
                            onClick={() => onGoalClick(player)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-500 active:bg-gray-400 transition-colors"
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
                              <line x1="5" y1="6" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="12" cy="12" r="4" fill="currentColor"/>
                              <path d="M12 8.5L13.5 11.5L16 12L13.5 12.5L12 15.5L10.5 12.5L8 12L10.5 11.5L12 8.5Z" fill="rgba(255, 255, 255, 0.6)" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="0.3"/>
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onSwapTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-500 active:bg-gray-400 transition-colors"
                            aria-label="Swap"
                            data-tooltip="Swap Team"
                          >
                            <svg
                              className="w-4 h-4 text-gray-200"
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
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => onLeaveTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-800/40 active:bg-amber-700/60 transition-colors"
                            aria-label="Mark player as left"
                            data-tooltip="Player left"
                          >
                            <svg
                              className="w-5 h-5 text-amber-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4m4-4H6m8 0l-3-3m3 3l-3 3"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {whiteLeft.length > 0 && (
              <>
                <div className="border-t border-gray-700 my-3" />
                <h5 className="text-sm text-gray-300 mb-2">
                  Players that have left ({whiteLeft.length})
                </h5>
                <div className="space-y-2">
                  {whiteLeft.map((player) => (
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
                        <span className="text-gray-200 text-sm truncate flex-1 min-w-0 mr-2">{player.name}</span>
                        {isAdmin && (
                          <button
                            onClick={() => onReturnToTeam(player.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-green-800/40 active:bg-green-700/60 transition-colors"
                            aria-label="Return player"
                            data-tooltip="Return to game"
                          >
                            <svg
                              className="w-4 h-4 text-green-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19V5m0 0l-4 4m4-4l4 4"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

