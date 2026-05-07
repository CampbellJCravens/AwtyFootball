-- Add `field` (stadium / grass / cancelled / null) to Game.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "field" TEXT;

-- Per-game RSVP rows. Identity is the player; one row per (gameId, playerId).
CREATE TABLE IF NOT EXISTS "GameRsvp" (
    "id"          TEXT PRIMARY KEY,
    "gameId"      TEXT NOT NULL,
    "playerId"    TEXT NOT NULL,
    "status"      TEXT NOT NULL,
    "guestCount"  INTEGER NOT NULL DEFAULT 0,
    "setByUserId" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameRsvp_gameId_fkey" FOREIGN KEY ("gameId")
        REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameRsvp_playerId_fkey" FOREIGN KEY ("playerId")
        REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GameRsvp_gameId_playerId_key" ON "GameRsvp"("gameId", "playerId");
CREATE INDEX IF NOT EXISTS "GameRsvp_gameId_idx" ON "GameRsvp"("gameId");
