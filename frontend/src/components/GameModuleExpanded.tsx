import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Player, fetchPlayers, createPlayer } from '../api/players';
import { fetchGame, updateGame, Goal, TeamChange, exportGameToSheets, importGameFromCsv, parseAvailableGames } from '../api/games';
import { incrementGuestCount } from '../api/settings';
import Accordion from './Accordion';
import GamePlayerCard from './GamePlayerCard';
import ActivePlayersSection from './ActivePlayersSection';
import GoalAssistModal from './GoalAssistModal';
import EditGoalscorerModal from './EditGoalscorerModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import TimePickerModal from './TimePickerModal';
import EditGameModal from './EditGameModal';
import Papa, { ParseResult } from 'papaparse';

interface GameModuleExpandedProps {
  gameId: string;
  gameNumber: number | null;
  gameDate: string;
  onClose: () => void;
  onPlayerAdded?: () => void; // Callback to refresh players list
  isAdmin?: boolean; // Whether user is admin (can modify games)
}

export default function GameModuleExpanded({ gameId, gameNumber, gameDate, onClose, onPlayerAdded, isAdmin = false }: GameModuleExpandedProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const gameTitle = `Game${gameNumber ?? '?'} - ${formatDate(gameDate)}`;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Record<string, 'color' | 'white'>>({});
  const [leftPlayers, setLeftPlayers] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [goalScorer, setGoalScorer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Array<{ scorer: Player; assister: Player | null; timestamp: Date; team: 'color' | 'white' | null }>>([]);
  const [teamChanges, setTeamChanges] = useState<Array<{ player: Player; timestamp: Date; team: 'color' | 'white'; type: 'leave' | 'swap'; previousTeam?: 'color' | 'white'; newTeam?: 'color' | 'white' }>>([]);
  const [editingGoalIndex, setEditingGoalIndex] = useState<number | null>(null);
  const [editingScorer, setEditingScorer] = useState<Player | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<number | null>(null);
  const [teamChangeToDelete, setTeamChangeToDelete] = useState<number | null>(null);
  const [editingTeamChangeIndex, setEditingTeamChangeIndex] = useState<number | null>(null);
  const [_saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [_exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [selectedGameForImport, setSelectedGameForImport] = useState<string>('');
  const [csvFilesLoaded, setCsvFilesLoaded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGoals, setShowGoals] = useState<boolean>(true);
  const [showTeamChanges, setShowTeamChanges] = useState<boolean>(true); // active by default
  const playersFileInputRef = useRef<HTMLInputElement>(null);
  const gameSummaryFileInputRef = useRef<HTMLInputElement>(null);

  // Load game data and players
  const loadGameData = useCallback(async () => {
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
      
      // Restore team changes from database
      if (gameData.teamChanges && gameData.teamChanges.length > 0) {
        const restoredTeamChanges = gameData.teamChanges
          .map(change => {
            const player = playersData.find(p => p.id === change.playerId);
            if (!player) {
              return null;
            }
            
            return {
              player,
              timestamp: new Date(change.timestamp),
              team: change.team,
              type: change.type,
              previousTeam: change.previousTeam,
              newTeam: change.newTeam,
            };
          })
          .filter((tc): tc is { player: Player; timestamp: Date; team: 'color' | 'white'; type: 'leave' | 'swap'; previousTeam?: 'color' | 'white' | undefined; newTeam?: 'color' | 'white' | undefined } => tc !== null);
        
        setTeamChanges(restoredTeamChanges);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game data');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadGameData();
  }, [gameId, loadGameData]);

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
      
      // Convert team changes to API format
      const teamChangesData: TeamChange[] = teamChanges.map(change => ({
        playerId: change.player.id,
        timestamp: change.timestamp.toISOString(),
        team: change.team,
        type: change.type,
        previousTeam: change.previousTeam,
        newTeam: change.newTeam,
      }));
      
      await updateGame(gameId, {
        teamAssignments: playerTeams,
        goals: goalsData,
        teamChanges: teamChangesData,
      });
    } catch (err) {
      console.error('Error saving game data:', err);
      // Don't show error to user for auto-save, but log it
    } finally {
      setSaving(false);
    }
  }, [gameId, playerTeams, goals, teamChanges]);

  // Export game data to Google Sheets
  const handleExportToSheets = useCallback(async () => {
    try {
      setExporting(true);
      setExportError(null);

      // Prepare team swaps data for export (only swap type, not leave)
      const teamSwaps = teamChanges
        .filter(change => change.type === 'swap')
        .map(change => ({
          playerId: change.player.id,
          timestamp: change.timestamp.toISOString(),
          team: change.newTeam || change.team,
        }));

      await exportGameToSheets(gameId, teamSwaps);
      
      // Show success message
      alert('Game data exported to Google Sheets successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export game data';
      setExportError(errorMessage);
      alert(`Error exporting: ${errorMessage}`);
    } finally {
      setExporting(false);
    }
  }, [gameId, teamChanges]);

  // Handle CSV file selection for import
  const handleFileInputChange = useCallback(async () => {
    const playersFile = playersFileInputRef.current?.files?.[0];
    const gameSummaryFile = gameSummaryFileInputRef.current?.files?.[0];

    if (playersFile && gameSummaryFile) {
      try {
        // Read files as text
        const playersText = await playersFile.text();
        const gameSummaryText = await gameSummaryFile.text();

        // Parse and extract available games
        const games = parseAvailableGames(playersText, gameSummaryText);
        
        if (games.length === 0) {
          setImportError('No games found in the CSV files');
          return;
        }

        setAvailableGames(games);
        setSelectedGameForImport(games[0]); // Default to first game
        setCsvFilesLoaded(true);
        setImportError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV files';
        setImportError(errorMessage);
      }
    }
  }, []);

  // Handle CSV file import
  const handleImportCsv = useCallback(async () => {
    if (!selectedGameForImport) {
      setImportError('Please select a game to import');
      return;
    }

    const playersFile = playersFileInputRef.current?.files?.[0];
    const gameSummaryFile = gameSummaryFileInputRef.current?.files?.[0];

    if (!playersFile || !gameSummaryFile) {
      setImportError('Please select both CSV files');
      return;
    }

    try {
      setImporting(true);
      setImportError(null);

      // Read files as text
      const playersText = await playersFile.text();
      const gameSummaryText = await gameSummaryFile.text();

      // Import data for selected game
      const result = await importGameFromCsv(gameId, playersText, gameSummaryText, selectedGameForImport);

      // Reload players and game data
      const [updatedPlayers, gameData] = await Promise.all([
        fetchPlayers(),
        fetchGame(gameId),
      ]);
      
      setPlayers(updatedPlayers);

      if (gameData.teamAssignments) {
        setPlayerTeams(gameData.teamAssignments);
      }
      if (gameData.goals && gameData.goals.length > 0) {
        const restoredGoals = gameData.goals.map(goal => {
          const scorer = updatedPlayers.find(p => p.id === goal.scorerId);
          const assister = goal.assisterId ? updatedPlayers.find(p => p.id === goal.assisterId) || null : null;
          
          if (!scorer) {
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

      // Parse and restore team changes from game summary
      Papa.parse(gameSummaryText, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<any>) => {
          const teamSwaps: Array<{ player: Player; timestamp: Date; team: 'color' | 'white'; type: 'swap'; previousTeam?: 'color' | 'white'; newTeam?: 'color' | 'white' }> = [];
          
          results.data.forEach((row: any) => {
            if (row.EntryType?.toLowerCase() === 'team swap') {
              const player = updatedPlayers.find(p => p.name === row.PlayerName);
              if (player) {
                const team = row.Team?.toLowerCase() === 'color' ? 'color' : 'white';
                // Determine previous team based on current team assignments
                const currentTeam = gameData.teamAssignments?.[player.id];
                const previousTeam = currentTeam === team ? (team === 'color' ? 'white' : 'color') : currentTeam;
                
                teamSwaps.push({
                  player,
                  timestamp: new Date(row.Timestamp),
                  team,
                  type: 'swap',
                  previousTeam: previousTeam as 'color' | 'white' | undefined,
                  newTeam: team,
                });
              }
            }
          });

          setTeamChanges(teamSwaps);
        },
      });

      alert(`Game data imported successfully! ${result.playersCount} players, ${result.goalsCount} goals, ${result.teamSwapsCount} team swaps.`);
      
      // Reset import state
      setShowImportModal(false);
      setCsvFilesLoaded(false);
      setAvailableGames([]);
      setSelectedGameForImport('');
      if (playersFileInputRef.current) playersFileInputRef.current.value = '';
      if (gameSummaryFileInputRef.current) gameSummaryFileInputRef.current.value = '';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import game data';
      setImportError(errorMessage);
      alert(`Error importing: ${errorMessage}`);
    } finally {
      setImporting(false);
    }
  }, [gameId, selectedGameForImport]);

  // Handle closing import modal
  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportError(null);
    setCsvFilesLoaded(false);
    setAvailableGames([]);
    setSelectedGameForImport('');
    if (playersFileInputRef.current) playersFileInputRef.current.value = '';
    if (gameSummaryFileInputRef.current) gameSummaryFileInputRef.current.value = '';
  }, []);

  // Handle editing game (date and game number)
  const handleEditGame = useCallback(async (newDate: string, newGameNumber: number) => {
    try {
      await updateGame(gameId, { 
        createdAt: newDate,
        gameNumber: newGameNumber 
      });
      // Refresh game data
      await loadGameData();
      setShowEditModal(false);
      alert('Game updated successfully! Note: The game list will refresh when you close this view.');
      // Close the expanded view to force parent to refresh the games list
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update game';
      if (errorMessage === 'Authentication required') {
        alert('Error: You must be logged in as an admin to edit games.');
      } else if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        alert(`Error updating game: ${errorMessage}`);
      } else {
        alert(`Error updating game: ${errorMessage}. Make sure the game number is unique.`);
      }
    }
  }, [gameId, loadGameData, onClose]);

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
    // If they were marked as left, reset them to active
    setLeftPlayers(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
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
    
    const currentTeam = playerTeams[playerId];
    if (!currentTeam) return;

    const newTeam = currentTeam === 'color' ? 'white' : 'color';
    const now = new Date();

    // If the player is switching back and no goals happened in between,
    // remove the previous swap entry instead of adding another.
    setTeamChanges(tc => {
      const player = allPlayers.find(p => p.id === playerId);
      if (!player) return tc;

      const lastSwapIndex = [...tc].reverse().findIndex(
        entry => entry.player.id === playerId && entry.type === 'swap'
      );

      if (lastSwapIndex !== -1) {
        const actualIndex = tc.length - 1 - lastSwapIndex;
        const lastSwap = tc[actualIndex];

        // Check if coming back to previous team and no goals since last swap
        const isReverting = lastSwap.previousTeam === newTeam;
        const goalAfterLastSwap = goals.some(g => g.timestamp > lastSwap.timestamp);

        if (isReverting && !goalAfterLastSwap) {
          // Remove the old swap entry and do not add a new one
          return [...tc.slice(0, actualIndex), ...tc.slice(actualIndex + 1)];
        }
      }

      return [
        ...tc,
        { player, timestamp: now, team: newTeam, previousTeam: currentTeam, newTeam, type: 'swap' },
      ];
    });

    // Update assignment
    setPlayerTeams(prev => ({ ...prev, [playerId]: newTeam }));
  };

  const handleLeaveTeam = (playerId: string) => {
    if (!isAdmin) return;
    setLeftPlayers(prev => ({ ...prev, [playerId]: true }));
    const player = allPlayers.find(p => p.id === playerId);
    const team = playerTeams[playerId];
    if (player && team) {
      setTeamChanges(prev => [
        ...prev,
        { player, timestamp: new Date(), team, type: 'leave' },
      ]);
    }
  };

  const handleReturnToTeam = (playerId: string) => {
    if (!isAdmin) return;
    setLeftPlayers(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
    // Remove any leave entries for this player
    setTeamChanges(prev => prev.filter(entry => entry.player.id !== playerId));
  };

  const handleAddGuest = async (team: 'color' | 'white') => {
    try {
      // Get the next guest number from the server
      const guestNumber = await incrementGuestCount();
      const guestName = `Guest${guestNumber} (Game${gameNumber ?? '?'})`;
      
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

  // Team change editing
  const handleEditTeamChangeTime = (index: number) => {
    setEditingTeamChangeIndex(index);
  };

  const handleTeamChangeTimeChange = (newTime: Date) => {
    if (editingTeamChangeIndex !== null) {
      setTeamChanges(prev => prev.map((tc, i) => 
        i === editingTeamChangeIndex ? { ...tc, timestamp: newTime } : tc
      ));
      setEditingTeamChangeIndex(null);
    }
  };

  const handleCloseTeamChangeTimePicker = () => {
    setEditingTeamChangeIndex(null);
  };

  const handleDeleteTeamChange = (index: number) => {
    setTeamChangeToDelete(index);
  };

  const handleConfirmDeleteTeamChange = () => {
    if (teamChangeToDelete === null) return;
    setTeamChanges(prev => prev.filter((_, i) => i !== teamChangeToDelete));
    setTeamChangeToDelete(null);
  };

  const handleCancelDeleteTeamChange = () => {
    setTeamChangeToDelete(null);
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
                  <>
                    <button
                      onClick={handleExportToSheets}
                      disabled={exporting || loading}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 active:bg-green-800 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                      data-tooltip="Export to Google Sheets"
                    >
                      {exporting ? 'Exporting...' : 'Report Stats'}
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      disabled={importing || loading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                      data-tooltip="Import from CSV"
                    >
                      Import
                    </button>
                    <button
                      onClick={() => setShowEditModal(true)}
                      disabled={loading}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors"
                      aria-label="Edit game"
                      data-tooltip="Edit Game"
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
                  </>
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

        {/* Choose Teams Accordion (admins only) */}
        {isAdmin && (
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
        )}

        {/* Game Summary Section */}
        {!loading && !error && (
          <div className="mb-6 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">Game Summary</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGoals(prev => !prev)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    showGoals ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                  data-tooltip="Toggle Goals"
                >
                  Goals
                </button>
                <button
                  onClick={() => setShowTeamChanges(prev => !prev)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    showTeamChanges ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                  data-tooltip="Toggle Team Changes"
                >
                  Team Changes
                </button>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 max-h-[400px] overflow-y-auto space-y-3">
              {(() => {
                const combined = [
                  ...goals.map((goal, index) => ({
                    type: 'goal' as const,
                    timestamp: goal.timestamp,
                    goal,
                    goalIndex: index,
                  })),
                  ...teamChanges.map((change, index) => ({
                    type: 'teamChange' as const,
                    timestamp: change.timestamp,
                    change,
                    changeIndex: index,
                  })),
                ]
                  .filter(item =>
                    (item.type === 'goal' && showGoals) ||
                    (item.type === 'teamChange' && showTeamChanges)
                  )
                  .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

                if (combined.length === 0) {
                  return (
                    <p className="text-gray-400 text-sm text-center py-2">
                      No events yet - adjust filters or record an event.
                    </p>
                  );
                }

                return (
                  <div>
                    {combined.map((item, idx) => {
                      if (item.type === 'goal') {
                        const { goal, goalIndex } = item;
                        return (
                          <div
                            key={`goal-${goalIndex}-${goal.timestamp.getTime()}-${idx}`}
                            className="flex items-center justify-between text-base text-gray-100 mb-2 last:mb-0"
                          >
                          <span className="pr-3 flex-1">
                              {(() => {
                                const teamLabel = goal.team === 'color' ? 'Color' : goal.team === 'white' ? 'White' : 'Unassigned';
                                return goal.assister 
                                  ? `(${teamLabel}) ${goal.scorer.name} scored! Assisted by ${goal.assister.name}`
                                  : `(${teamLabel}) ${goal.scorer.name} scored!`;
                              })()}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400 whitespace-nowrap">
                                {new Date(goal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditGoal(goalIndex)}
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
                                    onClick={() => handleDeleteGoal(goalIndex)}
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
                        );
                      } else {
                        const { change, changeIndex } = item;
                        return (
                          <div
                            key={`change-${changeIndex}-${change.timestamp.getTime()}-${idx}`}
                            className="flex items-center justify-between text-sm text-gray-200 italic mb-1 last:mb-0"
                          >
                            <span className="pr-3 flex-1 pl-3">
                              {change.type === 'leave'
                                ? `${change.player.name} left the game (${change.team === 'color' ? 'Color' : 'White'})`
                                : `${change.player.name} swapped from ${change.previousTeam === 'color' ? 'Color' : 'White'} to ${change.newTeam === 'color' ? 'Color' : 'White'}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditTeamChangeTime(changeIndex)}
                                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 active:bg-gray-600 transition-colors flex-shrink-0"
                                    aria-label="Edit team change time"
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
                                    onClick={() => handleDeleteTeamChange(changeIndex)}
                                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-900/30 active:bg-red-900/50 transition-colors flex-shrink-0"
                                    aria-label="Delete team change"
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
                        );
                      }
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Teams Section */}
        {!loading && !error && (
          <div className="flex-shrink-0">
            <ActivePlayersSection
              players={allPlayers}
              playerTeams={playerTeams}
              leftPlayers={leftPlayers}
              onTeamSelect={handleTeamSelect}
              onAddGuest={handleAddGuest}
              onRemoveFromTeam={handleRemoveFromTeam}
              onSwapTeam={handleSwapTeam}
              onGoalClick={handleGoalClick}
              onLeaveTeam={handleLeaveTeam}
              onReturnToTeam={handleReturnToTeam}
              isAdmin={isAdmin}
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

      {teamChangeToDelete !== null && (
        <DeleteConfirmationModal
          onConfirm={handleConfirmDeleteTeamChange}
          onCancel={handleCancelDeleteTeamChange}
          message="Are you sure you want to delete this team change entry?"
        />
      )}

      {/* Time Picker Modal for Team Changes */}
      {editingTeamChangeIndex !== null && teamChanges[editingTeamChangeIndex] && (
        <TimePickerModal
          currentTime={teamChanges[editingTeamChangeIndex].timestamp}
          onSelect={handleTeamChangeTimeChange}
          onClose={handleCloseTeamChangeTimePicker}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-semibold text-gray-100 mb-4">Import Game Data</h3>
            <p className="text-sm text-gray-400 mb-4">
              Please select two CSV files: one for Players and one for GameSummary. Then choose which game to import.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Players CSV
                </label>
                <input
                  ref={playersFileInputRef}
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  onChange={handleFileInputChange}
                  disabled={csvFilesLoaded}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  GameSummary CSV
                </label>
                <input
                  ref={gameSummaryFileInputRef}
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  onChange={handleFileInputChange}
                  disabled={csvFilesLoaded}
                />
              </div>

              {csvFilesLoaded && availableGames.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Game to Import
                  </label>
                  <select
                    value={selectedGameForImport}
                    onChange={(e) => setSelectedGameForImport(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-700 text-gray-100"
                  >
                    {availableGames.map((gameName) => (
                      <option key={gameName} value={gameName}>
                        {gameName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Current game: {gameTitle}
                  </p>
                </div>
              )}
            </div>

            {importError && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {importError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleCloseImportModal}
                disabled={importing}
                className="px-4 py-2 bg-gray-700 text-gray-100 text-sm font-medium rounded-lg hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              {csvFilesLoaded && availableGames.length > 0 && (
                <button
                  onClick={handleImportCsv}
                  disabled={importing || !selectedGameForImport}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {showEditModal && (
        <EditGameModal
          currentDate={gameDate}
          currentGameNumber={gameNumber}
          onSelect={handleEditGame}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}

