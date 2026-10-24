import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import { clearSession } from './auth';

/** A 401 from any request means the session expired or was revoked: sign the user out. */
export function createQueryClient(): QueryClient {
  const onError = (error: Error) => {
    if (error instanceof ApiError && error.status === 401) clearSession(queryClient);
  };
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return queryClient;
}
