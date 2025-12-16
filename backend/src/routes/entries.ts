import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { createEntrySchema } from '../schemas/entry';

const router = Router();

// POST /api/entries - Create a new entry
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = createEntrySchema.parse(req.body);
    const entry = await prisma.entry.create({
      data: validatedData,
    });
    res.status(201).json(entry);
  } catch (error) {
    // Let Zod errors propagate to error middleware
    next(error);
  }
});

// GET /api/entries - Get all entries
router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.entry.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// GET /api/entries/:id - Get a single entry
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await prisma.entry.findUnique({
      where: { id },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

// DELETE /api/entries/:id - Delete an entry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.entry.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      // Prisma record not found error
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;

