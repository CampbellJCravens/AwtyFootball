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
  GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || '',
  // Casual site-wide password gate. Default kept simple for dev; override
  // in .env / production environment.
  SITE_PASSWORD: process.env.SITE_PASSWORD || 'AWTY',
  // Read-only WhatsApp poll listener. When on, the backend links as a WhatsApp
  // device and syncs poll votes into RSVPs. Defaults ON in production (so a
  // deploy activates it without a manual env toggle) and OFF elsewhere; set
  // WHATSAPP_LISTENER_ENABLED=true/false to override in any environment.
  // See docs/whatsapp-poll-listener-spec.md.
  WHATSAPP_LISTENER_ENABLED: process.env.WHATSAPP_LISTENER_ENABLED
    ? process.env.WHATSAPP_LISTENER_ENABLED === 'true'
    : process.env.NODE_ENV === 'production',
  // Where Baileys auth state lives. Signal keys rotate constantly, so keeping
  // them in Postgres held the Neon compute awake 24/7 and burned the monthly
  // compute quota (outage on 2026-07-29).
  //   "redis"    — default when REDIS_URL is set. Survives redeploys and keeps
  //                zero-downtime deploys (unlike a Render disk, which forces the
  //                old instance to stop before the new one starts).
  //   "file"     — creds on disk at WHATSAPP_AUTH_DIR. Needs a persistent disk
  //                on Render or the session dies on every redeploy.
  //   "postgres" — the original store. Restores the compute burn; escape hatch.
  WHATSAPP_AUTH_STORE:
    process.env.WHATSAPP_AUTH_STORE === 'postgres'
      ? 'postgres'
      : process.env.WHATSAPP_AUTH_STORE === 'file'
        ? 'file'
        : process.env.WHATSAPP_AUTH_STORE === 'redis' || process.env.REDIS_URL
          ? 'redis'
          : 'file',
  WHATSAPP_AUTH_DIR: process.env.WHATSAPP_AUTH_DIR || './.wa-auth',
  // Standard Redis connection string (Upstash, Redis Cloud, self-hosted).
  REDIS_URL: process.env.REDIS_URL || '',
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

