import type { Role } from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs, organizations, users } from '../src/db/schema.js';
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

  it('follows the status rules', async () => {
    const appointment = (await book()).json<{ id: string }>();
    const status = (value: string) =>
      inject('POST', `${base()}/${appointment.id}/status`, reception, { status: value });

    expect((await status('completed')).statusCode).toBe(409);
    expect((await status('arrived')).json()).toMatchObject({ status: 'arrived' });
    expect((await status('cancelled')).statusCode).toBe(409);
    expect((await status('completed')).json()).toMatchObject({ status: 'completed' });
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
    await inject('POST', `${base()}/${appointment.id}/status`, reception, { status: 'arrived' });
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
});
