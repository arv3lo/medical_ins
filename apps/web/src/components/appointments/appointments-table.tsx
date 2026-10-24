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
import { ErrorAlert } from '@/components/error-alert';
import { AppointmentActions } from './appointment-actions';
import { AppointmentStatusBadge } from './appointment-status-badge';
import { RescheduleAppointmentDialog } from './reschedule-appointment-dialog';

/** Only an appointment still to come can move; a past one can only be closed (P2.3). */
const isMovable = (a: Appointment) =>
  a.status === 'scheduled' && Date.parse(a.startsAt) > Date.now();

/** Appointments of a center; `showDate` for lists spanning several days. */
export function AppointmentsTable({
  centerId,
  appointments,
  canManage,
  showDate = false,
  showPatient = true,
}: {
  centerId: string;
  appointments: Appointment[];
  canManage: boolean;
  showDate?: boolean;
  showPatient?: boolean;
}) {
  const change = useChangeAppointmentStatus(centerId);
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
            {canManage && <TableHead />}
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
              {canManage && (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {isMovable(a) && (
                      <RescheduleAppointmentDialog centerId={centerId} appointment={a} />
                    )}
                    <AppointmentActions
                      status={a.status}
                      startsAt={a.startsAt}
                      pending={change.isPending}
                      onChange={(status) => change.mutate({ id: a.id, status })}
                    />
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
