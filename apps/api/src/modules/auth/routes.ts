import { loginInputSchema } from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import type { Env } from '../../env.js';
import { audit } from '../../lib/audit.js';
import { loadCurrentUser } from '../../lib/current-user.js';
import { HttpError } from '../../lib/errors.js';
import { verifyPassword } from '../../lib/password.js';
import { SESSION_COOKIE, createSession, deleteSession } from '../../lib/session.js';
import { requireUser } from '../../plugins/auth.js';

export function authRoutes(app: FastifyInstance, { db, env }: { db: Db; env: Env }): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = loginInputSchema.parse(request.body);
      const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
      const valid =
        user?.isActive === true && (await verifyPassword(user.passwordHash, input.password));

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

      const session = await createSession(db, user.id, env.SESSION_TTL_HOURS, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      await audit(db, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ip: request.ip,
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
    if (token) await deleteSession(db, token);
    if (request.user) {
      await audit(db, {
        actorUserId: request.user.id,
        action: 'auth.logout',
        entityType: 'user',
        entityId: request.user.id,
        ip: request.ip,
      });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request) => requireUser(request));
}
