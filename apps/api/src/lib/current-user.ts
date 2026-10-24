import type { CurrentUser } from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { memberships, organizations, users } from '../db/schema.js';

export async function loadCurrentUser(db: Db, userId: string): Promise<CurrentUser | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.isActive) return null;

  const rows = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationType: organizations.type,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name);

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin,
    memberships: rows,
  };
}
