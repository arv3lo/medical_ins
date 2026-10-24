import { z } from 'zod';
import { isoDateSchema } from './dates.js';

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
