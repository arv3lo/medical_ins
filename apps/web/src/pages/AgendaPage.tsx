import type { CurrentUser } from '@medical-ins/shared';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { AppointmentsTable } from '@/components/appointments/appointments-table';
import { BookAppointmentDialog } from '@/components/appointments/book-appointment-dialog';
import { CenterPicker } from '@/components/center-picker';
import { ErrorAlert } from '@/components/error-alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppointments, useDoctors } from '@/lib/appointments';
import { canIn } from '@/lib/centers';
import { dayRange, localToday } from '@/lib/format';
import { useCenterParam } from '@/lib/use-center-param';

const ALL = 'all';

export function AgendaPage() {
  const user = useOutletContext<CurrentUser>();
  const { centers, centerId, setCenterId } = useCenterParam(user, 'appointment.read');
  const [date, setDate] = useState(localToday());
  // A doctor who opens the agenda sees their own day first.
  const [doctorId, setDoctorId] = useState(
    user.memberships.some((m) => m.organizationId === centerId && m.role === 'doctor')
      ? user.id
      : ALL,
  );

  if (!centerId) return <p className="text-muted-foreground">Aucun centre accessible.</p>;
  const canManage = canIn(user, centerId, 'appointment.manage');

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <div className="flex flex-wrap gap-2">
          <CenterPicker centers={centers} value={centerId} onChange={setCenterId} />
          {canManage && <BookAppointmentDialog centerId={centerId} date={date} />}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          aria-label="Jour"
          className="w-44"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <DoctorFilter centerId={centerId} value={doctorId} onChange={setDoctorId} />
      </div>
      <DayAppointments
        centerId={centerId}
        date={date}
        doctorId={doctorId === ALL ? undefined : doctorId}
        canManage={canManage}
      />
    </section>
  );
}

function DoctorFilter({
  centerId,
  value,
  onChange,
}: {
  centerId: string;
  value: string;
  onChange: (doctorId: string) => void;
}) {
  const doctors = useDoctors(centerId);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Médecin" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Tous les médecins</SelectItem>
        {doctors.data?.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DayAppointments({
  centerId,
  date,
  doctorId,
  canManage,
}: {
  centerId: string;
  date: string;
  doctorId?: string;
  canManage: boolean;
}) {
  const appointments = useAppointments(centerId, { ...dayRange(date), doctorId });
  if (appointments.error) return <ErrorAlert error={appointments.error} />;
  if (!appointments.data) return <p className="text-muted-foreground">Chargement…</p>;
  if (appointments.data.length === 0) {
    return <p className="text-muted-foreground">Aucun rendez-vous ce jour.</p>;
  }
  return (
    <AppointmentsTable centerId={centerId} appointments={appointments.data} canManage={canManage} />
  );
}
