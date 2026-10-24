import { z } from 'zod';
import { ORGANIZATION_TYPES, ROLES } from '../roles.js';

export const createOrganizationInputSchema = z.object({
  type: z.enum(ORGANIZATION_TYPES),
  name: z.string().trim().min(2).max(200),
  /** NIF or STAT number. */
  taxId: z.string().trim().max(50).optional(),
  region: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

/** An organization as the API returns it: absent optional fields come back as null. */
export const organizationSchema = createOrganizationInputSchema.extend({
  id: z.string().uuid(),
  taxId: z.string().nullable(),
  region: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

/** Attaches an existing account; only the super admin creates accounts (POST /api/users). */
export const addMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
});
export type AddMemberInput = z.infer<typeof addMemberInputSchema>;
