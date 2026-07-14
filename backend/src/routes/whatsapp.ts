/**
 * Admin API for the WhatsApp poll listener.
 *
 * Mounted at /api/whatsapp. All routes are admin-only. Covers linking the
 * device (QR), linking captured polls to games, and resolving unmatched votes.
 * See docs/whatsapp-poll-listener-spec.md.
 */
import { Router, Response, NextFunction } from 'express';
import QRCode from 'qrcode';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { env } from '../env';
import { getLatestWhatsappQr, isWhatsappLinked, listWhatsappGroups } from '../services/whatsapp/listener';
import { clearPostgresAuthState } from '../services/whatsapp/authState';
import {
  listPolls,
  linkPollToGame,
  getUnmatched,
  resolveContact,
  getScope,
  setScope,
} from '../services/whatsapp/polls';

const router = Router();

router.use(requireAdmin);

// Connection status for the admin panel.
router.get('/status', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    enabled: env.WHATSAPP_LISTENER_ENABLED,
    linked: isWhatsappLinked(),
    hasQr: getLatestWhatsappQr() !== null,
  });
});

// Current QR as a PNG data URL for scanning, or 204 if already linked / none.
router.get('/qr', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const qr = getLatestWhatsappQr();
    if (!qr) return res.status(204).end();
    const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    res.json({ dataUrl });
  } catch (err) {
    next(err);
  }
});

// Captured polls (linked and unlinked).
router.get('/polls', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await listPolls());
  } catch (err) {
    next(err);
  }
});

// Link (or re-link) a captured poll to a game.
router.post('/polls/:pollMessageId/link', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { pollMessageId } = req.params;
    const { gameId } = req.body ?? {};
    if (typeof gameId !== 'string' || !gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }
    await linkPollToGame(pollMessageId, gameId, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Groups the linked account is in (for choosing the scope).
router.get('/groups', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await listWhatsappGroups());
  } catch (err) {
    next(err);
  }
});

// Current capture scope (which group, or null = all chats).
router.get('/scope', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ groupJid: await getScope() });
  } catch (err) {
    next(err);
  }
});

// Set the capture scope. Pass { groupJid: null } to unscope.
router.post('/scope', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { groupJid } = req.body ?? {};
    await setScope(typeof groupJid === 'string' ? groupJid : null);
    res.json({ ok: true, groupJid: await getScope() });
  } catch (err) {
    next(err);
  }
});

// Votes from numbers not yet mapped to a player. Optional ?gameId= to scope to one game.
router.get('/unmatched', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
    res.json(await getUnmatched(gameId));
  } catch (err) {
    next(err);
  }
});

// Map a phone number to a player (backfills Player.phone) and re-sync.
router.post('/unmatched/resolve', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, playerId } = req.body ?? {};
    if (typeof phone !== 'string' || typeof playerId !== 'string' || !phone || !playerId) {
      return res.status(400).json({ error: 'phone and playerId are required' });
    }
    await resolveContact(phone, playerId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Force a fresh link: wipe stored auth so the next (re)start shows a new QR.
router.post('/reset', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await clearPostgresAuthState();
    res.json({ ok: true, note: 'Auth cleared. Restart the backend to generate a new QR.' });
  } catch (err) {
    next(err);
  }
});

export default router;
