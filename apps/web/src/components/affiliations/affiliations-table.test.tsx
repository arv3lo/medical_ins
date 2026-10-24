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
  declaredByOrganizationId: 'center',
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

  it('offers to withdraw only the pending declarations made by this center', () => {
    const pending = { ...affiliation, status: 'pending' as const };
    const render = (a: Affiliation, withdrawableFrom?: string) =>
      renderToString(
        <AffiliationsTable
          affiliations={[a]}
          today="2026-06-01"
          withdrawableFrom={withdrawableFrom}
          onWithdraw={() => {}}
        />,
      );

    expect(render(pending, 'center')).toContain('Retirer');
    expect(render(pending, 'other-center')).not.toContain('Retirer');
    expect(render(pending)).not.toContain('Retirer');
    expect(render(affiliation, 'center')).not.toContain('Retirer');
  });
});
