import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, createUser, login, resetDb, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('organizations', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let adminCookie: string;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.db);
    await createUser(ctx.db, {
      email: 'admin@example.mg',
      password: 'admin-pass',
      isSuperAdmin: true,
    });
    adminCookie = (await login(ctx.app, 'admin@example.mg', 'admin-pass')).cookie;
  });

  async function createCenter() {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: adminCookie },
      payload: { type: 'health_center', name: 'CSB II Analakely', region: 'Analamanga' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function addMember(orgId: string, cookie: string, payload: Record<string, unknown>) {
    return ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/members`,
      headers: { cookie },
      payload,
    });
  }

  it('only lets a super admin create an organization', async () => {
    await createUser(ctx.db, { email: 'someone@example.mg', password: 'pass-12345' });
    const { cookie } = await login(ctx.app, 'someone@example.mg', 'pass-12345');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie },
      payload: { type: 'insurer', name: 'OSTIE' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a center admin manage members, but not a doctor', async () => {
    const center = await createCenter();
    expect(
      (
        await addMember(center.id, adminCookie, {
          email: 'chef@example.mg',
          fullName: 'Chef de centre',
          initialPassword: 'chef-pass-123',
          role: 'center_admin',
        })
      ).statusCode,
    ).toBe(201);

    const chef = await login(ctx.app, 'chef@example.mg', 'chef-pass-123');
    const added = await addMember(center.id, chef.cookie, {
      email: 'doc@example.mg',
      fullName: 'Dr Rakoto',
      initialPassword: 'doc-pass-123',
      role: 'doctor',
    });
    expect(added.statusCode).toBe(201);

    const doctor = await login(ctx.app, 'doc@example.mg', 'doc-pass-123');
    const listed = await ctx.app.inject({
      method: 'GET',
      url: `/api/organizations/${center.id}/members`,
      headers: { cookie: doctor.cookie },
    });
    expect(listed.statusCode).toBe(403);

    const mine = await ctx.app.inject({
      method: 'GET',
      url: '/api/organizations',
      headers: { cookie: doctor.cookie },
    });
    expect(mine.json()).toHaveLength(1);
  });

  it('refuses an insurer role inside a health center', async () => {
    const center = await createCenter();
    const response = await addMember(center.id, adminCookie, {
      email: 'conseil@example.mg',
      fullName: 'Médecin conseil',
      initialPassword: 'conseil-pass-1',
      role: 'medical_advisor',
    });
    expect(response.statusCode).toBe(400);
  });
});
