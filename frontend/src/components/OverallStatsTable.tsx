import { useState, useMemo } from 'react';
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
}

interface OverallStatsTableProps {
  players: Player[];
  games: Game[];
}

type SortColumn = 'points' | 'gamesPlayed' | 'pointsPerGame' | 'goalInvolvements' | 'goals' | 'assists';
type SortDirection = 'asc' | 'desc';

export default function OverallStatsTable({ players, games }: OverallStatsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [playerStats, sortColumn, sortDirection]);

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-600">
            <th className="text-left py-3 px-4 font-semibold text-gray-300">Rank</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-300">Player</th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('points')}
            >
              Pts <SortIcon column="points" />
            </th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('gamesPlayed')}
            >
              GP <SortIcon column="gamesPlayed" />
            </th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('pointsPerGame')}
            >
              PPG <SortIcon column="pointsPerGame" />
            </th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('goalInvolvements')}
            >
              GI <SortIcon column="goalInvolvements" />
            </th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('goals')}
            >
              G <SortIcon column="goals" />
            </th>
            <th 
              className="text-left py-3 px-4 font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => handleSort('assists')}
            >
              A <SortIcon column="assists" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStats.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-8 text-gray-400">
                No stats available. Play some games first!
              </td>
            </tr>
          ) : (
            sortedStats.map((stats, index) => (
              <tr key={stats.player.id} className="border-b border-gray-700 hover:bg-gray-800">
                <td className="py-3 px-4 text-gray-300 font-medium">{index + 1}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {stats.player.pictureUrl ? (
                      <img
                        src={stats.player.pictureUrl}
                        alt={stats.player.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        {getInitial(stats.player.name)}
                      </div>
                    )}
                    <span className="font-medium text-gray-100">{stats.player.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300">{stats.points}</td>
                <td className="py-3 px-4 text-gray-300">{stats.gamesPlayed}</td>
                <td className="py-3 px-4 text-gray-300">{stats.pointsPerGame.toFixed(2)}</td>
                <td className="py-3 px-4 text-gray-300">{stats.goalInvolvements}</td>
                <td className="py-3 px-4 text-gray-300">{stats.goals}</td>
                <td className="py-3 px-4 text-gray-300">{stats.assists}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

