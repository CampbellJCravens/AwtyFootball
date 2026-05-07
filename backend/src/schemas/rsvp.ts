import { z } from 'zod';

export const rsvpStatusSchema = z.enum(['yes', 'maybe', 'no']);

export const upsertRsvpSchema = z.object({
  playerId: z.string().uuid(),
  status: rsvpStatusSchema,
  guestCount: z.number().int().min(0).max(2).optional().default(0),
});

export const adminOverrideRsvpSchema = z.object({
  status: rsvpStatusSchema,
  guestCount: z.number().int().min(0).max(2).optional().default(0),
});

export type UpsertRsvpInput = z.infer<typeof upsertRsvpSchema>;
export type AdminOverrideRsvpInput = z.infer<typeof adminOverrideRsvpSchema>;
