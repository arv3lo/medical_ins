import type { CreatePatientInput, PatientSummary, UpdatePatientInput } from '@medical-ins/shared';
import { and, asc, eq, exists, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import { affiliations, organizations, patientCenterLinks, patients } from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { escapeLike } from '../../lib/sql.js';

type Patient = typeof patients.$inferSelect;

const SEARCH_LIMIT = 50;

const CIN_TAKEN = 'Un patient existe déjà avec ce CIN';

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

type DuplicateQuery = Pick<CreatePatientInput, 'lastName' | 'birthDate' | 'nationalId'> & {
  allowDuplicate?: boolean;
};

/**
 * Refuses a patient that is probably someone already registered, in any center: same CIN, or same
 * last name and birth date. A CIN match is always a conflict; a name match only until confirmed.
 * Holds a lock on the name and birth date until the transaction ends, so that two registrations
 * of the same person without CIN cannot both pass the check.
 */
async function requireNoDuplicate(tx: Tx, input: DuplicateQuery, patientId?: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(lower(${input.lastName}::text) || ${input.birthDate}::text))`,
  );
  const { duplicates, sameNationalId } = await findDuplicates(tx, input, patientId);
  if (duplicates.length === 0) return;
  const message = sameNationalId ? CIN_TAKEN : 'Ce patient semble déjà enregistré';
  throw new HttpError(409, message, { duplicates, sameNationalId });
}

async function findDuplicates(
  tx: Tx,
  input: DuplicateQuery,
  patientId?: string,
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
  const notSelf = patientId ? ne(patients.id, patientId) : undefined;
  const rows = await tx
    .select({ ...summary, nationalId: patients.nationalId })
    .from(patients)
    .where(and(match, notSelf))
    .limit(10);
  return {
    duplicates: rows.map(({ nationalId, ...rest }) => rest),
    sameNationalId: !!input.nationalId && rows.some((r) => r.nationalId === input.nationalId),
  };
}

export function searchPatients(db: Db, organizationId: string, query = '') {
  const conditions: SQL[] = [eq(patientCenterLinks.organizationId, organizationId)];
  const match = query ? matchPatient(db, query) : undefined;
  if (match) conditions.push(match);
  return db
    .select({ patient: patients })
    .from(patients)
    .innerJoin(patientCenterLinks, eq(patientCenterLinks.patientId, patients.id))
    .where(and(...conditions))
    .orderBy(asc(patients.lastName), asc(patients.firstNames))
    .limit(SEARCH_LIMIT)
    .then((rows) => rows.map((r) => r.patient));
}

/** Name, CIN prefix, phone digits whatever their spacing, or member number prefix. */
function matchPatient(db: Db, query: string) {
  const digits = query.replace(/\D/g, '');
  const byMemberNumber = exists(
    db
      .select({ one: sql`1` })
      .from(affiliations)
      .where(
        and(
          eq(affiliations.patientId, patients.id),
          ilike(affiliations.memberNumber, `${escapeLike(query)}%`),
        ),
      ),
  );
  if (digits.length > 0 && digits.length === query.replace(/\s/g, '').length) {
    return or(
      ilike(patients.nationalId, `${digits}%`),
      sql`regexp_replace(${patients.phone}, '\\D', '', 'g') LIKE ${`%${digits}%`}`,
      byMemberNumber,
    );
  }
  return or(
    ilike(sql`${patients.lastName} || ' ' || ${patients.firstNames}`, `%${escapeLike(query)}%`),
    byMemberNumber,
  );
}

export async function insertPatient(tx: Tx, organizationId: string, input: CreatePatientInput) {
  await requireNoDuplicate(tx, input);
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

export async function updatePatient(tx: Tx, before: Patient, input: UpdatePatientInput) {
  if (input.nationalId) await requireFreeNationalId(tx, before.id, input.nationalId);
  const lastName = input.lastName ?? before.lastName;
  const birthDate = input.birthDate ?? before.birthDate;
  // Only a change can make the patient look like someone else: a confirmed homonym stays editable.
  if (lastName.toLowerCase() !== before.lastName.toLowerCase() || birthDate !== before.birthDate) {
    await requireNoDuplicate(tx, { lastName, birthDate }, before.id);
  }
  const [patient] = await tx
    .update(patients)
    .set(input)
    .where(eq(patients.id, before.id))
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
