import type { CreatePatientInput, PatientSummary, UpdatePatientInput } from '@medical-ins/shared';
import { and, asc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import { organizations, patientCenterLinks, patients } from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';

const SEARCH_LIMIT = 50;

export const CIN_TAKEN = 'Un patient existe déjà avec ce CIN';

/** Patients only exist in health centers: any other organization id is unknown here. */
export async function requireHealthCenter(db: Db, organizationId: string): Promise<void> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (organization?.type !== 'health_center') throw notFound('Centre de santé');
}

/** The patient, if `organizationId` is one of the centers linked to them. */
export async function findLinkedPatient(db: Db | Tx, organizationId: string, patientId: string) {
  const [row] = await db
    .select({ patient: patients })
    .from(patients)
    .innerJoin(patientCenterLinks, eq(patientCenterLinks.patientId, patients.id))
    .where(and(eq(patients.id, patientId), eq(patientCenterLinks.organizationId, organizationId)));
  return row?.patient;
}

export async function requireLinkedPatient(db: Db | Tx, organizationId: string, patientId: string) {
  const patient = await findLinkedPatient(db, organizationId, patientId);
  if (!patient) throw notFound('Patient');
  return patient;
}

const summary = {
  id: patients.id,
  lastName: patients.lastName,
  firstNames: patients.firstNames,
  birthDate: patients.birthDate,
  sex: patients.sex,
};

/**
 * Patients that are probably the person being registered, in any center: same CIN, or same last
 * name and birth date. A CIN match is always a conflict; a name match only until confirmed.
 */
export async function findDuplicates(
  db: Db | Tx,
  input: CreatePatientInput,
): Promise<{ duplicates: PatientSummary[]; sameNationalId: boolean }> {
  const sameCin = input.nationalId ? eq(patients.nationalId, input.nationalId) : undefined;
  const sameNameAndBirth = input.allowDuplicate
    ? undefined
    : and(
        sql`lower(${patients.lastName}) = lower(${input.lastName})`,
        eq(patients.birthDate, input.birthDate),
      );
  const match = or(sameCin, sameNameAndBirth);
  if (!match) return { duplicates: [], sameNationalId: false };
  const rows = await db
    .select({ ...summary, nationalId: patients.nationalId })
    .from(patients)
    .where(match)
    .limit(10);
  return {
    duplicates: rows.map(({ nationalId, ...rest }) => rest),
    sameNationalId: !!input.nationalId && rows.some((r) => r.nationalId === input.nationalId),
  };
}

export function searchPatients(db: Db, organizationId: string, query = '') {
  const digits = query.replace(/\D/g, '');
  const conditions: SQL[] = [eq(patientCenterLinks.organizationId, organizationId)];
  if (query && digits.length === query.replace(/\s/g, '').length) {
    // Only digits: a CIN prefix or part of a phone number, whatever its spacing.
    const byDigits = or(
      ilike(patients.nationalId, `${digits}%`),
      sql`regexp_replace(${patients.phone}, '\\D', '', 'g') LIKE ${`%${digits}%`}`,
    );
    if (byDigits) conditions.push(byDigits);
  } else if (query) {
    conditions.push(
      ilike(sql`${patients.lastName} || ' ' || ${patients.firstNames}`, `%${escapeLike(query)}%`),
    );
  }
  return db
    .select({ patient: patients })
    .from(patients)
    .innerJoin(patientCenterLinks, eq(patientCenterLinks.patientId, patients.id))
    .where(and(...conditions))
    .orderBy(asc(patients.lastName), asc(patients.firstNames))
    .limit(SEARCH_LIMIT)
    .then((rows) => rows.map((r) => r.patient));
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function insertPatient(tx: Tx, organizationId: string, input: CreatePatientInput) {
  const { allowDuplicate, ...values } = input;
  const [patient] = await tx.insert(patients).values(values).onConflictDoNothing().returning();
  // Lost a race with another registration of the same CIN.
  if (!patient) throw new HttpError(409, CIN_TAKEN);
  await linkPatient(tx, organizationId, patient.id);
  return patient;
}

/** Idempotent: linking a patient twice to the same center changes nothing. */
export async function linkPatient(tx: Tx, organizationId: string, patientId: string) {
  const [link] = await tx
    .insert(patientCenterLinks)
    .values({ patientId, organizationId })
    .onConflictDoNothing()
    .returning();
  return link !== undefined;
}

export async function updatePatient(tx: Tx, patientId: string, input: UpdatePatientInput) {
  if (input.nationalId) await requireFreeNationalId(tx, patientId, input.nationalId);
  const [patient] = await tx
    .update(patients)
    .set(input)
    .where(eq(patients.id, patientId))
    .returning();
  return patient!;
}

/** A CIN belongs to one person: refuse it when another patient already has it. */
async function requireFreeNationalId(tx: Tx, patientId: string, nationalId: string) {
  const [taken] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.nationalId, nationalId), ne(patients.id, patientId)));
  if (taken) throw new HttpError(409, CIN_TAKEN);
}
