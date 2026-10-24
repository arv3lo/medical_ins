import type { Appointment } from '@medical-ins/shared';
import { Link } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useChangeAppointmentStatus } from '@/lib/appointments';
import { formatLocalDate, formatTime } from '@/lib/format';
import { ConsultButton } from '@/components/consultations/consult-button';
import { ErrorAlert } from '@/components/error-alert';
import { AppointmentActions } from './appointment-actions';
import { AppointmentStatusBadge } from './appointment-status-badge';

const OPEN = ['scheduled', 'arrived'];

/**
 * Appointments of a center; `showDate` for lists spanning several days. `consultAs`, a doctor's
 * id, lets that doctor open the consultation of their own open appointments.
 */
export function AppointmentsTable({
  centerId,
  appointments,
  canManage,
  showDate = false,
  showPatient = true,
  consultAs,
}: {
  centerId: string;
  appointments: Appointment[];
  canManage: boolean;
  showDate?: boolean;
  showPatient?: boolean;
  consultAs?: string;
}) {
  const change = useChangeAppointmentStatus(centerId);
  const hasActions = canManage || Boolean(consultAs);
  return (
    <div className="grid gap-4">
      {change.error && <ErrorAlert error={change.error} />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{showDate ? 'Date' : 'Heure'}</TableHead>
            {showPatient && <TableHead>Patient</TableHead>}
            <TableHead>Médecin</TableHead>
            <TableHead>Motif</TableHead>
            <TableHead>Statut</TableHead>
            {hasActions && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                {showDate && `${formatLocalDate(a.startsAt)} `}
                {formatTime(a.startsAt)}
                <span className="text-muted-foreground"> · {a.durationMinutes} min</span>
              </TableCell>
              {showPatient && (
                <TableCell>
                  <Link
                    to={`/patients/${a.patientId}?centre=${centerId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {a.patient.lastName} {a.patient.firstNames}
                  </Link>
                </TableCell>
              )}
              <TableCell>{a.doctor.fullName}</TableCell>
              <TableCell>{a.reason ?? '—'}</TableCell>
              <TableCell>
                <AppointmentStatusBadge status={a.status} />
              </TableCell>
              {hasActions && (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {a.doctorId === consultAs && OPEN.includes(a.status) && (
                      <ConsultButton centerId={centerId} appointment={a} />
                    )}
                    {canManage && (
                      <AppointmentActions
                        status={a.status}
                        pending={change.isPending}
                        onChange={(status) => change.mutate({ id: a.id, status })}
                      />
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
