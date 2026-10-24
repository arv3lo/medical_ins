import type { Role } from '@medical-ins/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs, memberships, organizations } from '../src/db/schema.js';
import { TEST_DATABASE_URL, createUser, login, resetDb, setupTestApp } from './helpers.js';

const rakoto = {
  lastName: 'Rakoto',
  firstNames: 'Jean',
  birthDate: '1985-03-12',
  sex: 'male',
  nationalId: '101211123456',
  phone: '034 12 345 67',
};

describe.skipIf(!TEST_DATABASE_URL)('patients', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let centerA: string;
  let centerB: string;
  let insurer: string;

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
        { type: 'insurer', name: 'OSTIE' },
      ])
      .returning();
    [centerA, centerB, insurer] = rows.map((o) => o.id) as [string, string, string];
  });

  /** Creates an account with `role` in `organizationId` and returns its Cookie header. */
  async function as(role: Role, organizationId: string) {
    const email = `${role}.${organizationId.slice(0, 8)}@example.mg`;
    const user = await createUser(ctx.db, { email, password: 'pass-12345' });
    await ctx.db.insert(memberships).values({ userId: user.id, organizationId, role });
    return (await login(ctx.app, email, 'pass-12345')).cookie;
  }

  const create = (orgId: string, cookie: string, payload: Record<string, unknown> = rakoto) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/patients`,
      headers: { cookie },
      payload,
    });

  const get = (url: string, cookie: string) =>
    ctx.app.inject({ method: 'GET', url, headers: { cookie } });

  it('lets reception register a patient, audited in the center', async () => {
    const reception = await as('reception', centerA);
    const response = await create(centerA, reception);
    expect(response.statusCode).toBe(201);
    const patient = response.json<{ id: string }>();
    expect(patient).toMatchObject({ lastName: 'Rakoto', nationalId: '101211123456' });

    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'patient.create'), eq(auditLogs.entityId, patient.id)));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.organizationId).toBe(centerA);
  });

  it('refuses patient registration to roles without patient.create', async () => {
    expect((await create(centerA, await as('doctor', centerA))).statusCode).toBe(403);
    expect((await create(centerA, await as('billing', centerA))).statusCode).toBe(403);
    // A reception role in center A gives no right in center B.
    expect((await create(centerB, await as('reception', centerA))).statusCode).toBe(403);
  });

  it('keeps insurers away from patient records', async () => {
    const manager = await as('insurer_manager', insurer);
    expect((await create(insurer, manager)).statusCode).toBe(403);
    expect((await get(`/api/organizations/${insurer}/patients`, manager)).statusCode).toBe(403);
  });

  it('refuses to register patients in an insurer, even for the super admin', async () => {
    await createUser(ctx.db, {
      email: 'admin@example.mg',
      password: 'admin-pass',
      isSuperAdmin: true,
    });
    const admin = (await login(ctx.app, 'admin@example.mg', 'admin-pass')).cookie;
    expect((await create(insurer, admin)).statusCode).toBe(404);
  });

  it('searches the center patients by name, CIN or phone', async () => {
    const reception = await as('reception', centerA);
    await create(centerA, reception);
    await create(centerA, reception, {
      lastName: 'Rasoa',
      firstNames: 'Marie',
      birthDate: '1990-07-01',
      sex: 'female',
    });

    const search = async (q: string) =>
      (await get(`/api/organizations/${centerA}/patients?q=${encodeURIComponent(q)}`, reception))
        .json<{ lastName: string }[]>()
        .map((p) => p.lastName);

    expect(await search('')).toEqual(['Rakoto', 'Rasoa']);
    expect(await search('raso')).toEqual(['Rasoa']);
    expect(await search('101211')).toEqual(['Rakoto']);
    expect(await search('0341234567')).toEqual(['Rakoto']);
  });

  it('only shows a center the patients linked to it', async () => {
    const patient = (await create(centerA, await as('reception', centerA))).json<{ id: string }>();
    const receptionB = await as('reception', centerB);

    expect((await get(`/api/organizations/${centerB}/patients`, receptionB)).json()).toEqual([]);
    expect(
      (await get(`/api/organizations/${centerB}/patients/${patient.id}`, receptionB)).statusCode,
    ).toBe(404);
  });

  it('flags a probable duplicate and lets another center link the existing patient', async () => {
    const patient = (await create(centerA, await as('reception', centerA))).json<{ id: string }>();
    const receptionB = await as('reception', centerB);

    const sameCin = await create(centerB, receptionB, { ...rakoto, lastName: 'RAKOTO' });
    expect(sameCin.statusCode).toBe(409);
    expect(sameCin.json()).toMatchObject({
      sameNationalId: true,
      duplicates: [{ id: patient.id, lastName: 'Rakoto' }],
    });

    const sameNameAndBirth = await create(centerB, receptionB, {
      ...rakoto,
      lastName: 'rakoto',
      nationalId: undefined,
    });
    expect(sameNameAndBirth.statusCode).toBe(409);
    expect(sameNameAndBirth.json()).toMatchObject({ sameNationalId: false });

    const link = await ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${centerB}/patients/${patient.id}/link`,
      headers: { cookie: receptionB },
    });
    expect(link.statusCode).toBe(204);
    expect(
      (await get(`/api/organizations/${centerB}/patients/${patient.id}`, receptionB)).statusCode,
    ).toBe(200);
  });

  it('registers a homonym once the user confirms it is another person', async () => {
    const reception = await as('reception', centerA);
    await create(centerA, reception, { ...rakoto, nationalId: undefined });
    const homonym = await create(centerA, reception, {
      ...rakoto,
      nationalId: undefined,
      allowDuplicate: true,
    });
    expect(homonym.statusCode).toBe(201);
  });

  it('never registers two patients with the same CIN, even when confirmed', async () => {
    const reception = await as('reception', centerA);
    await create(centerA, reception);
    expect((await create(centerA, reception, { ...rakoto, allowDuplicate: true })).statusCode).toBe(
      409,
    );
  });

  it('lets reception correct administrative data, with before and after in the audit', async () => {
    const reception = await as('reception', centerA);
    const patient = (await create(centerA, reception)).json<{ id: string }>();

    const patch = (cookie: string) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/organizations/${centerA}/patients/${patient.id}`,
        headers: { cookie },
        payload: { phone: '032 00 000 00' },
      });

    expect((await patch(await as('billing', centerA))).statusCode).toBe(403);
    const response = await patch(reception);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ phone: '032 00 000 00' });

    const [entry] = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'patient.update'));
    expect(entry!.before).toMatchObject({ phone: '034 12 345 67' });
    expect(entry!.after).toMatchObject({ phone: '032 00 000 00' });
  });

  it('lets billing and the center admin read, but not create', async () => {
    const patient = (await create(centerA, await as('reception', centerA))).json<{ id: string }>();
    for (const role of ['billing', 'center_admin', 'doctor'] as const) {
      const cookie = await as(role, centerA);
      expect(
        (await get(`/api/organizations/${centerA}/patients/${patient.id}`, cookie)).statusCode,
      ).toBe(200);
    }
  });
});
