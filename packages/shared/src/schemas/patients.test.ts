import { describe, expect, it } from 'vitest';
import { createPatientInputSchema, updatePatientInputSchema } from './patients.js';

const valid = {
  lastName: '  Rakoto ',
  firstNames: 'Jean Claude',
  birthDate: '1985-03-12',
  sex: 'male',
};

describe('createPatientInputSchema', () => {
  it('accepts a minimal patient and trims names', () => {
    expect(createPatientInputSchema.parse(valid)).toMatchObject({ lastName: 'Rakoto' });
  });

  it('rejects a birth date in the future or not in YYYY-MM-DD form', () => {
    expect(createPatientInputSchema.safeParse({ ...valid, birthDate: '2999-01-01' }).success).toBe(
      false,
    );
    expect(createPatientInputSchema.safeParse({ ...valid, birthDate: '12/03/1985' }).success).toBe(
      false,
    );
  });

  it('only accepts a 12-digit CIN', () => {
    expect(
      createPatientInputSchema.safeParse({ ...valid, nationalId: '101 211 123 456' }).success,
    ).toBe(true);
    expect(
      createPatientInputSchema.parse({ ...valid, nationalId: '101 211 123 456' }),
    ).toMatchObject({ nationalId: '101211123456' });
    expect(createPatientInputSchema.safeParse({ ...valid, nationalId: '12345' }).success).toBe(
      false,
    );
  });
});

describe('updatePatientInputSchema', () => {
  it('accepts a partial update but not an empty one', () => {
    expect(updatePatientInputSchema.safeParse({ phone: '034 12 345 67' }).success).toBe(true);
    expect(updatePatientInputSchema.safeParse({}).success).toBe(false);
  });
});
