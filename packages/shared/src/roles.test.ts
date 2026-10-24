import { describe, expect, it } from 'vitest';
import { hasPermission, isRoleAllowedFor } from './roles.js';

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
});
