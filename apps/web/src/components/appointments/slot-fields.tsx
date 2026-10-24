import { APPOINTMENT_DURATIONS } from '@medical-ins/shared';
import { ErrorAlert } from '@/components/error-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDoctors } from '@/lib/appointments';
import { localToday } from '@/lib/format';

/** A slot as the form holds it: local date and time, minutes as text (Select values). */
export type Slot = { doctorId: string; date: string; time: string; duration: string };

/** The doctor, day, time and length of an appointment, shared by booking and rescheduling. */
export function SlotFields({
  centerId,
  value,
  onChange,
}: {
  centerId: string;
  value: Slot;
  onChange: (slot: Slot) => void;
}) {
  const doctors = useDoctors(centerId);
  const set = (change: Partial<Slot>) => onChange({ ...value, ...change });
  return (
    <>
      {doctors.error && <ErrorAlert error={doctors.error} />}
      <div className="grid gap-2">
        <Label htmlFor="doctor">Médecin</Label>
        <Select value={value.doctorId} onValueChange={(doctorId) => set({ doctorId })} required>
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
            value={value.date}
            onChange={(e) => set({ date: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="time">Heure</Label>
          <Input
            id="time"
            type="time"
            step={300}
            value={value.time}
            onChange={(e) => set({ time: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="duration">Durée</Label>
          <Select value={value.duration} onValueChange={(duration) => set({ duration })}>
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
    </>
  );
}
