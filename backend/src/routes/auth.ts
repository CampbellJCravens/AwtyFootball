import { Router, Request, Response } from 'express';
import passport from 'passport';
import prisma from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { env } from '../env';

const router = Router();

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

/**
 * GET /api/auth/google/callback
 * Google OAuth callback handler
 */
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req: AuthenticatedRequest, res: Response) => {
    // Successful authentication, redirect to frontend
    res.redirect(`${env.FRONTEND_URL}/?auth=success`);
  }
);

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get fresh user data from database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        playerId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * POST /api/auth/logout
 * Logout the current user
 */
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    req.session?.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Failed to destroy session' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

/**
 * GET /api/auth/allowed-emails
 * Get all allowed emails (admin only)
 */
router.get('/allowed-emails', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const allowedEmails = await prisma.allowedEmail.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json(allowedEmails);
  } catch (error) {
    console.error('Error fetching allowed emails:', error);
    res.status(500).json({ error: 'Failed to fetch allowed emails' });
  }
});

/**
 * POST /api/auth/allowed-emails
 * Add a new allowed email (admin only)
 */
router.post('/allowed-emails', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, role = 'regular' } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (role !== 'admin' && role !== 'regular') {
      return res.status(400).json({ error: 'Role must be "admin" or "regular"' });
    }

    const allowedEmail = await prisma.allowedEmail.create({
      data: {
        email: email.toLowerCase().trim(),
        role,
      },
    });

    res.status(201).json(allowedEmail);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already in allowlist' });
    }
    console.error('Error adding allowed email:', error);
    res.status(500).json({ error: 'Failed to add allowed email' });
  }
});

/**
 * DELETE /api/auth/allowed-emails/:id
 * Remove an allowed email (admin only)
 */
router.delete('/allowed-emails/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    await prisma.allowedEmail.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Allowed email not found' });
    }
    console.error('Error deleting allowed email:', error);
    res.status(500).json({ error: 'Failed to delete allowed email' });
  }
});

/**
 * POST /api/auth/link-player
 * Link an existing player to the current user account
 */
router.post('/link-player', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const { playerId } = req.body;
    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ error: 'playerId is required' });
    }

    // Check player exists
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Check no other user is already linked to this player
    const existingLink = await prisma.user.findFirst({ where: { playerId, NOT: { id: req.user.id } } });
    if (existingLink) return res.status(409).json({ error: 'This player is already linked to another account' });

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { playerId },
      select: { id: true, email: true, name: true, picture: true, role: true, playerId: true },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error linking player:', error);
    res.status(500).json({ error: 'Failed to link player' });
  }
});

/**
 * POST /api/auth/setup-profile
 * Create a new player and link to the current user (for new users)
 */
router.post('/setup-profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    const { name, pictureUrl } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check user doesn't already have a linked player
    const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (currentUser?.playerId) {
      return res.status(400).json({ error: 'You already have a linked player profile' });
    }

    // Create player and link in a transaction
    const [player, updatedUser] = await prisma.$transaction(async (tx) => {
      const newPlayer = await tx.player.create({
        data: { name: name.trim(), pictureUrl: pictureUrl || null },
      });
      const user = await tx.user.update({
        where: { id: req.user!.id },
        data: { playerId: newPlayer.id },
        select: { id: true, email: true, name: true, picture: true, role: true, playerId: true },
      });
      return [newPlayer, user];
    });

    res.status(201).json({ user: updatedUser, player });
  } catch (error) {
    console.error('Error setting up profile:', error);
    res.status(500).json({ error: 'Failed to set up profile' });
  }
});

export default router;

