import type { CurrentUser, LoginInput } from '@medical-ins/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';

export const ME_KEY = ['auth', 'me'];

export function useCurrentUser() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<CurrentUser>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => clearSession(queryClient),
  });
}

/** Forgets the user and everything cached under their session; the layout then shows login. */
export function clearSession(queryClient: QueryClient): void {
  queryClient.setQueryData(ME_KEY, null);
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
}
