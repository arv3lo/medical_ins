import {
  type CoverageRequestActor,
  canTransition,
  submissionProblem,
  type TransitionInput,
  transitionProblem,
} from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { coverageRequestEvents, coverageRequests } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import {
  type CoverageRequestRow,
  countItems,
  lockCoverageRequest,
  requirePatientAffiliation,
} from './service.js';

/** The request as `actor` of `organizationId` may act on it, or 404 (FR-014). */
export function requireReachable(
  request: CoverageRequestRow,
  organizationId: string,
  actor: Exclude<CoverageRequestActor, 'system'>,
): void {
  const reachable =
    actor === 'center'
      ? request.centerId === organizationId
      : request.insurerId === organizationId && request.status !== 'draft';
  if (!reachable) throw notFound('Demande de prise en charge');
}

async function problem(tx: Tx, request: CoverageRequestRow, input: TransitionInput) {
  if (input.to !== 'submitted') return transitionProblem(request.status, input, request);
  const affiliation = await requirePatientAffiliation(tx, request.patientId, request.affiliationId);
  return submissionProblem(affiliation, {
    diagnosisCode: request.diagnosisCode,
    itemCount: await countItems(tx, request.id),
  });
}

/**
 * Moves a request: lock, check the shared table and conditions on the locked row, then write the
 * new status, its history event and its audit entry in `tx`, so all three commit together. The
 * audit holds the move and amounts only: reasons stay in the history (constitution, principle I).
 */
export async function applyTransition(
  tx: Tx,
  move: {
    id: string;
    organizationId: string;
    actor: Exclude<CoverageRequestActor, 'system'>;
    actorUserId: string;
    input: TransitionInput;
    ip: string;
  },
): Promise<{ id: string; status: CoverageRequestRow['status'] }> {
  const { input } = move;
  const request = await lockCoverageRequest(tx, move.id);
  requireReachable(request, move.organizationId, move.actor);
  if (!canTransition(request.status, input.to, move.actor)) {
    throw new HttpError(409, "Ce changement de statut n'est pas possible");
  }
  const message = await problem(tx, request, input);
  if (message) throw new HttpError(400, message);

  // A grant sets the amount, the patient's share and the validity date together (a DB check
  // holds that too); the patient pays what the insurer does not cover (FR-010).
  const grant =
    input.to === 'granted'
      ? {
          grantedAmount: input.grantedAmount!,
          patientShare: request.estimatedAmount - input.grantedAmount!,
          validUntil: input.validUntil!,
        }
      : undefined;
  await tx
    .update(coverageRequests)
    .set({ status: input.to, ...grant })
    .where(eq(coverageRequests.id, request.id));
  await tx.insert(coverageRequestEvents).values({
    coverageRequestId: request.id,
    fromStatus: request.status,
    toStatus: input.to,
    actorUserId: move.actorUserId,
    reason: input.reason ?? null,
  });
  await audit(tx, {
    actorUserId: move.actorUserId,
    organizationId: move.organizationId,
    action: `coverage_request.${input.to}`,
    entityType: 'coverage_request',
    entityId: request.id,
    after: {
      from: request.status,
      to: input.to,
      ...(grant && { grantedAmount: grant.grantedAmount, validUntil: grant.validUntil }),
    },
    ip: move.ip,
  });
  return { id: request.id, status: input.to };
}
