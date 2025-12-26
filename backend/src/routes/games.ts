import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { updateGameSchema, UpdateGameInput } from '../schemas/game';
import { requireAdmin, requireRegularOrAdmin, AuthenticatedRequest } from '../middleware/auth';
import { google } from 'googleapis';
import { env } from '../env';
import Papa from 'papaparse';

// Safely parse JSON fields that might be null/empty/invalid
const safeParseJSON = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (err) {
    console.error('Failed to parse JSON field, returning fallback:', err);
    return fallback;
  }
};

const router = Router();

// POST /api/games - Create a new game (admin only)
router.post('/', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Get all existing games to determine the next game number
    let nextGameNumber = 1;
    
    try {
      const allGames = await prisma.game.findMany({
        select: { gameNumber: true },
      });

      // Filter out any games with null gameNumber (from before migration)
      const gamesWithNumbers = allGames.filter(g => g.gameNumber != null);

      if (gamesWithNumbers.length > 0) {
        // Find the highest game number currently in use
        const highestGameNumber = Math.max(...gamesWithNumbers.map(g => g.gameNumber!));
        
        // If the highest game number is greater than the count of games,
        // it means the highest numbered game was deleted, so we can reuse that number
        // Otherwise, increment from the highest
        if (highestGameNumber > gamesWithNumbers.length) {
          // Highest game was deleted, reuse its number
          nextGameNumber = highestGameNumber;
        } else {
          // No gap at the end, use next sequential number
          nextGameNumber = highestGameNumber + 1;
        }
      } else if (allGames.length > 0) {
        // We have games but none have gameNumber (pre-migration games)
        // Start numbering from 1, they'll get updated when accessed
        nextGameNumber = allGames.length + 1;
      }
    } catch (dbError: any) {
      // If querying gameNumber fails, the column doesn't exist - migration needed
      if (dbError.code === 'P2021' || dbError.message?.includes('gameNumber') || dbError.message?.includes('column')) {
        return res.status(500).json({ 
          error: 'Database migration required. Please run: cd backend && npm run prisma:migrate',
          details: 'The gameNumber column is missing from the database. Run the migration to add it.'
        });
      }
      throw dbError;
    }

    const game = await prisma.game.create({
      data: {
        gameNumber: nextGameNumber,
      },
    });
    // Parse JSON fields for response
    const parsedGame = {
      ...game,
      teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {}),
      goals: safeParseJSON(game.goals, [] as any[]),
    };

    res.status(201).json(parsedGame);
  } catch (error: any) {
    console.error('Error creating game:', error);
    // Provide more helpful error message for migration issues
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Game number already exists' });
    }
    if (error.message?.includes('gameNumber') || error.code === 'P2021' || error.code === 'P2025') {
      return res.status(500).json({ 
        error: 'Database schema mismatch. Please run: npm run prisma:migrate in the backend directory' 
      });
    }
    next(error);
  }
});

// GET /api/games - Get all games (authenticated users can view)
router.get('/', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const games = await prisma.game.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Parse JSON fields for all games
    const parsedGames = games.map(game => ({
      ...game,
      teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {}),
      goals: safeParseJSON(game.goals, [] as any[]),
    }));
    
    res.json(parsedGames);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// GET /api/games/:id - Get a single game (authenticated users can view)
router.get('/:id', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const game = await prisma.game.findUnique({
      where: { id },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Parse JSON fields
    const parsedGame = {
      ...game,
      teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {}),
      goals: safeParseJSON(game.goals, [] as any[]),
    };

    res.json(parsedGame);
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// PUT /api/games/:id - Update game data (admin only)
router.put('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Validate input
    const validationResult = updateGameSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validationResult.error.errors,
      });
    }

    const data: UpdateGameInput = validationResult.data;
    
    // Prepare update data
    const updateData: any = {};
    
    if (data.teamAssignments !== undefined) {
      updateData.teamAssignments = JSON.stringify(data.teamAssignments);
    }
    
    if (data.goals !== undefined) {
      updateData.goals = JSON.stringify(data.goals);
    }
    
    if (data.createdAt !== undefined) {
      updateData.createdAt = new Date(data.createdAt);
    }

    if (data.gameNumber !== undefined) {
      updateData.gameNumber = data.gameNumber;
    }

    const game = await prisma.game.update({
      where: { id },
      data: updateData,
    });

    // Parse JSON fields for response
    const parsedGame = {
      ...game,
      teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {}),
      goals: safeParseJSON(game.goals, [] as any[]),
    };

    res.json(parsedGame);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Game not found' });
    }
    console.error('Error updating game:', error);
    next(error);
  }
});

// DELETE /api/games/:id - Delete a game (admin only)
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.game.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Helper function to initialize Google Sheets API client
const getSheetsClient = async () => {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google Sheets credentials not configured');
  }

  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
};

