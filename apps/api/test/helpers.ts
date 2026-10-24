import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { users } from '../src/db/schema.js';
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
  await db.execute(
    sql`TRUNCATE audit_logs, sessions, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
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

/** Logs in and returns the Cookie header to send with later requests. */
export async function login(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.body}`);
  const sid = response.cookies.find((c) => c.name === 'sid');
  return { cookie: `sid=${sid!.value}` };
}
