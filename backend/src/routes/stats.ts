import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

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
  teamAssignments: Record<string, 'color' | 'white'>;
  goals: GoalData[];
}

async function loadAllGames(): Promise<ParsedGame[]> {
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  return games.map(g => ({
    id: g.id,
    gameNumber: g.gameNumber,
    createdAt: g.createdAt,
    teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(g.teamAssignments, {}),
    goals: safeParseJSON<GoalData[]>(g.goals, []),
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
router.get('/player/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    const getRank = (metric: (s: { games: number; wins: number; points: number; ppg: number; goals: number; assists: number; goalInvolvements: number }) => number): number => {
      const myVal = allPlayerStats.get(player.id);
      if (!myVal) return 0;
      const myMetric = metric(myVal);
      let rank = 1;
      for (const [pid, s] of allPlayerStats) {
        if (pid !== player.id && metric(s) > myMetric) rank++;
      }
      return rank;
    };

    const ranks = {
      games: getRank(s => s.games),
      points: getRank(s => s.points),
      ppg: getRank(s => s.ppg),
      goalInvolvements: getRank(s => s.goalInvolvements),
      goals: getRank(s => s.goals),
      assists: getRank(s => s.assists),
    };

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
    });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// ── GET /api/stats/chemistry ──
router.get('/chemistry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    const comboTracker = new Map<string, { playerIds: string[]; games: number; wins: number }>();

    for (const game of allGames) {
      const assignments = game.teamAssignments;
      if (!assignments || Object.keys(assignments).length === 0) continue;

      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;

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
          if (!comboTracker.has(key)) comboTracker.set(key, { playerIds: combo, games: 0, wins: 0 });
          const entry = comboTracker.get(key)!;
          entry.games++;
          if (isWin) entry.wins++;
        }
      }
    }

    const results = Array.from(comboTracker.values())
      .filter(c => c.games >= minGames)
      .map(c => ({
        players: c.playerIds.map(id => playerMap.get(id) || { id, name: 'Unknown', pictureUrl: null }),
        gamesPlayed: c.games,
        wins: c.wins,
        winRate: Math.round((c.wins / c.games) * 100),
      }))
      .sort((a, b) => b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed)
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
router.get('/monthly', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const allGames = await loadAllGames();
    const monthGames = allGames.filter(g => g.createdAt >= startDate && g.createdAt < endDate);

    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    // Compute per-player stats for this month
    const stats = new Map<string, { points: number; goals: number; assists: number; games: number; goalInvolvements: number }>();

    for (const game of monthGames) {
      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;

      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        const playerInfo = playerMap.get(pid)!;
        if (playerInfo.name.includes('Guest')) continue;

        if (!stats.has(pid)) stats.set(pid, { points: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0 });
        const s = stats.get(pid)!;
        s.games++;

        const isTie = colorGoals === whiteGoals;
        const isWin = (team === 'color' && colorGoals > whiteGoals) || (team === 'white' && whiteGoals > colorGoals);
        if (isWin) s.points += 3;
        else if (isTie) s.points += 1;
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

    const getTop = (metric: (s: { points: number; goals: number; assists: number; games: number; goalInvolvements: number }) => number) => {
      let topId: string | null = null;
      let topVal = -1;
      for (const [pid, s] of stats) {
        const val = metric(s);
        if (val > topVal) { topVal = val; topId = pid; }
      }
      if (!topId || topVal === 0) return null;
      return { player: playerMap.get(topId)!, value: topVal };
    };

    const playerOfTheMonth = getTop(s => s.points);
    const topGoalContributor = getTop(s => s.goalInvolvements);
    const topScorer = getTop(s => s.goals);
    const topAssister = getTop(s => s.assists);
    const topAttendance = getTop(s => s.games);

    // Figure out which months have games
    const allMonths: { month: number; year: number }[] = [];
    const seen = new Set<string>();
    for (const g of allGames) {
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
        topAttendance,
      },
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

export default router;
