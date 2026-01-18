import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Player } from '../api/players';
import { Game } from '../api/games';


interface PlayerStats {
  player: Player;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  points: number; // 3 pts per win, 1 pt per tie, 0 pts per loss
  pointsPerGame: number; // points / gamesPlayed
  goalInvolvements: number; // goals + assists
  goals: number;
  assists: number;
  score: number;
  form: ('W' | 'L' | 'T')[]; // Last 5 game results (oldest to newest, left to right)
  formWins: number; // Wins minus losses in the form array (for sorting)
}

interface OverallStatsTableProps {
  players: Player[];
  games: Game[];
}

type SortColumn = 'points' | 'gamesPlayed' | 'pointsPerGame' | 'goalInvolvements' | 'goals' | 'assists' | 'formWins';
type SortDirection = 'asc' | 'desc';


export default function OverallStatsTable({ players, games }: OverallStatsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Refs for manual sticky header
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const headerOverlayRef = useRef<HTMLDivElement>(null);
  const headerHeightRef = useRef<HTMLTableElement>(null);
  const headerRef = useRef<HTMLTableCellElement>(null);
  
  // Header height for padding-top calculation
  const [headerHeight, setHeaderHeight] = useState(0);
  
  // Manual sticky header: Sync overlay transform with scroll positions
  useEffect(() => {
    const updateHeaderPosition = () => {
      const verticalEl = verticalScrollRef.current;
      const horizontalEl = horizontalScrollRef.current;
      const overlayEl = headerOverlayRef.current;
      
      if (!verticalEl || !horizontalEl || !overlayEl) return;
      
      const scrollX = horizontalEl.scrollLeft;
      
      // Transform header overlay to sync horizontal scroll only (vertical is handled by absolute positioning)
      // Header is positioned at top:0, so no vertical transform needed
      overlayEl.style.transform = `translate(${-scrollX}px, 0)`;
    };
    
    const verticalEl = verticalScrollRef.current;
    const horizontalEl = horizontalScrollRef.current;
    
    // Use requestAnimationFrame for smooth updates
    let rafId: number;
    const onScroll = () => {
      rafId = requestAnimationFrame(updateHeaderPosition);
    };
    
    updateHeaderPosition(); // Initial position
    verticalEl?.addEventListener('scroll', onScroll);
    horizontalEl?.addEventListener('scroll', onScroll);
    
    return () => {
      verticalEl?.removeEventListener('scroll', onScroll);
      horizontalEl?.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  

  // Calculate stats for each player
  const playerStats = useMemo(() => {
    const statsMap = new Map<string, PlayerStats>();

    // Initialize stats for all players
    players.forEach(player => {
      statsMap.set(player.id, {
        player,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        pointsPerGame: 0,
        goalInvolvements: 0,
        goals: 0,
        assists: 0,
        score: 0,
        form: [],
        formWins: 0,
      });
    });

    // Process each game
    games.forEach(game => {
      if (!game.teamAssignments || !game.goals) return;

      const teamAssignments = game.teamAssignments;
      const goals = game.goals;

      // Count goals by team
      const colorGoals = goals.filter(g => g.team === 'color').length;
      const whiteGoals = goals.filter(g => g.team === 'white').length;

      // Determine winner or tie
      const colorWon = colorGoals > whiteGoals;
      const whiteWon = whiteGoals > colorGoals;
      const isTie = colorGoals === whiteGoals;

      // Track which players participated in this game
      const playersInGame = new Set<string>();

      // Process team assignments
      Object.entries(teamAssignments).forEach(([playerId, team]) => {
        // Skip if player not found (guests are now regular players, so they should be in the list)
        if (!statsMap.has(playerId)) {
          return;
        }

        const stats = statsMap.get(playerId)!;
        stats.gamesPlayed++;
        playersInGame.add(playerId);

        // Count wins/losses/ties
        if (isTie) {
          stats.ties++;
        } else if (team === 'color' && colorWon) {
          stats.wins++;
        } else if (team === 'color' && whiteWon) {
          stats.losses++;
        } else if (team === 'white' && whiteWon) {
          stats.wins++;
        } else if (team === 'white' && colorWon) {
          stats.losses++;
        }
      });

      // Process goals and assists
      goals.forEach(goal => {
        // Count goals
        if (statsMap.has(goal.scorerId)) {
          const stats = statsMap.get(goal.scorerId)!;
          stats.goals++;
          // Only count GP if they weren't already counted via team assignment
          if (!playersInGame.has(goal.scorerId)) {
            stats.gamesPlayed++;
            playersInGame.add(goal.scorerId);
          }
        } else {
          // Player should exist in the players list (guests are now regular players)
          // Skip if player not found
          return;
        }

        // Count assists
        if (goal.assisterId) {
          if (statsMap.has(goal.assisterId)) {
            const stats = statsMap.get(goal.assisterId)!;
            stats.assists++;
            // Only count GP if they weren't already counted
            if (!playersInGame.has(goal.assisterId)) {
              stats.gamesPlayed++;
              playersInGame.add(goal.assisterId);
            }
          } else {
            // Player should exist in the players list (guests are now regular players)
            // Skip if player not found
            return;
          }
        }
      });
    });

    // Calculate points, PPG, goal involvements, and scores
    statsMap.forEach(stats => {
      // Calculate points: 3 pts per win, 1 pt per tie, 0 pts per loss
      stats.points = (stats.wins * 3) + (stats.ties * 1);
      
      // Calculate points per game
      if (stats.gamesPlayed > 0) {
        stats.pointsPerGame = Math.round((stats.points / stats.gamesPlayed) * 100) / 100; // Round to 2 decimal places
      } else {
        stats.pointsPerGame = 0;
      }
      
      // Calculate goal involvements (goals + assists)
      stats.goalInvolvements = stats.goals + stats.assists;
      
      stats.score = stats.points + stats.gamesPlayed + stats.goals + stats.assists;
    });

    // Calculate form (last 5 games) for each player
    // Sort games by createdAt (newest first, so we can get the last 5 most recent)
    const sortedGames = [...games].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Newest first
    });

    // For each player, collect their last 5 game results (most recent 5)
    statsMap.forEach((stats, playerId) => {
      const playerForm: ('W' | 'L' | 'T')[] = [];
      
      // Iterate through games from newest to oldest, collecting results
      for (const game of sortedGames) {
        if (!game.teamAssignments || !game.goals) continue;

        const teamAssignments = game.teamAssignments;
        const goals = game.goals;

        // Check if player participated in this game
        const playerTeam = teamAssignments[playerId];
        if (!playerTeam) continue;

        // Count goals by team
        const colorGoals = goals.filter(g => g.team === 'color').length;
        const whiteGoals = goals.filter(g => g.team === 'white').length;

        // Determine result for this player
        const isTie = colorGoals === whiteGoals;
        if (isTie) {
          playerForm.push('T');
        } else if (playerTeam === 'color' && colorGoals > whiteGoals) {
          playerForm.push('W');
        } else if (playerTeam === 'color' && whiteGoals > colorGoals) {
          playerForm.push('L');
        } else if (playerTeam === 'white' && whiteGoals > colorGoals) {
          playerForm.push('W');
        } else if (playerTeam === 'white' && colorGoals > whiteGoals) {
          playerForm.push('L');
        }

        // Only keep last 5
        if (playerForm.length >= 5) {
          break;
        }
      }

      // Reverse to show oldest to newest (left to right in display)
      stats.form = playerForm.reverse();
      
      // Calculate wins minus losses in form (for sorting)
      const wins = stats.form.filter(result => result === 'W').length;
      const losses = stats.form.filter(result => result === 'L').length;
      stats.formWins = wins - losses;
    });

    return Array.from(statsMap.values()).filter(stats => stats.gamesPlayed > 0);
  }, [players, games]);

  // Sort stats
  const sortedStats = useMemo(() => {
    const sorted = [...playerStats].sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'points':
          comparison = a.points - b.points;
          // Tie-breaker: PPG, then goal involvements, then goals
          if (comparison === 0) {
            comparison = a.pointsPerGame - b.pointsPerGame;
            if (comparison === 0) {
              comparison = a.goalInvolvements - b.goalInvolvements;
              if (comparison === 0) {
                comparison = a.goals - b.goals;
              }
            }
          }
          break;
        case 'pointsPerGame':
          comparison = a.pointsPerGame - b.pointsPerGame;
          // Tie-breaker: goal involvements, then goals
          if (comparison === 0) {
            comparison = a.goalInvolvements - b.goalInvolvements;
            if (comparison === 0) {
              comparison = a.goals - b.goals;
            }
          }
          break;
        case 'gamesPlayed':
          comparison = a.gamesPlayed - b.gamesPlayed;
          // Tie-breaker: points, then goal involvements
          if (comparison === 0) {
            comparison = a.points - b.points;
            if (comparison === 0) {
              comparison = a.goalInvolvements - b.goalInvolvements;
            }
          }
          break;
        case 'goalInvolvements':
          comparison = a.goalInvolvements - b.goalInvolvements;
          // Tie-breaker: goals, then points
          if (comparison === 0) {
            comparison = a.goals - b.goals;
            if (comparison === 0) {
              comparison = a.points - b.points;
            }
          }
          break;
        case 'goals':
          comparison = a.goals - b.goals;
          // Tie-breaker: assists, then points
          if (comparison === 0) {
            comparison = a.assists - b.assists;
            if (comparison === 0) {
              comparison = a.points - b.points;
            }
          }
          break;
        case 'assists':
          comparison = a.assists - b.assists;
          // Tie-breaker: goals, then points
          if (comparison === 0) {
            comparison = a.goals - b.goals;
            if (comparison === 0) {
              comparison = a.points - b.points;
            }
          }
          break;
        case 'formWins':
          comparison = a.formWins - b.formWins;
          // Tie-breaker: points, then goal involvements
          if (comparison === 0) {
            comparison = a.points - b.points;
            if (comparison === 0) {
              comparison = a.goalInvolvements - b.goalInvolvements;
            }
          }
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [playerStats, sortColumn, sortDirection]);

  // Measure header height for padding-top calculation (must be after sortedStats is defined)
  useLayoutEffect(() => {
    const measureHeader = () => {
      if (headerHeightRef.current) {
        const height = headerHeightRef.current.offsetHeight;
        setHeaderHeight(height);
      }
    };
    
    measureHeader();
    // Re-measure on window resize and when table re-renders
    window.addEventListener('resize', measureHeader);
    // Use a small timeout to allow DOM to settle after render
    const timeoutId = setTimeout(measureHeader, 0);
    return () => {
      window.removeEventListener('resize', measureHeader);
      clearTimeout(timeoutId);
    };
  }, [sortedStats]); // Re-measure when data changes

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const columns = [
    { key: 'rank', label: 'Rk', tooltip: 'Rank', width: 'w-8', widthPx: 32, sticky: true, left: '0' },
    { key: 'player', label: 'Player', tooltip: 'Player', width: 'w-40', widthPx: 160, sticky: true, left: '2rem' },
    { key: 'points', label: 'Pts', tooltip: 'Points', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'points' },
    { key: 'gamesPlayed', label: 'GP', tooltip: 'Games Played', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'gamesPlayed' },
    { key: 'pointsPerGame', label: 'PPG', tooltip: 'Points Per Game', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'pointsPerGame' },
    { key: 'goalInvolvements', label: 'G+A', tooltip: 'Goals + Assists', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'goalInvolvements' },
    { key: 'goals', label: 'G', tooltip: 'Goals', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'goals' },
    { key: 'assists', label: 'A', tooltip: 'Assists', width: 'w-16', widthPx: 64, sortable: true, sortKey: 'assists' },
    { key: 'form', label: 'Form', tooltip: 'Form', width: 'w-32', widthPx: 128, sortable: true, sortKey: 'formWins' },
  ];

  // Manual sticky header overlay: Uses absolute positioning + transform instead of CSS sticky
  // This works regardless of CSS containment/transform issues that break position: sticky
  return (
    <>
      <div ref={verticalScrollRef} className="flex-1 min-h-0 overflow-y-auto relative">
        {/* Manual sticky header overlay - synced with scroll via transform */}
        <div 
          ref={headerOverlayRef} 
          className="absolute top-0 left-0 right-0 z-[999] pointer-events-none"
          style={{ transform: 'translate(0, 0)' }}
        >
          <div className="pointer-events-auto bg-gray-900">
            <table ref={headerHeightRef} className="min-w-max w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                {columns.map(col => (
                  <col key={col.key} style={{ width: `${col.widthPx}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gray-600">
                  {columns.map((col, idx) => (
                    <th
                      key={col.key}
                      ref={idx === 0 ? headerRef : undefined}
                      title={col.tooltip}
                      className={[
                        'py-2 px-2 font-semibold text-gray-300 bg-gray-900 border-b-2 border-gray-600 text-left',
                        col.sortable ? 'cursor-pointer hover:bg-gray-700 transition-colors' : '',
                        idx === 0 ? 'sticky left-0 z-70' : '',
                        idx === 1 ? 'sticky z-70' : '',
                        idx >= 2 ? 'z-60' : '',
                      ].filter(Boolean).join(' ')}
                      style={idx === 1 ? { left: `${columns[0].widthPx}px` } : undefined}
                      onClick={col.sortable && col.sortKey ? () => handleSort(col.sortKey as SortColumn) : undefined}
                    >
                      {col.label} {col.sortable && col.sortKey && <SortIcon column={col.sortKey as SortColumn} />}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        </div>

        {/* Horizontal scroll wrapper - MUST have overflow-y: visible to avoid breaking sticky */}
        <div 
          ref={horizontalScrollRef} 
          className="overflow-x-auto" 
          style={{ overflowY: 'visible', paddingTop: `${headerHeight}px` }}
        >
          {/* Body table - padding-top keeps content below header overlay */}
          <table className="min-w-max w-full table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              {columns.map(col => (
                <col key={col.key} style={{ width: `${col.widthPx}px` }} />
              ))}
            </colgroup>
            <tbody>
              {sortedStats.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-gray-400">
                    No stats available. Play some games first!
                  </td>
                </tr>
              ) : (
                sortedStats.map((stats, index) => (
                  <tr key={stats.player.id} className="border-b border-gray-700 hover:bg-gray-800">
                    {/* Rank - Sticky */}
                    <td className="py-2 px-1 text-gray-300 font-medium bg-gray-800 sticky left-0 z-20">
                      {index + 1}
                    </td>
                    
                    {/* Player - Sticky */}
                    <td 
                      className="py-2 px-3 bg-gray-800 sticky z-20"
                      style={{ left: `${columns[0].widthPx}px` }}
                    >
                      <div className="flex items-center gap-2">
                        {stats.player.pictureUrl ? (
                          <img
                            src={stats.player.pictureUrl}
                            alt={stats.player.name}
                            className="w-8 h-8 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {getInitial(stats.player.name)}
                          </div>
                        )}
                        <span className="font-medium text-gray-100 truncate">{stats.player.name}</span>
                      </div>
                    </td>
                    
                    {/* Rest of columns - Scrollable */}
                    <td className="py-2 px-3 text-gray-300">{stats.points}</td>
                    <td className="py-2 px-3 text-gray-300">{stats.gamesPlayed}</td>
                    <td className="py-2 px-3 text-gray-300">{stats.pointsPerGame.toFixed(2)}</td>
                    <td className="py-2 px-3 text-gray-300">{stats.goalInvolvements}</td>
                    <td className="py-2 px-3 text-gray-300">{stats.goals}</td>
                    <td className="py-2 px-3 text-gray-300">{stats.assists}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        {[0, 1, 2, 3, 4].map((i) => {
                          const result = stats.form[i];
                          return (
                            <div
                              key={i}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                result === 'W'
                                  ? 'bg-green-600 border-green-500 text-white'
                                  : result === 'L'
                                  ? 'bg-red-600 border-red-500 text-white'
                                  : result === 'T'
                                  ? 'bg-gray-500 border-gray-400 text-white'
                                  : 'bg-transparent border-gray-600 text-gray-600'
                              }`}
                            >
                              {result || ''}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

