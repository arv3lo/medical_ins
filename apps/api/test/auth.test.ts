import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs } from '../src/db/schema.js';
import { TEST_DATABASE_URL, createUser, login, resetDb, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('auth', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.db);
    await createUser(ctx.db, { email: 'doc@example.mg', password: 'correct-horse' });
  });

  it('reports health', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('rejects a wrong password and audits the attempt', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'doc@example.mg', password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.cookies).toHaveLength(0);
    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.login_failed'));
    expect(entries).toHaveLength(1);
  });

  it('logs in with a case-insensitive email, then logs out', async () => {
    const { cookie } = await login(ctx.app, 'DOC@example.mg', 'correct-horse');

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'doc@example.mg', memberships: [] });

    await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('keeps the audit log append-only', async () => {
    await login(ctx.app, 'doc@example.mg', 'correct-horse');
    await expect(ctx.db.execute(sql`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow();
    await expect(ctx.db.execute(sql`DELETE FROM audit_logs`)).rejects.toThrow();
  });
});
