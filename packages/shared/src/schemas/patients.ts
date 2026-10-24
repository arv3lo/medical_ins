import { z } from 'zod';
import { isoDateSchema, today } from './dates.js';

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export const SEX_LABELS: Record<Sex, string> = { female: 'Femme', male: 'Homme' };

const optionalText = (max: number) => z.string().trim().max(max).optional();

const patientFields = {
  lastName: z.string().trim().min(1).max(100),
  firstNames: z.string().trim().min(1).max(200),
  birthDate: isoDateSchema.refine(
    (value) => value <= today(),
    'La date de naissance ne peut pas être dans le futur',
  ),
  sex: z.enum(SEXES),
  /** Malagasy national ID card (CIN): 12 digits, spaces allowed on input. */
  nationalId: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{12}$/, 'Le CIN compte 12 chiffres'))
    .optional(),
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
