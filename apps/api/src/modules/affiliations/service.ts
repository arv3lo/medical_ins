import type { AffiliationStatus, CreateAffiliationInput } from '@medical-ins/shared';
import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import { affiliations, organizations, patients } from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';

export async function requireInsurer(db: Db | Tx, organizationId: string): Promise<void> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (organization?.type !== 'insurer') throw notFound('Assureur');
}

const withInsurerName = { ...getTableColumns(affiliations), insurerName: organizations.name };

export function listPatientAffiliations(db: Db, patientId: string) {
  return db
    .select(withInsurerName)
    .from(affiliations)
    .innerJoin(organizations, eq(organizations.id, affiliations.insurerId))
    .where(eq(affiliations.patientId, patientId))
    .orderBy(desc(affiliations.startsOn));
}

/** The insurer's view: who is covered, never what they were treated for. */
export async function listInsurerAffiliations(
  db: Db,
  insurerId: string,
  status?: AffiliationStatus,
) {
  const rows = await db
    .select({
      affiliation: withInsurerName,
      patient: {
        lastName: patients.lastName,
        firstNames: patients.firstNames,
        birthDate: patients.birthDate,
        nationalId: patients.nationalId,
      },
    })
    .from(affiliations)
    .innerJoin(organizations, eq(organizations.id, affiliations.insurerId))
    .innerJoin(patients, eq(patients.id, affiliations.patientId))
    .where(
      and(
        eq(affiliations.insurerId, insurerId),
        status ? eq(affiliations.status, status) : undefined,
      ),
    )
    .orderBy(affiliations.createdAt);
  return rows.map(({ affiliation, patient }) => ({ ...affiliation, patient }));
}

export async function insertAffiliation(
  tx: Tx,
  values: CreateAffiliationInput & { patientId: string; declaredByOrganizationId: string },
) {
  const [created] = await tx.insert(affiliations).values(values).onConflictDoNothing().returning();
  if (!created) {
    throw new HttpError(
      409,
      "Ce numéro d'assuré est déjà attribué à un titulaire chez cet assureur",
    );
  }
  return created;
}

/** Validation and rejection are final: only a pending affiliation can be decided. */
export async function decideAffiliation(
  tx: Tx,
  insurerId: string,
  affiliationId: string,
  decision: { status: 'validated' } | { status: 'rejected'; rejectionReason: string },
) {
  const before = await tx.query.affiliations.findFirst({
    where: and(eq(affiliations.id, affiliationId), eq(affiliations.insurerId, insurerId)),
  });
  if (!before) throw notFound('Affiliation');
  const alreadyDecided = new HttpError(409, 'Cette affiliation a déjà été traitée');
  if (before.status !== 'pending') throw alreadyDecided;
  // Conditional, so that a concurrent decision made since the read leaves nothing to update.
  const [after] = await tx
    .update(affiliations)
    .set(decision)
    .where(and(eq(affiliations.id, affiliationId), eq(affiliations.status, 'pending')))
    .returning();
  if (!after) throw alreadyDecided;
  return { before, after };
}
