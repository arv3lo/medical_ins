import type { AppointmentQuery, CurrentUser } from '@medical-ins/shared';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { AppointmentsTable } from '@/components/appointments/appointments-table';
import { BookAppointmentDialog } from '@/components/appointments/book-appointment-dialog';
import { CenterPicker } from '@/components/center-picker';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
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
import { dayRange, daysRange, localToday, weekRange } from '@/lib/format';
import { useCenterParam } from '@/lib/use-center-param';

const ALL = 'all';
/** How far ahead « Mes rendez-vous » looks. */
const MY_DAYS = 30;

export type AgendaView = 'day' | 'week' | 'mine';

export function AgendaPage() {
  const user = useOutletContext<CurrentUser>();
  const { centers, centerId, setCenterId } = useCenterParam(user, 'appointment.read');
  const [view, setView] = useState<AgendaView>('day');

  if (!centerId) return <p className="text-muted-foreground">Aucun centre accessible.</p>;
  const canManage = canIn(user, centerId, 'appointment.manage');

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <CenterPicker centers={centers} value={centerId} onChange={setCenterId} />
      </div>
      {/* Keyed on the center: its doctor filter and day start over when the center changes. */}
      <CenterAgenda
        key={centerId}
        user={user}
        centerId={centerId}
        canManage={canManage}
        consultAs={canIn(user, centerId, 'medical_record.write') ? user.id : undefined}
        view={view}
        onViewChange={setView}
      />
    </section>
  );
}

const isDoctorIn = (user: CurrentUser, centerId: string) =>
  user.memberships.some((m) => m.organizationId === centerId && m.role === 'doctor');

/** The agenda of one center: a day or a week per doctor, or a doctor's own next appointments. */
export function CenterAgenda({
  user,
  centerId,
  canManage,
  consultAs,
  view: requestedView,
  onViewChange,
}: {
  user: CurrentUser;
  centerId: string;
  canManage: boolean;
  /** A doctor's id: lets them open the consultation of their own open appointments. */
  consultAs?: string;
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
}) {
  const isDoctor = isDoctorIn(user, centerId);
  // « Mes rendez-vous » only exists in a center where the user is a doctor.
  const view = requestedView === 'mine' && !isDoctor ? 'day' : requestedView;
  const [date, setDate] = useState(localToday());
  // A doctor who opens the agenda sees their own day first.
  const [doctorId, setDoctorId] = useState(isDoctor ? user.id : ALL);

  const views: [AgendaView, string][] = [
    ['day', 'Jour'],
    ['week', 'Semaine'],
    ...(isDoctor ? [['mine', 'Mes rendez-vous'] as [AgendaView, string]] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1" role="group" aria-label="Vue">
            {views.map(([value, label]) => (
              <Button
                key={value}
                variant={view === value ? 'default' : 'outline'}
                aria-pressed={view === value}
                onClick={() => onViewChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {view !== 'mine' && (
            <>
              <Input
                type="date"
                aria-label={view === 'week' ? 'Semaine du' : 'Jour'}
                className="w-44"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
              <DoctorFilter centerId={centerId} value={doctorId} onChange={setDoctorId} />
            </>
          )}
        </div>
        {canManage && <BookAppointmentDialog centerId={centerId} date={date} />}
      </div>
      {view === 'day' && (
        <AppointmentsList
          centerId={centerId}
          filter={{ ...dayRange(date), doctorId: doctorId === ALL ? undefined : doctorId }}
          canManage={canManage}
          consultAs={consultAs}
          empty="Aucun rendez-vous ce jour."
        />
      )}
      {view === 'week' && (
        <AppointmentsList
          centerId={centerId}
          filter={{ ...weekRange(date), doctorId: doctorId === ALL ? undefined : doctorId }}
          canManage={canManage}
          consultAs={consultAs}
          showDate
          empty="Aucun rendez-vous cette semaine."
        />
      )}
      {view === 'mine' && (
        <AppointmentsList
          centerId={centerId}
          filter={{ ...daysRange(localToday(), MY_DAYS), doctorId: user.id }}
          canManage={canManage}
          consultAs={consultAs}
          showDate
          empty={`Aucun rendez-vous dans les ${MY_DAYS} prochains jours.`}
        />
      )}
    </>
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

function AppointmentsList({
  centerId,
  filter,
  canManage,
  consultAs,
  showDate = false,
  empty,
}: {
  centerId: string;
  filter: AppointmentQuery;
  canManage: boolean;
  consultAs?: string;
  showDate?: boolean;
  empty: string;
}) {
  const appointments = useAppointments(centerId, filter);
  if (appointments.error) return <ErrorAlert error={appointments.error} />;
  if (!appointments.data) return <p className="text-muted-foreground">Chargement…</p>;
  if (appointments.data.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <AppointmentsTable
      centerId={centerId}
      appointments={appointments.data}
      canManage={canManage}
      consultAs={consultAs}
      showDate={showDate}
    />
  );
}
