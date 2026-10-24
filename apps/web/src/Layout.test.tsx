import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';
import { ME_KEY } from './lib/auth';
import { failWith, render, testQueryClient } from './test/render';

describe('Layout', () => {
  it('reports a server error instead of sending the user to the login page', async () => {
    const queryClient = testQueryClient();
    await queryClient.prefetchQuery({ queryKey: ME_KEY, queryFn: failWith(500, 'Erreur interne') });
    expect(render(queryClient, <Layout />)).toContain('Erreur interne');
  });

  it('fades each page in', () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(ME_KEY, {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.mg',
      fullName: 'Test User',
      isSuperAdmin: false,
      memberships: [],
    });
    expect(render(queryClient, <Layout />)).toMatch(/<main[^>]*animate__animated animate__fadeIn/);
  });
});
