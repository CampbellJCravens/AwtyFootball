import { z } from 'zod';

export const goalSchema = z.object({
  scorerId: z.string(),
  assisterId: z.string().nullable(),
  timestamp: z.string(), // ISO date string
  team: z.enum(['color', 'white']).nullable(),
});

export const updateGameSchema = z.object({
  teamAssignments: z.record(z.enum(['color', 'white'])).optional(),
  goals: z.array(goalSchema).optional(),
  createdAt: z.string().datetime().optional(), // ISO date string
  gameNumber: z.number().int().positive().optional(), // Add game number support
});

export type Goal = z.infer<typeof goalSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;

