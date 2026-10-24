import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db/client.js';
import type { Env } from './env.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { organizationRoutes } from './modules/organizations/routes.js';
import { patientRoutes } from './modules/patients/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { registerAuth } from './plugins/auth.js';

export async function buildApp({ db, env }: { db: Db; env: Env }) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: 'info' },
    // request.ip keys the login rate limit and the audit log: trust only known proxy hops.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  registerAuth(app, db);

  app.setErrorHandler<FastifyError | Error>((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: 'Données invalides', issues: error.issues });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ ...error.details, message: error.message });
    }
    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    request.log.error(error);
    return reply.status(500).send({ message: 'Erreur interne' });
  });

  app.get('/api/health', async () => {
    await db.execute(sql`select 1`);
    return { status: 'ok' };
  });

  authRoutes(app, { db, env });
  organizationRoutes(app, { db });
  userRoutes(app, { db });
  patientRoutes(app, { db });

  return app;
}
