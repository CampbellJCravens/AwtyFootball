import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /api/settings/guest-count - Get current guest count
router.get('/guest-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      // Create default settings if they don't exist
      settings = await prisma.appSettings.create({
        data: { id: 'singleton', guestCount: 0 },
      });
    }

    res.json({ guestCount: settings.guestCount });
  } catch (error) {
    console.error('Error fetching guest count:', error);
    next(error);
  }
});

// POST /api/settings/increment-guest-count - Increment and return new guest count
router.post('/increment-guest-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { id: 'singleton', guestCount: 1 },
      });
      return res.json({ guestCount: 1 });
    }

    settings = await prisma.appSettings.update({
      where: { id: 'singleton' },
      data: { guestCount: { increment: 1 } },
    });

    res.json({ guestCount: settings.guestCount });
  } catch (error) {
    console.error('Error incrementing guest count:', error);
    next(error);
  }
});

export default router;

