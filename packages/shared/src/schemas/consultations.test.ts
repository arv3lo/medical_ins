import { describe, expect, it } from 'vitest';
import { signingProblem, updateConsultationInputSchema, vitalsSchema } from './consultations.js';

describe('vitalsSchema', () => {
  it('accepts plausible measures and leaves out the ones not taken', () => {
    expect(vitalsSchema.parse({ temperatureC: 38.5, heartRate: 92 })).toEqual({
      temperatureC: 38.5,
      heartRate: 92,
    });
  });

  it('rejects implausible values and unknown measures', () => {
    expect(vitalsSchema.safeParse({ temperatureC: 380 }).success).toBe(false);
    expect(vitalsSchema.safeParse({ spo2: 101 }).success).toBe(false);
    expect(vitalsSchema.safeParse({ glucose: 1 }).success).toBe(false);
  });
});

describe('updateConsultationInputSchema', () => {
  it('upper-cases ICD-10 codes and rejects malformed ones', () => {
    const parsed = updateConsultationInputSchema.parse({
      diagnoses: [{ code: ' b54 ', primary: true }],
    });
    expect(parsed.diagnoses).toEqual([{ code: 'B54', primary: true }]);
    expect(
      updateConsultationInputSchema.safeParse({ diagnoses: [{ code: 'paludisme', primary: true }] })
        .success,
    ).toBe(false);
  });

  it('allows at most one primary diagnosis and no code twice', () => {
    const twoPrimaries = [
      { code: 'B54', primary: true },
      { code: 'J06.9', primary: true },
    ];
    const sameCode = [
      { code: 'B54', primary: true },
      { code: 'B54', primary: false },
    ];
    expect(updateConsultationInputSchema.safeParse({ diagnoses: twoPrimaries }).success).toBe(
      false,
    );
    expect(updateConsultationInputSchema.safeParse({ diagnoses: sameCode }).success).toBe(false);
  });

  it('refuses an empty change', () => {
    expect(updateConsultationInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('signingProblem', () => {
  it('requires a primary diagnosis before signing', () => {
    expect(signingProblem({ diagnoses: [] })).toBe(
      'Ajoutez un diagnostic principal avant de signer',
    );
    expect(signingProblem({ diagnoses: [{ primary: false }] })).toBe(
      'Ajoutez un diagnostic principal avant de signer',
    );
    expect(signingProblem({ diagnoses: [{ primary: true }] })).toBeNull();
  });
});
