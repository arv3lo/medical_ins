import { z } from 'zod';

const measure = (min: number, max: number) => z.number().min(min).max(max).optional();

/** Vital signs taken during a consultation; every measure is optional. */
export const vitalsSchema = z
  .object({
    temperatureC: measure(30, 45),
    systolicBp: measure(50, 260),
    diastolicBp: measure(30, 160),
    heartRate: measure(20, 250),
    respiratoryRate: measure(5, 80),
    spo2: measure(50, 100),
    weightKg: measure(0.5, 400),
    heightCm: measure(30, 250),
  })
  .strict();
export type Vitals = z.infer<typeof vitalsSchema>;
export type Vital = keyof Vitals;

export const VITAL_LABELS: Record<Vital, { label: string; unit: string }> = {
  temperatureC: { label: 'Température', unit: '°C' },
  systolicBp: { label: 'Tension systolique', unit: 'mmHg' },
  diastolicBp: { label: 'Tension diastolique', unit: 'mmHg' },
  heartRate: { label: 'Pouls', unit: 'bpm' },
  respiratoryRate: { label: 'Fréquence respiratoire', unit: '/min' },
  spo2: { label: 'SpO₂', unit: '%' },
  weightKg: { label: 'Poids', unit: 'kg' },
  heightCm: { label: 'Taille', unit: 'cm' },
};

/** A category (B54) or a subcategory (J06.9) of ICD-10. */
export const icd10CodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, 'Code CIM-10 invalide');

export const diagnosisInputSchema = z.object({
  code: icd10CodeSchema,
  primary: z.boolean(),
});

const diagnosesSchema = z
  .array(diagnosisInputSchema)
  .max(10)
  .refine((list) => list.filter((d) => d.primary).length <= 1, 'Un seul diagnostic principal')
  .refine((list) => new Set(list.map((d) => d.code)).size === list.length, 'Diagnostic en double');

const text = (max: number) => z.string().trim().max(max);

export const createConsultationInputSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  reason: text(500).min(1, 'Motif requis'),
});
export type CreateConsultationInput = z.infer<typeof createConsultationInputSchema>;

/** Editing a draft; `diagnoses`, when sent, replaces the whole list. */
export const updateConsultationInputSchema = z
  .object({
    reason: text(500).min(1, 'Motif requis'),
    examination: text(5000),
    vitals: vitalsSchema,
    notes: text(5000),
    diagnoses: diagnosesSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateConsultationInput = z.infer<typeof updateConsultationInputSchema>;

export const addendumInputSchema = z.object({
  content: text(5000).min(1, 'Texte requis'),
});

/** Why a draft cannot be signed yet, or null when it can. */
export function signingProblem(consultation: { diagnoses: { primary: boolean }[] }) {
  return consultation.diagnoses.some((d) => d.primary)
    ? null
    : 'Ajoutez un diagnostic principal avant de signer';
}

export const icd10QuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

export type Icd10Code = { code: string; label: string };

export type Diagnosis = Icd10Code & { primary: boolean };

export type Addendum = {
  id: string;
  content: string;
  createdAt: string;
  author: { fullName: string };
};

export type ConsultationSummary = {
  id: string;
  organizationId: string;
  patientId: string;
  doctorId: string;
  reason: string;
  signedAt: string | null;
  createdAt: string;
  doctor: { fullName: string };
  organization: { name: string };
  primaryDiagnosis: Icd10Code | null;
};

export type Consultation = Omit<ConsultationSummary, 'primaryDiagnosis'> & {
  appointmentId: string | null;
  examination: string | null;
  vitals: Vitals;
  notes: string | null;
  diagnoses: Diagnosis[];
  addenda: Addendum[];
};
