import { INSURED_PAGE_SIZE, type InsuredAffiliation } from '@medical-ins/shared';
import { describe, expect, it } from 'vitest';
import { insuredKey, nextInsuredOffset } from '../lib/affiliations';
import { render, testQueryClient } from '../test/render';
import { INSURER } from '../test/users';
import { InsuredList } from './InsuredPage';

const affiliation = (i: number): InsuredAffiliation => ({
  id: String(i),
  memberNumber: `OS-${i}`,
  holderStatus: 'holder',
  planName: null,
  employer: null,
  startsOn: '2026-01-01',
  endsOn: null,
  status: 'pending',
  rejectionReason: null,
  patient: { lastName: 'Rakoto', firstNames: 'Jean', birthDate: '1985-03-12', nationalId: null },
});
const page = (size: number) => Array.from({ length: size }, (_, i) => affiliation(i));

describe('nextInsuredOffset', () => {
  it('asks for the next page only after a full one', () => {
    expect(nextInsuredOffset(page(INSURED_PAGE_SIZE), [page(INSURED_PAGE_SIZE)])).toBe(
      INSURED_PAGE_SIZE,
    );
    expect(nextInsuredOffset(page(3), [page(INSURED_PAGE_SIZE), page(3)])).toBeUndefined();
  });
});

describe('InsuredList', () => {
  const renderWith = async (size: number) => {
    const queryClient = testQueryClient();
    await queryClient.prefetchInfiniteQuery({
      queryKey: insuredKey(INSURER, 'pending', ''),
      queryFn: () => Promise.resolve(page(size)),
      initialPageParam: 0,
    });
    return render(
      queryClient,
      <InsuredList insurerId={INSURER} status="pending" memberNumber="" />,
    );
  };

  it('offers to load more after a full page', async () => {
    expect(await renderWith(INSURED_PAGE_SIZE)).toContain('Charger plus');
    expect(await renderWith(3)).not.toContain('Charger plus');
  });
});
