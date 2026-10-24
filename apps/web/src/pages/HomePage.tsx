import { ORGANIZATION_TYPE_LABELS, ROLE_LABELS, type CurrentUser } from '@medical-ins/shared';
import { useOutletContext } from 'react-router';

export function HomePage() {
  const user = useOutletContext<CurrentUser>();

  return (
    <section>
      <h1>Bonjour {user.fullName}</h1>
      {user.memberships.length === 0 ? (
        <p>Vous n'êtes rattaché à aucune organisation pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Type</th>
              <th>Rôle</th>
            </tr>
          </thead>
          <tbody>
            {user.memberships.map((m) => (
              <tr key={`${m.organizationId}-${m.role}`}>
                <td>{m.organizationName}</td>
                <td>{ORGANIZATION_TYPE_LABELS[m.organizationType]}</td>
                <td>{ROLE_LABELS[m.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
