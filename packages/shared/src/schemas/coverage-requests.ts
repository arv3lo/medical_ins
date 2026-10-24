import { z } from 'zod';
import { type Affiliation, isAffiliationActive } from './affiliations.js';
import { icd10CodeSchema } from './consultations.js';
import { isoDateSchema, today } from './dates.js';

/** Life cycle of a coverage request (prior approval), roadmap P3. */
export const COVERAGE_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'granted',
  'rejected',
  'info_requested',
  'used',
  'billed',
  'cancelled',
  'expired',
] as const;
export type CoverageRequestStatus = (typeof COVERAGE_REQUEST_STATUSES)[number];

export const COVERAGE_REQUEST_STATUS_LABELS: Record<CoverageRequestStatus, string> = {
  draft: 'Brouillon',
  submitted: 'Soumise',
  under_review: 'En examen',
  granted: 'Accordée',
  rejected: 'Refusée',
  info_requested: 'Complément demandé',
  used: 'Utilisée',
  billed: 'Facturée',
  cancelled: 'Annulée',
  expired: 'Expirée',
};

/** No transition ever leaves these. */
export const FINAL_STATUSES: readonly CoverageRequestStatus[] = [
  'rejected',
  'cancelled',
  'expired',
  'billed',
];

/**
 * Who moves a request: the requesting center (`coverage_request.create`), the insurer it is
 * addressed to (`coverage_request.decide`), or the system itself (expiry, billing).
 */
export type CoverageRequestActor = 'center' | 'insurer' | 'system';

export const coverageRequestStatusSchema = z.enum(COVERAGE_REQUEST_STATUSES);

/**
 * The only home of the life-cycle rule (spec FR-004): for each status, the statuses it may move
 * to and who may move it there. The API enforces it; screens use it to offer only possible moves.
 */
const TRANSITIONS: Record<
  CoverageRequestStatus,
  Partial<Record<CoverageRequestStatus, CoverageRequestActor>>
> = {
  draft: { submitted: 'center', cancelled: 'center' },
  submitted: { under_review: 'insurer', cancelled: 'center' },
  under_review: {
    granted: 'insurer',
    rejected: 'insurer',
    info_requested: 'insurer',
    cancelled: 'center',
  },
  info_requested: { submitted: 'center', cancelled: 'center' },
  granted: { used: 'center', expired: 'system' },
  used: { billed: 'system' },
  billed: {},
  rejected: {},
  cancelled: {},
  expired: {},
};

export function canTransition(
  from: CoverageRequestStatus,
  to: CoverageRequestStatus,
  actor: CoverageRequestActor,
): boolean {
  return TRANSITIONS[from][to] === actor;
}

/** A reason, required by some transitions (FR-004); kept in the history, never in the audit. */
export const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Motif requis')
  .max(1000, 'Motif trop long (1 000 caractères au plus)');

/** Ariary are whole: no amount has decimals. */
const amountSchema = z.number().int('Montant en ariary entiers').positive('Montant invalide');

/** Moving a request; which fields a move requires is checked by `transitionProblem`. */
export const transitionInputSchema = z.object({
  to: coverageRequestStatusSchema.exclude(['draft']),
  reason: reasonSchema.optional(),
  grantedAmount: amountSchema.optional(),
  validUntil: isoDateSchema.optional(),
});
export type TransitionInput = z.infer<typeof transitionInputSchema>;

/**
 * What blocks a move the transition table allows (FR-004), as a French message, or null. Dates
 * are calendar days in Madagascar, compared as AAAA-MM-JJ strings. Submission has its own check
 * (`submissionProblem`), since it needs the affiliation.
 */
export function transitionProblem(
  from: CoverageRequestStatus,
  input: TransitionInput,
  request: { estimatedAmount: number; validUntil: string | null },
  day: string = today(),
): string | null {
  const needsReason =
    input.to === 'rejected' ||
    input.to === 'info_requested' ||
    (input.to === 'cancelled' && from !== 'draft');
  if (needsReason && !input.reason) return 'Motif requis';

  if (input.to === 'granted') {
    const { grantedAmount, validUntil } = input;
    if (grantedAmount === undefined) return 'Montant accordé requis';
    if (grantedAmount > request.estimatedAmount) {
      return 'Le montant accordé ne peut pas dépasser le montant estimé';
    }
    if (!validUntil || validUntil < day)
      return "Date limite de validité requise, à partir d'aujourd'hui";
    if (grantedAmount < request.estimatedAmount && !input.reason) {
      return 'Motif requis pour un accord partiel';
    }
  }

  if (input.to === 'used' && (!request.validUntil || day > request.validUntil)) {
    return "L'accord a expiré";
  }
  return null;
}

/**
 * Amounts are stored as 32-bit integers (max 2 147 483 647). These bounds keep a line with its own
 * price under that limit; a line at the act's reference price is not bounded here, so the server
 * checks the total, which covers every line, before writing any of them.
 */
const MAX_ITEM_QUANTITY = 100;
const MAX_UNIT_PRICE = 20_000_000;
export const MAX_REQUEST_AMOUNT = 2_000_000_000;

/** A line asked for; without `unitPrice`, the act's reference price applies. */
export const coverageRequestItemInputSchema = z.object({
  actCode: z.string().trim().toUpperCase().min(1).max(30),
  quantity: z
    .number()
    .int('Quantité entière')
    .min(1, 'Quantité invalide')
    .max(MAX_ITEM_QUANTITY, `Quantité limitée à ${MAX_ITEM_QUANTITY}`),
  unitPrice: amountSchema.max(MAX_UNIT_PRICE, 'Tarif unitaire trop élevé').optional(),
});

const itemsSchema = z
  .array(coverageRequestItemInputSchema)
  .min(1, 'Au moins un acte')
  .max(30, '30 actes au plus');

export const createCoverageRequestInputSchema = z.object({
  patientId: z.string().uuid(),
  affiliationId: z.string().uuid(),
  diagnosisCode: icd10CodeSchema,
  items: itemsSchema,
});
export type CreateCoverageRequestInput = z.infer<typeof createCoverageRequestInputSchema>;

/** Editing a draft or a request awaiting more information; `items` replaces every line. */
export const updateCoverageRequestInputSchema = z
  .object({ affiliationId: z.string().uuid(), diagnosisCode: icd10CodeSchema, items: itemsSchema })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateCoverageRequestInput = z.infer<typeof updateCoverageRequestInputSchema>;

/** What blocks submitting a request to the insurer (FR-004), as a French message, or null. */
export function submissionProblem(
  affiliation: Pick<Affiliation, 'status' | 'startsOn' | 'endsOn'>,
  request: { diagnosisCode: string | null; itemCount: number },
  day: string = today(),
): string | null {
  if (!isAffiliationActive(affiliation, day)) {
    return "L'affiliation du patient n'est pas active aujourd'hui (validée et dans ses dates)";
  }
  if (!request.diagnosisCode) return 'Diagnostic principal requis';
  if (request.itemCount === 0) return 'Au moins un acte requis';
  return null;
}
