import type { CurrentUser, Membership } from '@medical-ins/shared';

export const CENTER_A = '00000000-0000-4000-8000-00000000000a';
export const CENTER_B = '00000000-0000-4000-8000-00000000000b';
export const INSURER = '00000000-0000-4000-8000-00000000000c';

export const member = (
  organizationId: string,
  role: Membership['role'],
  organizationName = organizationId === INSURER ? 'OSTIE' : `Centre ${organizationId.slice(-1)}`,
): Membership => ({
  organizationId,
  organizationName,
  organizationType: organizationId === INSURER ? 'insurer' : 'health_center',
  role,
});

export const userWith = (...memberships: Membership[]): CurrentUser => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.mg',
  fullName: 'Test User',
  isSuperAdmin: false,
  memberships,
});
