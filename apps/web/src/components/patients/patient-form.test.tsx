import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientForm, blankToNull } from './patient-form';

afterEach(() => {
  vi.useRealTimers();
});

describe('blankToNull', () => {
  it('sends an emptied field as null so the API clears it', () => {
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(' 034 12 345 67 ')).toBe('034 12 345 67');
  });
});

describe('PatientForm', () => {
  it('allows a birth date of today in Madagascar while it is still yesterday in UTC', () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T22:30:00Z') });
    const html = renderToString(
      <PatientForm submitLabel="Enregistrer" pending={false} onSubmit={() => {}} />,
    );
    expect(html).toContain('max="2026-10-25"');
  });
});
