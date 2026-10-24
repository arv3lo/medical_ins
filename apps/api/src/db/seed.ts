import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/password.js';
import { createDb } from './client.js';
import { users } from './schema.js';

const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  throw new Error('DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
}

const { db, client } = createDb(DATABASE_URL);
const email = SEED_ADMIN_EMAIL.trim().toLowerCase();
const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

if (existing?.isSuperAdmin) {
  console.log(`Super admin ${email} already exists`);
} else if (existing) {
  // Never promote an existing account silently: that would hand it every organization.
  await client.end();
  throw new Error(`${email} already has an account that is not super admin`);
} else {
  await db.insert(users).values({
    email,
    fullName: 'Super admin',
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    isSuperAdmin: true,
  });
  console.log(`Super admin ${email} created`);
}

await client.end();
