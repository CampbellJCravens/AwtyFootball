import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { updateGameSchema, UpdateGameInput } from '../schemas/game';
import { requireAdmin, requireRegularOrAdmin, AuthenticatedRequest } from '../middleware/auth';

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
    const game = await prisma.game.create({
      data: {},
    });
    res.status(201).json(game);
  } catch (error) {
    console.error('Error creating game:', error);
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

export default router;

