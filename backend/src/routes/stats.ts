import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
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
  fouls: Record<string, number>;
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
    fouls: safeParseJSON<Record<string, number>>(g.fouls, {}),
  }));
}

// Sportsmanship points started being recorded in May 2026; fouls in July 2026.
// Awards for each are suppressed for periods before their data exists.
const hasSportsmanshipData = (year: number, month: number) => year > 2026 || (year === 2026 && month >= 5);
const hasFoulsData = (year: number, month: number) => year > 2026 || (year === 2026 && month >= 7);

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
    // `sportsmanship` is the NET figure (gold stars minus fouls) and can be
    // negative; `fouls` is the raw positive count, used for Dirtiest Player.
    type PlayerStat = { points: number; wins: number; ties: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number; sportsmanship: number; fouls: number };

    for (const game of monthGames) {
      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;

      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        const playerInfo = playerMap.get(pid)!;
        if (playerInfo.name.includes('Guest')) continue;

        if (!stats.has(pid)) stats.set(pid, { points: 0, wins: 0, ties: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0, sportsmanship: 0, fouls: 0 });
        const s = stats.get(pid)!;
        s.games++;
        s.sportsmanship += (game.sportsmanship[pid] || 0) - (game.fouls[pid] || 0);
        s.fouls += game.fouls[pid] || 0;

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
    const sportsmanOfTheMonth = hasSportsmanshipData(year, month)
      ? getTop(s => s.sportsmanship, undefined, 1)
      : null;

    // Dirtiest Player of the Month: most fouls. Fouls are a positive count, so
    // getTop's "highest wins, drop zeros" behavior applies unchanged.
    const dirtiestPlayerOfTheMonth = hasFoulsData(year, month)
      ? getTop(s => s.fouls, undefined, 0)
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

    // Top Trio: best trio of teammates by points-per-game, min 2 games together
    // this month. A goal has at most a scorer+assister, so a trio can't be a
    // goal-combo like the duo — this is results-based (mirrors chemistry trios).
    const trioTracker = new Map<string, { ids: string[]; games: number; wins: number; ties: number }>();
    for (const game of monthGames) {
      const c = game.goals.filter(g => g.team === 'color').length;
      const w = game.goals.filter(g => g.team === 'white').length;
      const isTie = c === w;
      for (const team of ['color', 'white'] as const) {
        const teamPlayers = Object.entries(game.teamAssignments)
          .filter(([pid, t]) => t === team && playerMap.has(pid) && !playerMap.get(pid)!.name.includes('Guest'))
          .map(([pid]) => pid)
          .sort();
        if (teamPlayers.length < 3) continue;
        const isWin = (team === 'color' && c > w) || (team === 'white' && w > c);
        for (const combo of getCombinations(teamPlayers, 3)) {
          const key = combo.join('|');
          if (!trioTracker.has(key)) trioTracker.set(key, { ids: combo, games: 0, wins: 0, ties: 0 });
          const e = trioTracker.get(key)!;
          e.games++;
          if (isWin) e.wins++;
          else if (isTie) e.ties++;
        }
      }
    }
    let bestTrioPpg = -1, bestTrioGames = 0;
    for (const t of trioTracker.values()) {
      if (t.games < 2) continue;
      const ppg = (t.wins * 3 + t.ties) / t.games;
      if (ppg > bestTrioPpg || (ppg === bestTrioPpg && t.games > bestTrioGames)) {
        bestTrioPpg = ppg;
        bestTrioGames = t.games;
      }
    }
    const topTrio = bestTrioPpg >= 0
      ? Array.from(trioTracker.values())
          .filter(t => t.games >= 2 && (t.wins * 3 + t.ties) / t.games === bestTrioPpg && t.games === bestTrioGames)
          .map(t => ({
            players: t.ids.map(id => playerMap.get(id)!),
            value: Math.round(bestTrioPpg * 100) / 100,
            games: t.games,
            wins: t.wins,
          }))
      : null;

    // Highest-scoring game of the month (most total goals).
    let highestScoringGame: { gameNumber: number | null; date: string; colorScore: number; whiteScore: number; totalGoals: number } | null = null;
    for (const game of monthGames) {
      const c = game.goals.filter(g => g.team === 'color').length;
      const w = game.goals.filter(g => g.team === 'white').length;
      const total = c + w;
      if (total > 0 && (!highestScoringGame || total > highestScoringGame.totalGoals)) {
        highestScoringGame = { gameNumber: game.gameNumber, date: game.createdAt.toISOString(), colorScore: c, whiteScore: w, totalGoals: total };
      }
    }

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
      highestScoringGame,
      awards: {
        playerOfTheMonth,
        topGoalContributor,
        topScorer,
        topAssister,
        topDefender,
        sportsmanOfTheMonth,
        dirtiestPlayerOfTheMonth,
        topDuo,
        topTrio,
      },
      leaderboards: {
        points: getLeaderboard(s => s.points),
        goalInvolvements: getLeaderboard(s => s.goalInvolvements),
        goals: getLeaderboard(s => s.goals),
        assists: getLeaderboard(s => s.assists),
        defensiveRating: getLeaderboard(s => (s.games * 3) - s.goalsAllowed, { includeAll: true, extraFields: s => ({ games: s.games, goalsAllowed: s.goalsAllowed }), filter: s => s.games > 1 }),
        sportsmanship: hasSportsmanshipData(year, month) ? getLeaderboard(s => s.sportsmanship) : [],
        fouls: hasFoulsData(year, month) ? getLeaderboard(s => s.fouls) : [],
      },
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

// ── GET /api/stats/yearly?year=2026&limit=10 ──
// Season summary: marquee awards + top-N leaderboards across categories.
router.get('/yearly', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 25);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const allGames = await loadAllGames();
    const yearGames = allGames.filter(g =>
      g.createdAt >= startDate && g.createdAt < endDate && g.field !== 'cancelled'
    );

    const allPlayers = await prisma.player.findMany();
    const playerMap = new Map(allPlayers.map(p => [p.id, { id: p.id, name: p.name, pictureUrl: p.pictureUrl }]));

    type YStat = { points: number; wins: number; ties: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number; sportsmanship: number; fouls: number };
    const stats = new Map<string, YStat>();

    for (const game of yearGames) {
      const colorGoals = game.goals.filter(g => g.team === 'color').length;
      const whiteGoals = game.goals.filter(g => g.team === 'white').length;
      for (const [pid, team] of Object.entries(game.teamAssignments)) {
        if (!playerMap.has(pid)) continue;
        if (playerMap.get(pid)!.name.includes('Guest')) continue;
        if (!stats.has(pid)) stats.set(pid, { points: 0, wins: 0, ties: 0, goals: 0, assists: 0, games: 0, goalInvolvements: 0, goalsAllowed: 0, sportsmanship: 0, fouls: 0 });
        const s = stats.get(pid)!;
        s.games++;
        s.sportsmanship += (game.sportsmanship[pid] || 0) - (game.fouls[pid] || 0);
        s.fouls += game.fouls[pid] || 0;
        const isTie = colorGoals === whiteGoals;
        const isWin = (team === 'color' && colorGoals > whiteGoals) || (team === 'white' && whiteGoals > colorGoals);
        if (isWin) { s.points += 3; s.wins++; }
        else if (isTie) { s.points += 1; s.ties++; }
        s.goalsAllowed += team === 'color' ? whiteGoals : colorGoals;
      }
      for (const goal of game.goals) {
        if (stats.has(goal.scorerId)) { stats.get(goal.scorerId)!.goals++; stats.get(goal.scorerId)!.goalInvolvements++; }
        if (goal.assisterId && stats.has(goal.assisterId)) { stats.get(goal.assisterId)!.assists++; stats.get(goal.assisterId)!.goalInvolvements++; }
      }
    }

    const MIN_RATE_GAMES = 4; // qualifier for rate stats (PPG, win %)

    const rankList = (metric: (s: YStat) => number, opts?: { min?: number; extra?: (s: YStat) => Record<string, number> }) =>
      Array.from(stats.entries())
        .filter(([, s]) => (opts?.min ? s.games >= opts.min : true))
        .map(([pid, s]) => ({ player: playerMap.get(pid)!, value: metric(s), ...(opts?.extra?.(s) || {}) }))
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

    // Marquee winner(s) = everyone tied at the top of a ranked list.
    const marquee = <T extends { value: number }>(list: T[]): T[] | null =>
      list.length > 0 && list[0].value > 0 ? list.filter(e => e.value === list[0].value) : null;

    const points = rankList(s => s.points);
    const goals = rankList(s => s.goals);
    const assists = rankList(s => s.assists);
    const goalInvolvements = rankList(s => s.goalInvolvements);
    const appearances = rankList(s => s.games);
    const ppg = rankList(s => Math.round((s.points / s.games) * 100) / 100, { min: MIN_RATE_GAMES });
    const winRate = rankList(s => Math.round((s.wins / s.games) * 100), { min: MIN_RATE_GAMES, extra: s => ({ games: s.games, wins: s.wins }) });
    const sportsmanship = rankList(s => s.sportsmanship);
    const fouls = rankList(s => s.fouls);
    const defensiveRating = rankList(s => (s.games * 3) - s.goalsAllowed, { min: 2, extra: s => ({ games: s.games, goalsAllowed: s.goalsAllowed }) });

    // Best Duo (scorer-assister combos across the year)
    const duoStats = new Map<string, { ids: [string, string]; contributions: number }>();
    for (const game of yearGames) {
      for (const goal of game.goals) {
        if (!goal.assisterId) continue;
        if (!stats.has(goal.scorerId) || !stats.has(goal.assisterId)) continue;
        const [a, b] = [goal.scorerId, goal.assisterId].sort();
        const key = `${a}:${b}`;
        if (!duoStats.has(key)) duoStats.set(key, { ids: [a, b] as [string, string], contributions: 0 });
        duoStats.get(key)!.contributions++;
      }
    }
    const bestDuo = Array.from(duoStats.values())
      .filter(d => d.contributions > 1)
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, limit)
      .map(d => ({ players: [playerMap.get(d.ids[0])!, playerMap.get(d.ids[1])!], value: d.contributions }));

    // Best Trio (teammates by PPG, min 3 games together across the year)
    const trioTracker = new Map<string, { ids: string[]; games: number; wins: number; ties: number }>();
    for (const game of yearGames) {
      const c = game.goals.filter(g => g.team === 'color').length;
      const w = game.goals.filter(g => g.team === 'white').length;
      const isTie = c === w;
      for (const team of ['color', 'white'] as const) {
        const teamPlayers = Object.entries(game.teamAssignments)
          .filter(([pid, t]) => t === team && playerMap.has(pid) && !playerMap.get(pid)!.name.includes('Guest'))
          .map(([pid]) => pid)
          .sort();
        if (teamPlayers.length < 3) continue;
        const isWin = (team === 'color' && c > w) || (team === 'white' && w > c);
        for (const combo of getCombinations(teamPlayers, 3)) {
          const key = combo.join('|');
          if (!trioTracker.has(key)) trioTracker.set(key, { ids: combo, games: 0, wins: 0, ties: 0 });
          const e = trioTracker.get(key)!;
          e.games++;
          if (isWin) e.wins++;
          else if (isTie) e.ties++;
        }
      }
    }
    const bestTrio = Array.from(trioTracker.values())
      .filter(t => t.games >= 3)
      .map(t => ({ players: t.ids.map(id => playerMap.get(id)!), value: Math.round(((t.wins * 3 + t.ties) / t.games) * 100) / 100, games: t.games, wins: t.wins }))
      .sort((a, b) => b.value - a.value || b.games - a.games)
      .slice(0, limit);

    // Highest-scoring game of the year
    let highestScoringGame: { gameNumber: number | null; date: string; colorScore: number; whiteScore: number; totalGoals: number } | null = null;
    let totalGoals = 0;
    for (const game of yearGames) {
      const c = game.goals.filter(g => g.team === 'color').length;
      const w = game.goals.filter(g => g.team === 'white').length;
      totalGoals += c + w;
      const total = c + w;
      if (total > 0 && (!highestScoringGame || total > highestScoringGame.totalGoals)) {
        highestScoringGame = { gameNumber: game.gameNumber, date: game.createdAt.toISOString(), colorScore: c, whiteScore: w, totalGoals: total };
      }
    }

    const availableYears = [...new Set(allGames.filter(g => g.field !== 'cancelled').map(g => g.createdAt.getFullYear()))].sort((a, b) => b - a);

    res.json({
      year,
      gamesPlayed: yearGames.length,
      totalGoals,
      availableYears,
      highestScoringGame,
      awards: {
        playerOfTheYear: marquee(points),
        goldenBoot: marquee(goals),
        playmaker: marquee(assists),
        ironMan: marquee(appearances),
        topDefender: marquee(defensiveRating),
        sportsman: marquee(sportsmanship),
        dirtiestPlayer: marquee(fouls),
      },
      bestDuo: bestDuo.length ? bestDuo : null,
      bestTrio: bestTrio.length ? bestTrio : null,
      leaderboards: { points, goals, assists, goalInvolvements, appearances, ppg, winRate, sportsmanship, fouls, defensiveRating },
    });
  } catch (error) {
    console.error('Error fetching yearly stats:', error);
    res.status(500).json({ error: 'Failed to fetch yearly statistics' });
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

    type PlayerStat = { points: number; goals: number; assists: number; games: number; goalInvolvements: number; goalsAllowed: number; sportsmanship: number };

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

      const awardDefs: { name: string; unit: string; metric: (s: PlayerStat) => number; tiebreakers?: ((s: PlayerStat) => number)[]; minimum?: number; filter?: (s: PlayerStat) => boolean }[] = [
        { name: 'Player of the Month', unit: 'Points', metric: s => s.points, minimum: 3 },
        { name: 'Top Goal Contributor', unit: 'Goals + Assists', metric: s => s.goalInvolvements, minimum: 1 },
        { name: 'Top Scorer', unit: 'Goals', metric: s => s.goals, minimum: 1 },
        { name: 'Top Assister', unit: 'Assists', metric: s => s.assists, minimum: 1 },
        { name: 'Top Defender', unit: 'Defensive Rating', metric: s => (s.games * 3) - s.goalsAllowed, filter: s => s.games > 1 },
      ];

      // Sportsman of the Month, matching the threshold used by /stats/monthly.
      if (hasSportsmanshipData(year, month)) {
        awardDefs.push({ name: 'Sportsman of the Month', unit: 'Sportsmanship Points', metric: s => s.sportsmanship, minimum: 1 });
      }

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

// Annual member roster sizes from the club's field-statistics sheet. This is the
// denominator for response/attendance rates (the stored FieldStat.groupSize in
// the DB is incomplete/stale, so we don't use it). Update each November when the
// next year's roster is set; unlisted future years carry forward the latest.
const ROSTER_BY_YEAR: Record<number, number> = {
  2018: 43, 2019: 45, 2020: 47, 2021: 43, 2022: 48, 2023: 43, 2024: 48, 2025: 56, 2026: 55,
};
const ROSTER_YEARS = Object.keys(ROSTER_BY_YEAR).map(Number).sort((a, b) => a - b);
function rosterSizeForYear(yr: number): number | null {
  if (ROSTER_BY_YEAR[yr]) return ROSTER_BY_YEAR[yr];
  let best: number | null = null;
  for (const ky of ROSTER_YEARS) if (ky <= yr) best = ROSTER_BY_YEAR[ky];
  return best; // carry forward the latest known roster to future years
}

router.get('/field-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const yearParam = req.query.year as string | undefined;
    const year = yearParam ? parseInt(yearParam) : null;
    const where = year && !isNaN(year) ? { year } : {};

    const [stats, allGames, allPlayers, allRsvps] = await Promise.all([
      prisma.fieldStat.findMany({ where, orderBy: { date: 'asc' } }),
      prisma.game.findMany({ select: { id: true, createdAt: true, teamAssignments: true, field: true } }),
      prisma.player.findMany({ select: { id: true, name: true, isAlumni: true } }),
      prisma.gameRsvp.findMany({ select: { gameId: true, playerId: true, status: true } }),
    ]);

    const nameById = new Map(allPlayers.map(p => [p.id, p.name]));
    const isGuest = (pid: string) => (nameById.get(pid) ?? '').includes('Guest');
    const alumniIds = new Set(allPlayers.filter(p => p.isAlumni).map(p => p.id));

    // Build a map of ISO date → unique player count from tracked Game records,
    // plus per-date non-guest attendance for live response/attendance rates.
    const playerCountByDate = new Map<string, number>();
    const gameDate = new Map<string, string>();          // gameId → iso date
    const shownByDate = new Map<string, Set<string>>();  // non-guest players who showed
    const fieldByDate = new Map<string, string>();       // iso date → game field/location
    for (const g of allGames) {
      const dateKey = g.createdAt.toISOString().slice(0, 10);
      gameDate.set(g.id, dateKey);
      if (g.field && !fieldByDate.has(dateKey)) fieldByDate.set(dateKey, g.field);
      const assignments = safeParseJSON<Record<string, string>>(g.teamAssignments, {});
      playerCountByDate.set(dateKey, (playerCountByDate.get(dateKey) ?? 0) + Object.keys(assignments).length);
      let shown = shownByDate.get(dateKey);
      if (!shown) { shown = new Set(); shownByDate.set(dateKey, shown); }
      for (const pid of Object.keys(assignments)) if (!isGuest(pid)) shown.add(pid);
    }

    // Per-date responders (any RSVP), from GameRsvp — includes the WhatsApp sync.
    const respByDate = new Map<string, Set<string>>();
    // Live In/Maybe/Out counts from the poll (GameRsvp), for weeks with no
    // stored FieldStat row yet. status: "yes"=In, "maybe"=Maybe, "no"=Out.
    const pollByDate = new Map<string, { in: number; maybe: number; out: number }>();
    for (const r of allRsvps) {
      const iso = gameDate.get(r.gameId);
      if (!iso || isGuest(r.playerId)) continue;
      let set = respByDate.get(iso);
      if (!set) { set = new Set(); respByDate.set(iso, set); }
      set.add(r.playerId);
      let poll = pollByDate.get(iso);
      if (!poll) { poll = { in: 0, maybe: 0, out: 0 }; pollByDate.set(iso, poll); }
      if (r.status === 'yes') poll.in++;
      else if (r.status === 'maybe') poll.maybe++;
      else if (r.status === 'no') poll.out++;
    }

    // Live response/attendance vs the year's roster (0 when we can't compute).
    const liveRates = (isoDate: string, yr: number) => {
      const size = rosterSizeForYear(yr);
      const responders = respByDate.get(isoDate)?.size ?? 0;
      const shown = shownByDate.get(isoDate)?.size ?? 0;
      return {
        responseRate: size && responders > 0 ? parseFloat((responders / size * 100).toFixed(1)) : 0,
        attendanceRate: size && shown > 0 ? parseFloat((shown / size * 100).toFixed(1)) : 0,
      };
    };

    // Share of the non-guest players who showed on a date who are school alumni.
    // null when no tracked roster exists for that date (e.g. pre-2026 history).
    const alumniRateFor = (isoDate: string): number | null => {
      const shown = shownByDate.get(isoDate);
      if (!shown || shown.size === 0) return null;
      let alumni = 0;
      for (const pid of shown) if (alumniIds.has(pid)) alumni++;
      return parseFloat((alumni / shown.size * 100).toFixed(1));
    };

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

      // Prefer the stored sheet rate; fall back to live RSVP/roster data so
      // recent weeks (no sheet rate yet) still populate.
      const storedResp = parseFloat((s.responseRate * 100).toFixed(2));
      const storedAtt = parseFloat((s.attendanceRate * 100).toFixed(2));
      const live = liveRates(isoDate, s.year);

      return {
        year: s.year,
        date: `${s.date.getUTCDate()}-${MONTH_NAMES[s.date.getUTCMonth()]}`,
        isoDate,
        played: playedStatus,
        location: s.location ?? fieldByDate.get(isoDate) ?? null,
        waIn: s.waIn ?? pollByDate.get(isoDate)?.in ?? null,
        waPlus1: s.waPlus1 ?? null,
        waPlus2: s.waPlus2 ?? null,
        waMaybe: s.waMaybe ?? pollByDate.get(isoDate)?.maybe ?? null,
        waOut: s.waOut ?? pollByDate.get(isoDate)?.out ?? null,
        groupSize: s.groupSize ?? null,
        eviteResponse: s.eviteResponse,
        responseRate: storedResp > 0 ? storedResp : live.responseRate,
        showUp: s.showUp,
        attendanceRate: storedAtt > 0 ? storedAtt : live.attendanceRate,
        trackedPlayers,
        turnoutVsRsvp,
        alumniRate: alumniRateFor(isoDate),
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
      const live = liveRates(isoDate, yr);
      records.push({
        year: yr,
        date: `${dateObj.getUTCDate()}-${MONTH_NAMES[dateObj.getUTCMonth()]}`,
        isoDate,
        played: 'yes',
        location: fieldByDate.get(isoDate) ?? null,
        waIn: pollByDate.get(isoDate)?.in ?? null,
        waPlus1: null,
        waPlus2: null,
        waMaybe: pollByDate.get(isoDate)?.maybe ?? null,
        waOut: pollByDate.get(isoDate)?.out ?? null,
        groupSize: null,
        eviteResponse: null,
        responseRate: live.responseRate,
        attendanceRate: live.attendanceRate,
        showUp: null,
        trackedPlayers: count,
        turnoutVsRsvp: null,
        alumniRate: alumniRateFor(isoDate),
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

// ── GET /api/stats/reliability ── (admin only)
// Per-player RSVP reliability across *tracked* games (a game with a non-empty
// Color/White roster = "who showed up"). Guests (the GuestN pool players) are
// excluded — they aren't real members. Guest *headcounts* (guestCount on a
// player's own "yes") are rolled up separately for the guest-frequency view.
router.get('/reliability', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [players, games, rsvps] = await Promise.all([
      prisma.player.findMany({ select: { id: true, name: true, pictureUrl: true } }),
      prisma.game.findMany({ select: { id: true, teamAssignments: true } }),
      prisma.gameRsvp.findMany({ select: { gameId: true, playerId: true, status: true, guestCount: true } }),
    ]);

    // Tracked game = one with at least one player on a team.
    const rosterByGame = new Map<string, Set<string>>();
    for (const g of games) {
      const roster = Object.keys(safeParseJSON<Record<string, string>>(g.teamAssignments, {}));
      if (roster.length > 0) rosterByGame.set(g.id, new Set(roster));
    }
    const totalTrackedGames = rosterByGame.size;

    // RSVPs keyed by game+player, restricted to tracked games.
    const rsvpByKey = new Map<string, { status: string; guestCount: number }>();
    for (const r of rsvps) {
      if (rosterByGame.has(r.gameId)) {
        rsvpByKey.set(`${r.gameId}:${r.playerId}`, { status: r.status, guestCount: r.guestCount });
      }
    }

    const isGuestPool = (name: string) => /^Guest\d+$/.test(name.trim());

    const result = players
      .filter(p => !isGuestPool(p.name))
      .map(p => {
        let responded = 0, committed = 0, showed = 0, showedWhenCommitted = 0;
        let noShow = 0, ghost = 0, guestsBrought = 0, gamesWithGuests = 0;

        for (const [gameId, roster] of rosterByGame) {
          const r = rsvpByKey.get(`${gameId}:${p.id}`);
          const onRoster = roster.has(p.id);
          const committedThis = r?.status === 'yes';

          if (r) responded++;
          if (committedThis) {
            committed++;
            guestsBrought += r!.guestCount;
            if (r!.guestCount > 0) gamesWithGuests++;
          }
          if (onRoster) showed++;
          if (committedThis && onRoster) showedWhenCommitted++;
          if (committedThis && !onRoster) noShow++;
          if (!committedThis && onRoster) ghost++;
        }

        const frac = (num: number, den: number) => (den > 0 ? num / den : null);

        return {
          id: p.id,
          name: p.name,
          pictureUrl: p.pictureUrl,
          responded,
          committed,
          showed,
          showedWhenCommitted,
          noShow,
          ghost,
          guestsBrought,
          gamesWithGuests,
          // Fractions 0-1 (or null when the denominator is 0). Frontend formats %.
          responseRate: frac(responded, totalTrackedGames),
          showWhenCommittedRate: frac(showedWhenCommitted, committed),
          attendanceRate: frac(showed, totalTrackedGames),
          guestAttachRate: frac(gamesWithGuests, committed),
        };
      });

    // Season reconciliation: responses vs actual turnout, and indicated vs
    // actual guests. Guests sit on the roster as "GuestN" entries, so a game's
    // real turnout excludes them and guest slots = guests who actually showed.
    const nameById = new Map(players.map(p => [p.id, p.name]));
    let guestSlots = 0, realTurnout = 0, responsesTotal = 0, guestsIndicated = 0;
    for (const [, roster] of rosterByGame) {
      for (const pid of roster) {
        if (isGuestPool(nameById.get(pid) || '')) guestSlots++; else realTurnout++;
      }
    }
    for (const r of rsvps) {
      if (rosterByGame.has(r.gameId)) {
        responsesTotal++;
        if (r.status === 'yes') guestsIndicated += r.guestCount;
      }
    }
    const summary = {
      avgResponses: totalTrackedGames ? responsesTotal / totalTrackedGames : 0,
      avgTurnout: totalTrackedGames ? realTurnout / totalTrackedGames : 0,
      guestsIndicated,
      guestsShown: guestSlots,
    };

    res.json({ totalTrackedGames, summary, players: result });
  } catch (error) {
    console.error('Error computing reliability stats:', error);
    res.status(500).json({ error: 'Failed to compute reliability statistics' });
  }
});

export default router;
