import { Router, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { upsertRsvpSchema, adminOverrideRsvpSchema } from '../schemas/rsvp';
import { getGamePoll, buildPollTitle } from '../services/whatsapp/polls';
import { createPollForGame } from '../services/whatsapp/listener';

// Mounted at /api/games/:gameId/rsvps. mergeParams lets handlers see :gameId.
const router = Router({ mergeParams: true });

const serialize = (rsvp: {
  id: string;
  gameId: string;
  playerId: string;
  status: string;
  guestCount: number;
  setByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: rsvp.id,
  gameId: rsvp.gameId,
  playerId: rsvp.playerId,
  status: rsvp.status,
  guestCount: rsvp.guestCount,
  setByUserId: rsvp.setByUserId,
  createdAt: rsvp.createdAt.toISOString(),
  updatedAt: rsvp.updatedAt.toISOString(),
});

// GET /api/games/:gameId/rsvps/poll - Read-only poll view derived from WhatsApp
// votes (public). Counts linked players AND unlinked numbers; no phone numbers.
router.get('/poll', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(await getGamePoll(gameId));
  } catch (err) {
    next(err);
  }
});

// POST /api/games/:gameId/rsvps/create-poll - Post a standard-format poll to the
// WhatsApp group for this game and auto-link it (admin only).
router.post('/create-poll', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, createdAt: true, field: true },
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const title = buildPollTitle(game);
    const result = await createPollForGame(gameId, req.user!.id, title);
    res.json(result);
  } catch (err: any) {
    // Surface friendly setup errors (not linked / no group) instead of 500.
    return res.status(400).json({ error: err?.message || 'Failed to create poll' });
  }
});

// GET /api/games/:gameId/rsvps - List all RSVPs for a game (public)
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const rsvps = await prisma.gameRsvp.findMany({
      where: { gameId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rsvps.map(serialize));
  } catch (err) {
    next(err);
  }
});

// POST /api/games/:gameId/rsvp - Upsert own RSVP (public, identity = body.playerId)
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const parsed = upsertRsvpSchema.parse(req.body);

    const [game, player] = await Promise.all([
      prisma.game.findUnique({ where: { id: gameId }, select: { id: true } }),
      prisma.player.findUnique({ where: { id: parsed.playerId }, select: { id: true } }),
    ]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Force guestCount to 0 unless status is yes (matches UI rule)
    const guestCount = parsed.status === 'yes' ? parsed.guestCount : 0;

    const rsvp = await prisma.gameRsvp.upsert({
      where: { gameId_playerId: { gameId, playerId: parsed.playerId } },
      create: {
        gameId,
        playerId: parsed.playerId,
        status: parsed.status,
        guestCount,
        setByUserId: null, // self-set
      },
      update: {
        status: parsed.status,
        guestCount,
        setByUserId: null, // self-set overrides any prior admin override
      },
    });
    res.status(200).json(serialize(rsvp));
  } catch (err) {
    next(err);
  }
});

// PUT /api/games/:gameId/rsvps/:playerId - Admin override of someone else's RSVP
router.put('/:playerId', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId, playerId } = req.params;
    const parsed = adminOverrideRsvpSchema.parse(req.body);

    const [game, player] = await Promise.all([
      prisma.game.findUnique({ where: { id: gameId }, select: { id: true } }),
      prisma.player.findUnique({ where: { id: playerId }, select: { id: true } }),
    ]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const guestCount = parsed.status === 'yes' ? parsed.guestCount : 0;

    const rsvp = await prisma.gameRsvp.upsert({
      where: { gameId_playerId: { gameId, playerId } },
      create: {
        gameId,
        playerId,
        status: parsed.status,
        guestCount,
        setByUserId: req.user!.id,
      },
      update: {
        status: parsed.status,
        guestCount,
        setByUserId: req.user!.id,
      },
    });
    res.json(serialize(rsvp));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/games/:gameId/rsvps - Admin: reset the whole poll by clearing
// every RSVP for this game. Used to wipe a game's poll (e.g. when re-syncing
// from a fresh WhatsApp screenshot).
router.delete('/', requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const result = await prisma.gameRsvp.deleteMany({ where: { gameId } });
    res.json({ deleted: result.count });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/games/:gameId/rsvps/:playerId - Clear an RSVP (public; users can
// clear their own vote by tapping the same option twice, admins can clear
// anyone's via the row controls). Same trust model as POST.
router.delete('/:playerId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId, playerId } = req.params;
    await prisma.gameRsvp.delete({
      where: { gameId_playerId: { gameId, playerId } },
    });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'RSVP not found' });
    next(err);
  }
});

export default router;
