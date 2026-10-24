import {
  addMemberInputSchema,
  createOrganizationInputSchema,
  isRoleAllowedFor,
} from '@medical-ins/shared';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { memberships, organizations, users } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { requirePermission, requireSuperAdmin, requireUser } from '../../plugins/auth.js';

const idParams = z.object({ id: z.string().uuid() });

export function organizationRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get('/api/organizations', async (request) => {
    const user = requireUser(request);
    if (user.isSuperAdmin) {
      return db.select().from(organizations).orderBy(organizations.name);
    }
    const ids = [...new Set(user.memberships.map((m) => m.organizationId))];
    if (ids.length === 0) return [];
    return db
      .select()
      .from(organizations)
      .where(inArray(organizations.id, ids))
      .orderBy(organizations.name);
  });

  /** Every signed-in user may pick an insurer, e.g. when declaring a patient's affiliation. */
  app.get('/api/insurers', async (request) => {
    requireUser(request);
    return db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.type, 'insurer'))
      .orderBy(organizations.name);
  });

  app.post('/api/organizations', async (request, reply) => {
    const user = requireSuperAdmin(request);
    const input = createOrganizationInputSchema.parse(request.body);
    const organization = await db.transaction(async (tx) => {
      const [created] = await tx.insert(organizations).values(input).returning();
      await audit(tx, {
        actorUserId: user.id,
        organizationId: created!.id,
        action: 'organization.create',
        entityType: 'organization',
        entityId: created!.id,
        after: created,
        ip: request.ip,
      });
      return created;
    });
    return reply.status(201).send(organization);
  });

  app.get('/api/organizations/:id/members', async (request) => {
    const { id } = idParams.parse(request.params);
    requirePermission(request, id, 'org.members.manage');
    return db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, id))
      .orderBy(users.fullName);
  });

  app.post('/api/organizations/:id/members', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const actor = requirePermission(request, id, 'org.members.manage');
    const input = addMemberInputSchema.parse(request.body);

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
    if (!organization) throw notFound('Organisation');
    if (!isRoleAllowedFor(input.role, organization.type)) {
      throw new HttpError(400, "Ce rôle n'existe pas pour ce type d'organisation");
    }

    const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!user) throw notFound('Compte');

    const membership = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(memberships)
        .values({ userId: user.id, organizationId: id, role: input.role })
        .onConflictDoNothing()
        .returning();
      if (!created) throw new HttpError(409, 'Cet utilisateur a déjà ce rôle');
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: id,
        action: 'membership.create',
        entityType: 'membership',
        entityId: created.id,
        after: created,
        ip: request.ip,
      });
      return created;
    });
    return reply.status(201).send(membership);
  });
}
