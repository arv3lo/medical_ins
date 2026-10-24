import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';
import { ME_KEY } from './lib/auth';
import { failWith, render, testQueryClient } from './test/render';
import { CENTER_A, INSURER, member, userWith } from './test/users';

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

  it('shows the patients menu only to roles that can read patients', () => {
    const withUser = (user: ReturnType<typeof userWith>) => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(ME_KEY, user);
      return render(queryClient, <Layout />);
    };
    expect(withUser(userWith(member(CENTER_A, 'reception')))).toContain('Patients');
    expect(withUser(userWith(member(INSURER, 'insurer_manager')))).not.toContain('Patients');
  });

  it('shows the insured menu to insurer managers only', () => {
    const withUser = (user: ReturnType<typeof userWith>) => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(ME_KEY, user);
      return render(queryClient, <Layout />);
    };
    expect(withUser(userWith(member(INSURER, 'insurer_manager')))).toContain('Assurés');
    expect(withUser(userWith(member(CENTER_A, 'reception')))).not.toContain('Assurés');
  });

  it('shows the agenda to reception and care roles', () => {
    const withUser = (user: ReturnType<typeof userWith>) => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(ME_KEY, user);
      return render(queryClient, <Layout />);
    };
    expect(withUser(userWith(member(CENTER_A, 'doctor')))).toContain('Agenda');
    expect(withUser(userWith(member(CENTER_A, 'billing')))).not.toContain('Agenda');
  });
});
