import { describe, expect, it } from 'vitest';
import { organizationSchema } from './organizations.js';

describe('organizationSchema', () => {
  it('matches an organization as the API returns it', () => {
    const fromApi = {
      id: '0b8e7c1e-2f43-4a59-9a43-6c1f0f1e9d2a',
      type: 'insurer',
      name: 'OSTIE',
      taxId: null,
      region: null,
      address: null,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    };
    expect(organizationSchema.parse(fromApi)).toEqual(fromApi);
  });
});
