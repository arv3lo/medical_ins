import { z } from 'zod';
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
