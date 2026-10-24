import { type FormEvent, useState } from 'react';
import { Navigate } from 'react-router';
import { useCurrentUser, useLogin } from '../lib/auth';

export function LoginPage() {
  const { data: user } = useCurrentUser();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to="/" replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <main className="auth">
      <form className="card" onSubmit={onSubmit}>
        <h1>Connexion</h1>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {login.error && <p className="error">{login.error.message}</p>}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
