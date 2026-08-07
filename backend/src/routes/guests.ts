import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { computeGuestLedger } from '../services/guests';

const router = Router();

// GET /api/guests - autocomplete source for the guest-details modal, so a
// returning guest resolves to their existing identity instead of a new one.
router.get('/', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const guests = await prisma.guest.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(guests);
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

// GET /api/guests/ledger - the dues report: how many times each guest has
// actually turned up.
router.get('/ledger', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await computeGuestLedger());
  } catch (error) {
    console.error('Error computing guest ledger:', error);
    res.status(500).json({ error: 'Failed to compute guest ledger' });
  }
});

export default router;
