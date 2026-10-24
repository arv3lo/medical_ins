import type { ConsultationSummary } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { render, testQueryClient } from '@/test/render';
import { CENTER_A } from '@/test/users';
import { ConsultationsTable } from './consultations-table';

const summary = (overrides: Partial<ConsultationSummary>): ConsultationSummary => ({
  id: 'c1',
  organizationId: CENTER_A,
  patientId: 'p1',
  doctorId: 'd1',
  reason: 'Fièvre',
  signedAt: '2026-10-24T08:00:00.000Z',
  createdAt: '2026-10-24T07:30:00.000Z',
  doctor: { fullName: 'Dr Rakoto' },
  organization: { name: 'CSB A' },
  primaryDiagnosis: { code: 'B54', label: 'Paludisme, sans précision' },
  ...overrides,
});

describe('ConsultationsTable', () => {
  it('lists consultations from every center with their primary diagnosis and status', () => {
    const page = render(
      testQueryClient(),
      <ConsultationsTable
        centerId={CENTER_A}
        consultations={[
          summary({}),
          summary({
            id: 'c2',
            signedAt: null,
            primaryDiagnosis: null,
            organization: { name: 'CSB B' },
          }),
        ]}
      />,
    );
    expect(page).toContain('B54 · Paludisme, sans précision');
    expect(page).toContain('CSB B');
    expect(page).toContain('Brouillon');
    expect(page).toContain('Signée');
    expect(page).toContain(`/patients/p1/consultations/c2?centre=${CENTER_A}`);
  });
});
