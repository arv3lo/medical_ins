import type { CurrentUser } from '@medical-ins/shared';
import { MutationObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { failWith } from '../test/render';
import { ME_KEY } from './auth';
import { createQueryClient } from './query-client';

const signedIn = () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(ME_KEY, { id: 'u1' } as CurrentUser);
  queryClient.setQueryData(['organizations'], []);
  return queryClient;
};

describe('createQueryClient', () => {
  it('signs the user out when a query answers 401', async () => {
    const queryClient = signedIn();
    await queryClient.prefetchQuery({
      queryKey: ['organizations', 'members'],
      queryFn: failWith(401, 'Authentification requise'),
    });
    expect(queryClient.getQueryData(ME_KEY)).toBeNull();
    expect(queryClient.getQueryData(['organizations'])).toBeUndefined();
  });

  it('signs the user out when a mutation answers 401', async () => {
    const queryClient = signedIn();
    const mutation = new MutationObserver(queryClient, {
      mutationFn: failWith(401, 'Authentification requise'),
    });
    await mutation.mutate().catch(() => {});
    expect(queryClient.getQueryData(ME_KEY)).toBeNull();
  });

  it('keeps the user signed in on other errors', async () => {
    const queryClient = signedIn();
    await queryClient.prefetchQuery({
      queryKey: ['organizations', 'members'],
      queryFn: failWith(500, 'Erreur interne'),
    });
    expect(queryClient.getQueryData(ME_KEY)).toEqual({ id: 'u1' });
  });
});
