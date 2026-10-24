import { ORGANIZATION_TYPE_LABELS, ROLE_LABELS, type CurrentUser } from '@medical-ins/shared';
import { useOutletContext } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function HomePage() {
  const user = useOutletContext<CurrentUser>();

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Bonjour {user.fullName}</h1>
      {user.memberships.length === 0 ? (
        <p className="text-muted-foreground">
          Vous n'êtes rattaché à aucune organisation pour le moment.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rôle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {user.memberships.map((m) => (
              <TableRow key={`${m.organizationId}-${m.role}`}>
                <TableCell>{m.organizationName}</TableCell>
                <TableCell>{ORGANIZATION_TYPE_LABELS[m.organizationType]}</TableCell>
                <TableCell>{ROLE_LABELS[m.role]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
