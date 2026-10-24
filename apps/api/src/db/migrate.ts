import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

/** Relative to the working directory, which is the API package root (pnpm scripts, Docker). */
const MIGRATIONS_FOLDER = 'drizzle';

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, client } = createDb(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}
