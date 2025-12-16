import { useState, useEffect, useMemo, useCallback } from 'react';
import { Player, fetchPlayers, createPlayer } from '../api/players';
import { fetchGame, updateGame, Goal } from '../api/games';
import { incrementGuestCount } from '../api/settings';
import Accordion from './Accordion';
import GamePlayerCard from './GamePlayerCard';
import ActivePlayersSection from './ActivePlayersSection';
import GoalAssistModal from './GoalAssistModal';
import EditGoalscorerModal from './EditGoalscorerModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface GameModuleExpandedProps {
  gameId: string;
  gameNumber: number;
  gameDate: string;
  onClose: () => void;
  onPlayerAdded?: () => void; // Callback to refresh players list
  isAdmin?: boolean; // Whether user is admin (can modify games)
}

export default function GameModuleExpanded({ gameId, gameNumber, gameDate, onClose, onPlayerAdded, isAdmin = true }: GameModuleExpandedProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const gameTitle = `Game${gameNumber} - ${formatDate(gameDate)}`;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Record<string, 'color' | 'white'>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [goalScorer, setGoalScorer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Array<{ scorer: Player; assister: Player | null; timestamp: Date; team: 'color' | 'white' | null }>>([]);
  const [editingGoalIndex, setEditingGoalIndex] = useState<number | null>(null);
  const [editingScorer, setEditingScorer] = useState<Player | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Load game data and players
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load players and game data in parallel
        const [playersData, gameData] = await Promise.all([
          fetchPlayers(),
          fetchGame(gameId),
        ]);
        
        setPlayers(playersData);
        
        // Restore game state
        if (gameData.teamAssignments) {
          setPlayerTeams(gameData.teamAssignments);
        }
        
        // Restore goals - guests are now regular players, so just use playersData
        if (gameData.goals && gameData.goals.length > 0) {
          const allPlayersWithGuests = [...playersData];
          
          const restoredGoals = gameData.goals.map(goal => {
            const scorer = allPlayersWithGuests.find(p => p.id === goal.scorerId);
            const assister = goal.assisterId ? allPlayersWithGuests.find(p => p.id === goal.assisterId) || null : null;
            
            if (!scorer) {
              // Skip goals with missing players (shouldn't happen, but handle gracefully)
              return null;
            }
            
            return {
              scorer,
              assister,
              timestamp: new Date(goal.timestamp),
              team: goal.team,
            };
          }).filter((g): g is { scorer: Player; assister: Player | null; timestamp: Date; team: 'color' | 'white' | null } => g !== null);
          
          setGoals(restoredGoals);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [gameId]);

  // Save game data to backend
  const saveGameData = useCallback(async () => {
    try {
      setSaving(true);
      
      // Convert goals to API format
      const goalsData: Goal[] = goals.map(goal => ({
        scorerId: goal.scorer.id,
        assisterId: goal.assister?.id || null,
        timestamp: goal.timestamp.toISOString(),
        team: goal.team,
      }));
      
      await updateGame(gameId, {
        teamAssignments: playerTeams,
        goals: goalsData,
      });
    } catch (err) {
      console.error('Error saving game data:', err);
      // Don't show error to user for auto-save, but log it
    } finally {
      setSaving(false);
    }
  }, [gameId, playerTeams, goals]);

  // Auto-save when game data changes (debounced)
  useEffect(() => {
    if (loading) return; // Don't save while loading
    
    const timeoutId = setTimeout(() => {
      saveGameData();
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timeoutId);
  }, [playerTeams, goals, loading, saveGameData]);

  const handleTeamSelect = (playerId: string, team: 'color' | 'white') => {
    // Only admins can modify team assignments
    if (!isAdmin) return;
    
    setPlayerTeams(prev => {
      // If clicking the same team, deselect it
      if (prev[playerId] === team) {
        const newTeams = { ...prev };
        delete newTeams[playerId];
        return newTeams;
      }
      // Otherwise, set the new team
      return { ...prev, [playerId]: team };
    });
  };

  const handleRemoveFromTeam = (playerId: string) => {
    // Only admins can remove players from teams
    if (!isAdmin) return;
    
    setPlayerTeams(prev => {
      const newTeams = { ...prev };
      delete newTeams[playerId];
      return newTeams;
    });
  };

  const handleSwapTeam = (playerId: string) => {
    // Only admins can swap teams
    if (!isAdmin) return;
    
    setPlayerTeams(prev => {
      const currentTeam = prev[playerId];
      if (currentTeam === 'color') {
        return { ...prev, [playerId]: 'white' };
      } else if (currentTeam === 'white') {
        return { ...prev, [playerId]: 'color' };
      }
      return prev;
    });
  };

  const handleAddGuest = async (team: 'color' | 'white') => {
    try {
      // Get the next guest number from the server
      const guestNumber = await incrementGuestCount();
      const guestName = `Guest${guestNumber} (Game${gameNumber})`;
      
      // Create the guest as a real player in the database
      const newGuest = await createPlayer({
        name: guestName,
      });
      
      // Add the new player to the team
      setPlayerTeams(prev => ({ ...prev, [newGuest.id]: team }));
      
      // Refresh the players list to include the new guest
      const updatedPlayers = await fetchPlayers();
      setPlayers(updatedPlayers);
      
      // Notify parent to refresh players list
      if (onPlayerAdded) {
        onPlayerAdded();
      }
    } catch (err) {
      console.error('Error adding guest:', err);
      // Could show an error message to the user here
    }
  };

  // All players (guests are now regular players in the database)
  const allPlayers = players;

  const handleGoalClick = (player: Player) => {
    setGoalScorer(player);
  };

  const handleAssisterSelected = (assister: Player | null) => {
    if (goalScorer) {
      const scorerTeam = playerTeams[goalScorer.id] || null;
      setGoals(prev => [...prev, { scorer: goalScorer, assister, timestamp: new Date(), team: scorerTeam }]);
      setGoalScorer(null);
    }
  };

  const handleCloseGoalModal = () => {
    setGoalScorer(null);
  };

  const handleEditGoal = (goalIndex: number) => {
    const goal = goals[goalIndex];
    setEditingGoalIndex(goalIndex);
    setEditingScorer(goal.scorer);
  };

  const handleGoalTimeChange = (newTime: Date) => {
    if (editingGoalIndex !== null) {
      setGoals(prev => {
        const newGoals = [...prev];
        newGoals[editingGoalIndex] = {
          ...newGoals[editingGoalIndex],
          timestamp: newTime,
        };
        return newGoals;
      });
    }
  };

  const handleEditScorerSelected = (newScorer: Player) => {
    if (editingGoalIndex !== null) {
      // Update the scorer and show assister modal
      setEditingScorer(newScorer);
      setGoalScorer(newScorer); // This will trigger the assister modal
    }
  };

  const handleEditScorerSkip = () => {
    if (editingGoalIndex !== null && editingScorer) {
      // Skip changing scorer, move to assister selection with current scorer
      setGoalScorer(editingScorer); // This will trigger the assister modal
    }
  };

  const handleEditAssisterSelected = (assister: Player | null) => {
    if (editingGoalIndex !== null && editingScorer) {
      const scorerTeam = playerTeams[editingScorer.id] || null;
      setGoals(prev => {
        const newGoals = [...prev];
        newGoals[editingGoalIndex] = {
          scorer: editingScorer,
          assister,
          timestamp: prev[editingGoalIndex].timestamp, // Keep original timestamp
          team: scorerTeam,
        };
        return newGoals;
      });
      setEditingGoalIndex(null);
      setEditingScorer(null);
      setGoalScorer(null);
    }
  };

  const handleCloseEditModal = () => {
    setEditingGoalIndex(null);
    setEditingScorer(null);
    setGoalScorer(null);
  };

  const handleDeleteGoal = (goalIndex: number) => {
    setGoalToDelete(goalIndex);
  };

  const handleConfirmDeleteGoal = () => {
    if (goalToDelete !== null) {
      setGoals(prev => prev.filter((_, index) => index !== goalToDelete));
      setGoalToDelete(null);
    }
  };

  const handleCancelDeleteGoal = () => {
    setGoalToDelete(null);
  };

  // Get team players for the goal scorer
  const getTeamPlayers = (scorer: Player): Player[] => {
    const scorerTeam = playerTeams[scorer.id];
    if (!scorerTeam) return [];
    
    return allPlayers.filter(player => 
      player.id !== scorer.id && playerTeams[player.id] === scorerTeam
    );
  };


  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = allPlayers.filter(player =>
      player.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [allPlayers, searchQuery]);

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header with Save and Close Buttons */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-100">{gameTitle}</h2>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={saveGameData}
                    disabled={saving || loading}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 active:bg-green-800 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    data-tooltip="Report Stats"
                  >
                    {saving ? 'Reporting...' : 'Report Stats'}
                  </button>
                )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
            aria-label="Close"
            data-tooltip="Close"
          >
            <svg
              className="w-6 h-6 text-gray-300"
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

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {/* Score Module */}
        <div className="mb-6 flex-shrink-0">
          <div className="bg-gray-800 rounded-lg border border-gray-700 relative h-20 overflow-hidden">
            {/* Color Team Side - rounded left corners only */}
            <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-gray-900 flex items-center justify-center rounded-tl-lg rounded-bl-lg">
              <span className="text-white font-semibold text-lg">
                Color ({allPlayers.filter(p => playerTeams[p.id] === 'color').length})
              </span>
            </div>
            {/* White Team Side - rounded right corners only */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gray-800 border-l-2 border-gray-600 flex items-center justify-center rounded-tr-lg rounded-br-lg">
              <span className="text-gray-100 font-semibold text-lg">
                White ({allPlayers.filter(p => playerTeams[p.id] === 'white').length})
              </span>
            </div>
            {/* Score Box (centered, overlapping) */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-600 rounded-lg px-4 py-2 border-2 border-gray-600 shadow-md z-10">
              <span className="text-gray-100 font-bold text-xl">
                {goals.filter(g => g.team === 'color').length} - {goals.filter(g => g.team === 'white').length}
              </span>
            </div>
          </div>
        </div>

        {/* Choose Teams Accordion */}
        <div className="mb-6 flex-shrink-0" style={{ maxHeight: '40vh' }}>
          <Accordion 
            title="Choose Teams" 
            defaultOpen={false}
            hint={{
              collapsed: "Expand to choose teams",
              expanded: "Collapse to hide"
            }}
          >
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-400">Loading players...</p>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
                <p className="text-sm">{error}</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: '35vh' }}>
                {/* Search Bar */}
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100 placeholder-gray-500"
                  />
                </div>

                {filteredAndSortedPlayers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">
                      {players.length === 0
                        ? 'No players available. Add players in the "All Players" tab.'
                        : `No players found matching "${searchQuery}"`}
                    </p>
                  </div>
                ) : (
                  filteredAndSortedPlayers.map((player) => (
                    <GamePlayerCard
                      key={player.id}
                      player={player}
                      onTeamSelect={handleTeamSelect}
                      selectedTeam={playerTeams[player.id]}
                    />
                  ))
                )}
              </div>
            )}
          </Accordion>
        </div>

        {/* Goal Summary Section */}
        {!loading && !error && (
          <div className="mb-6 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Goal Summary</h3>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 max-h-[200px] overflow-y-auto">
              {goals.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No goals scored yet - choose a goal scorer in the teams section</p>
              ) : (
                <div className="space-y-2">
                  {goals.map((goal, index) => (
                    <div key={index} className="flex items-center justify-between text-base text-gray-100">
                      <span className="pr-3 flex-1">
                        {goal.assister 
                          ? `${goal.scorer.name} scored a goal! Assisted by ${goal.assister.name}`
                          : `${goal.scorer.name} scored a goal!`
                        }
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400 whitespace-nowrap">
                          {new Date(goal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleEditGoal(index)}
                              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors flex-shrink-0"
                              aria-label="Edit goal"
                              data-tooltip="Edit"
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
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteGoal(index)}
                              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-900/30 active:bg-red-900/50 transition-colors flex-shrink-0"
                              aria-label="Delete goal"
                              data-tooltip="Delete"
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Teams Section */}
        {!loading && !error && (
          <div className="flex-shrink-0">
            <ActivePlayersSection
              players={allPlayers}
              playerTeams={playerTeams}
              onTeamSelect={handleTeamSelect}
              onAddGuest={handleAddGuest}
              onRemoveFromTeam={handleRemoveFromTeam}
              onSwapTeam={handleSwapTeam}
              onGoalClick={handleGoalClick}
            />
          </div>
        )}
      </div>

      {/* Goal Assist Modal */}
      {goalScorer && editingGoalIndex === null && (
        <GoalAssistModal
          scorer={goalScorer}
          teamPlayers={getTeamPlayers(goalScorer)}
          onSelectAssister={handleAssisterSelected}
          onClose={handleCloseGoalModal}
        />
      )}

      {/* Edit Goalscorer Modal */}
      {editingGoalIndex !== null && editingScorer && !goalScorer && (
        <EditGoalscorerModal
          currentScorer={editingScorer}
          teamPlayers={getTeamPlayers(editingScorer)}
          currentGoalTime={goals[editingGoalIndex].timestamp}
          onSelectScorer={handleEditScorerSelected}
          onSkip={handleEditScorerSkip}
          onTimeChange={handleGoalTimeChange}
          onClose={handleCloseEditModal}
        />
      )}

      {/* Edit Assister Modal (shown after selecting/scipping scorer in edit mode) */}
      {goalScorer && editingGoalIndex !== null && editingScorer && (
        <GoalAssistModal
          scorer={goalScorer}
          teamPlayers={getTeamPlayers(goalScorer)}
          onSelectAssister={handleEditAssisterSelected}
          onClose={handleCloseEditModal}
        />
      )}

      {/* Delete Goal Confirmation Modal */}
      {goalToDelete !== null && (
        <DeleteConfirmationModal
          onConfirm={handleConfirmDeleteGoal}
          onCancel={handleCancelDeleteGoal}
          message="Are you sure you want to delete this goal?"
        />
      )}
    </div>
  );
}

