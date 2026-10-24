import type { Role } from '@medical-ins/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs, consultations, memberships, organizations } from '../src/db/schema.js';
import {
  TEST_DATABASE_URL,
  createUser,
  login,
  memberCookie,
  resetDb,
  setupTestApp,
} from './helpers.js';

type Consultation = {
  id: string;
  doctorId: string;
  signedAt: string | null;
  diagnoses: { code: string; label: string; primary: boolean }[];
  addenda: { content: string; author: { fullName: string } }[];
};

describe.skipIf(!TEST_DATABASE_URL)('consultations', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let center: string;
  let otherCenter: string;
  let reception: string;
  let doctor: string;
  let patientId: string;

  const as = (role: Role, organizationId: string) =>
    memberCookie(ctx.app, ctx.db, role, organizationId);

  /** A second account with the same role in the same center (memberCookie names one per role). */
  async function colleague(role: Role, organizationId: string) {
    const email = `second.${role}@example.mg`;
    const user = await createUser(ctx.db, { email, password: 'pass-12345' });
    await ctx.db.insert(memberships).values({ userId: user.id, organizationId, role });
    return (await login(ctx.app, email, 'pass-12345')).cookie;
  }

  const inject = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    cookie: string,
    payload?: object,
  ) => ctx.app.inject({ method, url, headers: { cookie }, payload });

  const base = (organizationId = center) => `/api/organizations/${organizationId}/consultations`;

  const start = (cookie = doctor, payload: object = {}) =>
    inject('POST', base(), cookie, { patientId, reason: 'Fièvre depuis 3 jours', ...payload });

  async function draft(cookie = doctor) {
    return (await start(cookie)).json<Consultation>();
  }

  async function signed() {
    const consultation = await draft();
    await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
      diagnoses: [{ code: 'B54', primary: true }],
    });
    await inject('POST', `${base()}/${consultation.id}/sign`, doctor);
    return consultation;
  }

  const actions = async (action: string) =>
    ctx.db.select().from(auditLogs).where(eq(auditLogs.action, action));

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
    doctor = await as('doctor', center);
    const created = await inject('POST', `/api/organizations/${center}/patients`, reception, {
      lastName: 'Rakoto',
      firstNames: 'Jean',
      birthDate: '1985-03-12',
      sex: 'male',
    });
    patientId = created.json<{ id: string }>().id;
  });

  it('lets a doctor open a draft consultation for a patient of the center, audited', async () => {
    const response = await start();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      reason: 'Fièvre depuis 3 jours',
      signedAt: null,
      diagnoses: [],
      vitals: {},
      organization: { name: 'CSB A' },
    });
    expect(await actions('consultation.create')).toHaveLength(1);
  });

  it('keeps writing to medical_record.write and patients linked to the center', async () => {
    expect((await start(await as('nurse', center))).statusCode).toBe(403);
    expect((await start(reception)).statusCode).toBe(403);
    const doctorB = await as('doctor', otherCenter);
    const elsewhere = await inject('POST', base(otherCenter), doctorB, {
      patientId,
      reason: 'Toux',
    });
    expect(elsewhere.statusCode).toBe(404);
  });

  it('edits a draft: vitals, notes and diagnoses with their ICD-10 labels', async () => {
    const consultation = await draft();
    const response = await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
      examination: 'Fébrile, pas de raideur de nuque',
      vitals: { temperatureC: 39.2, heartRate: 104 },
      diagnoses: [
        { code: 'B54', primary: true },
        { code: 'r50.9', primary: false },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      vitals: { temperatureC: 39.2, heartRate: 104 },
      diagnoses: [
        { code: 'B54', label: 'Paludisme, sans précision', primary: true },
        { code: 'R50.9', primary: false },
      ],
    });

    const replaced = await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
      diagnoses: [{ code: 'J06.9', primary: true }],
    });
    expect(replaced.json<Consultation>().diagnoses.map((d) => d.code)).toEqual(['J06.9']);
    expect(await actions('consultation.update')).toHaveLength(2);
  });

  it('rejects a diagnosis code missing from the ICD-10 reference', async () => {
    const consultation = await draft();
    const response = await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
      diagnoses: [{ code: 'Z99.99', primary: true }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Code CIM-10 inconnu : Z99.99' });
  });

  it('keeps a draft to its author', async () => {
    const consultation = await draft();
    const other = await colleague('doctor', center);
    expect((await inject('GET', `${base()}/${consultation.id}`, other)).statusCode).toBe(404);
    const edit = await inject('PATCH', `${base()}/${consultation.id}`, other, { notes: 'x' });
    expect(edit.statusCode).toBe(404);
    expect((await inject('POST', `${base()}/${consultation.id}/sign`, other)).statusCode).toBe(404);
  });

  it('signs only with a primary diagnosis, then the consultation is read-only', async () => {
    const consultation = await draft();
    const early = await inject('POST', `${base()}/${consultation.id}/sign`, doctor);
    expect(early.statusCode).toBe(400);

    await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
      diagnoses: [{ code: 'B54', primary: true }],
    });
    const sign = await inject('POST', `${base()}/${consultation.id}/sign`, doctor);
    expect(sign.statusCode).toBe(200);
    expect(sign.json<Consultation>().signedAt).not.toBeNull();
    expect(await actions('consultation.sign')).toHaveLength(1);

    const edit = await inject('PATCH', `${base()}/${consultation.id}`, doctor, { notes: 'x' });
    expect(edit.statusCode).toBe(409);
    expect((await inject('POST', `${base()}/${consultation.id}/sign`, doctor)).statusCode).toBe(
      409,
    );
  });

  it('enforces read-only signed consultations in the database too', async () => {
    const consultation = await signed();
    await expect(
      ctx.db
        .update(consultations)
        .set({ notes: 'changed' })
        .where(eq(consultations.id, consultation.id)),
    ).rejects.toThrow();
    await expect(
      ctx.db.execute(sql`DELETE FROM diagnoses WHERE consultation_id = ${consultation.id}`),
    ).rejects.toThrow();
  });

  it('shows signed consultations to care roles of every linked center, auditing each read', async () => {
    const consultation = await signed();
    const nurse = await as('nurse', center);
    const read = await inject('GET', `${base()}/${consultation.id}`, nurse);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ diagnoses: [{ code: 'B54' }] });
    const reads = await actions('medical_record.read');
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ entityType: 'consultation', entityId: consultation.id });

    const doctorB = await as('doctor', otherCenter);
    expect(
      (await inject('GET', `${base(otherCenter)}/${consultation.id}`, doctorB)).statusCode,
    ).toBe(404);
    const receptionB = await as('reception', otherCenter);
    await inject(
      'POST',
      `/api/organizations/${otherCenter}/patients/${patientId}/link`,
      receptionB,
    );
    expect(
      (await inject('GET', `${base(otherCenter)}/${consultation.id}`, doctorB)).statusCode,
    ).toBe(200);

    expect((await inject('GET', `${base()}/${consultation.id}`, reception)).statusCode).toBe(403);
  });

  it("lists the patient's signed consultations and the reader's own drafts, audited", async () => {
    const done = await signed();
    const mine = await draft();
    const theirs = await draft(await colleague('doctor', center));
    const url = `/api/organizations/${center}/patients/${patientId}/consultations`;

    const list = await inject('GET', url, doctor);
    expect(list.statusCode).toBe(200);
    const ids = list.json<{ id: string }[]>().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([done.id, mine.id]));
    expect(ids).not.toContain(theirs.id);
    expect(
      list.json<{ id: string; primaryDiagnosis: unknown }[]>().find((c) => c.id === done.id),
    ).toMatchObject({ primaryDiagnosis: { code: 'B54' } });
    // The audit records which consultations were shown, by id only.
    expect(await actions('medical_record.read')).toMatchObject([
      { entityType: 'patient', entityId: patientId, after: { consultationIds: ids } },
    ]);
    expect((await inject('GET', url, reception)).statusCode).toBe(403);
  });

  it('adds addenda to a signed consultation only, and never changes them', async () => {
    const open = await draft();
    const early = await inject('POST', `${base()}/${open.id}/addenda`, doctor, { content: 'x' });
    expect(early.statusCode).toBe(409);

    const consultation = await signed();
    const added = await inject('POST', `${base()}/${consultation.id}/addenda`, doctor, {
      content: 'Goutte épaisse positive',
    });
    expect(added.statusCode).toBe(201);
    const read = await inject('GET', `${base()}/${consultation.id}`, doctor);
    expect(read.json<Consultation>().addenda).toMatchObject([
      { content: 'Goutte épaisse positive' },
    ]);
    expect(await actions('consultation.addendum')).toHaveLength(1);
    await expect(
      ctx.db.execute(sql`UPDATE consultation_addenda SET content = 'y'`),
    ).rejects.toThrow();
  });

  it('keeps medical content out of the append-only audit log', async () => {
    const created = await start(doctor, { reason: 'MARKER-REASON' });
    const { id } = created.json<{ id: string }>();
    await inject('PATCH', `${base()}/${id}`, doctor, {
      reason: 'MARKER-REASON-2',
      examination: 'MARKER-EXAMINATION',
      notes: 'MARKER-NOTES',
      vitals: { temperatureC: 39.2 },
      diagnoses: [{ code: 'B54', primary: true }],
    });
    await inject('POST', `${base()}/${id}/sign`, doctor);
    const added = await inject('POST', `${base()}/${id}/addenda`, doctor, {
      content: 'MARKER-ADDENDUM',
    });
    expect(added.statusCode).toBe(201);

    const rows = await ctx.db.select().from(auditLogs);
    const json = JSON.stringify(rows);
    for (const forbidden of ['MARKER', 'Paludisme', 'temperatureC', '39.2']) {
      expect(json).not.toContain(forbidden);
    }
    expect(await actions('consultation.update')).toMatchObject([
      {
        before: null,
        after: { fields: ['reason', 'examination', 'vitals', 'notes', 'diagnoses'] },
      },
    ]);
    const [sign] = await actions('consultation.sign');
    expect(sign!.after).toMatchObject({ signedAt: expect.any(String) });
    const [addendum] = await actions('consultation.addendum');
    expect(addendum).toMatchObject({ entityId: id, after: { addendumId: expect.any(String) } });
  });

  describe('from an appointment', () => {
    let appointmentId: string;

    beforeEach(async () => {
      const doctorRow = await ctx.db.query.users.findFirst({
        where: (u, { like }) => like(u.email, `doctor.${center.slice(0, 8)}%`),
      });
      const booked = await inject('POST', `/api/organizations/${center}/appointments`, reception, {
        patientId,
        doctorId: doctorRow!.id,
        startsAt: '2099-11-03T09:00:00+03:00',
        durationMinutes: 20,
      });
      appointmentId = booked.json<{ id: string }>().id;
      await inject(
        'POST',
        `/api/organizations/${center}/appointments/${appointmentId}/status`,
        reception,
        {
          status: 'arrived',
        },
      );
    });

    it('opens one consultation per appointment and completes the visit on signing', async () => {
      const consultation = (await start(doctor, { appointmentId })).json<Consultation>();
      const again = await start(doctor, { appointmentId });
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ consultationId: consultation.id });

      await inject('PATCH', `${base()}/${consultation.id}`, doctor, {
        diagnoses: [{ code: 'B54', primary: true }],
      });
      await inject('POST', `${base()}/${consultation.id}/sign`, doctor);
      const appointment = await ctx.db.query.appointments.findFirst({
        where: (a) => eq(a.id, appointmentId),
      });
      expect(appointment!.status).toBe('completed');
      expect(await actions('appointment.completed')).toHaveLength(1);
    });

    it("refuses another doctor's appointment or another patient", async () => {
      const other = await colleague('doctor', center);
      expect((await start(other, { appointmentId })).statusCode).toBe(400);
      const someoneElse = await inject('POST', `/api/organizations/${center}/patients`, reception, {
        lastName: 'Rabe',
        firstNames: 'Marie',
        birthDate: '1990-01-01',
        sex: 'female',
      });
      const mismatch = await start(doctor, {
        appointmentId,
        patientId: someoneElse.json<{ id: string }>().id,
      });
      expect(mismatch.statusCode).toBe(400);
    });
  });

  it('searches the ICD-10 reference by code or label for signed-in users', async () => {
    const byLabel = await inject('GET', '/api/referentials/icd10?q=palud', doctor);
    expect(byLabel.statusCode).toBe(200);
    expect(byLabel.json()).toContainEqual({ code: 'B54', label: 'Paludisme, sans précision' });
    const byCode = await inject('GET', '/api/referentials/icd10?q=j06', doctor);
    expect(byCode.json<{ code: string }[]>().map((c) => c.code)).toContain('J06.9');
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/referentials/icd10?q=a' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('never lets an insurer reach medical content', async () => {
    const consultation = await signed();
    const [insurer] = await ctx.db
      .insert(organizations)
      .values({ type: 'insurer', name: 'OSTIE' })
      .returning();
    const advisor = await as('medical_advisor', insurer!.id);
    expect((await inject('GET', `${base()}/${consultation.id}`, advisor)).statusCode).toBe(403);
    expect(
      (await inject('GET', `${base(insurer!.id)}/${consultation.id}`, advisor)).statusCode,
    ).toBe(403);
    const rows = await ctx.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'medical_record.read')));
    expect(rows).toHaveLength(0);
  });
});
