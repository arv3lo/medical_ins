import { afterEach, describe, expect, it, vi } from 'vitest';
import { today } from './dates.js';

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
