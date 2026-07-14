/**
 * Awty Football Backend API
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Install dependencies:
 *    npm install
 * 
 * 2. Set up environment variables:
 *    - Copy .env.example to .env
 *    - Update DATABASE_URL with your PostgreSQL connection string
 *    - Example: DATABASE_URL="postgresql://user:password@localhost:5432/awty_football?schema=public"
 * 
 * 3. Run database migrations:
 *    npm run prisma:migrate
 *    (This will create the database schema and generate the Prisma client)
 * 
 * 4. Start the development server:
 *    npm run dev
 *    (Server will run on http://localhost:4000 by default)
 * 
 * API ENDPOINTS:
 * - POST   /api/players    - Create a new player
 * - GET    /api/players    - Get all players (ordered by createdAt DESC)
 * - GET    /api/players/:id - Get a single player by ID
 * - PATCH  /api/players/:id - Update a player
 * - DELETE /api/players/:id - Delete a player by ID
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import passport from 'passport';
import { ZodError } from 'zod';
import { env } from './env';
import './config/passport'; // Initialize passport strategies
import playersRouter from './routes/players';
import gamesRouter from './routes/games';
import rsvpsRouter from './routes/rsvps';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import statsRouter from './routes/stats';
import whatsappRouter from './routes/whatsapp';
import { startWhatsappListener } from './services/whatsapp/listener';

const PgSession = pgSession(session);

const app = express();

// Behind a proxy/load balancer (Render); needed so secure cookies work
app.set('trust proxy', 1);

// Middleware
const allowedOrigins = [
  env.FRONTEND_URL,
  process.env.FRONTEND_URL_ALT || 'https://www.awtyfootballclub.com',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):\d+$/.test(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.log('[CORS] Blocked origin:', origin);
    callback(null, false);
  },
  credentials: true,
}));
// Increase body size limit to 10MB for image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration with PostgreSQL store for persistence across server restarts
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on every request, keeps session alive while active
  store: new PgSession({
    conString: env.DATABASE_URL, // Use Neon PostgreSQL database
    tableName: 'user_sessions', // Custom table name for sessions
    createTableIfMissing: true, // Automatically create the sessions table
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
    httpOnly: true,
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days (increased from 30 days for better mobile persistence)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' needed for cross-domain in production
    domain: process.env.NODE_ENV === 'production' ? '.awtyfootballclub.com' : undefined, // Set domain for production
  },
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/games/:gameId/rsvps', rsvpsRouter);
app.use('/api/games', gamesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/whatsapp', whatsappRouter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    console.error('Validation error:', err.errors);
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
  }

  console.error('Unhandled error:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);

  // Read-only WhatsApp poll listener. Off unless WHATSAPP_LISTENER_ENABLED=true,
  // so this is inert in every environment until we explicitly link the device.
  if (env.WHATSAPP_LISTENER_ENABLED) {
    console.log('📱 WhatsApp listener enabled — starting (read-only)…');
    startWhatsappListener().catch((err) =>
      console.error('[whatsapp] Listener failed to start:', err)
    );
  }
});

