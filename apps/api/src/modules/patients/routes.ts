import {
  createPatientInputSchema,
  patientSearchQuerySchema,
  updatePatientInputSchema,
} from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { patients } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { requirePermission } from '../../plugins/auth.js';
import {
  CIN_TAKEN,
  findDuplicates,
  insertPatient,
  linkPatient,
  requireHealthCenter,
  requireLinkedPatient,
  searchPatients,
  updatePatient,
} from './service.js';

const orgParams = z.object({ orgId: z.string().uuid() });
const patientParams = orgParams.extend({ patientId: z.string().uuid() });

const BASE = '/api/organizations/:orgId/patients';

export function patientRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get(BASE, async (request) => {
    const { orgId } = orgParams.parse(request.params);
    requirePermission(request, orgId, 'patient.read_admin');
    await requireHealthCenter(db, orgId);
    const { q } = patientSearchQuerySchema.parse(request.query);
    return searchPatients(db, orgId, q);
  });

  app.post(BASE, async (request, reply) => {
    const { orgId } = orgParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'patient.create');
    await requireHealthCenter(db, orgId);
    const input = createPatientInputSchema.parse(request.body);

    const { duplicates, sameNationalId } = await findDuplicates(db, input);
    if (duplicates.length > 0) {
      const message = sameNationalId ? CIN_TAKEN : 'Ce patient semble déjà enregistré';
      throw new HttpError(409, message, { duplicates, sameNationalId });
    }

    const patient = await db.transaction(async (tx) => {
      const created = await insertPatient(tx, orgId, input);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'patient.create',
        entityType: 'patient',
        entityId: created.id,
        after: created,
        ip: request.ip,
      });
      return created;
    });
    return reply.status(201).send(patient);
  });

  /** Gives this center access to a patient registered elsewhere (after a duplicate warning). */
  app.post(`${BASE}/:patientId/link`, async (request, reply) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'patient.create');
    await requireHealthCenter(db, orgId);
    const patient = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
    if (!patient) throw notFound('Patient');

    await db.transaction(async (tx) => {
      if (!(await linkPatient(tx, orgId, patientId))) return;
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'patient.link',
        entityType: 'patient',
        entityId: patientId,
        ip: request.ip,
      });
    });
    return reply.status(204).send();
  });

  app.get(`${BASE}/:patientId`, async (request) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    requirePermission(request, orgId, 'patient.read_admin');
    return requireLinkedPatient(db, orgId, patientId);
  });

  app.patch(`${BASE}/:patientId`, async (request) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'patient.update');
    const input = updatePatientInputSchema.parse(request.body);

    return db.transaction(async (tx) => {
      const before = await requireLinkedPatient(tx, orgId, patientId);
      const after = await updatePatient(tx, patientId, input);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'patient.update',
        entityType: 'patient',
        entityId: patientId,
        before,
        after,
        ip: request.ip,
      });
      return after;
    });
  });
}
