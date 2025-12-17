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
import passport from 'passport';
import { ZodError } from 'zod';
import { env } from './env';
import './config/passport'; // Initialize passport strategies
import playersRouter from './routes/players';
import gamesRouter from './routes/games';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';

const app = express();

// Behind a proxy/load balancer (Render); needed so secure cookies work
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
// Increase body size limit to 10MB for image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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
app.use('/api/games', gamesRouter);
app.use('/api/settings', settingsRouter);

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
});

