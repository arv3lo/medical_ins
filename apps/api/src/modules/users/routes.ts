import { createUserInputSchema } from '@medical-ins/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { requireSuperAdmin } from '../../plugins/auth.js';

export function userRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  /** Only the super admin creates accounts, so nobody else ever knows a user's initial password. */
  app.post('/api/users', async (request, reply) => {
    const actor = requireSuperAdmin(request);
    const input = createUserInputSchema.parse(request.body);
    // Hashing is slow: do it before the transaction holds a pooled connection.
    const passwordHash = await hashPassword(input.initialPassword);

    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email: input.email, fullName: input.fullName, passwordHash })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });
      if (!created) throw new HttpError(409, 'Un compte existe déjà pour cet email');
      await audit(tx, {
        actorUserId: actor.id,
        action: 'user.create',
        entityType: 'user',
        entityId: created.id,
        after: created,
        ip: request.ip,
      });
      return created;
    });
    return reply.status(201).send(user);
  });
}
