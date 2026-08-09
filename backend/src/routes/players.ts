import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { createPlayerSchema, updatePlayerSchema } from '../schemas/entry';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { resyncPollsForPhone } from '../services/whatsapp/polls';

const router = Router();

// Normalize a free-form phone entry to digits only (matching how WhatsApp poll
// votes are keyed). undefined = leave unchanged; empty/blank = clear (null).
// US assumption: a bare 10-digit number gets a leading "1" (country code), since
// WhatsApp reports numbers with it and people won't type it themselves.
const normalizePhone = (raw: string | null | undefined): string | null | undefined => {
  if (raw === undefined) return undefined;
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) digits = '1' + digits;
  return digits;
};

// Player is public, but phone numbers are not: everyone gets `hasPhone`, only
// admins get the actual `phone` string.
const serializePlayer = (p: any, isAdmin: boolean) => ({
  id: p.id,
  name: p.name,
  pictureUrl: p.pictureUrl,
  team: p.team,
  onRoster: p.onRoster,
  isAlumni: p.isAlumni,
  memberSince: p.memberSince,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  hasPhone: !!p.phone,
  ...(isAdmin ? { phone: p.phone ?? null } : {}),
});

const isReqAdmin = (req: AuthenticatedRequest) => req.user?.role === 'admin';

// POST /api/players - Create a new player (public; new RSVPers can self-register)
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Received request body:', req.body);
    const validatedData = createPlayerSchema.parse(req.body);
    console.log('Validated data:', validatedData);
    const player = await prisma.player.create({
      data: {
        name: validatedData.name,
        pictureUrl: validatedData.pictureUrl && validatedData.pictureUrl !== '' ? validatedData.pictureUrl : null,
        team: validatedData.team || null,
        phone: normalizePhone(validatedData.phone) ?? null,
        ...(validatedData.onRoster !== undefined && { onRoster: validatedData.onRoster }),
        ...(validatedData.isAlumni !== undefined && { isAlumni: validatedData.isAlumni }),
        ...(validatedData.memberSince !== undefined && { memberSince: validatedData.memberSince }),
      },
    });
    res.status(201).json(serializePlayer(player, isReqAdmin(req)));
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'That phone number is already linked to another player' });
    }
    console.error('Error creating player:', error);
    // Let Zod errors propagate to error middleware
    next(error);
  }
});

// GET /api/players - Get all players (public)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const players = await prisma.player.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    const admin = isReqAdmin(req);
    res.json(players.map((p) => serializePlayer(p, admin)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /api/players/:id - Get a single player (public)
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(serializePlayer(player, isReqAdmin(req)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// PATCH /api/players/:id - Update a player (public; matches existing "any signed-in user can edit" behavior under the open-access model)
router.patch('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = updatePlayerSchema.parse(req.body);
    
    const normalizedPhone = normalizePhone(validatedData.phone);

    const player = await prisma.player.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.pictureUrl !== undefined && { pictureUrl: validatedData.pictureUrl || null }),
        ...(validatedData.team !== undefined && { team: validatedData.team || null }),
        ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
        ...(validatedData.onRoster !== undefined && { onRoster: validatedData.onRoster }),
        ...(validatedData.isAlumni !== undefined && { isAlumni: validatedData.isAlumni }),
        ...(validatedData.memberSince !== undefined && { memberSince: validatedData.memberSince }),
      },
    });

    // If a number was just set, retroactively attribute any past poll votes
    // from it (best-effort — don't fail the save if the re-sync hiccups).
    if (typeof normalizedPhone === 'string' && normalizedPhone) {
      try {
        await resyncPollsForPhone(normalizedPhone);
      } catch (e) {
        console.error('[players] resync after phone update failed:', e);
      }
    }

    res.json(serializePlayer(player, isReqAdmin(req)));
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'That phone number is already linked to another player' });
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

