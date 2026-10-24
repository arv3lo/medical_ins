import { describe, expect, it } from 'vitest';
import {
  canChangeAppointmentStatus,
  createAppointmentInputSchema,
  isStatusChangeDue,
} from './appointments.js';

describe('createAppointmentInputSchema', () => {
  const valid = {
    patientId: '00000000-0000-4000-8000-000000000001',
    doctorId: '00000000-0000-4000-8000-000000000002',
    startsAt: '2026-11-03T09:30:00+03:00',
    durationMinutes: 20,
    reason: 'Fièvre',
  };

  it('accepts an ISO date-time with an offset and normalizes it to UTC', () => {
    expect(createAppointmentInputSchema.parse(valid).startsAt).toBe('2026-11-03T06:30:00.000Z');
  });

  it('keeps durations between 5 minutes and 4 hours, in steps of 5', () => {
    expect(createAppointmentInputSchema.safeParse({ ...valid, durationMinutes: 0 }).success).toBe(
      false,
    );
    expect(createAppointmentInputSchema.safeParse({ ...valid, durationMinutes: 17 }).success).toBe(
      false,
    );
    expect(createAppointmentInputSchema.safeParse({ ...valid, durationMinutes: 300 }).success).toBe(
      false,
    );
  });
});

describe('canChangeAppointmentStatus', () => {
  it('follows scheduled → arrived → completed, with cancel and no-show before arrival', () => {
    expect(canChangeAppointmentStatus('scheduled', 'arrived')).toBe(true);
    expect(canChangeAppointmentStatus('scheduled', 'cancelled')).toBe(true);
    expect(canChangeAppointmentStatus('scheduled', 'no_show')).toBe(true);
    expect(canChangeAppointmentStatus('arrived', 'completed')).toBe(true);
  });

  it('never leaves a final status, nor skips arrival', () => {
    expect(canChangeAppointmentStatus('scheduled', 'completed')).toBe(false);
    expect(canChangeAppointmentStatus('cancelled', 'scheduled')).toBe(false);
    expect(canChangeAppointmentStatus('completed', 'arrived')).toBe(false);
    expect(canChangeAppointmentStatus('no_show', 'arrived')).toBe(false);
  });
});

describe('isStatusChangeDue', () => {
  const startsAt = new Date('2026-11-03T09:00:00+03:00');
  const minutesFromStart = (minutes: number) => new Date(startsAt.getTime() + minutes * 60_000);

  it('records an arrival from one hour before the start', () => {
    expect(isStatusChangeDue('arrived', startsAt, minutesFromStart(-61))).toBe(false);
    expect(isStatusChangeDue('arrived', startsAt, minutesFromStart(-60))).toBe(true);
  });

  it('records a no-show or a completion only once the start has passed', () => {
    for (const status of ['no_show', 'completed'] as const) {
      expect(isStatusChangeDue(status, startsAt, minutesFromStart(-1))).toBe(false);
      expect(isStatusChangeDue(status, startsAt, minutesFromStart(0))).toBe(true);
    }
  });

  it('cancels at any time', () => {
    expect(isStatusChangeDue('cancelled', startsAt, minutesFromStart(-60 * 24 * 30))).toBe(true);
  });
});
