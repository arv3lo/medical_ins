import { hasPermission, type CurrentUser, type Permission } from '@medical-ins/shared';

export type Center = { id: string; name: string };

/** The health centers where at least one of the user's roles grants `permission`. */
export function centersWith(user: CurrentUser, permission: Permission): Center[] {
  const centers = new Map<string, Center>();
  for (const m of user.memberships) {
    if (m.organizationType !== 'health_center' || centers.has(m.organizationId)) continue;
    const roles = user.memberships
      .filter((other) => other.organizationId === m.organizationId)
      .map((other) => other.role);
    if (hasPermission(roles, permission)) {
      centers.set(m.organizationId, { id: m.organizationId, name: m.organizationName });
    }
  }
  return [...centers.values()];
}

export function canIn(user: CurrentUser, organizationId: string, permission: Permission): boolean {
  return centersWith(user, permission).some((c) => c.id === organizationId);
}
