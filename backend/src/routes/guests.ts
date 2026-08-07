import { Router, Response } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { computeGuestLedger, listGuests } from '../services/guests';

const router = Router();

// GET /api/guests - source for the guest-details modal, most-recently-seen
// first, so a returning guest resolves to their existing identity instead of a
// near-duplicate.
router.get('/', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await listGuests());
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
