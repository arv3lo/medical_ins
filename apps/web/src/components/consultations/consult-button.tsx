import type { Appointment } from '@medical-ins/shared';
import { StethoscopeIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useStartConsultation } from '@/lib/consultations';

/** Opens the consultation of an appointment: a new draft, or the one already started. */
export function ConsultButton({
  centerId,
  appointment,
}: {
  centerId: string;
  appointment: Appointment;
}) {
  const navigate = useNavigate();
  const start = useStartConsultation(centerId);
  const open = (consultationId: string) =>
    navigate(
      `/patients/${appointment.patientId}/consultations/${consultationId}?centre=${centerId}`,
    );

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={start.isPending}
      onClick={() =>
        start.mutate(
          {
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            reason: appointment.reason || 'Consultation',
          },
          {
            onSuccess: (c) => open(c.id),
            onError: (error) => {
              const existing = error instanceof ApiError && error.details.consultationId;
              if (typeof existing === 'string') open(existing);
            },
          },
        )
      }
    >
      <StethoscopeIcon />
      Consulter
    </Button>
  );
}
