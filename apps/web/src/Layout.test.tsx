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
});
