import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions } from '../db/schema.js';

export const SESSION_COOKIE = 'sid';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(
  db: Db,
  userId: string,
  ttlHours: number,
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { token, expiresAt };
}

export async function findSessionUserId(db: Db, token: string): Promise<string | null> {
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())),
  });
  return session?.userId ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
