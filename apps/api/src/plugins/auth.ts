import type { CurrentUser, Permission, Role } from '@medical-ins/shared';
import { hasPermission } from '@medical-ins/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { loadCurrentUser } from '../lib/current-user.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE, findSessionUserId } from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
}

/** Resolves the session cookie into `request.user` on every request. */
export function registerAuth(app: FastifyInstance, db: Db): void {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const userId = await findSessionUserId(db, token);
    if (userId) request.user = await loadCurrentUser(db, userId);
  });
}

export function requireUser(request: FastifyRequest): CurrentUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function requireSuperAdmin(request: FastifyRequest): CurrentUser {
  const user = requireUser(request);
  if (!user.isSuperAdmin) throw forbidden();
  return user;
}

export function rolesIn(user: CurrentUser, organizationId: string): Role[] {
  return user.memberships.filter((m) => m.organizationId === organizationId).map((m) => m.role);
}

/** Super admins pass; everyone else needs a role granting `permission` in that organization. */
export function requirePermission(
  request: FastifyRequest,
  organizationId: string,
  permission: Permission,
): CurrentUser {
  const user = requireUser(request);
  if (user.isSuperAdmin || hasPermission(rolesIn(user, organizationId), permission)) return user;
  throw forbidden();
}
