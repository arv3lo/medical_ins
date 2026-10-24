import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditLogs, sessions, users } from '../src/db/schema.js';
import * as password from '../src/lib/password.js';
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

  it('spends the same password work on unknown and deactivated accounts', async () => {
    // Otherwise the response time tells which emails have an active account.
    await ctx.db.update(users).set({ isActive: false }).where(eq(users.email, 'doc@example.mg'));
    const verify = vi.spyOn(password, 'verifyPassword');
    try {
      for (const email of ['nobody@example.mg', 'doc@example.mg']) {
        const response = await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email, password: 'correct-horse' },
        });
        expect(response.statusCode).toBe(401);
      }
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      verify.mockRestore();
    }
  });

  it('ignores X-Forwarded-For when no proxy is trusted', async () => {
    const attempt = (forwardedFor: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        // Own address: the rate limit counts per IP and other tests log in from 127.0.0.1.
        remoteAddress: '192.0.2.1',
        headers: { 'x-forwarded-for': forwardedFor },
        payload: { email: 'doc@example.mg', password: 'wrong' },
      });
    for (let i = 0; i < 10; i++) expect((await attempt(`10.0.0.${i}`)).statusCode).toBe(401);
    expect((await attempt('10.0.0.99')).statusCode).toBe(429);

    const entries = await ctx.db.select({ ip: auditLogs.ip }).from(auditLogs);
    expect(new Set(entries.map((e) => e.ip))).toEqual(new Set(['192.0.2.1']));
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

  it('purges expired sessions when someone logs in', async () => {
    const other = await createUser(ctx.db, { email: 'gone@example.mg', password: 'gone-pass-1' });
    await ctx.db
      .insert(sessions)
      .values({ id: 'expired', userId: other.id, expiresAt: new Date(Date.now() - 1000) });

    await login(ctx.app, 'doc@example.mg', 'correct-horse');
    const ids = (await ctx.db.select({ id: sessions.id }).from(sessions)).map((s) => s.id);
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain('expired');
  });

  it('keeps the audit log append-only', async () => {
    await login(ctx.app, 'doc@example.mg', 'correct-horse');
    await expect(ctx.db.execute(sql`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow();
    await expect(ctx.db.execute(sql`DELETE FROM audit_logs`)).rejects.toThrow();
    await expect(ctx.db.execute(sql`TRUNCATE audit_logs`)).rejects.toThrow();
    // CASCADE reaches audit_logs through its foreign key to users.
    await expect(ctx.db.execute(sql`TRUNCATE users CASCADE`)).rejects.toThrow();
  });
});
