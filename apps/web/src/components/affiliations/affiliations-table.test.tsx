import type { Affiliation } from '@medical-ins/shared';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AffiliationsTable } from './affiliations-table';

const affiliation: Affiliation = {
  id: '1',
  patientId: 'p',
  insurerId: 'i',
  insurerName: 'OSTIE',
  memberNumber: 'OS-1',
  holderStatus: 'holder',
  planName: null,
  employer: 'JIRAMA',
  startsOn: '2026-01-01',
  endsOn: null,
  status: 'validated',
  rejectionReason: null,
};

describe('AffiliationsTable', () => {
  it('says which affiliation covers the patient today', () => {
    const html = renderToString(
      <AffiliationsTable affiliations={[affiliation]} today="2026-06-01" />,
    );
    expect(html).toContain('OSTIE');
    expect(html).toContain('Couvert');
  });

  it('shows why the insurer refused an affiliation', () => {
    const html = renderToString(
      <AffiliationsTable
        affiliations={[{ ...affiliation, status: 'rejected', rejectionReason: 'Numéro inconnu' }]}
        today="2026-06-01"
      />,
    );
    expect(html).toContain('Refusée');
    expect(html).toContain('Numéro inconnu');
  });
});
