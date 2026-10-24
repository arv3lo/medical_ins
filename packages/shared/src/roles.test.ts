import { describe, expect, it } from 'vitest';
import { hasPermission, isRoleAllowedFor, superAdminBypasses } from './roles.js';

describe('roles', () => {
  it('keeps medical content away from administrative roles', () => {
    expect(hasPermission(['reception'], 'medical_record.read')).toBe(false);
    expect(hasPermission(['billing'], 'medical_record.read')).toBe(false);
    expect(hasPermission(['doctor'], 'medical_record.read')).toBe(true);
  });

  it('combines permissions across roles', () => {
    expect(hasPermission(['nurse', 'pharmacist'], 'prescription.dispense')).toBe(true);
  });

  it('only allows center roles in health centers', () => {
    expect(isRoleAllowedFor('doctor', 'health_center')).toBe(true);
    expect(isRoleAllowedFor('doctor', 'insurer')).toBe(false);
    expect(isRoleAllowedFor('medical_advisor', 'insurer')).toBe(true);
  });

  it('lets reception edit patient records, and keeps insurers away from them', () => {
    expect(hasPermission(['reception'], 'patient.update')).toBe(true);
    expect(hasPermission(['billing'], 'patient.update')).toBe(false);
    for (const role of ['insurer_manager', 'medical_advisor', 'insurer_accountant'] as const) {
      expect(hasPermission([role], 'patient.read_admin')).toBe(false);
    }
  });

  it('lets care roles read the agenda, and only reception manage it', () => {
    expect(hasPermission(['doctor'], 'appointment.read')).toBe(true);
    expect(hasPermission(['nurse'], 'appointment.read')).toBe(true);
    expect(hasPermission(['reception'], 'appointment.read')).toBe(true);
    expect(hasPermission(['doctor'], 'appointment.manage')).toBe(false);
    expect(hasPermission(['billing'], 'appointment.read')).toBe(false);
  });
});

describe('superAdminBypasses', () => {
  it('lets the super admin administer, but never reach medical content', () => {
    expect(superAdminBypasses('org.members.manage')).toBe(true);
    expect(superAdminBypasses('patient.read_admin')).toBe(true);
    expect(superAdminBypasses('medical_record.read')).toBe(false);
    expect(superAdminBypasses('medical_record.write')).toBe(false);
    expect(superAdminBypasses('prescription.dispense')).toBe(false);
  });

  it('keeps coverage requests, which carry the diagnosis, to the roles that handle them', () => {
    expect(superAdminBypasses('coverage_request.create')).toBe(false);
    expect(superAdminBypasses('coverage_request.decide')).toBe(false);
  });
});
