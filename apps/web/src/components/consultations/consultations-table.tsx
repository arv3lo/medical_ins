import type { ConsultationSummary } from '@medical-ins/shared';
import { Link } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatLocalDate } from '@/lib/format';
import { ConsultationStatusBadge } from './consultation-status-badge';

/** A patient's consultations in every center that shares the record. */
export function ConsultationsTable({
  centerId,
  consultations,
}: {
  centerId: string;
  consultations: ConsultationSummary[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Motif</TableHead>
          <TableHead>Diagnostic principal</TableHead>
          <TableHead>Médecin</TableHead>
          <TableHead>Centre</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {consultations.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link
                to={`/patients/${c.patientId}/consultations/${c.id}?centre=${centerId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {formatLocalDate(c.createdAt)}
              </Link>
            </TableCell>
            <TableCell>{c.reason}</TableCell>
            <TableCell>
              {c.primaryDiagnosis
                ? `${c.primaryDiagnosis.code} · ${c.primaryDiagnosis.label}`
                : '—'}
            </TableCell>
            <TableCell>{c.doctor.fullName}</TableCell>
            <TableCell>{c.organization.name}</TableCell>
            <TableCell>
              <ConsultationStatusBadge signedAt={c.signedAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
