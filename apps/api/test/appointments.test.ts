import type { Role } from '@medical-ins/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appointments, auditLogs, organizations, users } from '../src/db/schema.js';
import { TEST_DATABASE_URL, memberCookie, resetDb, setupTestApp } from './helpers.js';

/** Far enough ahead that "in the past" never applies by accident. */
const at = (time: string) => `2099-11-03T${time}:00+03:00`;

describe.skipIf(!TEST_DATABASE_URL)('appointments', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let center: string;
  let otherCenter: string;
  let reception: string;
  let doctorId: string;
  let otherDoctorId: string;
  let patientId: string;

  const as = (role: Role, organizationId: string) =>
    memberCookie(ctx.app, ctx.db, role, organizationId);

  async function userIdOf(cookieEmailPrefix: string) {
    const user = await ctx.db.query.users.findFirst({
      where: (u, { like }) => like(u.email, `${cookieEmailPrefix}%`),
    });
    return user!.id;
  }

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.db);
    const rows = await ctx.db
      .insert(organizations)
      .values([
        { type: 'health_center', name: 'CSB A' },
        { type: 'health_center', name: 'CSB B' },
      ])
      .returning();
    [center, otherCenter] = rows.map((o) => o.id) as [string, string];
    reception = await as('reception', center);
    await as('doctor', center);
    doctorId = await userIdOf(`doctor.${center.slice(0, 8)}`);
    await as('doctor', otherCenter);
    otherDoctorId = await userIdOf(`doctor.${otherCenter.slice(0, 8)}`);
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${center}/patients`,
      headers: { cookie: reception },
      payload: { lastName: 'Rakoto', firstNames: 'Jean', birthDate: '1985-03-12', sex: 'male' },
    });
    patientId = created.json<{ id: string }>().id;
  });

  const base = () => `/api/organizations/${center}/appointments`;

  const book = (payload: Record<string, unknown> = {}, cookie = reception) =>
    ctx.app.inject({
      method: 'POST',
      url: base(),
      headers: { cookie },
      payload: {
        patientId,
        doctorId,
        startsAt: at('09:00'),
        durationMinutes: 20,
        reason: 'Fièvre',
        ...payload,
      },
    });

  const inject = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    cookie: string,
    payload?: object,
  ) => ctx.app.inject({ method, url, headers: { cookie }, payload });

  /** Writes an appointment straight to the table, for times the API refuses to book (the past). */
  async function insertAppointment(startsAt: Date) {
    const [row] = await ctx.db
      .insert(appointments)
      .values({
        organizationId: center,
        patientId,
        doctorId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 20 * 60_000),
        durationMinutes: 20,
      })
      .returning();
    return row!.id;
  }

  /**
   * Sets the appointment's status in a transaction that stays open until `request` is blocked
   * on that row, then commits: the request runs exactly "at the same moment" as the change.
   */
  async function racing<T>(id: string, status: 'cancelled' | 'arrived', request: () => Promise<T>) {
    let pending!: Promise<T>;
    await ctx.db.transaction(async (tx) => {
      await tx.update(appointments).set({ status }).where(eq(appointments.id, id));
      pending = request();
      await untilSomeoneWaitsForALock();
    });
    return pending;
  }

  async function untilSomeoneWaitsForALock() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await ctx.db.execute<{ waiting: number }>(
        sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (row!.waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('the request never waited for the row lock');
  }

  const auditOf = (action: string) =>
    ctx.db.select().from(auditLogs).where(eq(auditLogs.action, action));

  it('lets reception book an appointment with a doctor of the center, audited', async () => {
    const response = await book();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: 'scheduled',
      startsAt: '2099-11-03T06:00:00.000Z',
      endsAt: '2099-11-03T06:20:00.000Z',
      patient: { lastName: 'Rakoto' },
    });
    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'appointment.create'));
    expect(entries).toHaveLength(1);
  });

  it('refuses booking to care roles, a doctor from another center, or an unlinked patient', async () => {
    expect((await book({}, await as('nurse', center))).statusCode).toBe(403);
    expect((await book({ doctorId: otherDoctorId })).statusCode).toBe(400);
    const receptionB = await as('reception', otherCenter);
    const elsewhere = await inject(
      'POST',
      `/api/organizations/${otherCenter}/appointments`,
      receptionB,
      {
        patientId,
        doctorId: otherDoctorId,
        startsAt: at('09:00'),
        durationMinutes: 20,
      },
    );
    expect(elsewhere.statusCode).toBe(404);
  });

  it('refuses a slot in the past', async () => {
    expect((await book({ startsAt: '2020-01-01T09:00:00+03:00' })).statusCode).toBe(400);
  });

  it('never double-books a doctor, but frees the slot once cancelled', async () => {
    const first = (await book()).json<{ id: string }>();
    const overlap = await book({ startsAt: at('09:10') });
    expect(overlap.statusCode).toBe(409);
    // Back to back is fine.
    expect((await book({ startsAt: at('09:20') })).statusCode).toBe(201);

    await inject('POST', `${base()}/${first.id}/status`, reception, { status: 'cancelled' });
    expect((await book({ startsAt: at('09:10'), durationMinutes: 10 })).statusCode).toBe(201);
  });

  it('lists a day of the agenda, filtered by doctor, for care roles', async () => {
    await book();
    await book({ startsAt: at('10:00') });
    await book({ startsAt: '2099-11-04T09:00:00+03:00' });
    const doctor = await inject(
      'GET',
      `${base()}?from=${encodeURIComponent(at('00:00'))}&to=${encodeURIComponent('2099-11-04T00:00:00+03:00')}&doctorId=${doctorId}`,
      await as('nurse', center),
    );
    expect(doctor.statusCode).toBe(200);
    expect(doctor.json<{ startsAt: string }[]>().map((a) => a.startsAt)).toEqual([
      '2099-11-03T06:00:00.000Z',
      '2099-11-03T07:00:00.000Z',
    ]);
    expect((await inject('GET', base(), await as('billing', center))).statusCode).toBe(403);
  });

  it('lists the appointments of one patient', async () => {
    await book();
    const list = await inject('GET', `${base()}?patientId=${patientId}`, reception);
    expect(list.json()).toHaveLength(1);
  });

  const statusOf = (id: string) => (value: string) =>
    inject('POST', `${base()}/${id}/status`, reception, { status: value });

  it('follows the status rules', async () => {
    const status = statusOf(await insertAppointment(new Date(Date.now() - 30 * 60_000)));

    expect((await status('completed')).statusCode).toBe(409);
    expect((await status('arrived')).json()).toMatchObject({ status: 'arrived' });
    expect((await status('cancelled')).statusCode).toBe(409);
    expect((await status('completed')).json()).toMatchObject({ status: 'completed' });
  });

  it('records an arrival from one hour before the start, a no-show only after it', async () => {
    const later = statusOf((await book()).json<{ id: string }>().id);
    expect((await later('arrived')).statusCode).toBe(409);
    expect((await later('no_show')).statusCode).toBe(409);

    const soon = statusOf(await insertAppointment(new Date(Date.now() + 30 * 60_000)));
    expect((await soon('no_show')).statusCode).toBe(409);
    expect((await soon('arrived')).json()).toMatchObject({ status: 'arrived' });
    expect((await soon('completed')).statusCode).toBe(409);
  });

  it('reschedules a future appointment, still without overlap', async () => {
    const first = (await book()).json<{ id: string }>();
    await book({ startsAt: at('10:00') });

    const moved = await inject('PATCH', `${base()}/${first.id}`, reception, {
      startsAt: at('11:00'),
      durationMinutes: 30,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ endsAt: '2099-11-03T08:30:00.000Z' });

    const clash = await inject('PATCH', `${base()}/${first.id}`, reception, {
      startsAt: at('10:05'),
    });
    expect(clash.statusCode).toBe(409);
  });

  it('does not move an appointment that is no longer scheduled', async () => {
    const appointment = (await book()).json<{ id: string }>();
    await inject('POST', `${base()}/${appointment.id}/status`, reception, { status: 'cancelled' });
    const moved = await inject('PATCH', `${base()}/${appointment.id}`, reception, {
      startsAt: at('11:00'),
    });
    expect(moved.statusCode).toBe(409);
  });

  it('lists the doctors of the center for the booking form', async () => {
    const doctors = await inject('GET', `/api/organizations/${center}/doctors`, reception);
    const [doctor] = await ctx.db.select().from(users).where(eq(users.id, doctorId));
    expect(doctors.json()).toEqual([{ id: doctorId, fullName: doctor!.fullName }]);
  });

  it('never moves a past appointment', async () => {
    const id = await insertAppointment(new Date(Date.now() - 3_600_000));
    const moved = await inject('PATCH', `${base()}/${id}`, reception, { startsAt: at('11:00') });
    expect(moved.statusCode).toBe(400);
  });

  it('refuses to reschedule to a doctor of another center, or to a member who is not a doctor', async () => {
    const appointment = (await book()).json<{ id: string }>();
    await as('nurse', center);
    const nurseId = await userIdOf(`nurse.${center.slice(0, 8)}`);
    for (const id of [otherDoctorId, nurseId]) {
      const moved = await inject('PATCH', `${base()}/${appointment.id}`, reception, {
        doctorId: id,
      });
      expect(moved.statusCode).toBe(400);
    }
    expect((await book({ doctorId: nurseId })).statusCode).toBe(400);
  });

  it("hides one center's appointments from another center", async () => {
    const appointment = (await book()).json<{ id: string }>();
    const receptionB = await as('reception', otherCenter);
    const elsewhere = `/api/organizations/${otherCenter}/appointments/${appointment.id}`;
    expect(
      (await inject('PATCH', elsewhere, receptionB, { startsAt: at('11:00') })).statusCode,
    ).toBe(404);
    expect(
      (await inject('POST', `${elsewhere}/status`, receptionB, { status: 'cancelled' })).statusCode,
    ).toBe(404);
    const listed = await inject(
      'GET',
      `/api/organizations/${otherCenter}/appointments?patientId=${patientId}`,
      receptionB,
    );
    expect(listed.json()).toEqual([]);
  });

  it('audits reschedules and status changes', async () => {
    const appointment = (await book()).json<{ id: string }>();
    await inject('PATCH', `${base()}/${appointment.id}`, reception, { startsAt: at('11:00') });
    await inject('POST', `${base()}/${appointment.id}/status`, reception, { status: 'cancelled' });

    const [moved] = await auditOf('appointment.reschedule');
    expect(moved).toMatchObject({
      entityId: appointment.id,
      before: { startsAt: '2099-11-03T06:00:00.000Z' },
      after: { startsAt: '2099-11-03T08:00:00.000Z' },
    });
    const [cancelled] = await auditOf('appointment.cancelled');
    expect(cancelled).toMatchObject({
      entityId: appointment.id,
      before: { status: 'scheduled' },
      after: { status: 'cancelled' },
    });
  });

  it('does not move an appointment cancelled while the reschedule runs', async () => {
    const appointment = (await book()).json<{ id: string }>();
    const moved = await racing(appointment.id, 'cancelled', () =>
      inject('PATCH', `${base()}/${appointment.id}`, reception, { startsAt: at('11:00') }),
    );
    expect(moved.statusCode).toBe(409);
    const [row] = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id));
    expect(row).toMatchObject({ status: 'cancelled', startsAt: new Date(at('09:00')) });
  });

  it('does not cancel an appointment marked as arrived at the same moment', async () => {
    const appointment = (await book()).json<{ id: string }>();
    const cancelled = await racing(appointment.id, 'arrived', () =>
      inject('POST', `${base()}/${appointment.id}/status`, reception, { status: 'cancelled' }),
    );
    expect(cancelled.statusCode).toBe(409);
    const [row] = await ctx.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id));
    expect(row!.status).toBe('arrived');
  });

  it('refuses to book or reschedule to a deactivated doctor', async () => {
    const appointment = (await book()).json<{ id: string }>();
    await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, doctorId));
    expect((await book({ startsAt: at('10:00') })).statusCode).toBe(400);
    const moved = await inject('PATCH', `${base()}/${appointment.id}`, reception, { doctorId });
    expect(moved.statusCode).toBe(400);
  });
});
