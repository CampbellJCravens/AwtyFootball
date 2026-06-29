import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { computePlayerAchievements, earnedAchievementIds } from '../services/achievements';

const router = Router();

const safeParseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

interface GoalData {
  scorerId: string;
  assisterId: string | null;
  timestamp: string;
  team: 'color' | 'white' | null;
}

interface ParsedGame {
  id: string;
  gameNumber: number | null;
  createdAt: Date;
  field: string | null;
  teamAssignments: Record<string, 'color' | 'white'>;
  goals: GoalData[];
  sportsmanship: Record<string, number>;
}

async function loadAllGames(): Promise<ParsedGame[]> {
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  return games.map(g => ({
    id: g.id,
    gameNumber: g.gameNumber,
    createdAt: g.createdAt,
    field: g.field,
    teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(g.teamAssignments, {}),
    goals: safeParseJSON<GoalData[]>(g.goals, []),
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

// ── GET /api/stats/player/:id ──
router.get('/player/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const allGames = await loadAllGames();
    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    let wins = 0, losses = 0, ties = 0, totalGoals = 0, totalAssists = 0;
    const matchHistory: any[] = [];
    const partnerTracker = new Map<string, { games: number; points: number }>();
    const groupTracker = new Map<string, { playerIds: string[]; games: number; points: number }>();
    // Track assist relationships
    const assistedByMe = new Map<string, number>(); // people I've assisted (their goals)
    const assistedMe = new Map<string, number>(); // people who've assisted my goals

    for (const game of allGames) {
      const playerTeam = game.teamAssignments[player.id];
      if (!playerTeam) continue;

      const result = getGameResult(game, playerTeam);
      if (result === 'W') wins++;
      else if (result === 'L') losses++;
      else ties++;

      const points = result === 'W' ? 3 : result === 'T' ? 1 : 0;

      const colorScore = game.goals.filter(g => g.team === 'color').length;
      const whiteScore = game.goals.filter(g => g.team === 'white').length;
      const goalsScored = game.goals.filter(g => g.scorerId === player.id).length;
      const assistsMade = game.goals.filter(g => g.assisterId === player.id).length;
      totalGoals += goalsScored;
      totalAssists += assistsMade;

      matchHistory.push({
        gameId: game.id,
        gameNumber: game.gameNumber,
        date: game.createdAt.toISOString(),
        team: playerTeam,
        result,
        goalsScored,
        assists: assistsMade,
        colorScore,
        whiteScore,
      });

      // Track teammates for best partners (by PPG)
      const teammates = Object.entries(game.teamAssignments)
        .filter(([pid, team]) => pid !== player.id && team === playerTeam)
        .map(([pid]) => pid);

      for (const tmId of teammates) {
        if (!partnerTracker.has(tmId)) partnerTracker.set(tmId, { games: 0, points: 0 });
        const p = partnerTracker.get(tmId)!;
        p.games++;
        p.points += points;
      }

      // Track groups of 3 and 4 that include this player
      const teammatesWithMe = [player.id, ...teammates].sort();
      for (const size of [3, 4]) {
        if (teammatesWithMe.length < size) continue;
        const combos = getCombinations(teammatesWithMe, size).filter(c => c.includes(player.id));
        for (const combo of combos) {
          const key = combo.join('|');
          if (!groupTracker.has(key)) groupTracker.set(key, { playerIds: combo, games: 0, points: 0 });
          const g = groupTracker.get(key)!;
          g.games++;
          g.points += points;
        }
      }

      // Track assist relationships from this game's goals
      for (const goal of game.goals) {
        // Goals where I assisted someone else
        if (goal.assisterId === player.id && goal.scorerId !== player.id) {
          assistedByMe.set(goal.scorerId, (assistedByMe.get(goal.scorerId) || 0) + 1);
        }
        // Goals where someone assisted me
        if (goal.scorerId === player.id && goal.assisterId && goal.assisterId !== player.id) {
          assistedMe.set(goal.assisterId, (assistedMe.get(goal.assisterId) || 0) + 1);
        }
      }
    }

    const gamesPlayed = wins + losses + ties;
    const totalPoints = (wins * 3) + (ties * 1);
    const ppg = gamesPlayed > 0 ? Math.round((totalPoints / gamesPlayed) * 100) / 100 : 0;
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

    // Best partners by PPG: min 3 games together
    const bestPartnersByPPG = Array.from(partnerTracker.entries())
      .filter(([, data]) => data.games >= 3)
      .map(([partnerId, data]) => ({
        player: playerMap.get(partnerId) || { id: partnerId, name: 'Unknown', pictureUrl: null },
        gamesPlayed: data.games,
        ppg: Math.round((data.points / data.games) * 100) / 100,
      }))
      .sort((a, b) => b.ppg - a.ppg || b.gamesPlayed - a.gamesPlayed)
      .slice(0, 10);

    // People I've assisted (my assists led to their goals)
    const myAssistsTo = Array.from(assistedByMe.entries())
      .map(([pid, count]) => ({
        player: playerMap.get(pid) || { id: pid, name: 'Unknown', pictureUrl: null },
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // People who've assisted me (their assists led to my goals)
    const assistsToMe = Array.from(assistedMe.entries())
      .map(([pid, count]) => ({
        player: playerMap.get(pid) || { id: pid, name: 'Unknown', pictureUrl: null },
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Best groups (trios/squads) by PPG: min 3 games together
    const bestGroups = Array.from(groupTracker.values())
      .filter(g => g.games >= 3)
      .map(g => ({
        players: g.playerIds.map(id => playerMap.get(id) || { id, name: 'Unknown', pictureUrl: null }),
        gamesPlayed: g.games,
        ppg: Math.round((g.points / g.games) * 100) / 100,
        size: g.playerIds.length,
      }))
      .sort((a, b) => b.ppg - a.ppg || b.gamesPlayed - a.gamesPlayed)
      .slice(0, 10);

    // Form: last 10 results (matchHistory is already newest-first)
    const form = matchHistory.slice(0, 10).map(m => m.result);

    // Compute league rankings by calculating stats for all players
    const allPlayerStats = new Map<string, { games: number; wins: number; points: number; ppg: number; goals: number; assists: number; goalInvolvements: number }>();
    for (const p of allPlayers) {
      if (p.name.includes('Guest')) continue;
      let pWins = 0, pTies = 0, pGames = 0, pGoals = 0, pAssists = 0;
      for (const game of allGames) {
        const team = game.teamAssignments[p.id];
        if (!team) continue;
        pGames++;
        const result = getGameResult(game, team);
        if (result === 'W') pWins++;
        else if (result === 'T') pTies++;
        pGoals += game.goals.filter(g => g.scorerId === p.id).length;
        pAssists += game.goals.filter(g => g.assisterId === p.id).length;
      }
      if (pGames === 0) continue;
      const pPoints = (pWins * 3) + (pTies * 1);
      allPlayerStats.set(p.id, { games: pGames, wins: pWins, points: pPoints, ppg: Math.round((pPoints / pGames) * 100) / 100, goals: pGoals, assists: pAssists, goalInvolvements: pGoals + pAssists });
    }

    const MIN_QUALIFIED_GAMES = 3;
    const getRank = (metric: (s: { games: number; wins: number; points: number; ppg: number; goals: number; assists: number; goalInvolvements: number }) => number): number => {
      const myVal = allPlayerStats.get(player.id);
      if (!myVal || myVal.games < MIN_QUALIFIED_GAMES) return 0;
      const myMetric = metric(myVal);
      let rank = 1;
      for (const [pid, s] of allPlayerStats) {
        if (pid !== player.id && s.games >= MIN_QUALIFIED_GAMES && metric(s) > myMetric) rank++;
      }
      return rank;
    };

    const ranks = {
      games: getRank(s => s.games),
      points: getRank(s => s.points),
      wins: getRank(s => s.wins),
      ppg: getRank(s => s.ppg),
      goalInvolvements: getRank(s => s.goalInvolvements),
      goals: getRank(s => s.goals),
      assists: getRank(s => s.assists),
    };

    // Legacy stats
    const legacyRecords = await prisma.legacyStat.findMany({ where: { playerId: player.id } });
    const legacyStats: Record<string, { goals: number; assists: number; wins: number }> = {};
    const legacyTotals = { goals: 0, assists: 0, wins: 0 };
    for (const rec of legacyRecords) {
      legacyStats[rec.season] = { goals: rec.goals, assists: rec.assists, wins: rec.wins };
      legacyTotals.goals += rec.goals;
      legacyTotals.assists += rec.assists;
      legacyTotals.wins += rec.wins;
    }

    res.json({
      player: { id: player.id, name: player.name, pictureUrl: player.pictureUrl },
      aggregate: { games: gamesPlayed, wins, losses, ties, winRate, ppg, goals: totalGoals, assists: totalAssists },
      ranks,
      matchHistory,
      bestPartnersByPPG,
      bestGroups,
      myAssistsTo,
      assistsToMe,
      form,
      legacyStats: Object.keys(legacyStats).length > 0 ? legacyStats : null,
      legacyTotals: Object.keys(legacyStats).length > 0 ? legacyTotals : null,
    });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// ── GET /api/stats/chemistry ──
router.get('/chemistry', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const type = (req.query.type as string) || 'duos';
    const minGames = parseInt(req.query.minGames as string) || 3;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const allGames = await loadAllGames();
    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    if (type === 'goalPartners') {
      // Track scorer-assister pairs
      const pairMap = new Map<string, { playerIds: [string, string]; total: number; goals: number; assists: number }>();

      for (const game of allGames) {
        for (const goal of game.goals) {
          if (!goal.assisterId) continue;
          // Normalize pair key (alphabetical order)
          const [a, b] = [goal.scorerId, goal.assisterId].sort();
          const key = `${a}|${b}`;
          if (!pairMap.has(key)) pairMap.set(key, { playerIds: [a, b], total: 0, goals: 0, assists: 0 });
          pairMap.get(key)!.total++;
        }
      }

      const results = Array.from(pairMap.values())
        .filter(p => p.total >= 2)
        .sort((a, b) => b.total - a.total)
        .slice(0, limit)
        .map(p => ({
          players: p.playerIds.map(id => playerMap.get(id) || { id, name: 'Unknown', pictureUrl: null }),
          totalContributions: p.total,
        }));

      return res.json({ type: 'goalPartners', results });
    }

    // Duos, Trios, Squads
    const groupSize = type === 'duos' ? 2 : type === 'trios' ? 3 : 4;
    const comboTracker = new Map<string, { playerIds: string[]; games: number; wins: number; ties: number }>();

    for (const game of allGames) {
      const assignments = game.teamAssignments;
      if (!assignments || Object.keys(assignments).length === 0) continue;

      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;
      const isTie = colorGoals === whiteGoals;

      for (const team of ['color', 'white'] as const) {
        const teamPlayers = Object.entries(assignments)
          .filter(([, t]) => t === team)
          .map(([pid]) => pid)
          .sort();

        if (teamPlayers.length < groupSize) continue;

        const isWin = (team === 'color' && colorGoals > whiteGoals) || (team === 'white' && whiteGoals > colorGoals);

        // Generate combinations
        const combos = getCombinations(teamPlayers, groupSize);
        for (const combo of combos) {
          const key = combo.join('|');
          if (!comboTracker.has(key)) comboTracker.set(key, { playerIds: combo, games: 0, wins: 0, ties: 0 });
          const entry = comboTracker.get(key)!;
          entry.games++;
          if (isWin) entry.wins++;
          else if (isTie) entry.ties++;
        }
      }
    }

    const results = Array.from(comboTracker.values())
      .filter(c => c.games >= minGames)
      .map(c => {
        const points = (c.wins * 3) + (c.ties * 1);
        const ppg = Math.round((points / c.games) * 100) / 100;
        return {
          players: c.playerIds.map(id => playerMap.get(id) || { id, name: 'Unknown', pictureUrl: null }),
          gamesPlayed: c.games,
          wins: c.wins,
          ppg,
          totalPoints: points,
        };
      })
      .sort((a, b) => b.ppg - a.ppg || b.gamesPlayed - a.gamesPlayed)
      .slice(0, limit);

    res.json({ type, results });
  } catch (error) {
    console.error('Error fetching chemistry stats:', error);
    res.status(500).json({ error: 'Failed to fetch chemistry stats' });
  }
});

// Generate all combinations of size k from array
function getCombinations(arr: string[], k: number): string[][] {
  if (k === 1) return arr.map(x => [x]);
  if (k === arr.length) return [arr];
  const results: string[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) {
      results.push([arr[i], ...combo]);
    }
  }
  return results;
}

// ── GET /api/stats/monthly?month=3&year=2026 ──
router.get('/monthly', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const allGames = await loadAllGames();
    // Cancelled games never happened — exclude them from the monthly count,
    // award computation, and player stats for the period.
    const monthGames = allGames.filter(g =>
      g.createdAt >= startDate && g.createdAt < endDate && g.field !== 'cancelled'
    );

    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    // Compute per-player stats for this month
    const stats = new Map<string, PlayerStat>();
    type PlayerStat = { points: number; wins: number; ties: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number; sportsmanship: number };

    for (const game of monthGames) {
      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;

      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        const playerInfo = playerMap.get(pid)!;
        if (playerInfo.name.includes('Guest')) continue;

        if (!stats.has(pid)) stats.set(pid, { points: 0, wins: 0, ties: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0, sportsmanship: 0 });
        const s = stats.get(pid)!;
        s.games++;
        s.sportsmanship += game.sportsmanship[pid] || 0;

        const isTie = colorGoals === whiteGoals;
        const isWin = (team === 'color' && colorGoals > whiteGoals) || (team === 'white' && whiteGoals > colorGoals);
        if (isWin) { s.points += 3; s.wins++; }
        else if (isTie) { s.points += 1; s.ties++; }

        const opponentGoals = team === 'color' ? whiteGoals : colorGoals;
        s.goalsAllowed += opponentGoals;
      }

      for (const goal of game.goals) {
        if (stats.has(goal.scorerId)) {
          stats.get(goal.scorerId)!.goals++;
          stats.get(goal.scorerId)!.goalInvolvements++;
        }
        if (goal.assisterId && stats.has(goal.assisterId)) {
          stats.get(goal.assisterId)!.assists++;
          stats.get(goal.assisterId)!.goalInvolvements++;
        }
      }
    }

    const getTop = (metric: (s: PlayerStat) => number, tiebreakers?: ((s: PlayerStat) => number)[], minimum?: number, filter?: (s: PlayerStat) => boolean) => {
      let topIds: string[] = [];
      let topVal = -1;
      for (const [pid, s] of stats) {
        if (filter && !filter(s)) continue;
        const val = metric(s);
        if (val > topVal) { topVal = val; topIds = [pid]; }
        else if (val === topVal && val > 0) { topIds.push(pid); }
      }
      if (topIds.length === 0 || topVal === 0) return null;
      if (minimum !== undefined && topVal <= minimum) return null;

      // Apply tiebreakers if there are ties
      if (topIds.length > 1 && tiebreakers) {
        for (const tb of tiebreakers) {
          let bestVal = -1;
          let bestIds: string[] = [];
          for (const pid of topIds) {
            const val = tb(stats.get(pid)!);
            if (val > bestVal) { bestVal = val; bestIds = [pid]; }
            else if (val === bestVal) { bestIds.push(pid); }
          }
          topIds = bestIds;
          if (topIds.length === 1) break;
        }
      }

      return topIds.map(id => {
        const s = stats.get(id)!;
        return { player: playerMap.get(id)!, value: topVal, games: s.games, wins: s.wins, ties: s.ties, goals: s.goals, assists: s.assists, goalsAllowed: s.goalsAllowed };
      });
    };

    // Top leaderboard: targets ~5 entries, only adds a new rank group if it fits within 5
    const getLeaderboard = (metric: (s: PlayerStat) => number, opts?: { target?: number; includeAll?: boolean; extraFields?: (s: PlayerStat) => Record<string, number>; filter?: (s: PlayerStat) => boolean }) => {
      const target = opts?.target ?? 5;
      const entries = Array.from(stats.entries())
        .filter(([, s]) => !opts?.filter || opts.filter(s))
        .map(([pid, s]) => ({ pid, value: metric(s), extra: opts?.extraFields?.(s) }))
        .filter(e => opts?.includeAll || e.value > 0)
        .sort((a, b) => b.value - a.value);
      if (entries.length === 0) return [];
      const result: { player: typeof playerMap extends Map<string, infer V> ? V : never; value: number; games?: number; goalsAllowed?: number }[] = [];
      let lastVal = Infinity;
      for (const e of entries) {
        const isNewRank = e.value !== lastVal;
        if (isNewRank && result.length >= target) break;
        lastVal = e.value;
        result.push({ player: playerMap.get(e.pid)!, value: e.value, ...e.extra });
      }
      return result;
    };

    const playerOfTheMonth = getTop(s => s.points, undefined, 3);
    const topGoalContributor = getTop(s => s.goalInvolvements, undefined, 1);
    const topScorer = getTop(s => s.goals, undefined, 1);
    const topAssister = getTop(s => s.assists, undefined, 1);
    const topDefender = getTop(s => (s.games * 3) - s.goalsAllowed, undefined, undefined, s => s.games > 1);

    // Sportsman of the Month: only awarded from May 2026 onwards (no historical data)
    const sportsmanOfTheMonth = (year > 2026 || (year === 2026 && month >= 5))
      ? getTop(s => s.sportsmanship, undefined, 1)
      : null;

    // Top Duo: pair with the most scorer-assister goal contributions to each other
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
    const topDuo = topDuoVal > 1
      ? Array.from(duoStats.values())
          .filter(d => d.contributions === topDuoVal)
          .map(d => ({ players: [playerMap.get(d.ids[0])!, playerMap.get(d.ids[1])!], value: d.contributions }))
      : null;

    // Figure out which months have non-cancelled games. A month with only
    // cancelled games shouldn't show up in the month picker.
    const allMonths: { month: number; year: number }[] = [];
    const seen = new Set<string>();
    for (const g of allGames) {
      if (g.field === 'cancelled') continue;
      const m = g.createdAt.getMonth() + 1;
      const y = g.createdAt.getFullYear();
      const key = `${y}-${m}`;
      if (!seen.has(key)) { seen.add(key); allMonths.push({ month: m, year: y }); }
    }
    allMonths.sort((a, b) => b.year - a.year || b.month - a.month);

    res.json({
      month,
      year,
      gamesPlayed: monthGames.length,
      availableMonths: allMonths,
      awards: {
        playerOfTheMonth,
        topGoalContributor,
        topScorer,
        topAssister,
        topDefender,
        sportsmanOfTheMonth,
        topDuo,
      },
      leaderboards: {
        points: getLeaderboard(s => s.points),
        goalInvolvements: getLeaderboard(s => s.goalInvolvements),
        goals: getLeaderboard(s => s.goals),
        assists: getLeaderboard(s => s.assists),
        defensiveRating: getLeaderboard(s => (s.games * 3) - s.goalsAllowed, { includeAll: true, extraFields: s => ({ games: s.games, goalsAllowed: s.goalsAllowed }), filter: s => s.games > 1 }),
        sportsmanship: (year > 2026 || (year === 2026 && month >= 5)) ? getLeaderboard(s => s.sportsmanship) : [],
      },
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

// ── GET /api/stats/player/:id/awards ──
router.get('/player/:id/awards', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.params.id;
    const allGames = await loadAllGames();
    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    if (!playerMap.has(playerId)) return res.status(404).json({ error: 'Player not found' });

    // Group games by month
    const gamesByMonth = new Map<string, ParsedGame[]>();
    for (const g of allGames) {
      const key = `${g.createdAt.getFullYear()}-${g.createdAt.getMonth() + 1}`;
      if (!gamesByMonth.has(key)) gamesByMonth.set(key, []);
      gamesByMonth.get(key)!.push(g);
    }

    type PlayerStat = { points: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number };

    const getTopIds = (stats: Map<string, PlayerStat>, metric: (s: PlayerStat) => number, tiebreakers?: ((s: PlayerStat) => number)[], filter?: (s: PlayerStat) => boolean): string[] => {
      let topIds: string[] = [];
      let topVal = -1;
      for (const [pid, s] of stats) {
        if (filter && !filter(s)) continue;
        const val = metric(s);
        if (val > topVal) { topVal = val; topIds = [pid]; }
        else if (val === topVal && val > 0) { topIds.push(pid); }
      }
      if (topIds.length === 0 || topVal === 0) return [];
      if (topIds.length > 1 && tiebreakers) {
        for (const tb of tiebreakers) {
          let bestVal = -1;
          let bestIds: string[] = [];
          for (const pid of topIds) {
            const val = tb(stats.get(pid)!);
            if (val > bestVal) { bestVal = val; bestIds = [pid]; }
            else if (val === bestVal) { bestIds.push(pid); }
          }
          topIds = bestIds;
          if (topIds.length === 1) break;
        }
      }
      return topIds;
    };

    const awards: { month: number; year: number; award: string; value: number; unit: string; partner?: { id: string; name: string; pictureUrl: string | null } }[] = [];
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    for (const [key, monthGames] of gamesByMonth) {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      // Skip the current month since it's still in progress
      if (year === currentYear && month === currentMonth) continue;

      const stats = new Map<string, PlayerStat>();
      for (const game of monthGames) {
        const colorGoals = game.goals.filter(g => g.team === 'color').length;
        const whiteGoals = game.goals.filter(g => g.team === 'white').length;
        for (const [pid, team] of Object.entries(game.teamAssignments)) {
          if (!playerMap.has(pid)) continue;
          if (playerMap.get(pid)!.name.includes('Guest')) continue;
          if (!stats.has(pid)) stats.set(pid, { points: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0 });
          const s = stats.get(pid)!;
          s.games++;
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

      const awardDefs: { name: string; unit: string; metric: (s: PlayerStat) => number; tiebreakers?: ((s: PlayerStat) => number)[]; minimum?: number; filter?: (s: PlayerStat) => boolean }[] = [
        { name: 'Player of the Month', unit: 'Points', metric: s => s.points, minimum: 3 },
        { name: 'Top Goal Contributor', unit: 'Goals + Assists', metric: s => s.goalInvolvements, minimum: 1 },
        { name: 'Top Scorer', unit: 'Goals', metric: s => s.goals, minimum: 1 },
        { name: 'Top Assister', unit: 'Assists', metric: s => s.assists, minimum: 1 },
        { name: 'Top Defender', unit: 'Defensive Rating', metric: s => (s.games * 3) - s.goalsAllowed, filter: s => s.games > 1 },
      ];

      for (const def of awardDefs) {
        const winnerIds = getTopIds(stats, def.metric, def.tiebreakers, def.filter);
        const topVal = winnerIds.length > 0 ? def.metric(stats.get(winnerIds[0])!) : 0;
        if (def.minimum !== undefined && topVal <= def.minimum) continue;
        if (winnerIds.includes(playerId)) {
          awards.push({ month, year, award: def.name, value: def.metric(stats.get(playerId)!), unit: def.unit });
        }
      }

      // Top Duo for this month (scorer-assister pairs)
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
          if (duo.contributions === topDuoVal && duo.ids.includes(playerId)) {
            const partnerId = duo.ids[0] === playerId ? duo.ids[1] : duo.ids[0];
            const partner = playerMap.get(partnerId);
            awards.push({ month, year, award: 'Top Duo', value: topDuoVal, unit: 'Goal Contributions', partner: partner ? { id: partner.id, name: partner.name, pictureUrl: partner.pictureUrl } : undefined });
            break;
          }
        }
      }
    }

    awards.sort((a, b) => b.year - a.year || b.month - a.month);
    res.json(awards);
  } catch (error) {
    console.error('Error fetching player awards:', error);
    res.status(500).json({ error: 'Failed to fetch player awards' });
  }
});

// ── GET /api/stats/me/new-achievements ──
// Returns achievements the logged-in user's linked player has earned but has
// not yet seen a popup for. Atomically marks them as seen in the same call,
// so refreshing or losing the popup mid-view doesn't re-trigger.
router.get('/me/new-achievements', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, playerId: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.playerId) return res.json([]); // No linked player → no popup

    const achievements = await computePlayerAchievements(user.playerId);
    if (!achievements) return res.json([]); // Linked player was deleted

    const earnedIds = earnedAchievementIds(achievements);
    if (earnedIds.length === 0) return res.json([]);

    const alreadySeen = await prisma.userAchievementSeen.findMany({
      where: { userId: user.id, achievementId: { in: earnedIds } },
      select: { achievementId: true },
    });
    const seenSet = new Set(alreadySeen.map(r => r.achievementId));
    const newIds = earnedIds.filter(id => !seenSet.has(id));

    if (newIds.length === 0) return res.json([]);

    // Mark seen atomically so we don't re-show on refresh.
    await prisma.userAchievementSeen.createMany({
      data: newIds.map(id => ({ userId: user.id, achievementId: id })),
      skipDuplicates: true,
    });

    const achievementsById = new Map(achievements.map(a => [a.id, a]));
    const newAchievements = newIds
      .map(id => achievementsById.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a);

    res.json(newAchievements);
  } catch (error) {
    console.error('Error fetching new achievements:', error);
    res.status(500).json({ error: 'Failed to fetch new achievements' });
  }
});

// ── GET /api/stats/player/:id/achievements ──
router.get('/player/:id/achievements', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.params.id;
    const achievements = await computePlayerAchievements(playerId);
    if (!achievements) return res.status(404).json({ error: 'Player not found' });
    return res.json(achievements);
  } catch (error) {
    console.error('Error fetching player achievements:', error);
    return res.status(500).json({ error: 'Failed to fetch player achievements' });
  }
});

// ── GET /api/stats/legacy?season=all|2022-2023|2023-2024 ──
router.get('/legacy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const seasonFilter = (req.query.season as string) || 'all';

    const where = seasonFilter !== 'all' ? { season: seasonFilter } : {};
    const legacyStats = await prisma.legacyStat.findMany({ where });

    const playerIds = [...new Set(legacyStats.map(s => s.playerId))];
    const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
    const playerMap = new Map(players.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    // Group by player
    const grouped = new Map<string, { seasons: Record<string, { goals: number; assists: number; wins: number }>; totals: { goals: number; assists: number; wins: number } }>();

    for (const stat of legacyStats) {
      if (!grouped.has(stat.playerId)) {
        grouped.set(stat.playerId, { seasons: {}, totals: { goals: 0, assists: 0, wins: 0 } });
      }
      const entry = grouped.get(stat.playerId)!;
      entry.seasons[stat.season] = { goals: stat.goals, assists: stat.assists, wins: stat.wins };
      entry.totals.goals += stat.goals;
      entry.totals.assists += stat.assists;
      entry.totals.wins += stat.wins;
    }

    const stats = Array.from(grouped.entries())
      .map(([playerId, data]) => ({
        player: playerMap.get(playerId) || { id: playerId, name: 'Unknown', pictureUrl: null },
        seasons: data.seasons,
        totals: data.totals,
      }))
      .sort((a, b) => (b.totals.goals + b.totals.assists) - (a.totals.goals + a.totals.assists));

    const seasons = [...new Set(legacyStats.map(s => s.season))].sort();

    res.json({ seasons, stats });
  } catch (error) {
    console.error('Error fetching legacy stats:', error);
    res.status(500).json({ error: 'Failed to fetch legacy stats' });
  }
});

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

router.get('/field-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const yearParam = req.query.year as string | undefined;
    const year = yearParam ? parseInt(yearParam) : null;
    const where = year && !isNaN(year) ? { year } : {};

    const [stats, allGames] = await Promise.all([
      prisma.fieldStat.findMany({ where, orderBy: { date: 'asc' } }),
      prisma.game.findMany({ select: { createdAt: true, teamAssignments: true } }),
    ]);

    // Build a map of ISO date → unique player count from tracked Game records
    const playerCountByDate = new Map<string, number>();
    for (const g of allGames) {
      const dateKey = g.createdAt.toISOString().slice(0, 10);
      const assignments = safeParseJSON<Record<string, string>>(g.teamAssignments, {});
      const count = Object.keys(assignments).length;
      playerCountByDate.set(dateKey, (playerCountByDate.get(dateKey) ?? 0) + count);
    }

    const records = stats.map(s => {
      const isoDate = s.date.toISOString().slice(0, 10);
      const trackedPlayers = playerCountByDate.get(isoDate) ?? null;

      // Cross-reference: if we have both WhatsApp showUp and tracked game players,
      // compute actual vs expected turnout
      const turnoutVsRsvp = (trackedPlayers !== null && s.waIn !== null && s.waIn > 0)
        ? parseFloat((trackedPlayers / (s.waIn + (s.waPlus1 ?? 0) * 2 + (s.waPlus2 ?? 0) * 3) * 100).toFixed(1))
        : null;

      // App game tracking supersedes FieldStat: if a game was played for this date,
      // mark played='yes' regardless of stored FieldStat.played value.
      const playedStatus = trackedPlayers && trackedPlayers > 0 ? 'yes' : s.played;

      return {
        year: s.year,
        date: `${s.date.getUTCDate()}-${MONTH_NAMES[s.date.getUTCMonth()]}`,
        isoDate,
        played: playedStatus,
        location: s.location ?? null,
        waIn: s.waIn ?? null,
        waPlus1: s.waPlus1 ?? null,
        waPlus2: s.waPlus2 ?? null,
        waMaybe: s.waMaybe ?? null,
        waOut: s.waOut ?? null,
        groupSize: s.groupSize ?? null,
        eviteResponse: s.eviteResponse,
        responseRate: parseFloat((s.responseRate * 100).toFixed(2)),
        showUp: s.showUp,
        attendanceRate: parseFloat((s.attendanceRate * 100).toFixed(2)),
        trackedPlayers,
        turnoutVsRsvp,
        notes: s.notes ?? null,
      };
    });

    // Synthesize records for game dates not yet in FieldStats (e.g. current season)
    const existingDates = new Set(records.map(r => r.isoDate));
    for (const [isoDate, count] of playerCountByDate) {
      if (existingDates.has(isoDate)) continue;
      const dateObj = new Date(isoDate + 'T00:00:00Z');
      const yr = dateObj.getUTCFullYear();
      if (year && yr !== year) continue;
      records.push({
        year: yr,
        date: `${dateObj.getUTCDate()}-${MONTH_NAMES[dateObj.getUTCMonth()]}`,
        isoDate,
        played: 'yes',
        location: null,
        waIn: null,
        waPlus1: null,
        waPlus2: null,
        waMaybe: null,
        waOut: null,
        groupSize: null,
        eviteResponse: null,
        responseRate: 0,
        attendanceRate: 0,
        showUp: null,
        trackedPlayers: count,
        turnoutVsRsvp: null,
        notes: null,
      });
    }
    records.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    res.json(records);
  } catch (error) {
    console.error('Error fetching field stats:', error);
    res.status(500).json({ error: 'Failed to fetch field statistics' });
  }
});

export default router;
