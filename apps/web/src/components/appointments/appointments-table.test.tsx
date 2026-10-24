import type { Appointment, AppointmentStatus } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { render, testQueryClient } from '../../test/render';
import { CENTER_A } from '../../test/users';
import { AppointmentsTable } from './appointments-table';

const appointment = (startsAt: string, status: AppointmentStatus = 'scheduled'): Appointment => ({
  id: '1',
  organizationId: CENTER_A,
  patientId: 'p',
  doctorId: 'd',
  startsAt,
  endsAt: startsAt,
  durationMinutes: 20,
  reason: null,
  status,
  patient: { lastName: 'Rakoto', firstNames: 'Jean' },
  doctor: { fullName: 'Dr Rabe' },
});

const html = (a: Appointment, canManage = true) =>
  render(
    testQueryClient(),
    <AppointmentsTable centerId={CENTER_A} appointments={[a]} canManage={canManage} />,
  );

describe('AppointmentsTable', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('offers to move a scheduled appointment that has not started', () => {
    expect(html(appointment(future))).toContain('Déplacer');
  });

  it('never offers to move a past, closed or read-only appointment', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(html(appointment(past))).not.toContain('Déplacer');
    expect(html(appointment(future, 'cancelled'))).not.toContain('Déplacer');
    expect(html(appointment(future), false)).not.toContain('Déplacer');
  });
});
