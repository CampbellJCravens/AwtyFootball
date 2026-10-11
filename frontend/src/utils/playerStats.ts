import { Player } from '../api/players';
import { Game, isOwnGoal } from '../api/games';
import { scoreFor } from './goals';

// Per-player stats for a set of games. Shared by the Players table and the
// rank-race chart so the two can never rank differently.

export interface PlayerStats {
  player: Player;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  points: number; // 3 pts per win, 1 pt per tie, 0 pts per loss
  pointsPerGame: number; // points / gamesPlayed
  goalInvolvements: number; // goals + assists
  goals: number;
  ownGoals: number;
  assists: number;
  cleanSheets: number; // games where the opponent scored 0
  sportsmanship: number; // net gold stars minus fouls; can go negative
  fouls: number;         // raw foul count
  score: number;
  form: ('W' | 'L' | 'T')[]; // Last 5 game results (oldest to newest, left to right)
  formWins: number; // Wins minus losses in the form array (for sorting)
}

export type SortColumn = 'points' | 'gamesPlayed' | 'wins' | 'losses' | 'ties' | 'goalInvolvements' | 'goals' | 'ownGoals' | 'assists' | 'cleanSheets' | 'sportsmanship' | 'fouls' | 'formWins';

export const MIN_QUALIFIED_GAMES = 3;

export function computePlayerStats(players: Player[], games: Game[]): PlayerStats[] {
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
      ownGoals: 0,
      assists: 0,
      cleanSheets: 0,
      sportsmanship: 0,
      fouls: 0,
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
    const colorGoals = scoreFor(goals, 'color');
    const whiteGoals = scoreFor(goals, 'white');

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

      // Clean sheet: opponent scored 0 goals
      const opponentGoals = team === 'color' ? whiteGoals : colorGoals;
      if (opponentGoals === 0) {
        stats.cleanSheets++;
      }

      stats.sportsmanship += (game.sportsmanship?.[playerId] || 0) - (game.fouls?.[playerId] || 0);
      stats.fouls += (game.fouls?.[playerId] || 0);
    });

    // Process goals and assists
    goals.forEach(goal => {
      // Count goals. An own goal credits the opposing team via goal.team and
      // must never land in the scorer's own G column.
      if (statsMap.has(goal.scorerId)) {
        const stats = statsMap.get(goal.scorerId)!;
        if (isOwnGoal(goal)) stats.ownGoals++;
        else stats.goals++;
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
      const colorGoals = scoreFor(goals, 'color');
      const whiteGoals = scoreFor(goals, 'white');

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

  return Array.from(statsMap.values()).filter(stats => 
    stats.gamesPlayed > 0 && !stats.player.name.includes('Guest')
  );
}

const pg = (val: number, gp: number) => gp > 0 ? val / gp : 0;

export function statValue(stats: PlayerStats, col: SortColumn, perGame = false): number {
  const gp = stats.gamesPlayed;
  switch (col) {
    case 'points': return perGame ? pg(stats.points, gp) : stats.points;
    case 'gamesPlayed': return stats.gamesPlayed;
    case 'wins': return perGame ? pg(stats.wins, gp) : stats.wins;
    case 'losses': return perGame ? pg(stats.losses, gp) : stats.losses;
    case 'ties': return perGame ? pg(stats.ties, gp) : stats.ties;
    case 'goalInvolvements': return perGame ? pg(stats.goalInvolvements, gp) : stats.goalInvolvements;
    case 'goals': return perGame ? pg(stats.goals, gp) : stats.goals;
    case 'ownGoals': return perGame ? pg(stats.ownGoals, gp) : stats.ownGoals;
    case 'assists': return perGame ? pg(stats.assists, gp) : stats.assists;
    case 'cleanSheets': return perGame ? pg(stats.cleanSheets, gp) : stats.cleanSheets;
    case 'sportsmanship': return perGame ? pg(stats.sportsmanship, gp) : stats.sportsmanship;
    case 'fouls': return perGame ? pg(stats.fouls, gp) : stats.fouls;
    case 'formWins': return stats.formWins;
}
}

export const TIEBREAKERS: Record<SortColumn, SortColumn[]> = {
  points: ['goalInvolvements', 'goals'],
  gamesPlayed: ['points', 'goalInvolvements'],
  wins: ['points', 'goalInvolvements'],
  losses: ['points', 'goalInvolvements'],
  ties: ['points', 'goalInvolvements'],
  goalInvolvements: ['goals', 'points'],
  goals: ['assists', 'points'],
  ownGoals: ['goals', 'points'],
  assists: ['goals', 'points'],
  cleanSheets: ['wins', 'points'],
  sportsmanship: ['points', 'goalInvolvements'],
  fouls: ['points', 'goalInvolvements'],
  formWins: ['points', 'goalInvolvements'],
};

/** Descending by the column, then its tiebreakers — the table's default order. */
export function compareStats(a: PlayerStats, b: PlayerStats, col: SortColumn, perGame = false): number {
  let c = statValue(b, col, perGame) - statValue(a, col, perGame);
  if (c === 0) {
    for (const t of TIEBREAKERS[col]) {
      c = statValue(b, t, perGame) - statValue(a, t, perGame);
      if (c !== 0) break;
    }
  }
  return c;
}
