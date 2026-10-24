import { loginInputSchema } from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import type { Env } from '../../env.js';
import { audit } from '../../lib/audit.js';
import { loadCurrentUser } from '../../lib/current-user.js';
import { HttpError } from '../../lib/errors.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../lib/password.js';
import { SESSION_COOKIE, createSession, deleteSession } from '../../lib/session.js';
import { requireUser } from '../../plugins/auth.js';

export function authRoutes(app: FastifyInstance, { db, env }: { db: Db; env: Env }): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = loginInputSchema.parse(request.body);
      const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
      const active = user?.isActive === true;
      // Verify even without an active account: the response time must not reveal which exist.
      const passwordHash = active ? user.passwordHash : await DUMMY_PASSWORD_HASH;
      const valid = (await verifyPassword(passwordHash, input.password)) && active;

      if (!user || !valid) {
        await audit(db, {
          actorUserId: user?.id ?? null,
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user?.id,
          after: { email: input.email },
          ip: request.ip,
        });
        throw new HttpError(401, 'Email ou mot de passe incorrect');
      }

      const session = await db.transaction(async (tx) => {
        const created = await createSession(tx, user.id, env.SESSION_TTL_HOURS, {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
        await audit(tx, {
          actorUserId: user.id,
          action: 'auth.login',
          entityType: 'user',
          entityId: user.id,
          ip: request.ip,
        });
        return created;
      });

      reply.setCookie(SESSION_COOKIE, session.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        expires: session.expiresAt,
      });
      return loadCurrentUser(db, user.id);
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const user = request.user;
    await db.transaction(async (tx) => {
      if (token) await deleteSession(tx, token);
      if (user) {
        await audit(tx, {
          actorUserId: user.id,
          action: 'auth.logout',
          entityType: 'user',
          entityId: user.id,
          ip: request.ip,
        });
      }
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request) => requireUser(request));
}
