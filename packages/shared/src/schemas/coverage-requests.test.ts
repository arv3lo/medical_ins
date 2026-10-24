import { describe, expect, it } from 'vitest';
import {
  COVERAGE_REQUEST_STATUSES,
  type CoverageRequestActor,
  type CoverageRequestStatus,
  FINAL_STATUSES,
  canTransition,
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
