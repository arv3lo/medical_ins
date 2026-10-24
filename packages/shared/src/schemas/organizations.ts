import { z } from 'zod';
import { ORGANIZATION_TYPES } from '../roles.js';

export const createOrganizationInputSchema = z.object({
  type: z.enum(ORGANIZATION_TYPES),
  name: z.string().trim().min(2).max(200),
  /** NIF or STAT number. */
  taxId: z.string().trim().max(50).optional(),
  region: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const organizationSchema = createOrganizationInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;
