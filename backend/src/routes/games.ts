import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { updateGameSchema, UpdateGameInput } from '../schemas/game';

const router = Router();

// POST /api/games - Create a new game
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
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

// GET /api/games - Get all games
router.get('/', async (req: Request, res: Response) => {
  try {
    const games = await prisma.game.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Parse JSON fields for all games
    const parsedGames = games.map(game => ({
      ...game,
      teamAssignments: game.teamAssignments ? JSON.parse(game.teamAssignments) : {},
      goals: game.goals ? JSON.parse(game.goals) : [],
    }));
    
    res.json(parsedGames);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// GET /api/games/:id - Get a single game
router.get('/:id', async (req: Request, res: Response) => {
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
      teamAssignments: game.teamAssignments ? JSON.parse(game.teamAssignments) : {},
      goals: game.goals ? JSON.parse(game.goals) : [],
    };

    res.json(parsedGame);
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// PUT /api/games/:id - Update game data
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
      teamAssignments: game.teamAssignments ? JSON.parse(game.teamAssignments) : {},
      goals: game.goals ? JSON.parse(game.goals) : [],
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

// DELETE /api/games/:id - Delete a game
router.delete('/:id', async (req: Request, res: Response) => {
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