// POST /api/games/:id/export - Export game data to Google Sheets
router.post('/:id/export', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { teamSwaps } = req.body; // Accept team swaps from frontend (gameNumber comes from DB)
    
    // Fetch game and players
    const game = await prisma.game.findUnique({
      where: { id },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Parse game data
    const teamAssignments = safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {});
    const goals = safeParseJSON<Array<{
      scorerId: string;
      assisterId: string | null;
      timestamp: string;
      team: 'color' | 'white' | null;
    }>>(game.goals, []);

    // Fetch all players
    const allPlayers = await prisma.player.findMany();

    // Create game name with game number (from database)
    const gameDate = new Date(game.createdAt);
    const gameNumber = game.gameNumber || 0; // Fallback to 0 if null (shouldn't happen after migration)
    const gameName = `Game${gameNumber} - ${gameDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`;

    // Build Players CSV data
    const playersData: Array<{
      Player: string;
      Game: string;
      Team: string;
      Goals: number;
      Assists: number;
    }> = [];

    // Calculate stats for each player in the game
    const playerStats = new Map<string, { goals: number; assists: number; team: string }>();
    
    // Initialize stats for all players in team assignments
    Object.entries(teamAssignments).forEach(([playerId, team]) => {
      const player = allPlayers.find(p => p.id === playerId);
      if (player) {
        playerStats.set(playerId, {
          goals: 0,
          assists: 0,
          team: team === 'color' ? 'Color' : 'White',
        });
      }
    });

    // Count goals and assists
    goals.forEach(goal => {
      // Count goals
      if (goal.scorerId) {
        const stats = playerStats.get(goal.scorerId);
        if (stats) {
          stats.goals += 1;
        }
      }
      // Count assists
      if (goal.assisterId) {
        const stats = playerStats.get(goal.assisterId);
        if (stats) {
          stats.assists += 1;
        }
      }
    });

    // Build players rows
    playerStats.forEach((stats, playerId) => {
      const player = allPlayers.find(p => p.id === playerId);
      if (player) {
        playersData.push({
          Player: player.name,
          Game: gameName,
          Team: stats.team,
          Goals: stats.goals,
          Assists: stats.assists,
        });
      }
    });

    // Build GameSummary CSV data
    const gameSummaryData: Array<{
      EntryType: string;
      Game: string;
      PlayerName: string;
      Assister: string;
      Team: string;
      Timestamp: string;
    }> = [];

    // Add goal entries
    goals.forEach(goal => {
      const scorer = allPlayers.find(p => p.id === goal.scorerId);
      const assister = goal.assisterId ? allPlayers.find(p => p.id === goal.assisterId) : null;
      const teamLabel = goal.team === 'color' ? 'Color' : goal.team === 'white' ? 'White' : 'Unassigned';

      if (scorer) {
        gameSummaryData.push({
          EntryType: 'goal',
          Game: gameName,
          PlayerName: scorer.name,
          Assister: assister?.name || '',
          Team: teamLabel,
          Timestamp: new Date(goal.timestamp).toISOString(),
        });
      }
    });

    // Add team swap entries (sent from frontend)
    if (teamSwaps && Array.isArray(teamSwaps)) {
      teamSwaps.forEach((swap: any) => {
        const player = allPlayers.find(p => p.id === swap.playerId);
        if (player) {
          const teamLabel = swap.team === 'color' ? 'Color' : 'White';
          gameSummaryData.push({
            EntryType: 'team swap',
            Game: gameName,
            PlayerName: player.name,
            Assister: '', // Team swaps don't have assisters
            Team: teamLabel,
            Timestamp: swap.timestamp || new Date().toISOString(),
          });
        }
      });
    }

    // Export to Google Sheets
    if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      return res.status(500).json({ error: 'Google Sheets spreadsheet ID not configured' });
    }

    const sheets = await getSheetsClient();

    // First, read existing data to find and remove duplicates
    const [existingPlayersResult, existingGameSummaryResult] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: 'Players!A:E',
      }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: 'GameSummary!A:F',
      }).catch(() => ({ data: { values: [] } })),
    ]);

    const existingPlayers = existingPlayersResult.data.values || [];
    const existingGameSummary = existingGameSummaryResult.data.values || [];

    // Filter out rows that match the current game name (keep header and other games)
    const filteredPlayers = existingPlayers.filter((row, index) => {
      // Keep header row and rows that don't match this game
      return index === 0 || (row[1] && row[1] !== gameName);
    });

    const filteredGameSummary = existingGameSummary.filter((row, index) => {
      // Keep header row and rows that don't match this game
      return index === 0 || (row[1] && row[1] !== gameName);
    });

    // Prepare data for sheets API (include filtered existing data and new data)
    const playersValues = [
      ...filteredPlayers.slice(1), // Skip header from filtered data
      ...playersData.map(p => [p.Player, p.Game, p.Team, p.Goals.toString(), p.Assists.toString()]),
    ];

    const gameSummaryValues = [
      ...filteredGameSummary.slice(1), // Skip header from filtered data
      ...gameSummaryData.map(g => [
        g.EntryType,
        g.Game,
        g.PlayerName,
        g.Assister,
        g.Team,
        g.Timestamp,
      ]),
    ];

    // Clear existing data and write new data
    await sheets.spreadsheets.values.clear({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'Players!A:Z',
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'GameSummary!A:Z',
    });

    // Write headers and data
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'Players!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Player', 'Game', 'Team', 'Goals', 'Assists'], // Header
          ...playersValues,
        ],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'GameSummary!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['EntryType', 'Game', 'PlayerName', 'Assister', 'Team', 'Timestamp'], // Header
          ...gameSummaryValues,
        ],
      },
    });

    res.json({
      message: 'Game data exported to Google Sheets successfully',
      playersCount: playersData.length,
      gameSummaryCount: gameSummaryData.length,
    });
  } catch (error: any) {
    console.error('Error exporting game data:', error);
    next(error);
  }
});

