import { z } from 'zod';

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
