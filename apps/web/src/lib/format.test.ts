import { describe, expect, it, vi } from 'vitest';
import {
  addDays,
  dayRange,
  daysRange,
  formatDate,
  formatLocalDate,
  formatTime,
  localPartsOf,
  toInstant,
  weekRange,
} from './format';

describe('format', () => {
  it('formats a calendar date without timezone shift', () => {
    expect(formatDate('1985-03-12')).toBe('12/03/1985');
  });

  it('turns a local date and time into an instant, and back into a local time', () => {
    const instant = toInstant('2026-11-03', '09:30');
    expect(formatTime(instant)).toBe('09:30');
  });

  it('gives the bounds of a local day', () => {
    const { from, to } = dayRange('2026-11-03');
    expect(Date.parse(to) - Date.parse(from)).toBe(24 * 3_600_000);
    expect(formatTime(from)).toBe('00:00');
  });

  it('gives the local date of an instant, even when UTC is still on the day before', () => {
    vi.stubEnv('TZ', 'Indian/Antananarivo');
    try {
      expect(formatLocalDate(toInstant('2026-11-03', '01:30'))).toBe('03/11/2026');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('moves a local date by whole days, across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives the bounds of several local days', () => {
    const { from, to } = daysRange('2026-11-03', 7);
    expect(from).toBe(dayRange('2026-11-03').from);
    expect(to).toBe(dayRange('2026-11-09').to);
  });

  it('gives the bounds of the local week, Monday to Sunday, around a date', () => {
    const week = { from: dayRange('2026-11-02').from, to: dayRange('2026-11-08').to };
    expect(weekRange('2026-11-05')).toEqual(week);
    expect(weekRange('2026-11-02')).toEqual(week);
    expect(weekRange('2026-11-08')).toEqual(week);
  });

  it('splits an instant into the local date and time a form shows', () => {
    expect(localPartsOf(toInstant('2026-11-03', '09:30'))).toEqual({
      date: '2026-11-03',
      time: '09:30',
    });
  });
});
