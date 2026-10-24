import {
  hasPermission,
  type CurrentUser,
  type OrganizationType,
  type Permission,
} from '@medical-ins/shared';

export type Center = { id: string; name: string };

/** Organizations of `type` where at least one of the user's roles grants `permission`. */
export function organizationsWith(
  user: CurrentUser,
  permission: Permission,
  type: OrganizationType,
): Center[] {
  const found = new Map<string, Center>();
  for (const m of user.memberships) {
    if (m.organizationType !== type || found.has(m.organizationId)) continue;
    const roles = user.memberships
      .filter((other) => other.organizationId === m.organizationId)
      .map((other) => other.role);
    if (hasPermission(roles, permission)) {
      found.set(m.organizationId, { id: m.organizationId, name: m.organizationName });
    }
  }
  return [...found.values()];
}

/** The health centers where at least one of the user's roles grants `permission`. */
export const centersWith = (user: CurrentUser, permission: Permission): Center[] =>
  organizationsWith(user, permission, 'health_center');

export function canIn(user: CurrentUser, organizationId: string, permission: Permission): boolean {
  const roles = user.memberships
    .filter((m) => m.organizationId === organizationId)
    .map((m) => m.role);
  return hasPermission(roles, permission);
}
