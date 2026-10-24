import {
  canChangeAppointmentStatus,
  isStatusChangeDue,
  type AppointmentStatus,
} from '@medical-ins/shared';
import { Button } from '@/components/ui/button';

const ACTIONS: { to: AppointmentStatus; label: string; variant: 'default' | 'outline' }[] = [
  { to: 'arrived', label: 'Arrivé', variant: 'default' },
  { to: 'completed', label: 'Terminé', variant: 'default' },
  { to: 'no_show', label: 'Absent', variant: 'outline' },
  { to: 'cancelled', label: 'Annuler', variant: 'outline' },
];

/** The status changes the rules allow from `status` at `now`, as buttons. */
export function AppointmentActions({
  status,
  startsAt,
  now = new Date(),
  pending,
  onChange,
}: {
  status: AppointmentStatus;
  startsAt: string;
  now?: Date;
  pending: boolean;
  onChange: (to: AppointmentStatus) => void;
}) {
  const actions = ACTIONS.filter(
    (a) =>
      canChangeAppointmentStatus(status, a.to) && isStatusChangeDue(a.to, new Date(startsAt), now),
  );
  if (actions.length === 0) return null;
  return (
    <div className="flex justify-end gap-2">
      {actions.map((a) => (
        <Button
          key={a.to}
          size="sm"
          variant={a.variant}
          disabled={pending}
          onClick={() => onChange(a.to)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
