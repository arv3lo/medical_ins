import { describe, expect, it } from 'vitest';
import { formatVital, toVitals, toVitalsForm } from './vitals';

describe('toVitals', () => {
  it('keeps the measures typed in, accepting a decimal comma', () => {
    expect(toVitals({ temperatureC: '39,2', heartRate: '104', spo2: '' })).toEqual({
      temperatureC: 39.2,
      heartRate: 104,
    });
  });
});

describe('toVitalsForm', () => {
  it('turns stored vitals back into form text', () => {
    expect(toVitalsForm({ weightKg: 62.5 })).toMatchObject({ weightKg: '62.5', heightCm: '' });
  });
});

describe('formatVital', () => {
  it('shows a measure the French way, with its unit', () => {
    expect(formatVital('temperatureC', 39.2)).toBe('39,2 °C');
    expect(formatVital('spo2', 97)).toBe('97 %');
  });
});
