import { NavLink, Navigate, Outlet } from 'react-router';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser, useLogout } from './lib/auth';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm text-muted-foreground transition-colors hover:text-foreground',
    isActive && 'font-semibold text-foreground',
  );

export function Layout() {
  const { data: user, isPending, error, refetch } = useCurrentUser();
  const logout = useLogout();

  if (isPending) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  // Only a 401 means "logged out" (useCurrentUser maps it to null); anything else is an outage.
  if (error) {
    return (
      <main className="mx-auto grid max-w-md gap-4 p-8">
        <ErrorAlert error={error} />
        <Button variant="outline" onClick={() => refetch()}>
          Réessayer
        </Button>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-svh">
      <header className="flex items-center gap-6 border-b bg-card px-6 py-3">
        <strong>Medical Ins</strong>
        <nav className="flex flex-1 gap-4">
          <NavLink to="/" end className={navLinkClass}>
            Accueil
          </NavLink>
          {user.isSuperAdmin && (
            <NavLink to="/organizations" className={navLinkClass}>
              Organisations
            </NavLink>
          )}
        </nav>
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <Button variant="outline" size="sm" onClick={() => logout.mutate()}>
          Déconnexion
        </Button>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <Outlet context={user} />
      </main>
    </div>
  );
}
