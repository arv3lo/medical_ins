import { describe, expect, it } from 'vitest';
import { dayRange, formatDate, formatLocalDate, formatTime, toInstant } from './format';

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
    const tz = process.env.TZ;
    process.env.TZ = 'Indian/Antananarivo';
    try {
      expect(formatLocalDate(toInstant('2026-11-03', '01:30'))).toBe('03/11/2026');
    } finally {
      process.env.TZ = tz;
    }
  });
});
