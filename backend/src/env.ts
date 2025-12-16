import dotenv from 'dotenv';

dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  PORT: parseInt(process.env.PORT || '4000', 10),
};

// Validate required environment variables
if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in .env file');
}

