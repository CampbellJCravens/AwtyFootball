import { Router, Request, Response, NextFunction } from 'express';
import { isStorableImage, loadPlayersForDisplay, avatarUrl } from '../services/avatar';
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

/*
 * Avatars are served as their own cacheable URL rather than inlined as base64.
 *
 * They used to ride inside every payload that mentioned a player, which made
 * GET /api/stats/monthly 22.7 MB of photographs wrapped around 10 KB of stats,
 * with the same twelve images repeated fifty-one times. As a URL the browser
 * fetches each one once and caches it, and no JSON ever carries an image again.
 *
 * The origin comes from the request rather than an env var: this is the host the
 * client just successfully called, so it cannot drift out of sync with wherever
 * the API is actually deployed. (`trust proxy` is set, so req.protocol is the
 * external scheme, not Render's internal http.)
 *
 * `?v=updatedAt` is what makes a long cache safe — change the photo and the URL
 * changes with it. Without it a new photo would not appear for a year.
 */
// Deliberately NOT a local copy. This file used to define its own avatarUrl
// that tested `p.pictureUrl`, and when loadPlayersForDisplay stopped returning
// that column every avatar on the roster silently became null. One
// implementation, in services/avatar.ts, which understands `hasPhoto`.

const serializePlayer = (p: any, isAdmin: boolean, req?: AuthenticatedRequest) => ({
  id: p.id,
  name: p.name,
  pictureUrl: req ? avatarUrl(req, p) : p.pictureUrl,
  team: p.team,
  onRoster: p.onRoster,
  isAlumni: p.isAlumni,
  graduationYear: p.graduationYear,
  memberSince: p.memberSince,
  staminaExempt: p.staminaExempt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  hasPhone: !!p.phone,
  ...(isAdmin ? { phone: p.phone ?? null } : {}),
});

const isReqAdmin = (req: AuthenticatedRequest) => req.user?.role === 'admin';

/*
 * A photo is only ever stored as base64. Since serialisation now hands clients a
 * URL, any caller that echoes a whole player object back would otherwise write
 * that URL into the column and destroy the image. The edit form sends this field
 * only when a new file is chosen, so this should never fire — it exists so that
 * a future caller which is less careful cannot silently wipe everyone's photos.
 */
const storablePicture = (value: string | null | undefined) =>
  value && isStorableImage(value) ? value : null;

// POST /api/players - Create a new player (public; new RSVPers can self-register)
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Received request body:', req.body);
    const validatedData = createPlayerSchema.parse(req.body);
    console.log('Validated data:', validatedData);
    const player = await prisma.player.create({
      data: {
        name: validatedData.name,
        pictureUrl: storablePicture(validatedData.pictureUrl),
        team: validatedData.team || null,
        phone: normalizePhone(validatedData.phone) ?? null,
        ...(validatedData.onRoster !== undefined && { onRoster: validatedData.onRoster }),
        ...(validatedData.isAlumni !== undefined && { isAlumni: validatedData.isAlumni }),
        ...(validatedData.graduationYear !== undefined && { graduationYear: validatedData.graduationYear }),
        ...(validatedData.memberSince !== undefined && { memberSince: validatedData.memberSince }),
        ...(validatedData.staminaExempt !== undefined && { staminaExempt: validatedData.staminaExempt }),
      },
    });
    res.status(201).json(serializePlayer(player, isReqAdmin(req), req));
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
    // No `select` here used to pull every base64 photo out of Neon (1.22 MB)
    // only for serializePlayer to discard it. See services/avatar.ts.
    const players = await loadPlayersForDisplay(prisma, {
      orderBy: { createdAt: 'desc' },
    });
    const admin = isReqAdmin(req);
    res.json(players.map((p) => serializePlayer(p, admin, req)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /api/players/:id/avatar - the player's photo as an image (public)
//
// Long-cached and immutable: the URL carries ?v=updatedAt, so a changed photo is
// a different URL and the stale one is never consulted. Anything without the
// version parameter still revalidates via ETag.
router.get('/:id/avatar', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      select: { pictureUrl: true, updatedAt: true },
    });
    if (!player?.pictureUrl) return res.status(404).end();

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(player.pictureUrl);
    if (!match) return res.status(404).end();

    const body = Buffer.from(match[2], 'base64');
    const etag = `W/"${player.updatedAt.getTime()}-${body.length}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    res.setHeader('Content-Type', match[1]);
    res.setHeader('Content-Length', body.length);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate');
    return res.end(body);
  } catch (error) {
    console.error('Error serving avatar:', error);
    return res.status(500).end();
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

    res.json(serializePlayer(player, isReqAdmin(req), req));
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
        ...(validatedData.pictureUrl !== undefined && { pictureUrl: storablePicture(validatedData.pictureUrl) }),
        ...(validatedData.team !== undefined && { team: validatedData.team || null }),
        ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
        ...(validatedData.onRoster !== undefined && { onRoster: validatedData.onRoster }),
        ...(validatedData.isAlumni !== undefined && { isAlumni: validatedData.isAlumni }),
        ...(validatedData.graduationYear !== undefined && { graduationYear: validatedData.graduationYear }),
        ...(validatedData.memberSince !== undefined && { memberSince: validatedData.memberSince }),
        ...(validatedData.staminaExempt !== undefined && { staminaExempt: validatedData.staminaExempt }),
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

    res.json(serializePlayer(player, isReqAdmin(req), req));
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

