-- Add fouls column to Game (JSON Record<playerId, number>, positive counts)
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "fouls" TEXT;

-- Add isAlumni flag to Player (school alumni tracking)
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isAlumni" BOOLEAN NOT NULL DEFAULT false;
