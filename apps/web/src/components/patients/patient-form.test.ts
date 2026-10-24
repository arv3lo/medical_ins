import { describe, expect, it } from 'vitest';
import { blankToNull } from './patient-form';

describe('blankToNull', () => {
  it('sends an emptied field as null so the API clears it', () => {
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(' 034 12 345 67 ')).toBe('034 12 345 67');
  });
});
