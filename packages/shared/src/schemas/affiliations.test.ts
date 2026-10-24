import { describe, expect, it } from 'vitest';
import { createAffiliationInputSchema, isAffiliationActive } from './affiliations.js';

const INSURER = '00000000-0000-4000-8000-00000000000c';

describe('createAffiliationInputSchema', () => {
  const valid = {
    insurerId: INSURER,
    memberNumber: ' ab-1234 ',
    holderStatus: 'holder',
    startsOn: '2026-01-01',
  };

  it('normalizes the member number', () => {
    expect(createAffiliationInputSchema.parse(valid)).toMatchObject({ memberNumber: 'AB-1234' });
  });

  it('refuses an end date before the start date', () => {
    expect(createAffiliationInputSchema.safeParse({ ...valid, endsOn: '2025-12-31' }).success).toBe(
      false,
    );
  });
});

describe('isAffiliationActive', () => {
  const affiliation = {
    status: 'validated',
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
  } as const;

  it('is active between its dates once validated', () => {
    expect(isAffiliationActive(affiliation, '2026-06-15')).toBe(true);
    expect(isAffiliationActive(affiliation, '2026-12-31')).toBe(true);
    expect(isAffiliationActive(affiliation, '2027-01-01')).toBe(false);
    expect(isAffiliationActive(affiliation, '2025-12-31')).toBe(false);
  });

  it('is never active before validation', () => {
    expect(isAffiliationActive({ ...affiliation, status: 'pending' }, '2026-06-15')).toBe(false);
  });

  it('has no end when endsOn is null', () => {
    expect(isAffiliationActive({ ...affiliation, endsOn: null }, '2040-01-01')).toBe(true);
  });
});
