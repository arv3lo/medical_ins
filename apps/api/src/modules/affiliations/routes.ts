import {
  AFFILIATION_STATUSES,
  createAffiliationInputSchema,
  rejectAffiliationInputSchema,
} from '@medical-ins/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { requirePermission } from '../../plugins/auth.js';
import { requireLinkedPatient } from '../patients/service.js';
import {
  decideAffiliation,
  insertAffiliation,
  listInsurerAffiliations,
  listPatientAffiliations,
  requireInsurer,
} from './service.js';

const patientParams = z.object({ orgId: z.string().uuid(), patientId: z.string().uuid() });
const insurerParams = z.object({ orgId: z.string().uuid() });
const affiliationParams = insurerParams.extend({ affiliationId: z.string().uuid() });
const insurerQuery = z.object({ status: z.enum(AFFILIATION_STATUSES).optional() });

const PATIENT_AFFILIATIONS = '/api/organizations/:orgId/patients/:patientId/affiliations';
const INSURER_AFFILIATIONS = '/api/organizations/:orgId/affiliations';

export function affiliationRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get(PATIENT_AFFILIATIONS, async (request) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    requirePermission(request, orgId, 'patient.read_admin');
    await requireLinkedPatient(db, orgId, patientId);
    return listPatientAffiliations(db, patientId);
  });

  app.post(PATIENT_AFFILIATIONS, async (request, reply) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'patient.update');
    const input = createAffiliationInputSchema.parse(request.body);
    await requireLinkedPatient(db, orgId, patientId);
    await requireInsurer(db, input.insurerId);

    const created = await db.transaction(async (tx) => {
      const affiliation = await insertAffiliation(tx, {
        ...input,
        patientId,
        declaredByOrganizationId: orgId,
      });
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'affiliation.create',
        entityType: 'affiliation',
        entityId: affiliation.id,
        after: affiliation,
        ip: request.ip,
      });
      return affiliation;
    });
    const [withName] = (await listPatientAffiliations(db, patientId)).filter(
      (a) => a.id === created.id,
    );
    return reply.status(201).send(withName);
  });

  app.get(INSURER_AFFILIATIONS, async (request) => {
    const { orgId } = insurerParams.parse(request.params);
    requirePermission(request, orgId, 'insured.manage');
    await requireInsurer(db, orgId);
    const { status } = insurerQuery.parse(request.query);
    return listInsurerAffiliations(db, orgId, status);
  });

  const decide = (
    request: FastifyRequest,
    decision: { status: 'validated' } | { status: 'rejected'; rejectionReason: string },
  ) => {
    const { orgId, affiliationId } = affiliationParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'insured.manage');
    return db.transaction(async (tx) => {
      const { before, after } = await decideAffiliation(tx, orgId, affiliationId, decision);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: decision.status === 'validated' ? 'affiliation.validate' : 'affiliation.reject',
        entityType: 'affiliation',
        entityId: affiliationId,
        before,
        after,
        ip: request.ip,
      });
      return after;
    });
  };

  app.post(`${INSURER_AFFILIATIONS}/:affiliationId/validate`, (request) =>
    decide(request, { status: 'validated' }),
  );

  app.post(`${INSURER_AFFILIATIONS}/:affiliationId/reject`, (request) => {
    const { reason } = rejectAffiliationInputSchema.parse(request.body ?? {});
    return decide(request, { status: 'rejected', rejectionReason: reason });
  });
}
