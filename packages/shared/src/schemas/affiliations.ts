import { z } from 'zod';
import { isoDateSchema } from './dates.js';

export const HOLDER_STATUSES = ['holder', 'dependent'] as const;
export type HolderStatus = (typeof HOLDER_STATUSES)[number];
export const HOLDER_STATUS_LABELS: Record<HolderStatus, string> = {
  holder: 'Titulaire',
  dependent: 'Ayant droit',
};

/** `withdrawn`: the declaring center took back a pending declaration made by mistake. */
export const AFFILIATION_STATUSES = ['pending', 'validated', 'rejected', 'withdrawn'] as const;
export type AffiliationStatus = (typeof AFFILIATION_STATUSES)[number];
export const AFFILIATION_STATUS_LABELS: Record<AffiliationStatus, string> = {
  pending: 'À valider',
  validated: 'Validée',
  rejected: 'Refusée',
  withdrawn: 'Retirée',
};

/** Declared by a center; stays pending until the insurer validates it. */
export const createAffiliationInputSchema = z
  .object({
    insurerId: z.string().uuid(),
    /** Numéro d'assuré, as printed on the insurance card. Dependents use the holder's number. */
    memberNumber: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((value) => value.toUpperCase()),
    holderStatus: z.enum(HOLDER_STATUSES),
    /** Free text until insurance plans exist (roadmap P1.6). */
    planName: z.string().trim().max(200).optional(),
    employer: z.string().trim().max(200).optional(),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema.optional(),
  })
  .refine((a) => !a.endsOn || a.endsOn >= a.startsOn, {
    message: 'La fin doit suivre le début',
    path: ['endsOn'],
  });
export type CreateAffiliationInput = z.infer<typeof createAffiliationInputSchema>;

export const rejectAffiliationInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectAffiliationInput = z.infer<typeof rejectAffiliationInputSchema>;

export type Affiliation = {
  id: string;
  patientId: string;
  insurerId: string;
  insurerName: string;
  memberNumber: string;
  holderStatus: HolderStatus;
  planName: string | null;
  employer: string | null;
  startsOn: string;
  endsOn: string | null;
  status: AffiliationStatus;
  rejectionReason: string | null;
};

/** What an insurer sees of an affiliation: the person's identity, never medical content. */
export type InsuredAffiliation = Affiliation & {
  patient: { lastName: string; firstNames: string; birthDate: string; nationalId: string | null };
};

/** Covered on `day` (AAAA-MM-JJ): validated by the insurer, and within its dates. */
export function isAffiliationActive(
  affiliation: Pick<Affiliation, 'status' | 'startsOn' | 'endsOn'>,
  day: string,
): boolean {
  return (
    affiliation.status === 'validated' &&
    affiliation.startsOn <= day &&
    (affiliation.endsOn === null || day <= affiliation.endsOn)
  );
}
