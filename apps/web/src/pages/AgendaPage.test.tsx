import type { Appointment } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { daysRange, formatLocalDate, localToday, toInstant, weekRange } from '../lib/format';
import { render, testQueryClient } from '../test/render';
import { CENTER_A, member, userWith } from '../test/users';
import { CenterAgenda } from './AgendaPage';

const reception = userWith(member(CENTER_A, 'reception'));
const doctor = userWith(member(CENTER_A, 'doctor'));

const appointment = (startsAt: string): Appointment => ({
  id: '1',
  organizationId: CENTER_A,
  patientId: 'p',
  doctorId: doctor.id,
  startsAt,
  endsAt: startsAt,
  durationMinutes: 20,
  reason: null,
  status: 'scheduled',
  patient: { lastName: 'Rakoto', firstNames: 'Jean' },
  doctor: { fullName: 'Dr Rabe' },
});

describe('CenterAgenda', () => {
  const startsAt = toInstant(localToday(), '23:30');

  it('shows the week around the chosen day, with the date of each appointment', () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      ['appointments', CENTER_A, weekRange(localToday())],
      [appointment(startsAt)],
    );
    const html = render(
      queryClient,
      <CenterAgenda
        user={reception}
        centerId={CENTER_A}
        canManage={false}
        view="week"
        onViewChange={() => {}}
      />,
    );
    expect(html).toContain('Rakoto');
    expect(html).toContain(formatLocalDate(startsAt));
  });

  it("lists a doctor's own upcoming appointments", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      ['appointments', CENTER_A, { ...daysRange(localToday(), 30), doctorId: doctor.id }],
      [appointment(startsAt)],
    );
    const html = render(
      queryClient,
      <CenterAgenda
        user={doctor}
        centerId={CENTER_A}
        canManage={false}
        view="mine"
        onViewChange={() => {}}
      />,
    );
    expect(html).toContain('Rakoto');
    expect(html).toContain(formatLocalDate(startsAt));
  });

  it('offers « Mes rendez-vous » to the doctors of the center only', () => {
    const queryClient = testQueryClient();
    const view = (user: typeof doctor) =>
      render(
        queryClient,
        <CenterAgenda
          user={user}
          centerId={CENTER_A}
          canManage={false}
          view="day"
          onViewChange={() => {}}
        />,
      );
    expect(view(doctor)).toContain('Mes rendez-vous');
    expect(view(reception)).not.toContain('Mes rendez-vous');
    expect(view(reception)).toContain('Semaine');
  });
});
