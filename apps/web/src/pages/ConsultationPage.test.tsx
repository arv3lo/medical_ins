import type { Consultation as ConsultationData } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { render, testQueryClient } from '../test/render';
import { CENTER_A, CENTER_B, member, userWith } from '../test/users';
import { Consultation } from './ConsultationPage';

const draft: ConsultationData = {
  id: 'c1',
  organizationId: CENTER_A,
  patientId: 'p1',
  doctorId: '00000000-0000-4000-8000-000000000001',
  appointmentId: null,
  reason: 'Fièvre depuis 3 jours',
  examination: null,
  vitals: {},
  notes: null,
  signedAt: null,
  createdAt: '2026-10-24T07:30:00.000Z',
  doctor: { fullName: 'Dr Rakoto' },
  organization: { name: 'CSB A' },
  diagnoses: [],
  addenda: [],
};

const page = (user: ReturnType<typeof userWith>, centerId: string) => {
  const queryClient = testQueryClient();
  queryClient.setQueryData(['consultations', centerId, draft.id], draft);
  return render(
    queryClient,
    <Consultation user={user} centerId={centerId} consultationId={draft.id} />,
  );
};

describe('Consultation', () => {
  const doctorInBoth = userWith(member(CENTER_A, 'doctor'), member(CENTER_B, 'doctor'));

  it('opens the editor on a draft written in this center by one who may write', () => {
    expect(page(doctorInBoth, CENTER_A)).toContain('Enregistrer le brouillon');
  });

  it('shows the read-only record of a draft written in another center', () => {
    const html = page(doctorInBoth, CENTER_B);
    expect(html).not.toContain('Enregistrer le brouillon');
    expect(html).not.toContain('Ajouter un avenant');
    expect(html).toContain('Fièvre depuis 3 jours');
  });

  it('shows the read-only record when the user may no longer write in this center', () => {
    const html = page(userWith(member(CENTER_A, 'nurse')), CENTER_A);
    expect(html).not.toContain('Enregistrer le brouillon');
    expect(html).toContain('Fièvre depuis 3 jours');
  });
});
