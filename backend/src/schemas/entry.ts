import { z } from 'zod';

// Accepts regular URLs or base64 data URLs, or empty string/undefined
const pictureUrlSchema = z
  .string()
  .refine(
    (val) => {
      if (!val || val === '') return true;
      // Check if it's a valid URL or base64 data URL
      try {
        if (val.startsWith('data:image/')) return true;
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Picture URL must be a valid URL or base64 data URL' }
  )
  .optional()
  .nullable();

export const createPlayerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be less than 200 characters'),
  pictureUrl: pictureUrlSchema,
  team: z.enum(['dark', 'white']).optional(),
});

export const updatePlayerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be less than 200 characters').optional(),
  pictureUrl: pictureUrlSchema,
  team: z.enum(['dark', 'white']).optional(),
});

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;

