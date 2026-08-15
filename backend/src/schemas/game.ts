import { z } from 'zod';

export const goalSchema = z.object({
  scorerId: z.string(),
  assisterId: z.string().nullable(),
  timestamp: z.string(), // ISO date string
  // The team CREDITED with the goal. For an own goal that is the scorer's
  // opponent, which is what keeps the scoreline right with no special-casing.
  team: z.enum(['color', 'white']).nullable(),
  ownGoal: z.boolean().optional(),
});

export const teamChangeSchema = z.object({
  playerId: z.string(),
  timestamp: z.string(), // ISO date string
  team: z.enum(['color', 'white']),
  type: z.enum(['leave', 'swap']),
  previousTeam: z.enum(['color', 'white']).optional(),
  newTeam: z.enum(['color', 'white']).optional(),
});

export const gameEventSchema = z.object({
  type: z.enum(['halfTime', 'gameOver']),
  timestamp: z.string(), // ISO date string
});

// One guest appearance. slotPlayerId is the GuestN pool Player carrying the
// guest through teamAssignments/goals; guestName resolves server-side to a
// durable Guest identity. Both guestName and hostPlayerId are nullable —
// naming a guest and crediting a host are each skippable at the sideline.
export const guestVisitSchema = z.object({
  slotPlayerId: z.string(),
  guestName: z.string().trim().min(1).max(60).nullable(),
  hostPlayerId: z.string().nullable(),
});

export const updateGameSchema = z.object({
  guestVisits: z.array(guestVisitSchema).optional(),
  teamAssignments: z.record(z.enum(['color', 'white'])).optional(),
  goals: z.array(goalSchema).optional(),
  teamChanges: z.array(teamChangeSchema).optional(),
  gameEvents: z.array(gameEventSchema).optional(),
  sportsmanship: z.record(z.number()).optional(),
  fouls: z.record(z.number()).optional(),
  createdAt: z.string().datetime().optional(), // ISO date string
  gameNumber: z.number().int().positive().optional(), // Add game number support
  field: z.enum(['stadium', 'grass', 'cancelled']).nullable().optional(),
  // Kick-off. null clears it, so a mis-tap on the start button is undoable.
  startedAt: z.string().datetime().nullable().optional(),
});

export type Goal = z.infer<typeof goalSchema>;
export type GuestVisit = z.infer<typeof guestVisitSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;

