import { afterEach, describe, expect, it, vi } from 'vitest';
import { isoDateSchema, today } from './dates.js';

describe('today', () => {
  afterEach(() => vi.useRealTimers());

  it('is the calendar date in Madagascar (UTC+3), not in UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T22:30:00Z'));
    expect(today()).toBe('2026-04-01');
  });

  it('stays on the same day in the middle of the day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
    expect(today()).toBe('2026-03-31');
  });
});

describe('isoDateSchema', () => {
  it('accepts a real calendar date, including 29 February of a leap year', () => {
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(isoDateSchema.safeParse('1900-01-01').success).toBe(true);
  });

  it('rejects a date that does not exist instead of rolling it over', () => {
    expect(isoDateSchema.safeParse('2023-02-30').success).toBe(false);
    expect(isoDateSchema.safeParse('2023-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-04-31').success).toBe(false);
  });

  it('rejects years before 1900 and other formats', () => {
    expect(isoDateSchema.safeParse('1899-12-31').success).toBe(false);
    expect(isoDateSchema.safeParse('0001-01-01').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-1-01').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-01-01T00:00:00Z').success).toBe(false);
  });
});
