import prisma from '../prisma';
import { isScoringGoal, isOwnGoal, scoreFor } from './goals';

// Types mirrored from stats.ts — kept local so this module is self-contained.
interface GoalData {
  scorerId: string;
  assisterId: string | null;
  timestamp: string;
  team: 'color' | 'white' | null;
  ownGoal?: boolean;
  goldenGoal?: boolean;
  value?: number; // scoreline weight; player credit is always 1
}

interface GameEventData {
  type: 'halfTime' | 'gameOver' | 'goldenGoalArmed';
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
  fouls: Record<string, number>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  current: number;
  target: number;
  reigning?: boolean; // Highlander: currently the reigning holder (sword badge)
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
    fouls: safeParseJSON<Record<string, number>>(g.fouls, {}),
  }));
}

function getGameResult(game: ParsedGame, team: 'color' | 'white'): 'W' | 'L' | 'T' {
  const colorGoals = scoreFor(game.goals, 'color');
  const whiteGoals = scoreFor(game.goals, 'white');
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

  let wins = 0, ties = 0, goals = 0, ownGoals = 0, assists = 0, gamesPlayed = 0, cleanSheets = 0, totalSportsmanship = 0;
  let comebackWins = 0, gameWinningGoals = 0, goldenGoals = 0;
  let secondHalfGoals = 0, halfHatTricks = 0;
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

    goals += game.goals.filter(g => g.scorerId === playerId && isScoringGoal(g)).length;
    // Golden goals are counted as RECORDS, never by their scoreline weight: a
    // decider worth 3 is one golden goal. Own goals never credit the scorer.
    goldenGoals += game.goals.filter(g => g.scorerId === playerId && isScoringGoal(g) && g.goldenGoal === true).length;
    ownGoals += game.goals.filter(g => g.scorerId === playerId && isOwnGoal(g)).length;
    assists += game.goals.filter(g => g.assisterId === playerId).length;

    const opponentTeam = playerTeam === 'color' ? 'white' : 'color';
    const opponentGoals = game.goals.filter(g => g.team === opponentTeam).length;
    if (opponentGoals === 0) cleanSheets++;

    totalSportsmanship += (game.sportsmanship[playerId] || 0) - (game.fouls[playerId] || 0);

    // Half-split scoring, for the tempo achievements. halfTime is the anchor the
    // data supports; gameOver is tapped whenever someone remembers, so it is not
    // read here. A game with no halfTime event contributes nothing rather than
    // guessing where the break fell.
    {
      const halfTime = game.gameEvents.find(e => e.type === 'halfTime');
      if (halfTime) {
        const ht = new Date(halfTime.timestamp).getTime();
        let firstHalf = 0;
        for (const g of game.goals) {
          if (g.scorerId !== playerId || !isScoringGoal(g)) continue;
          if (new Date(g.timestamp).getTime() <= ht) firstHalf++;
          else secondHalfGoals++;
        }
        if (firstHalf >= 3) halfHatTricks++;
      }
    }

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
      const colorGoals = scoreFor(game.goals, 'color');
      const whiteGoals = scoreFor(game.goals, 'white');
      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        if (playerMap.get(pid)!.name.includes('Guest')) continue;
        if (!stats.has(pid)) stats.set(pid, { points: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0, sportsmanship: 0 });
        const s = stats.get(pid)!;
        s.games++;
        s.sportsmanship += (game.sportsmanship[pid] || 0) - (game.fouls[pid] || 0);
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

  // The Highlander — annual title for a year's longest attendance streak
  // (most consecutive games attended; a miss resets the run; guests excluded).
  // The achievement unlocks for anyone who won a COMPLETED year; the reigning
  // holder (most recent completed year's champion) also gets a sword by name.
  const rosterOf = (g: ParsedGame) =>
    Object.keys(g.teamAssignments).filter(pid => {
      const info = playerMap.get(pid);
      return info && !info.name.includes('Guest');
    });
  const gamesByYearForStreak = new Map<number, ParsedGame[]>();
  for (const g of sortedGames) {
    if (rosterOf(g).length === 0) continue;
    const yr = g.createdAt.getFullYear();
    if (!gamesByYearForStreak.has(yr)) gamesByYearForStreak.set(yr, []);
    gamesByYearForStreak.get(yr)!.push(g);
  }
  const championsByYear = new Map<number, Set<string>>();
  for (const [yr, ygames] of gamesByYearForStreak) {
    const curRun = new Map<string, number>();
    const maxRun = new Map<string, number>();
    for (const g of ygames) {
      const present = new Set(rosterOf(g));
      for (const pid of present) {
        const r = (curRun.get(pid) ?? 0) + 1;
        curRun.set(pid, r);
        maxRun.set(pid, Math.max(maxRun.get(pid) ?? 0, r));
      }
      for (const pid of curRun.keys()) if (!present.has(pid)) curRun.set(pid, 0);
    }
    let bestRun = 0;
    for (const [, r] of maxRun) bestRun = Math.max(bestRun, r);
    if (bestRun >= 2) championsByYear.set(yr, new Set([...maxRun].filter(([, r]) => r === bestRun).map(([pid]) => pid)));
  }
  const completedChampYears = [...championsByYear.keys()].filter(yr => yr < currentYear).sort((a, b) => a - b);
  const wonHighlanderYears = completedChampYears.filter(yr => championsByYear.get(yr)!.has(playerId));
  const isHighlander = wonHighlanderYears.length > 0;
  const reigningYear = completedChampYears.length ? completedChampYears[completedChampYears.length - 1] : null;
  const isReigningHighlander = reigningYear !== null && championsByYear.get(reigningYear)!.has(playerId);

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
    { id: 'highlander', name: 'The Highlander', description: isHighlander
        ? `Won a season's longest attendance streak (${wonHighlanderYears.join(', ')}) — there can be only one`
        : `Win a season's longest attendance streak — there can be only one`,
      current: isHighlander ? 1 : 0, target: 1, reigning: isReigningHighlander },
    { id: 'first_sportsmanship', name: 'My First Gold Star!', description: 'Earn your first sportsmanship point', current: Math.max(0, Math.min(totalSportsmanship, 1)), target: 1 },
    { id: 'sportsmanship_10', name: 'Ted Lasso', description: 'Earn 10 sportsmanship points', current: Math.max(0, Math.min(totalSportsmanship, 10)), target: 10 },
    { id: 'comeback_3', name: 'They Had Us in the First Half', description: 'Come back to win after losing at halftime 3 times', current: Math.min(comebackWins, 3), target: 3 },
    // The id must NOT change - UserAchievementSeen is keyed on it, so a new id
    // would re-fire the "new achievement" notification for every existing holder.
    // Only the display name moves; the Dagger name goes to first_golden_goal.
    { id: 'game_winner', name: 'Game Winner', description: 'Score a game-winning goal', current: Math.min(gameWinningGoals, 1), target: 1 },
    { id: 'first_golden_goal', name: 'The Dagger', description: 'Score a golden goal', current: Math.min(goldenGoals, 1), target: 1 },
    { id: 'golden_goals_3', name: 'The Decider', description: 'Score 3 golden goals', current: Math.min(goldenGoals, 3), target: 3 },
    // Tempo achievements (MATCH_ANALYTICS_PRD.md). Lifetime, like every other
    // achievement here; the seasonal equivalents are awards, not these.
    { id: 'half_hat_trick', name: 'Forty-Five Minutes of Fame', description: 'Score 3 goals in a single half', current: Math.min(halfHatTricks, 1), target: 1 },
    { id: 'second_half_goals_5', name: 'The Late Show', description: 'Score 5 second-half goals', current: Math.min(secondHalfGoals, 5), target: 5 },
    { id: 'first_own_goal', name: 'Wrong Net', description: 'Score an own goal', current: Math.min(ownGoals, 1), target: 1 },
    { id: 'own_goals_3', name: 'Sponsored by the Opposition', description: 'Score 3 own goals', current: Math.min(ownGoals, 3), target: 3 },
  ];
}

export function earnedAchievementIds(achievements: Achievement[]): string[] {
  return achievements.filter(a => a.current >= a.target).map(a => a.id);
}
