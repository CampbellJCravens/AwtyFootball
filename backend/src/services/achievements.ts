import prisma from '../prisma';

// Types mirrored from stats.ts — kept local so this module is self-contained.
interface GoalData {
  scorerId: string;
  assisterId: string | null;
  timestamp: string;
  team: 'color' | 'white' | null;
}

interface GameEventData {
  type: 'halfTime' | 'gameOver';
  timestamp: string;
}

interface ParsedGame {
  id: string;
  gameNumber: number | null;
  createdAt: Date;
  teamAssignments: Record<string, 'color' | 'white'>;
  goals: GoalData[];
  gameEvents: GameEventData[];
  sportsmanship: Record<string, number>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  current: number;
  target: number;
}

const safeParseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

async function loadAllGames(): Promise<ParsedGame[]> {
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  return games.map(g => ({
    id: g.id,
    gameNumber: g.gameNumber,
    createdAt: g.createdAt,
    teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(g.teamAssignments, {}),
    goals: safeParseJSON<GoalData[]>(g.goals, []),
    gameEvents: safeParseJSON<GameEventData[]>(g.gameEvents, []),
    sportsmanship: safeParseJSON<Record<string, number>>(g.sportsmanship, {}),
  }));
}

function getGameResult(game: ParsedGame, team: 'color' | 'white'): 'W' | 'L' | 'T' {
  const colorGoals = game.goals.filter(g => g.team === 'color').length;
  const whiteGoals = game.goals.filter(g => g.team === 'white').length;
  if (colorGoals === whiteGoals) return 'T';
  if (team === 'color') return colorGoals > whiteGoals ? 'W' : 'L';
  return whiteGoals > colorGoals ? 'W' : 'L';
}

/**
 * Compute the current achievement progress for a player.
 * Returns null if the player does not exist.
 *
 * This is the single source of truth used by both the stats route and the
 * new-achievements popup endpoint, so any change to achievement definitions
 * or computation only needs to happen here.
 */
