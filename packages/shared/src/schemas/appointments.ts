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

/** Statuses that still hold the doctor's time slot. */
export const SLOT_HOLDING_STATUSES = ['scheduled', 'arrived', 'completed'] as const;

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

export const appointmentQuerySchema = z.object({
  from: instantSchema.optional(),
  to: instantSchema.optional(),
  doctorId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
});

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
