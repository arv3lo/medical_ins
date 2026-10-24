import type { AppointmentStatus } from '@medical-ins/shared';
import { and, asc, eq, getTableColumns, gte, lt } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import { appointments, memberships, patients, users } from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';

const withNames = {
  ...getTableColumns(appointments),
  patient: { lastName: patients.lastName, firstNames: patients.firstNames },
  doctor: { fullName: users.fullName },
};

function selectAppointments(db: Db | Tx) {
  return db
    .select(withNames)
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(users, eq(users.id, appointments.doctorId));
}

export function listAppointments(
  db: Db,
  organizationId: string,
  filter: { from?: string; to?: string; doctorId?: string; patientId?: string },
) {
  return selectAppointments(db)
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        filter.from ? gte(appointments.startsAt, new Date(filter.from)) : undefined,
        filter.to ? lt(appointments.startsAt, new Date(filter.to)) : undefined,
        filter.doctorId ? eq(appointments.doctorId, filter.doctorId) : undefined,
        filter.patientId ? eq(appointments.patientId, filter.patientId) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt));
}

export async function findAppointment(db: Db | Tx, organizationId: string, id: string) {
  const [row] = await selectAppointments(db).where(
    and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)),
  );
  if (!row) throw notFound('Rendez-vous');
  return row;
}

export function listDoctors(db: Db, organizationId: string) {
  return db
    .select({ id: users.id, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, 'doctor'),
        eq(users.isActive, true),
      ),
    )
    .orderBy(users.fullName);
}

export async function requireDoctorOf(db: Db, organizationId: string, doctorId: string) {
  const doctor = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.organizationId, organizationId),
      eq(memberships.userId, doctorId),
      eq(memberships.role, 'doctor'),
    ),
  });
  if (!doctor) throw new HttpError(400, "Ce médecin n'exerce pas dans ce centre");
}

export function requireFuture(startsAt: Date) {
  if (startsAt.getTime() < Date.now()) {
    throw new HttpError(400, 'Le rendez-vous ne peut pas être dans le passé');
  }
}

export const endOf = (startsAt: Date, durationMinutes: number) =>
  new Date(startsAt.getTime() + durationMinutes * 60_000);

const OVERLAP = 'appointments_doctor_no_overlap';

/** Runs a write and turns the doctor-overlap exclusion violation into a 409. */
export async function withoutOverlap<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const cause = (error as { cause?: { constraint_name?: string } }).cause ?? error;
    if ((cause as { constraint_name?: string }).constraint_name === OVERLAP) {
      throw new HttpError(409, 'Ce médecin a déjà un rendez-vous sur ce créneau');
    }
    throw error;
  }
}

export async function setStatus(tx: Tx, id: string, status: AppointmentStatus) {
  await tx.update(appointments).set({ status }).where(eq(appointments.id, id));
}
