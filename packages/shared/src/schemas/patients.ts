import { z } from 'zod';

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export const SEX_LABELS: Record<Sex, string> = { female: 'Femme', male: 'Homme' };

const MIN_YEAR = 1900;

/**
 * A real calendar day: `Date.parse` rolls 2023-02-30 over to March 2, so the date must read back
 * unchanged once built from its parts.
 */
const isCalendarDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= MIN_YEAR && date.toISOString().slice(0, 10) === value;
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine(isCalendarDate, 'Date invalide');

/** Absent leaves the field as it is; null clears it (an emptied form field). */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const patientFields = {
  lastName: z.string().trim().min(1).max(100),
  firstNames: z.string().trim().min(1).max(200),
  birthDate: isoDate.refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    'La date de naissance ne peut pas être dans le futur',
  ),
  sex: z.enum(SEXES),
  /** Malagasy national ID card (CIN): 12 digits, spaces allowed on input. */
  nationalId: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{12}$/, 'Le CIN compte 12 chiffres'))
    .nullish(),
  phone: optionalText(30),
  address: optionalText(500),
  region: optionalText(100),
};

export const createPatientInputSchema = z.object({
  ...patientFields,
  /** Set after the user confirmed that a probable duplicate is a different person. */
  allowDuplicate: z.boolean().optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientInputSchema>;

export const updatePatientInputSchema = z
  .object(patientFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdatePatientInput = z.infer<typeof updatePatientInputSchema>;

/** A patient as the API returns it: absent optional fields come back as null. */
export type Patient = {
  id: string;
  lastName: string;
  firstNames: string;
  birthDate: string;
  sex: Sex;
  nationalId: string | null;
  phone: string | null;
  address: string | null;
  region: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What a duplicate warning reveals about a patient registered by another center. */
export type PatientSummary = Pick<Patient, 'id' | 'lastName' | 'firstNames' | 'birthDate' | 'sex'>;

export const patientSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});
