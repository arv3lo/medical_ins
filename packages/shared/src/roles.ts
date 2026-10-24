export const ORGANIZATION_TYPES = ['health_center', 'insurer'] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  health_center: 'Centre de santé',
  insurer: 'Assureur',
};

export const CENTER_ROLES = [
  'center_admin',
  'reception',
  'doctor',
  'nurse',
  'pharmacist',
  'billing',
] as const;

export const INSURER_ROLES = ['insurer_manager', 'medical_advisor', 'insurer_accountant'] as const;

export const ROLES = [...CENTER_ROLES, ...INSURER_ROLES] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  center_admin: 'Admin centre',
  reception: 'Accueil',
  doctor: 'Médecin',
  nurse: 'Infirmier',
  pharmacist: 'Pharmacien',
  billing: 'Facturation',
  insurer_manager: 'Gestionnaire assureur',
  medical_advisor: 'Médecin conseil',
  insurer_accountant: 'Comptable assureur',
};

/** A role only makes sense inside an organization of the matching type. */
export function isRoleAllowedFor(role: Role, type: OrganizationType): boolean {
  const allowed: readonly Role[] = type === 'health_center' ? CENTER_ROLES : INSURER_ROLES;
  return allowed.includes(role);
}

export const PERMISSIONS = [
  'org.members.manage',
  'patient.create',
  'patient.update',
  'patient.read_admin',
  'appointment.read',
  'appointment.manage',
  'medical_record.read',
  'medical_record.write',
  'prescription.dispense',
  'coverage_request.create',
  'coverage_request.decide',
  'invoice.manage',
  'invoice.review',
  'insured.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permission matrix from the functional spec ("Acteurs et rôles").
 * Medical content is limited to care roles; insurers only see what a decision needs.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  center_admin: ['org.members.manage', 'patient.read_admin'],
  reception: [
    'patient.create',
    'patient.update',
    'patient.read_admin',
    'appointment.read',
    'appointment.manage',
  ],
  doctor: [
    'patient.read_admin',
    'appointment.read',
    'medical_record.read',
    'medical_record.write',
    'coverage_request.create',
  ],
  nurse: ['patient.read_admin', 'appointment.read', 'medical_record.read'],
  pharmacist: ['patient.read_admin', 'prescription.dispense'],
  billing: ['patient.read_admin', 'invoice.manage'],
  insurer_manager: ['org.members.manage', 'insured.manage'],
  medical_advisor: ['coverage_request.decide'],
  insurer_accountant: ['invoice.review'],
};

/**
 * What super admin status alone grants, without a role in the organization. Every permission must
 * be listed, so a new one fails to typecheck until someone decides. Medical content (records,
 * prescriptions, coverage requests that carry the diagnosis) is reachable only through a role.
 */
const SUPER_ADMIN_GRANTS: Record<Permission, boolean> = {
  'org.members.manage': true,
  'patient.create': true,
  'patient.update': true,
  'patient.read_admin': true,
  'appointment.read': true,
  'appointment.manage': true,
  'medical_record.read': false,
  'medical_record.write': false,
  'prescription.dispense': false,
  'coverage_request.create': false,
  'coverage_request.decide': false,
  'invoice.manage': true,
  'invoice.review': true,
  'insured.manage': true,
};

/** Whether being super admin is enough for `permission`, without a role in the organization. */
export function superAdminBypasses(permission: Permission): boolean {
  return SUPER_ADMIN_GRANTS[permission];
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}
