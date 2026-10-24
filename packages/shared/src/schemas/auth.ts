import { z } from 'zod';
import { ORGANIZATION_TYPES, ROLES } from '../roles.js';

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const membershipSchema = z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  organizationType: z.enum(ORGANIZATION_TYPES),
  role: z.enum(ROLES),
});
export type Membership = z.infer<typeof membershipSchema>;

export const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  isSuperAdmin: z.boolean(),
  memberships: z.array(membershipSchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;
