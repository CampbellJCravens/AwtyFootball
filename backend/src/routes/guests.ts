import { Router, Response } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import {
  computeGuestLedger,
  listGuests,
  renameGuest,
  planPromotion,
  promoteGuest,
  PromotionBlocked,
} from '../services/guests';
import { unlinkGuestPhone } from '../services/phoneLinks';
import { resyncPollsForPhone } from '../services/whatsapp/polls';
import prisma from '../prisma';

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

// Why a promotion was refused, in words the admin can act on. Each of these is
// a decision only a human can make — never guessed at.
const promotionError = (message: string): { status: number; body: object } => {
  if (message === 'no_such_guest') return { status: 404, body: { error: 'Guest not found' } };
  if (message === 'no_such_player') return { status: 404, body: { error: 'That player no longer exists' } };
  if (message === 'already_a_member') return { status: 409, body: { error: 'That guest is already a member' } };
  if (message === 'dues_year_not_open') {
    return { status: 409, body: { error: 'Open the dues year first — the member amount comes from it' } };
  }
  if (message.startsWith('phone_held_by:')) {
    const who = message.slice('phone_held_by:'.length);
    return { status: 409, body: { error: `${who} already has that number. A number belongs to one person.` } };
  }
  if (message.startsWith('name_taken:')) {
    return {
      status: 409,
      body: { error: 'name_taken', playerIds: message.slice('name_taken:'.length).split(',') },
    };
  }
  return { status: 500, body: { error: 'Failed to promote guest' } };
};

const duesYearFrom = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isInteger(n) && n > 2000 && n < 2100 ? n : null;
};

// GET /api/guests/:id/promotion?duesYear= — what converting would change. The
// confirm screen runs off this; the write runs off the same plan.
router.get('/:id/promotion', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const duesYear = duesYearFrom(req.query.duesYear);
  if (duesYear === null) return res.status(400).json({ error: 'duesYear is required' });
  try {
    res.json(await planPromotion(req.params.id, duesYear, {
      attachPlayerId: typeof req.query.attachPlayerId === 'string' ? req.query.attachPlayerId : null,
    }));
  } catch (error: any) {
    if (error instanceof PromotionBlocked) {
      const { status, body } = promotionError(error.message);
      return res.status(status).json(body);
    }
    console.error('Error planning promotion:', error);
    res.status(500).json({ error: 'Failed to plan promotion' });
  }
});

// POST /api/guests/:id/promote — make this guest a member.
router.post('/:id/promote', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const duesYear = duesYearFrom(req.body?.duesYear);
  if (duesYear === null) return res.status(400).json({ error: 'duesYear is required' });
  try {
    const result = await promoteGuest(req.params.id, duesYear, {
      attachPlayerId: typeof req.body?.attachPlayerId === 'string' ? req.body.attachPlayerId : null,
      acknowledgeNameClash: req.body?.acknowledgeNameClash === true,
    });
    // Her number now points at the member: give upcoming polls to the member row.
    const player = await prisma.player.findUnique({ where: { id: result.playerId }, select: { phone: true } });
    if (player?.phone) {
      try {
        await resyncPollsForPhone(player.phone, { onlyUpcoming: true });
      } catch (e) {
        console.error('[guests] resync after promotion failed:', e);
      }
    }
    res.json(result);
  } catch (error: any) {
    if (error instanceof PromotionBlocked) {
      const { status, body } = promotionError(error.message);
      return res.status(status).json(body);
    }
    console.error('Error promoting guest:', error);
    res.status(500).json({ error: 'Failed to promote guest' });
  }
});

// DELETE /api/guests/:id/phone — take a wrongly linked number off a guest. It
// shows up as an unmatched vote again, where it is re-linked to the right person.
router.delete('/:id/phone', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await unlinkGuestPhone(req.params.id));
  } catch (error: any) {
    if (error?.message === 'not_found') return res.status(404).json({ error: 'Guest not found' });
    console.error('Error unlinking guest phone:', error);
    res.status(500).json({ error: 'Failed to unlink number' });
  }
});

export default router;
