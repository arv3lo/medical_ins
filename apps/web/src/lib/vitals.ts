import { VITAL_LABELS, type Vital, type Vitals } from '@medical-ins/shared';

export const VITALS = Object.keys(VITAL_LABELS) as Vital[];

export type VitalsForm = Record<Vital, string>;

/** Form text → measures, leaving out the empty fields; "39,2" reads as 39.2. */
export function toVitals(form: Partial<VitalsForm>): Vitals {
  const vitals: Vitals = {};
  for (const vital of VITALS) {
    const text = form[vital]?.trim().replace(',', '.');
    if (text) vitals[vital] = Number(text);
  }
  return vitals;
}

export function toVitalsForm(vitals: Vitals): VitalsForm {
  return Object.fromEntries(
    VITALS.map((vital) => [vital, vitals[vital]?.toString() ?? '']),
  ) as VitalsForm;
}

export function formatVital(vital: Vital, value: number): string {
  return `${value.toLocaleString('fr-FR')} ${VITAL_LABELS[vital].unit}`;
}
