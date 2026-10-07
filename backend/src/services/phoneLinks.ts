import { Prisma } from '@prisma/client';
import prisma from '../prisma';

// Same value as polls.ts WHATSAPP_SOURCE. Not imported from there because
// polls.ts pulls in Baileys, which keeps this module out of reach of tsx checks.
const WHATSAPP_SOURCE = 'whatsapp';

type Tx = Prisma.TransactionClient;

// Fixing a wrong link only reaches games that haven't been played. Played games
// are history and stay exactly as they were (owner 2026-10-07). A day's grace
// covers a game-morning fix before anyone has pressed Start.
export const upcomingGameWhere = (): Prisma.GameWhereInput => ({
  startedAt: null,
  createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
});

/** Drop the WhatsApp RSVPs a member's number created in upcoming games. */
export async function clearPlayerClaims(tx: Tx, playerId: string): Promise<number> {
  const { count } = await tx.gameRsvp.deleteMany({
    where: { playerId, setByUserId: WHATSAPP_SOURCE, game: upcomingGameWhere() },
  });
  return count;
}

/**
 * Release the GuestN slots a guest's number claimed in upcoming games. Only a
 * slot the poll sync claimed is released: its RSVP is WhatsApp-sourced and
 * nobody has put the slot on a team yet. A guest named by hand is left alone.
 */
export async function clearGuestClaims(tx: Tx, guestId: string): Promise<number> {
  const visits = await tx.guestVisit.findMany({
    where: { guestId, game: upcomingGameWhere() },
    select: { id: true, gameId: true, slotPlayerId: true, game: { select: { teamAssignments: true } } },
  });
  let released = 0;
  for (const v of visits) {
    const teams: Record<string, unknown> = v.game.teamAssignments ? JSON.parse(v.game.teamAssignments) : {};
    if (v.slotPlayerId in teams) continue;
    const { count } = await tx.gameRsvp.deleteMany({
      where: { gameId: v.gameId, playerId: v.slotPlayerId, setByUserId: WHATSAPP_SOURCE },
    });
    if (count === 0) continue;
    await tx.guestVisit.delete({ where: { id: v.id } });
    released++;
  }
  return released;
}

/** Take a number off a guest. It shows up as unmatched again, ready to re-link. */
export async function unlinkGuestPhone(guestId: string): Promise<{ phone: string | null; released: number }> {
  return prisma.$transaction(async tx => {
    const guest = await tx.guest.findUnique({ where: { id: guestId }, select: { phone: true } });
    if (!guest) throw new Error('not_found');
    if (!guest.phone) return { phone: null, released: 0 };
    const released = await clearGuestClaims(tx, guestId);
    await tx.guest.update({ where: { id: guestId }, data: { phone: null } });
    return { phone: guest.phone, released };
  });
}
