import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../lib/api';

/** A client whose cached errors stay errors when rendered (no refetch on mount). */
export const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });

export const failWith = (status: number, message: string) => () =>
  Promise.reject(new ApiError(status, message));

/** Renders to HTML in Node: enough to check what a page shows for a given cache state. */
export const render = (queryClient: QueryClient, ui: ReactNode) =>
  renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
