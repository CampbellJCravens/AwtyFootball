import dotenv from 'dotenv';

dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  PORT: parseInt(process.env.PORT || '4000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:4000',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-this-to-a-strong-random-secret',
};

// Validate required environment variables
if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

// Validate required environment variables for OAuth
if (process.env.NODE_ENV === 'production') {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production');
  }
  if (env.SESSION_SECRET === 'change-this-to-a-strong-random-secret' || env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be a strong random string (at least 32 characters) in production');
  }
}

