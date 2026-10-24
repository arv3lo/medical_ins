import type { Consultation } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { render, testQueryClient } from '@/test/render';
import { CENTER_A } from '@/test/users';
import { ConsultationRecord } from './consultation-record';

const signed: Consultation = {
  id: 'c1',
  organizationId: CENTER_A,
  patientId: 'p1',
  doctorId: 'd1',
  appointmentId: null,
  reason: 'Fièvre depuis 3 jours',
  examination: 'Fébrile',
  vitals: { temperatureC: 39.2 },
  notes: null,
  signedAt: '2026-10-24T08:00:00.000Z',
  createdAt: '2026-10-24T07:30:00.000Z',
  doctor: { fullName: 'Dr Rakoto' },
  organization: { name: 'CSB A' },
  diagnoses: [
    { code: 'B54', label: 'Paludisme, sans précision', primary: true },
    { code: 'R50.9', label: 'Fièvre, sans précision', primary: false },
  ],
  addenda: [
    {
      id: 'a1',
      content: 'Goutte épaisse positive',
      createdAt: '2026-10-24T10:00:00.000Z',
      author: { fullName: 'Dr Rakoto' },
    },
  ],
};

const html = (canAmend: boolean) =>
  render(
    testQueryClient(),
    <ConsultationRecord centerId={CENTER_A} consultation={signed} canAmend={canAmend} />,
  );

describe('ConsultationRecord', () => {
  it('shows the signed record: vitals with units, diagnoses and addenda', () => {
    const page = html(false);
    expect(page).toContain('39,2 °C');
    expect(page).toContain('B54');
    expect(page).toContain('Principal');
    expect(page).toContain('Goutte épaisse positive');
    expect(page).toContain('Signée');
  });

  it('offers an addendum only to those who may write', () => {
    expect(html(true)).toContain('Ajouter un avenant');
    expect(html(false)).not.toContain('Ajouter un avenant');
  });
});
