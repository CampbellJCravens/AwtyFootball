-- Add gameEvents and sportsmanship columns to Game table
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "gameEvents" TEXT;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "sportsmanship" TEXT;
