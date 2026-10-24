import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs } from '../src/db/schema.js';
import { TEST_DATABASE_URL, createUser, login, resetDb, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('users', () => {
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

  const newAccount = {
    email: 'Doc@Example.mg',
    fullName: 'Dr Rakoto',
    initialPassword: 'doc-pass-123',
  };

  async function createAccount(cookie: string, payload: Record<string, unknown> = newAccount) {
    return ctx.app.inject({ method: 'POST', url: '/api/users', headers: { cookie }, payload });
  }

  it('lets the super admin create an account, audited without the password', async () => {
    const response = await createAccount(adminCookie);
    expect(response.statusCode).toBe(201);
    const user = response.json<Record<string, unknown>>();
    expect(user).toMatchObject({ email: 'doc@example.mg', fullName: 'Dr Rakoto' });
    expect(user).not.toHaveProperty('passwordHash');

    const [entry] = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'user.create'));
    expect(entry).toMatchObject({ entityType: 'user', entityId: user.id });
    expect(JSON.stringify(entry!.after)).not.toContain('password');

    await login(ctx.app, 'doc@example.mg', 'doc-pass-123');
  });

  it('refuses account creation to anyone but the super admin', async () => {
    await createUser(ctx.db, { email: 'chef@example.mg', password: 'chef-pass-123' });
    const { cookie } = await login(ctx.app, 'chef@example.mg', 'chef-pass-123');
    expect((await createAccount(cookie)).statusCode).toBe(403);
  });

  it('answers 409 for an email that already has an account', async () => {
    expect((await createAccount(adminCookie)).statusCode).toBe(201);
    expect((await createAccount(adminCookie)).statusCode).toBe(409);
  });
});
