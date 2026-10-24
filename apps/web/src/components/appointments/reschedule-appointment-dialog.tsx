import type { Appointment } from '@medical-ins/shared';
import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRescheduleAppointment } from '@/lib/appointments';
import { localPartsOf, toInstant } from '@/lib/format';
import { type Slot, SlotFields } from './slot-fields';

const slotOf = (a: Appointment): Slot => ({
  doctorId: a.doctorId,
  ...localPartsOf(a.startsAt),
  duration: String(a.durationMinutes),
});

/** Moves a scheduled appointment to another time, length or doctor of the center. */
export function RescheduleAppointmentDialog({
  centerId,
  appointment,
}: {
  centerId: string;
  appointment: Appointment;
}) {
  const [open, setOpen] = useState(false);
  const reschedule = useRescheduleAppointment(centerId);
  const [slot, setSlot] = useState(() => slotOf(appointment));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    reschedule.mutate(
      {
        id: appointment.id,
        doctorId: slot.doctorId,
        startsAt: toInstant(slot.date, slot.time),
        durationMinutes: Number(slot.duration),
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Start from the appointment as it is now, not as it was when the row first rendered.
        if (next) setSlot(slotOf(appointment));
        else reschedule.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Déplacer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déplacer le rendez-vous</DialogTitle>
          <DialogDescription>
            {appointment.patient.lastName} {appointment.patient.firstNames}
          </DialogDescription>
        </DialogHeader>
        {reschedule.error && <ErrorAlert error={reschedule.error} />}
        <form className="grid gap-4" onSubmit={submit}>
          <SlotFields centerId={centerId} value={slot} onChange={setSlot} />
          <Button type="submit" disabled={reschedule.isPending}>
            Enregistrer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
