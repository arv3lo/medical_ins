import {
  appointmentQuerySchema,
  canChangeAppointmentStatus,
  changeAppointmentStatusInputSchema,
  createAppointmentInputSchema,
  isStatusChangeDue,
  rescheduleAppointmentInputSchema,
} from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appointments } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { requirePermission } from '../../plugins/auth.js';
import { requireHealthCenter, requireLinkedPatient } from '../patients/service.js';
import {
  endOf,
  findAppointment,
  listAppointments,
  listDoctors,
  lockAppointment,
  requireDoctorOf,
  requireFuture,
  setStatus,
  withoutOverlap,
} from './service.js';

const orgParams = z.object({ orgId: z.string().uuid() });
const appointmentParams = orgParams.extend({ appointmentId: z.string().uuid() });

const BASE = '/api/organizations/:orgId/appointments';

export function appointmentRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get('/api/organizations/:orgId/doctors', async (request) => {
    const { orgId } = orgParams.parse(request.params);
    requirePermission(request, orgId, 'appointment.read');
    return listDoctors(db, orgId);
  });

  app.get(BASE, async (request) => {
    const { orgId } = orgParams.parse(request.params);
    requirePermission(request, orgId, 'appointment.read');
    return listAppointments(db, orgId, appointmentQuerySchema.parse(request.query));
  });

  app.post(BASE, async (request, reply) => {
    const { orgId } = orgParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'appointment.manage');
    const input = createAppointmentInputSchema.parse(request.body);
    await requireHealthCenter(db, orgId);
    await requireLinkedPatient(db, orgId, input.patientId);
    await requireDoctorOf(db, orgId, input.doctorId);
    const startsAt = new Date(input.startsAt);
    requireFuture(startsAt);

    const id = await withoutOverlap(() =>
      db.transaction(async (tx) => {
        const [created] = await tx
          .insert(appointments)
          .values({
            ...input,
            organizationId: orgId,
            startsAt,
            endsAt: endOf(startsAt, input.durationMinutes),
          })
          .returning();
        await audit(tx, {
          actorUserId: actor.id,
          organizationId: orgId,
          action: 'appointment.create',
          entityType: 'appointment',
          entityId: created!.id,
          after: created,
          ip: request.ip,
        });
        return created!.id;
      }),
    );
    return reply.status(201).send(await findAppointment(db, orgId, id));
  });

  app.patch(`${BASE}/:appointmentId`, async (request) => {
    const { orgId, appointmentId } = appointmentParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'appointment.manage');
    const input = rescheduleAppointmentInputSchema.parse(request.body);

    await withoutOverlap(() =>
      db.transaction(async (tx) => {
        const before = await lockAppointment(tx, orgId, appointmentId);
        if (before.status !== 'scheduled') {
          throw new HttpError(409, 'Seul un rendez-vous prévu peut être déplacé');
        }
        requireFuture(before.startsAt);
        const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
        requireFuture(startsAt);
        if (input.doctorId) await requireDoctorOf(tx, orgId, input.doctorId);

        const durationMinutes = input.durationMinutes ?? before.durationMinutes;
        const [after] = await tx
          .update(appointments)
          .set({ ...input, startsAt, durationMinutes, endsAt: endOf(startsAt, durationMinutes) })
          .where(eq(appointments.id, appointmentId))
          .returning();
        await audit(tx, {
          actorUserId: actor.id,
          organizationId: orgId,
          action: 'appointment.reschedule',
          entityType: 'appointment',
          entityId: appointmentId,
          before,
          after,
          ip: request.ip,
        });
      }),
    );
    return findAppointment(db, orgId, appointmentId);
  });

  app.post(`${BASE}/:appointmentId/status`, async (request) => {
    const { orgId, appointmentId } = appointmentParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'appointment.manage');
    const { status } = changeAppointmentStatusInputSchema.parse(request.body);

    await db.transaction(async (tx) => {
      const before = await lockAppointment(tx, orgId, appointmentId);
      if (!canChangeAppointmentStatus(before.status, status)) {
        throw new HttpError(409, 'Ce changement de statut n’est pas possible');
      }
      if (!isStatusChangeDue(status, before.startsAt, new Date())) {
        throw new HttpError(
          409,
          'Ce statut ne peut pas encore être enregistré pour ce rendez-vous',
        );
      }
      await setStatus(tx, appointmentId, status);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: `appointment.${status}`,
        entityType: 'appointment',
        entityId: appointmentId,
        before: { status: before.status },
        after: { status },
        ip: request.ip,
      });
    });
    return findAppointment(db, orgId, appointmentId);
  });
}