// POST /api/games/import - Import game data from CSV into a new game (MUST be before /:id/import)
router.post('/import', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { playersCsv, gameSummaryCsv, selectedGameName } = req.body;

    if (!playersCsv || !gameSummaryCsv || !selectedGameName) {
      return res.status(400).json({ error: 'playersCsv, gameSummaryCsv, and selectedGameName are required' });
    }

    // Parse CSV data using papaparse
    const playersParseResult = Papa.parse(playersCsv, {
      header: true,
      skipEmptyLines: true,
    });

    const gameSummaryParseResult = Papa.parse(gameSummaryCsv, {
      header: true,
      skipEmptyLines: true,
    });

    if (playersParseResult.errors.length > 0 || gameSummaryParseResult.errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid CSV format',
        playersErrors: playersParseResult.errors,
        gameSummaryErrors: gameSummaryParseResult.errors,
      });
    }

    // Filter data to only include rows matching the selected game name
    const playersData = (playersParseResult.data as any[]).filter((row: any) => row.Game === selectedGameName);
    const gameSummaryData = (gameSummaryParseResult.data as any[]).filter((row: any) => row.Game === selectedGameName);

    if (playersData.length === 0 && gameSummaryData.length === 0) {
      return res.status(400).json({ error: `No data found for game: ${selectedGameName}` });
    }

    // Extract date from game name if possible, otherwise use current date
    let gameDate = new Date();
    const dateMatch = selectedGameName.match(/(\w+\s+\d{1,2},\s+\d{4})/);
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1]);
      if (!isNaN(parsedDate.getTime())) {
        gameDate = parsedDate;
      }
    }

    // Get all players
    const allPlayers = await prisma.player.findMany();

    // Build team assignments from players data
    const teamAssignments: Record<string, 'color' | 'white'> = {};
    playersData.forEach((row: any) => {
      const player = allPlayers.find(p => p.name === row.Player);
      if (player && row.Team) {
        const team = row.Team.toLowerCase() === 'color' ? 'color' : 'white';
        teamAssignments[player.id] = team;
      }
    });

    // Build goals from game summary data
    const goals: Array<{
      scorerId: string;
      assisterId: string | null;
      timestamp: string;
      team: 'color' | 'white' | null;
    }> = [];

    gameSummaryData.forEach((row: any) => {
      if (row.EntryType?.toLowerCase() === 'goal') {
        const scorer = allPlayers.find(p => p.name === row.PlayerName);
        const assister = row.Assister
          ? allPlayers.find(p => p.name === row.Assister)
          : null;

        if (scorer) {
          const team = row.Team?.toLowerCase() === 'color'
            ? 'color'
            : row.Team?.toLowerCase() === 'white'
            ? 'white'
            : null;

          goals.push({
            scorerId: scorer.id,
            assisterId: assister?.id || null,
            timestamp: row.Timestamp || new Date().toISOString(),
            team,
          });
        }
      }
    });

    // Determine the next game number (reuse logic from create game)
    const allGames = await prisma.game.findMany({
      select: { gameNumber: true },
    });

    // Filter out any games with null gameNumber (from before migration)
    const gamesWithNumbers = allGames.filter(g => g.gameNumber != null);

    let nextGameNumber = 1;
    if (gamesWithNumbers.length > 0) {
      const highestGameNumber = Math.max(...gamesWithNumbers.map(g => g.gameNumber!));
      if (highestGameNumber > gamesWithNumbers.length) {
        nextGameNumber = highestGameNumber;
      } else {
        nextGameNumber = highestGameNumber + 1;
      }
    }

    // Create new game with imported data
    const game = await prisma.game.create({
      data: {
        gameNumber: nextGameNumber,
        createdAt: gameDate,
        teamAssignments: JSON.stringify(teamAssignments),
        goals: JSON.stringify(goals),
      },
    });

    // Parse JSON fields for response
    const parsedGame = {
      ...game,
      teamAssignments: safeParseJSON<Record<string, 'color' | 'white'>>(game.teamAssignments, {}),
      goals: safeParseJSON(game.goals, [] as any[]),
    };

    res.status(201).json({
      game: parsedGame,
      message: 'Game imported successfully',
      playersCount: playersData.length,
      goalsCount: goals.length,
    });
  } catch (error: any) {
    console.error('Error importing game data:', error);
    next(error);
  }
});

