import { z } from 'zod';

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'arrived',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Prévu',
  arrived: 'Arrivé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absent',
};

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ['arrived', 'cancelled', 'no_show'],
  arrived: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canChangeAppointmentStatus(from: AppointmentStatus, to: AppointmentStatus) {
  return TRANSITIONS[from].includes(to);
}

/** Patients often come early: their arrival can be recorded up to this long before the start. */
export const EARLY_ARRIVAL_MINUTES = 60;

/**
 * Whether `to` may be recorded `now` for an appointment starting at `startsAt`. A no-show or a
 * completion only makes sense once the start has passed; a cancellation is possible at any time.
 * This keeps a mis-click on « Absent » weeks ahead from freeing the doctor's slot.
 */
export function isStatusChangeDue(to: AppointmentStatus, startsAt: Date, now: Date) {
  if (to === 'cancelled') return true;
  const margin = to === 'arrived' ? EARLY_ARRIVAL_MINUTES * 60_000 : 0;
  return now.getTime() >= startsAt.getTime() - margin;
}

/** An instant with an explicit offset, normalized to UTC ISO so the API compares like with like. */
const instantSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const APPOINTMENT_DURATIONS = [10, 15, 20, 30, 45, 60] as const;

const durationSchema = z
  .number()
  .int()
  .min(5)
  .max(240)
  .refine((minutes) => minutes % 5 === 0, 'Durée par pas de 5 minutes');

export const createAppointmentInputSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  startsAt: instantSchema,
  durationMinutes: durationSchema,
  reason: z.string().trim().max(500).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;

/** Moving a scheduled appointment: time, length, doctor or reason. */
export const rescheduleAppointmentInputSchema = createAppointmentInputSchema
  .omit({ patientId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentInputSchema>;

export const changeAppointmentStatusInputSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

/** The longest range one list may cover: a quarter, enough for a patient's recent and next visits. */
export const MAX_APPOINTMENT_RANGE_DAYS = 92;

/** A list always covers a bounded range, [from, to), so it never returns a center's whole history. */
export const appointmentQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    doctorId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
  })
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      return days > 0 && days <= MAX_APPOINTMENT_RANGE_DAYS;
    },
    { message: `Période de ${MAX_APPOINTMENT_RANGE_DAYS} jours au plus`, path: ['to'] },
  );
export type AppointmentQuery = z.infer<typeof appointmentQuerySchema>;

export type Appointment = {
  id: string;
  organizationId: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  reason: string | null;
  status: AppointmentStatus;
  patient: { lastName: string; firstNames: string };
  doctor: { fullName: string };
};
