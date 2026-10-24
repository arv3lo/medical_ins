import type { Role } from '@medical-ins/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { memberships, users } from '../src/db/schema.js';
import { loadEnv } from '../src/env.js';
import { hashPassword } from '../src/lib/password.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function setupTestApp(): Promise<{
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
  await runMigrations(TEST_DATABASE_URL);
  const { db, client } = createDb(TEST_DATABASE_URL);
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL });
  const app = await buildApp({ db, env });
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await client.end();
    },
  };
}

export async function resetDb(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    // Tests only: the replica role skips the append-only triggers on audit_logs.
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await tx.execute(
      sql`TRUNCATE audit_logs, sessions, memberships, coverage_request_events, coverage_request_items, coverage_requests, consultation_addenda, diagnoses, consultations, appointments, affiliations, patient_center_links, patients, organizations, users RESTART IDENTITY CASCADE`,
    );
  });
}

/** Runs `fn` while every audit_logs insert fails, as if the audit write broke mid-request. */
export async function withAuditFailing<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`
    CREATE FUNCTION test_fail_audit() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'audit write failed'; END;
    $$ LANGUAGE plpgsql`);
  await db.execute(sql`
    CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION test_fail_audit()`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`DROP FUNCTION test_fail_audit() CASCADE`);
  }
}

export async function createUser(
  db: Db,
  values: { email: string; password: string; isSuperAdmin?: boolean },
) {
  const [user] = await db
    .insert(users)
    .values({
      email: values.email,
      fullName: values.email.split('@')[0]!,
      passwordHash: await hashPassword(values.password),
      isSuperAdmin: values.isSuperAdmin ?? false,
    })
    .returning();
  return user!;
}

let loginCount = 0;

/**
 * Logs in and returns the Cookie header to send with later requests. Each call comes from its
 * own address, so a test file never reaches the per-IP login rate limit.
 */
export async function login(app: FastifyInstance, email: string, password: string) {
  loginCount += 1;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: `10.0.${Math.floor(loginCount / 256)}.${loginCount % 256}`,
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.body}`);
  const sid = response.cookies.find((c) => c.name === 'sid');
  return { cookie: `sid=${sid!.value}` };
}

/** Creates an account with `role` in `organizationId`, logs it in and returns its Cookie header. */
export async function memberCookie(
  app: FastifyInstance,
  db: Db,
  role: Role,
  organizationId: string,
): Promise<string> {
  const email = `${role}.${organizationId.slice(0, 8)}@example.mg`;
  const user = await createUser(db, { email, password: 'pass-12345' });
  await db.insert(memberships).values({ userId: user.id, organizationId, role });
  return (await login(app, email, 'pass-12345')).cookie;
}