// POST /api/games/:id/import - Import game data from CSV
router.post('/:id/import', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { playersCsv, gameSummaryCsv, selectedGameName } = req.body;

    if (!playersCsv || !gameSummaryCsv || !selectedGameName) {
      return res.status(400).json({ error: 'playersCsv, gameSummaryCsv, and selectedGameName are required' });
    }

    // Parse CSV data using papaparse
    const playersParseResult = Papa.parse(playersCsv, {
      header: true,
      skipEmptyLines: true,
    });

    const gameSummaryParseResult = Papa.parse(gameSummaryCsv, {
      header: true,
      skipEmptyLines: true,
    });

    if (playersParseResult.errors.length > 0 || gameSummaryParseResult.errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid CSV format',
        playersErrors: playersParseResult.errors,
        gameSummaryErrors: gameSummaryParseResult.errors,
      });
    }

    // Filter data to only include rows matching the selected game name
    const playersData = (playersParseResult.data as any[]).filter((row: any) => row.Game === selectedGameName);
    const gameSummaryData = (gameSummaryParseResult.data as any[]).filter((row: any) => row.Game === selectedGameName);

    if (playersData.length === 0 && gameSummaryData.length === 0) {
      return res.status(400).json({ error: `No data found for game: ${selectedGameName}` });
    }

    // Fetch existing game
    const game = await prisma.game.findUnique({
      where: { id },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Fetch all players
    const allPlayers = await prisma.player.findMany();

    // Build team assignments from players data
    const teamAssignments: Record<string, 'color' | 'white'> = {};
    playersData.forEach((row: any) => {
      const player = allPlayers.find(p => p.name === row.Player);
      if (player && row.Team) {
        const team = row.Team.toLowerCase() === 'color' ? 'color' : 'white';
        teamAssignments[player.id] = team;
      }
    });

    // Build goals from game summary data
    const goals: Array<{
      scorerId: string;
      assisterId: string | null;
      timestamp: string;
      team: 'color' | 'white' | null;
    }> = [];

    // Also track team swaps for future use (when we add them to the schema)
    const teamSwaps: Array<{
      playerId: string;
      timestamp: string;
      team: 'color' | 'white';
      previousTeam?: 'color' | 'white';
    }> = [];

    gameSummaryData.forEach((row: any) => {
      if (row.EntryType?.toLowerCase() === 'goal') {
        const scorer = allPlayers.find(p => p.name === row.PlayerName);
        const assister = row.Assister
          ? allPlayers.find(p => p.name === row.Assister)
          : null;

        if (scorer) {
          const team = row.Team?.toLowerCase() === 'color'
            ? 'color'
            : row.Team?.toLowerCase() === 'white'
            ? 'white'
            : null;

          goals.push({
            scorerId: scorer.id,
            assisterId: assister?.id || null,
            timestamp: row.Timestamp || new Date().toISOString(),
            team,
          });
        }
      } else if (row.EntryType?.toLowerCase() === 'team swap') {
        const player = allPlayers.find(p => p.name === row.PlayerName);
        if (player && row.Team) {
          const team = row.Team.toLowerCase() === 'color' ? 'color' : 'white';
          teamSwaps.push({
            playerId: player.id,
            timestamp: row.Timestamp || new Date().toISOString(),
            team,
          });
        }
      }
    });

    // Update game with imported data
    await prisma.game.update({
      where: { id },
      data: {
        teamAssignments: JSON.stringify(teamAssignments),
        goals: JSON.stringify(goals),
      },
    });

    res.json({
      message: 'Game data imported successfully',
      playersCount: playersData.length,
      goalsCount: goals.length,
      teamSwapsCount: teamSwaps.length,
    });
  } catch (error: any) {
    console.error('Error importing game data:', error);
    next(error);
  }
});

export default router;

