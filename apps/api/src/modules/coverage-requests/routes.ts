import {
  createCoverageRequestInputSchema,
  hasPermission,
  transitionInputSchema,
  updateCoverageRequestInputSchema,
} from '@medical-ins/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { forbidden } from '../../lib/errors.js';
import { requirePermission, requireUser, rolesIn } from '../../plugins/auth.js';
import { requireHealthCenter } from '../patients/service.js';
import {
  insertCoverageRequest,
  lockCoverageRequest,
  searchMedicalActs,
  updateCoverageRequest,
} from './service.js';
import { applyTransition, requireReachable } from './transitions.js';

const orgParams = z.object({ orgId: z.string().uuid() });
const requestParams = orgParams.extend({ id: z.string().uuid() });

const BASE = '/api/organizations/:orgId/coverage-requests';

/**
 * Which side the caller acts for in `orgId`: the requesting center (coverage_request.create) or
 * the insurer (coverage_request.decide). Neither permission is granted by super admin status
 * alone, and the system side is never reachable over HTTP.
 */
function sideIn(request: FastifyRequest, orgId: string) {
  const user = requireUser(request);
  const roles = rolesIn(user, orgId);
  if (hasPermission(roles, 'coverage_request.create')) return { user, actor: 'center' as const };
  if (hasPermission(roles, 'coverage_request.decide')) return { user, actor: 'insurer' as const };
  throw forbidden();
}

// Audit entries hold ids, statuses, amounts and field names only: no diagnosis, act label or
// reason, since audit_logs is append-only and not restricted to care roles. Writes answer with
// ids only; the content is read back through the GET, which audits the read.
export function coverageRequestRoutes(app: FastifyInstance, { db }: { db: Db }): void {
  app.get('/api/referentials/medical-acts', async (request) => {
    requireUser(request);
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(request.query);
    return searchMedicalActs(db, q);
  });

  app.post(BASE, async (request, reply) => {
    const { orgId } = orgParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'coverage_request.create');
    const input = createCoverageRequestInputSchema.parse(request.body);
    await requireHealthCenter(db, orgId);
    const created = await db.transaction(async (tx) => {
      const row = await insertCoverageRequest(tx, orgId, actor.id, input);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'coverage_request.create',
        entityType: 'coverage_request',
        entityId: row.id,
        after: {
          patientId: row.patientId,
          affiliationId: row.affiliationId,
          insurerId: row.insurerId,
        },
        ip: request.ip,
      });
      return row;
    });
    return reply.status(201).send({ id: created.id });
  });

  app.patch(`${BASE}/:id`, async (request) => {
    const { orgId, id } = requestParams.parse(request.params);
    const actor = requirePermission(request, orgId, 'coverage_request.create');
    const input = updateCoverageRequestInputSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const row = await lockCoverageRequest(tx, id);
      requireReachable(row, orgId, 'center');
      await updateCoverageRequest(tx, row, input);
      await audit(tx, {
        actorUserId: actor.id,
        organizationId: orgId,
        action: 'coverage_request.update',
        entityType: 'coverage_request',
        entityId: id,
        after: { fields: Object.keys(input) },
        ip: request.ip,
      });
    });
    return { id };
  });

  app.post(`${BASE}/:id/transitions`, async (request) => {
    const { orgId, id } = requestParams.parse(request.params);
    const { user, actor } = sideIn(request, orgId);
    const input = transitionInputSchema.parse(request.body);
    return db.transaction((tx) =>
      applyTransition(tx, {
        id,
        organizationId: orgId,
        actor,
        actorUserId: user.id,
        input,
        ip: request.ip,
      }),
    );
  });
}
