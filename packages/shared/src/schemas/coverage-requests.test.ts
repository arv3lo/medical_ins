import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COVERAGE_REQUEST_STATUSES,
  type CoverageRequestActor,
  type CoverageRequestStatus,
  FINAL_STATUSES,
  canTransition,
  transitionInputSchema,
  transitionProblem,
} from './coverage-requests.js';

const ACTORS: CoverageRequestActor[] = ['center', 'insurer', 'system'];

// The table of the spec (FR-004), written out independently of the implementation.
const EXPECTED: [CoverageRequestStatus, CoverageRequestStatus, CoverageRequestActor][] = [
  ['draft', 'submitted', 'center'],
  ['draft', 'cancelled', 'center'],
  ['submitted', 'under_review', 'insurer'],
  ['submitted', 'cancelled', 'center'],
  ['under_review', 'cancelled', 'center'],
  ['under_review', 'granted', 'insurer'],
  ['under_review', 'rejected', 'insurer'],
  ['under_review', 'info_requested', 'insurer'],
  ['info_requested', 'submitted', 'center'],
  ['info_requested', 'cancelled', 'center'],
  ['granted', 'used', 'center'],
  ['granted', 'expired', 'system'],
  ['used', 'billed', 'system'],
];

describe('canTransition', () => {
  it('allows exactly the transitions of the table, and nothing else', () => {
    const allowed = new Set(EXPECTED.map((t) => t.join(' ')));
    for (const from of COVERAGE_REQUEST_STATUSES) {
      for (const to of COVERAGE_REQUEST_STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(from, to, actor), `${from} → ${to} by ${actor}`).toBe(
            allowed.has(`${from} ${to} ${actor}`),
          );
        }
      }
    }
  });

  it('never leaves a final status, and never goes back to draft', () => {
    for (const from of COVERAGE_REQUEST_STATUSES) {
      for (const actor of ACTORS) {
        expect(canTransition(from, 'draft', actor)).toBe(false);
        if (FINAL_STATUSES.includes(from)) {
          for (const to of COVERAGE_REQUEST_STATUSES) {
            expect(canTransition(from, to, actor)).toBe(false);
          }
        }
      }
    }
  });
});

describe('transitionInputSchema', () => {
  const ok = (input: unknown) => transitionInputSchema.safeParse(input).success;

  it('accepts a target status with an optional reason, amount and date', () => {
    expect(ok({ to: 'submitted' })).toBe(true);
    expect(
      ok({ to: 'granted', reason: 'Partiel', grantedAmount: 50000, validUntil: '2026-11-30' }),
    ).toBe(true);
  });

  it('trims the reason and refuses an empty or too long one', () => {
    expect(transitionInputSchema.parse({ to: 'rejected', reason: '  Hors contrat ' }).reason).toBe(
      'Hors contrat',
    );
    expect(ok({ to: 'rejected', reason: '   ' })).toBe(false);
    expect(ok({ to: 'rejected', reason: 'x'.repeat(1001) })).toBe(false);
  });

  it('refuses a non-positive or non-integer amount, a bad date, an unknown or draft status', () => {
    expect(ok({ to: 'granted', grantedAmount: 0 })).toBe(false);
    expect(ok({ to: 'granted', grantedAmount: 1000.5 })).toBe(false);
    expect(ok({ to: 'granted', validUntil: '2026-02-30' })).toBe(false);
    expect(ok({ to: 'approved' })).toBe(false);
    expect(ok({ to: 'draft' })).toBe(false);
  });
});

describe('transitionProblem', () => {
  afterEach(() => vi.useRealTimers());
  const request = { estimatedAmount: 70000, validUntil: '2026-11-30' };
  const problem = (from: CoverageRequestStatus, input: Parameters<typeof transitionProblem>[1]) =>
    transitionProblem(from, input, request, '2026-10-24');

  it('requires a reason to cancel a submitted request, to reject or to ask for more', () => {
    expect(problem('draft', { to: 'cancelled' })).toBeNull();
    for (const from of ['submitted', 'under_review', 'info_requested'] as const) {
      expect(problem(from, { to: 'cancelled' })).toBe('Motif requis');
      expect(problem(from, { to: 'cancelled', reason: 'Patient transféré' })).toBeNull();
    }
    expect(problem('under_review', { to: 'rejected' })).toBe('Motif requis');
    expect(problem('under_review', { to: 'info_requested' })).toBe('Motif requis');
    expect(problem('under_review', { to: 'rejected', reason: 'Hors contrat' })).toBeNull();
  });

  it('grants within the estimate, until a date to come, with a reason when partial', () => {
    const grant = { to: 'granted' as const, validUntil: '2026-11-30' };
    expect(problem('under_review', { ...grant, grantedAmount: 70000 })).toBeNull();
    expect(problem('under_review', { ...grant, grantedAmount: 50000 })).toMatch(/motif/i);
    expect(
      problem('under_review', { ...grant, grantedAmount: 50000, reason: 'Plafond' }),
    ).toBeNull();
    expect(problem('under_review', { ...grant, grantedAmount: 70001 })).toMatch(/estimé/);
    expect(problem('under_review', { to: 'granted', validUntil: '2026-11-30' })).toMatch(
      /montant/i,
    );
    expect(problem('under_review', { to: 'granted', grantedAmount: 70000 })).toMatch(/date/i);
    expect(
      problem('under_review', { to: 'granted', grantedAmount: 70000, validUntil: '2026-10-23' }),
    ).toMatch(/date/i);
    expect(
      problem('under_review', { to: 'granted', grantedAmount: 70000, validUntil: '2026-10-24' }),
    ).toBeNull();
  });

  it('marks a grant used only until its validity date', () => {
    expect(transitionProblem('granted', { to: 'used' }, request, '2026-11-30')).toBeNull();
    expect(transitionProblem('granted', { to: 'used' }, request, '2026-12-01')).toMatch(/expiré/);
  });

  it('reads today in Madagascar by default, a day ahead of UTC late at night', () => {
    vi.useFakeTimers({ now: new Date('2026-11-30T22:30:00Z') });
    expect(transitionProblem('granted', { to: 'used' }, request)).toMatch(/expiré/);
  });
});