export async function computePlayerAchievements(playerId: string): Promise<Achievement[] | null> {
  const allPlayers = await prisma.player.findMany();
  const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));
  if (!playerMap.has(playerId)) return null;

  const allGames = await loadAllGames();

  let wins = 0, ties = 0, goals = 0, assists = 0, gamesPlayed = 0, cleanSheets = 0, totalSportsmanship = 0;
  let comebackWins = 0, gameWinningGoals = 0;
  const matchResults: ('W' | 'L' | 'T')[] = [];

  const sortedGames = [...allGames].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const game of sortedGames) {
    const playerTeam = game.teamAssignments[playerId];
    if (!playerTeam) continue;

    gamesPlayed++;
    const result = getGameResult(game, playerTeam);
    matchResults.push(result);
    if (result === 'W') wins++;
    else if (result === 'T') ties++;

    goals += game.goals.filter(g => g.scorerId === playerId).length;
    assists += game.goals.filter(g => g.assisterId === playerId).length;

    const opponentTeam = playerTeam === 'color' ? 'white' : 'color';
    const opponentGoals = game.goals.filter(g => g.team === opponentTeam).length;
    if (opponentGoals === 0) cleanSheets++;

    totalSportsmanship += game.sportsmanship[playerId] || 0;

    // Comeback win: losing at halftime but won the game
    if (result === 'W') {
      const halfTimeEvent = game.gameEvents.find(e => e.type === 'halfTime');
      if (halfTimeEvent) {
        const htTime = new Date(halfTimeEvent.timestamp).getTime();
        const goalsBeforeHalf = game.goals.filter(g => new Date(g.timestamp).getTime() <= htTime);
        const teamGoalsAtHalf = goalsBeforeHalf.filter(g => g.team === playerTeam).length;
        const oppGoalsAtHalf = goalsBeforeHalf.filter(g => g.team === opponentTeam).length;
        if (oppGoalsAtHalf > teamGoalsAtHalf) {
          comebackWins++;
        }
      }
    }

    // Game-winning goal: scored the last goal, it broke a tie, team won by 1
    if (result === 'W' && game.goals.length > 0) {
      const sortedGoals = [...game.goals].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const lastGoal = sortedGoals[sortedGoals.length - 1];
      if (lastGoal.scorerId === playerId && lastGoal.team === playerTeam) {
        // Count score before this goal
        const priorGoals = sortedGoals.slice(0, -1);
        const teamBefore = priorGoals.filter(g => g.team === playerTeam).length;
        const oppBefore = priorGoals.filter(g => g.team === opponentTeam).length;
        // Was it a tie-breaker? And final margin is 1?
        const finalTeam = teamBefore + 1;
        const finalOpp = oppBefore;
        if (teamBefore === oppBefore && finalTeam - finalOpp === 1) {
          gameWinningGoals++;
        }
      }
    }
  }

  let maxWinStreak = 0, currentStreak = 0;
  for (const r of matchResults) {
    if (r === 'W') { currentStreak++; maxWinStreak = Math.max(maxWinStreak, currentStreak); }
    else currentStreak = 0;
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const gamesByMonth = new Map<string, ParsedGame[]>();
  for (const g of allGames) {
    const key = `${g.createdAt.getFullYear()}-${g.createdAt.getMonth() + 1}`;
    if (!gamesByMonth.has(key)) gamesByMonth.set(key, []);
    gamesByMonth.get(key)!.push(g);
  }

  type PlayerStat = { points: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number; sportsmanship: number };

  const getTopIds = (stats: Map<string, PlayerStat>, metric: (s: PlayerStat) => number, filter?: (s: PlayerStat) => boolean): string[] => {
    let topIds: string[] = [];
    let topVal = -1;
    for (const [pid, s] of stats) {
      if (filter && !filter(s)) continue;
      const val = metric(s);
      if (val > topVal) { topVal = val; topIds = [pid]; }
      else if (val === topVal && val > 0) { topIds.push(pid); }
    }
    if (topIds.length === 0 || topVal === 0) return [];
    return topIds;
  };

  let awardsCount = 0;
  let playedAllGamesInMonth = false;
  let undefeatedInMonth = false;

  for (const [key, monthGames] of gamesByMonth) {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    if (year === currentYear && month === currentMonth) continue;

    const stats = new Map<string, PlayerStat>();
    for (const game of monthGames) {
      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;
      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        if (playerMap.get(pid)!.name.includes('Guest')) continue;
        if (!stats.has(pid)) stats.set(pid, { points: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0, sportsmanship: 0 });
        const s = stats.get(pid)!;
        s.games++;
        s.sportsmanship += game.sportsmanship[pid] || 0;
        const isTie = colorGoals === whiteGoals;
        const isWin = (team === 'color' && colorGoals > whiteGoals) || (team === 'white' && whiteGoals > colorGoals);
        if (isWin) s.points += 3;
        else if (isTie) s.points += 1;
        const opponentGoals = team === 'color' ? whiteGoals : colorGoals;
        s.goalsAllowed += opponentGoals;
      }
      for (const goal of game.goals) {
        if (stats.has(goal.scorerId)) { stats.get(goal.scorerId)!.goals++; stats.get(goal.scorerId)!.goalInvolvements++; }
        if (goal.assisterId && stats.has(goal.assisterId)) { stats.get(goal.assisterId)!.assists++; stats.get(goal.assisterId)!.goalInvolvements++; }
      }
    }

    const awardDefs = [
      { metric: (s: PlayerStat) => s.points, minimum: 3 as number | undefined, filter: undefined as ((s: PlayerStat) => boolean) | undefined },
      { metric: (s: PlayerStat) => s.goalInvolvements, minimum: 1 as number | undefined, filter: undefined as ((s: PlayerStat) => boolean) | undefined },
      { metric: (s: PlayerStat) => s.goals, minimum: 1 as number | undefined, filter: undefined as ((s: PlayerStat) => boolean) | undefined },
      { metric: (s: PlayerStat) => s.assists, minimum: 1 as number | undefined, filter: undefined as ((s: PlayerStat) => boolean) | undefined },
      { metric: (s: PlayerStat) => (s.games * 3) - s.goalsAllowed, minimum: undefined as number | undefined, filter: ((s: PlayerStat) => s.games > 1) as ((s: PlayerStat) => boolean) | undefined },
    ];
    // Sportsman of the Month only from May 2026 onwards
    if (year > 2026 || (year === 2026 && month >= 5)) {
      awardDefs.push({ metric: (s: PlayerStat) => s.sportsmanship, minimum: 1 as number | undefined, filter: undefined as ((s: PlayerStat) => boolean) | undefined });
    }
    for (const def of awardDefs) {
      const winnerIds = getTopIds(stats, def.metric, def.filter);
      if (winnerIds.length === 0) continue;
      const topVal = def.metric(stats.get(winnerIds[0])!);
      if (def.minimum !== undefined && topVal <= def.minimum) continue;
      if (winnerIds.includes(playerId)) awardsCount++;
    }

    const duoStats = new Map<string, { ids: [string, string]; contributions: number }>();
    for (const game of monthGames) {
      for (const goal of game.goals) {
        if (!goal.assisterId) continue;
        if (!stats.has(goal.scorerId) || !stats.has(goal.assisterId)) continue;
        const [a, b] = [goal.scorerId, goal.assisterId].sort();
        const duoKey = `${a}:${b}`;
        if (!duoStats.has(duoKey)) duoStats.set(duoKey, { ids: [a, b] as [string, string], contributions: 0 });
        duoStats.get(duoKey)!.contributions++;
      }
    }
    let topDuoVal = 0;
    for (const [, duo] of duoStats) {
      if (duo.contributions > topDuoVal) topDuoVal = duo.contributions;
    }
    if (topDuoVal > 1) {
      for (const [, duo] of duoStats) {
        if (duo.contributions === topDuoVal && duo.ids.includes(playerId)) { awardsCount++; break; }
      }
    }

    const playerGamesInMonth = monthGames.filter(g => g.teamAssignments[playerId]);
    if (playerGamesInMonth.length === monthGames.length && monthGames.length > 0) {
      playedAllGamesInMonth = true;

      const allUndefeated = playerGamesInMonth.every(g => {
        const team = g.teamAssignments[playerId];
        const result = getGameResult(g, team);
        return result === 'W' || result === 'T';
      });
      if (allUndefeated) undefeatedInMonth = true;
    }
  }

  const totalPoints = (wins * 3) + (ties * 1);

  // The Highlander — "there can be only one": the longest attendance streak of
  // the current year (most consecutive games attended without missing one).
  // Rewards the most reliable attendee; a miss resets the run. Guests excluded.
  const highlanderYear = currentYear;
  const isNonGuestOnRoster = (g: ParsedGame) =>
    Object.keys(g.teamAssignments).filter(pid => {
      const info = playerMap.get(pid);
      return info && !info.name.includes('Guest');
    });
  const streakGames = sortedGames.filter(g => g.createdAt.getFullYear() === highlanderYear && isNonGuestOnRoster(g).length > 0);

  const curRun = new Map<string, number>();
  const maxRun = new Map<string, number>();
  for (const g of streakGames) {
    const present = new Set(isNonGuestOnRoster(g));
    for (const pid of present) {
      const r = (curRun.get(pid) ?? 0) + 1;
      curRun.set(pid, r);
      maxRun.set(pid, Math.max(maxRun.get(pid) ?? 0, r));
    }
    for (const pid of curRun.keys()) {
      if (!present.has(pid)) curRun.set(pid, 0);
    }
  }
  let bestRun = 0;
  for (const [, r] of maxRun) bestRun = Math.max(bestRun, r);
  const isHighlander = bestRun >= 2 && (maxRun.get(playerId) ?? 0) === bestRun;

  return [
    { id: 'first_goal', name: 'My First Goal!', description: 'Score your first goal', current: Math.min(goals, 1), target: 1 },
    { id: 'goals_10', name: 'R9? Or Manny Suarez?', description: 'Score 10 goals', current: Math.min(goals, 10), target: 10 },
    { id: 'first_assist', name: 'My First Assist!', description: 'Record your first assist', current: Math.min(assists, 1), target: 1 },
    { id: 'assists_10', name: 'The Playmaker', description: 'Record 10 assists', current: Math.min(assists, 10), target: 10 },
    { id: 'first_win', name: 'My First Win!', description: 'Win your first game', current: Math.min(wins, 1), target: 1 },
    { id: 'wins_10', name: 'Victory Lap', description: 'Win 10 games', current: Math.min(wins, 10), target: 10 },
    { id: 'games_10', name: 'Regular', description: 'Play 10 games', current: Math.min(gamesPlayed, 10), target: 10 },
    { id: 'games_50', name: 'Iron Man', description: 'Play 50 games', current: Math.min(gamesPlayed, 50), target: 50 },
    { id: 'points_100', name: 'Centurion', description: 'Earn 100 points', current: Math.min(totalPoints, 100), target: 100 },
    { id: 'awards_3', name: 'Trophy Collector', description: 'Win 3 awards', current: Math.min(awardsCount, 3), target: 3 },
    { id: 'win_streak_3', name: 'Hat Trick of Wins', description: 'Win 3 games in a row', current: Math.min(maxWinStreak, 3), target: 3 },
    { id: 'clean_sheets_3', name: 'Brick Wall', description: 'Keep 3 clean sheets', current: Math.min(cleanSheets, 3), target: 3 },
    { id: 'mr_consistent', name: 'Mr. Consistent', description: 'Play every game in a month', current: playedAllGamesInMonth ? 1 : 0, target: 1 },
    { id: 'invincible', name: 'Invincible', description: 'Go undefeated in a month (play all games, only wins or ties)', current: undefeatedInMonth ? 1 : 0, target: 1 },
    { id: 'highlander', name: 'The Highlander', description: `Hold the longest attendance streak of ${highlanderYear} — there can be only one`, current: isHighlander ? 1 : 0, target: 1 },
    { id: 'first_sportsmanship', name: 'My First Gold Star!', description: 'Earn your first sportsmanship point', current: Math.min(totalSportsmanship, 1), target: 1 },
    { id: 'sportsmanship_10', name: 'Ted Lasso', description: 'Earn 10 sportsmanship points', current: Math.min(totalSportsmanship, 10), target: 10 },
    { id: 'comeback_3', name: 'They Had Us in the First Half', description: 'Come back to win after losing at halftime 3 times', current: Math.min(comebackWins, 3), target: 3 },
    { id: 'game_winner', name: 'The Dagger', description: 'Score a game-winning goal', current: Math.min(gameWinningGoals, 1), target: 1 },
  ];
}

export function earnedAchievementIds(achievements: Achievement[]): string[] {
  return achievements.filter(a => a.current >= a.target).map(a => a.id);
}
