import { z } from 'zod';

export const goalSchema = z.object({
  scorerId: z.string(),
  assisterId: z.string().nullable(),
  timestamp: z.string(), // ISO date string
  team: z.enum(['color', 'white']).nullable(),
});

export const teamChangeSchema = z.object({
  playerId: z.string(),
  timestamp: z.string(), // ISO date string
  team: z.enum(['color', 'white']),
  type: z.enum(['leave', 'swap']),
  previousTeam: z.enum(['color', 'white']).optional(),
  newTeam: z.enum(['color', 'white']).optional(),
});

export const updateGameSchema = z.object({
  teamAssignments: z.record(z.enum(['color', 'white'])).optional(),
  goals: z.array(goalSchema).optional(),
  teamChanges: z.array(teamChangeSchema).optional(),
  createdAt: z.string().datetime().optional(), // ISO date string
  gameNumber: z.number().int().positive().optional(), // Add game number support
});

export type Goal = z.infer<typeof goalSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;

