import type { Appointment } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { render, testQueryClient } from '@/test/render';
import { CENTER_A } from '@/test/users';
import { AppointmentsTable } from './appointments-table';

const DOCTOR = '00000000-0000-4000-8000-0000000000d1';

const appointment = (overrides: Partial<Appointment>): Appointment => ({
  id: 'a1',
  organizationId: CENTER_A,
  patientId: 'p1',
  doctorId: DOCTOR,
  startsAt: '2026-11-03T06:00:00.000Z',
  endsAt: '2026-11-03T06:20:00.000Z',
  durationMinutes: 20,
  reason: 'Fièvre',
  status: 'arrived',
  patient: { lastName: 'Rakoto', firstNames: 'Jean' },
  doctor: { fullName: 'Dr Rakoto' },
  ...overrides,
});

const html = (appointments: Appointment[], consultAs?: string) =>
  render(
    testQueryClient(),
    <AppointmentsTable
      centerId={CENTER_A}
      appointments={appointments}
      canManage={false}
      consultAs={consultAs}
    />,
  );

describe('AppointmentsTable', () => {
  it('lets a doctor open the consultation of their own open appointments', () => {
    expect(html([appointment({})], DOCTOR)).toContain('Consulter');
  });

  it("offers no consultation for a colleague's or a closed appointment, nor to non-doctors", () => {
    expect(html([appointment({ doctorId: 'someone-else' })], DOCTOR)).not.toContain('Consulter');
    expect(html([appointment({ status: 'cancelled' })], DOCTOR)).not.toContain('Consulter');
    expect(html([appointment({})])).not.toContain('Consulter');
  });
});
