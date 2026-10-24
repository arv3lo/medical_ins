import type { Patient } from '@medical-ins/shared';
import { CalendarPlusIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { PatientPicker } from '@/components/patients/patient-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBookAppointment } from '@/lib/appointments';
import { localToday, toInstant } from '@/lib/format';
import { type Slot, SlotFields } from './slot-fields';

type Picked = Pick<Patient, 'id' | 'lastName' | 'firstNames'>;

/** Books a slot; `patient` skips the patient search (booking from the patient's page). */
export function BookAppointmentDialog({
  centerId,
  patient: fixedPatient,
  date: initialDate,
}: {
  centerId: string;
  patient?: Picked;
  date?: string;
}) {
  const [open, setOpen] = useState(false);
  const book = useBookAppointment(centerId);
  const [patient, setPatient] = useState<Picked | null>(fixedPatient ?? null);
  const [slot, setSlot] = useState<Slot>({
    doctorId: '',
    date: initialDate ?? localToday(),
    time: '',
    duration: '20',
  });
  const [reason, setReason] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    book.mutate(
      {
        patientId: patient.id,
        doctorId: slot.doctorId,
        startsAt: toInstant(slot.date, slot.time),
        durationMinutes: Number(slot.duration),
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setSlot((current) => ({ ...current, time: '' }));
          setReason('');
          if (!fixedPatient) setPatient(null);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Open on the day the agenda shows now, not the one it showed when first rendered.
        if (next) setSlot((current) => ({ ...current, date: initialDate ?? localToday() }));
        else book.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size={fixedPatient ? 'sm' : 'default'}
          variant={fixedPatient ? 'outline' : 'default'}
        >
          <CalendarPlusIcon />
          {fixedPatient ? 'Prendre rendez-vous' : 'Nouveau rendez-vous'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
        </DialogHeader>
        {book.error && <ErrorAlert error={book.error} />}
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label>Patient</Label>
            {fixedPatient ? (
              <p className="font-medium">
                {fixedPatient.lastName} {fixedPatient.firstNames}
              </p>
            ) : (
              <PatientPicker centerId={centerId} value={patient} onChange={setPatient} />
            )}
          </div>
          <SlotFields centerId={centerId} value={slot} onChange={setSlot} />
          <div className="grid gap-2">
            <Label htmlFor="reason">Motif (facultatif)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" disabled={book.isPending || !patient || !slot.doctorId}>
            Réserver
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
