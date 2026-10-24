import { APPOINTMENT_DURATIONS, type Patient } from '@medical-ins/shared';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBookAppointment, useDoctors } from '@/lib/appointments';
import { localToday, toInstant } from '@/lib/format';

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
  const doctors = useDoctors(centerId);
  const book = useBookAppointment(centerId);
  const [patient, setPatient] = useState<Picked | null>(fixedPatient ?? null);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(initialDate ?? localToday());
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('20');
  const [reason, setReason] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!patient) return;
    book.mutate(
      {
        patientId: patient.id,
        doctorId,
        startsAt: toInstant(date, time),
        durationMinutes: Number(duration),
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTime('');
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
        if (next) setDate(initialDate ?? localToday());
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
        {doctors.error && <ErrorAlert error={doctors.error} />}
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
          <div className="grid gap-2">
            <Label htmlFor="doctor">Médecin</Label>
            <Select value={doctorId} onValueChange={setDoctorId} required>
              <SelectTrigger id="doctor" className="w-full">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {doctors.data?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                min={localToday()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time">Heure</Label>
              <Input
                id="time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Durée</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">Motif (facultatif)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" disabled={book.isPending || !patient || !doctorId}>
            Réserver
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
