import { NavLink, Navigate, Outlet } from 'react-router';
import { useCurrentUser, useLogout } from './lib/auth';

export function Layout() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();

  if (isPending) return <p className="loading">Chargement…</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="shell">
      <header>
        <strong>Medical Ins</strong>
        <nav>
          <NavLink to="/" end>
            Accueil
          </NavLink>
          {user.isSuperAdmin && <NavLink to="/organizations">Organisations</NavLink>}
        </nav>
        <span className="user">{user.email}</span>
        <button type="button" onClick={() => logout.mutate()}>
          Déconnexion
        </button>
      </header>
      <main>
        <Outlet context={user} />
      </main>
    </div>
  );
}
