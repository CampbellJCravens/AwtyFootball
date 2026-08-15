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
import { getLatestWhatsappQr, getWhatsappHealth, listWhatsappGroups, relinkWhatsapp, requestWhatsappPairingCode } from '../services/whatsapp/listener';
import {
  listPolls,
  linkPollToGame,
  getUnmatched,
  resolveContact,
  getWhatsappSettings,
  setWhatsappSettings,
} from '../services/whatsapp/polls';

const router = Router();

router.use(requireAdmin);

// Connection status for the admin panel. Deliberately touches NO database: the
// status banner polls this every 60s, so a query here would hold the Neon
// compute awake for as long as an admin has the app open — the exact burn
// 470acf2 was written to stop. Poll history comes from /polls instead.
router.get('/status', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    enabled: env.WHATSAPP_LISTENER_ENABLED,
    ...getWhatsappHealth(),
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

// Capture settings: which group (null = all chats) and title filter (null = any).
router.get('/settings', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await getWhatsappSettings());
  } catch (err) {
    next(err);
  }
});

// Update capture settings. Only provided fields change; pass null to clear one.
router.post('/settings', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { groupJid, titleFilter } = req.body ?? {};
    res.json(
      await setWhatsappSettings({
        groupJid: groupJid === undefined ? undefined : typeof groupJid === 'string' ? groupJid : null,
        titleFilter: titleFilter === undefined ? undefined : typeof titleFilter === 'string' ? titleFilter : null,
      })
    );
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

// Force a fresh link now: clear the (dead) session and restart the listener so
// a new QR is generated to scan — no redeploy needed.
router.post('/reset', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await relinkWhatsapp();
    res.json({ ok: true, note: 'Session cleared and re-linking — a new QR should appear shortly.' });
  } catch (err) {
    next(err);
  }
});

// Get a pairing code to link the account by typing it into WhatsApp (phone-only,
// no QR scan). Body: { phone } — the account's own number.
router.post('/pairing-code', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone } = req.body ?? {};
    if (typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Your WhatsApp number is required' });
    }
    const code = await requestWhatsappPairingCode(phone);
    res.json({ code });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to get a pairing code' });
  }
});

export default router;
