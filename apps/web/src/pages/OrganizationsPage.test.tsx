import { describe, expect, it } from 'vitest';
import { failWith, render, testQueryClient } from '../test/render';
import { OrganizationsPage } from './OrganizationsPage';

describe('OrganizationsPage', () => {
  it('shows why the list could not be loaded', async () => {
    const queryClient = testQueryClient();
    await queryClient.prefetchQuery({
      queryKey: ['organizations'],
      queryFn: failWith(403, 'Accès refusé'),
    });
    expect(render(queryClient, <OrganizationsPage />)).toContain('Accès refusé');
  });
});
