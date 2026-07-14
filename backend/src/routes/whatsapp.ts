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
import { getLatestWhatsappQr, isWhatsappLinked } from '../services/whatsapp/listener';
import { clearPostgresAuthState } from '../services/whatsapp/authState';
import {
  listPolls,
  linkPollToGame,
  getUnmatched,
  resolveContact,
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

// Votes from numbers not yet mapped to a player.
router.get('/unmatched', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await getUnmatched());
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
