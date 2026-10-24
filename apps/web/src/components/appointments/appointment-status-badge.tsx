import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '@medical-ins/shared';
import { Badge } from '@/components/ui/badge';

const VARIANTS = {
  scheduled: 'outline',
  arrived: 'default',
  completed: 'secondary',
  cancelled: 'secondary',
  no_show: 'destructive',
} as const satisfies Record<AppointmentStatus, string>;

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={VARIANTS[status]}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>;
}
