import { Router, Response } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { computeGuestLedger, listGuests, renameGuest } from '../services/guests';

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


// PATCH /api/guests/:id — rename a guest identity, or merge it into an existing
// one. Admin only. A name that collides with another guest returns 409 with the
// clash rather than merging silently: merging moves visits AND dues, so it is
// the caller's decision, not a side effect of typing.
router.patch('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, merge } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'A name is required' });
  }
  if (name.trim().length > 60) {
    return res.status(400).json({ error: 'That name is too long' });
  }
  try {
    const result = await renameGuest(req.params.id, name, { merge: merge === true });
    if ('conflict' in result) return res.status(409).json(result);
    return res.json(result);
  } catch (error: any) {
    if (error?.message === 'not_found') return res.status(404).json({ error: 'Guest not found' });
    if (error?.message === 'empty_name') return res.status(400).json({ error: 'A name is required' });
    console.error('Error renaming guest:', error);
    return res.status(500).json({ error: 'Failed to rename guest' });
  }
});

export default router;
