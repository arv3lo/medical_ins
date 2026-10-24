import { z } from 'zod';

export const createUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(200),
  initialPassword: z.string().min(10),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
