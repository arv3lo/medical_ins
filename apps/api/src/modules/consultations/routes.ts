import {
  type Addendum,
  addendumInputSchema,
  createConsultationInputSchema,
  icd10QuerySchema,
  signingProblem,
  updateConsultationInputSchema,
} from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { consultationAddenda, consultations } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { requirePermission, requireUser } from '../../plugins/auth.js';
import { findAppointment, setStatus } from '../appointments/service.js';
import { requireHealthCenter, requireLinkedPatient } from '../patients/service.js';
import {
  findConsultation,
  listPatientConsultations,
  markSigned,
  requireOwnDraft,
  searchIcd10,
  updateDraft,
} from './service.js';

const orgParams = z.object({ orgId: z.string().uuid() });
const patientParams = orgParams.extend({ patientId: z.string().uuid() });
const consultationParams = orgParams.extend({ consultationId: z.string().uuid() });

const BASE = '/api/organizations/:orgId/consultations';
const ONE_PER_APPOINTMENT = 'consultations_appointment_id_unique';

/** The client opens the existing consultation instead, when it knows which one. */
const alreadyConsulted = (consultationId?: string) =>
  new HttpError(409, 'Une consultation existe déjà pour ce rendez-vous', { consultationId });

// Audit entries hold ids and metadata only: audit_logs can never be purged, and it is not
// restricted to care roles, so no medical content (reason, notes, vitals, diagnoses…) goes there.
// Writes answer with ids only, too: the client reads the record back through the GET, which
// audits that read as medical_record.read.
export function consultationRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get('/api/referentials/icd10', async (request) => {
    requireUser(request);
    return searchIcd10(db, icd10QuerySchema.parse(request.query).q);
  });

  // Every read of medical content is audited in the same transaction as the read itself.
  app.get('/api/organizations/:orgId/patients/:patientId/consultations', async (request) => {
    const { orgId, patientId } = patientParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.read');
    return db.transaction(async (tx) => {
      await requireLinkedPatient(tx, orgId, patientId);
      const list = await listPatientConsultations(tx, patientId, actor.id);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'medical_record.read',
        entityType: 'patient',
        entityId: patientId,
        after: { consultationIds: list.map((c) => c.id) },
        ip: request.ip,
      });
      return list;
    });
  });

  app.get(`${BASE}/:consultationId`, async (request) => {
    const { orgId, consultationId } = consultationParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.read');
    return db.transaction(async (tx) => {
      const consultation = await findConsultation(tx, consultationId, actor.id);
      // Any center linked to the patient shares the record; others do not know it exists.
      await requireLinkedPatient(tx, orgId, consultation.patientId).catch(() => {
        throw notFound('Consultation');
      });
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'medical_record.read',
        entityType: 'consultation',
        entityId: consultationId,
        ip: request.ip,
      });
      return consultation;
    });
  });

  app.post(BASE, async (request, reply) => {
    const { orgId } = orgParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.write');
    const input = createConsultationInputSchema.parse(request.body);
    await requireHealthCenter(db, orgId);
    await requireLinkedPatient(db, orgId, input.patientId);
    if (input.appointmentId) {
      const appointment = await findAppointment(db, orgId, input.appointmentId);
      if (appointment.patientId !== input.patientId || appointment.doctorId !== actor.id) {
        throw new HttpError(400, "Ce rendez-vous n'est pas le vôtre avec ce patient");
      }
      if (appointment.status !== 'scheduled' && appointment.status !== 'arrived') {
        throw new HttpError(409, 'Ce rendez-vous est clos');
      }
      const existing = await db.query.consultations.findFirst({
        where: eq(consultations.appointmentId, input.appointmentId),
      });
      if (existing) throw alreadyConsulted(existing.id);
    }

    try {
      const id = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(consultations)
          .values({ ...input, organizationId: orgId, doctorId: actor.id })
          .returning();
        await audit(tx, {
          actorUserId: actor.id,
          organizationId: orgId,
          action: 'consultation.create',
          entityType: 'consultation',
          entityId: created!.id,
          after: { patientId: created!.patientId, appointmentId: created!.appointmentId },
          ip: request.ip,
        });
        return created!.id;
      });
      return reply.status(201).send({ id });
    } catch (error) {
      const cause = (error as { cause?: { constraint_name?: string } }).cause;
      if (cause?.constraint_name === ONE_PER_APPOINTMENT) throw alreadyConsulted();
      throw error;
    }
  });

  app.patch(`${BASE}/:consultationId`, async (request) => {
    const { orgId, consultationId } = consultationParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.write');
    const input = updateConsultationInputSchema.parse(request.body);
    return db.transaction(async (tx) => {
      await requireOwnDraft(tx, orgId, consultationId, actor.id);
      await updateDraft(tx, consultationId, input);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'consultation.update',
        entityType: 'consultation',
        entityId: consultationId,
        after: { fields: Object.keys(input) },
        ip: request.ip,
      });
      return { id: consultationId };
    });
  });

  app.post(`${BASE}/:consultationId/sign`, async (request) => {
    const { orgId, consultationId } = consultationParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.write');
    return db.transaction(async (tx) => {
      const draft = await requireOwnDraft(tx, orgId, consultationId, actor.id);
      const problem = signingProblem(draft);
      if (problem) throw new HttpError(400, problem);
      const signedAt = await markSigned(tx, consultationId);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'consultation.sign',
        entityType: 'consultation',
        entityId: consultationId,
        after: { signedAt },
        ip: request.ip,
      });
      // Signing the consultation ends the visit it came from.
      if (draft.appointmentId) {
        const appointment = await findAppointment(tx, orgId, draft.appointmentId);
        if (appointment.status === 'arrived') {
          await setStatus(tx, appointment.id, 'completed');
          await audit(tx, {
            actorUserId: actor.id,
            organizationId: orgId,
            action: 'appointment.completed',
            entityType: 'appointment',
            entityId: appointment.id,
            before: { status: 'arrived' },
            after: { status: 'completed' },
            ip: request.ip,
          });
        }
      }
      return { id: consultationId, signedAt: signedAt.toISOString() };
    });
  });

  app.post(`${BASE}/:consultationId/addenda`, async (request, reply) => {
    const { orgId, consultationId } = consultationParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'medical_record.write');
    const { content } = addendumInputSchema.parse(request.body);
    const addendum = await db.transaction(async (tx) => {
      const target = await findConsultation(tx, consultationId, actor.id);
      if (target.organizationId !== orgId) throw notFound('Consultation');
      if (!target.signedAt) throw new HttpError(409, 'Modifiez le brouillon directement');
      const [added] = await tx
        .insert(consultationAddenda)
        .values({ consultationId, authorId: actor.id, content })
        .returning();
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'consultation.addendum',
        entityType: 'consultation',
        entityId: consultationId,
        after: { addendumId: added!.id },
        ip: request.ip,
      });
      return added!;
    });
    return reply.status(201).send({
      id: addendum.id,
      content: addendum.content,
      createdAt: addendum.createdAt.toISOString(),
      author: { fullName: actor.fullName },
    } satisfies Addendum);
  });
}
