import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { createPlayerSchema, updatePlayerSchema } from '../schemas/entry';
import { requireRegularOrAdmin, requireAdmin, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/players - Create a new player (regular users and admins)
router.post('/', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Received request body:', req.body);
    const validatedData = createPlayerSchema.parse(req.body);
    console.log('Validated data:', validatedData);
    const player = await prisma.player.create({
      data: {
        name: validatedData.name,
        pictureUrl: validatedData.pictureUrl && validatedData.pictureUrl !== '' ? validatedData.pictureUrl : null,
        team: validatedData.team || null,
      },
    });
    res.status(201).json(player);
  } catch (error) {
    console.error('Error creating player:', error);
    // Let Zod errors propagate to error middleware
    next(error);
  }
});

// GET /api/players - Get all players (authenticated users only)
router.get('/', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const players = await prisma.player.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /api/players/:id - Get a single player (authenticated users only)
router.get('/:id', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(player);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// PATCH /api/players/:id - Update a player (regular users can update images, admins can update anything)
router.patch('/:id', requireRegularOrAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = updatePlayerSchema.parse(req.body);
    
    const player = await prisma.player.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.pictureUrl !== undefined && { pictureUrl: validatedData.pictureUrl || null }),
        ...(validatedData.team !== undefined && { team: validatedData.team || null }),
      },
    });
    
    res.json(player);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Player not found' });
    }
    next(error);
  }
});

// DELETE /api/players/:id - Delete a player (admin only)
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.player.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Prisma record not found error
      return res.status(404).json({ error: 'Player not found' });
    }
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

export default router;

