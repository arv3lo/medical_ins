import type { AffiliationStatus, CreateAffiliationInput } from '@medical-ins/shared';
import { and, desc, eq, getTableColumns, type SQL } from 'drizzle-orm';
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

/**
 * The insurer's view (InsuredAffiliation): only what a decision needs. Not which center
 * declared it, which can hint at what the patient is treated for, nor internal ids.
 */
const insurerView = {
  id: affiliations.id,
  memberNumber: affiliations.memberNumber,
  holderStatus: affiliations.holderStatus,
  planName: affiliations.planName,
  employer: affiliations.employer,
  startsOn: affiliations.startsOn,
  endsOn: affiliations.endsOn,
  status: affiliations.status,
  rejectionReason: affiliations.rejectionReason,
  patient: {
    lastName: patients.lastName,
    firstNames: patients.firstNames,
    birthDate: patients.birthDate,
    nationalId: patients.nationalId,
  },
};

export function listInsurerAffiliations(db: Db, insurerId: string, status?: AffiliationStatus) {
  return db
    .select(insurerView)
    .from(affiliations)
    .innerJoin(patients, eq(patients.id, affiliations.patientId))
    .where(
      and(
        eq(affiliations.insurerId, insurerId),
        status ? eq(affiliations.status, status) : undefined,
      ),
    )
    .orderBy(affiliations.createdAt);
}

export async function insertAffiliation(
  tx: Tx,
  values: CreateAffiliationInput & { patientId: string; declaredByOrganizationId: string },
) {
  // DO NOTHING without a target also covers the holder number's exclusion constraint.
  const [created] = await tx.insert(affiliations).values(values).onConflictDoNothing().returning();
  if (!created) {
    throw new HttpError(
      409,
      "Ce numéro d'assuré est déjà attribué à un titulaire chez cet assureur",
    );
  }
  return created;
}

/**
 * Moves the pending affiliation that `scope` finds out of pending. Every other status is final.
 * The update is conditional, so a concurrent change made since the read leaves nothing to update.
 */
async function leavePending(
  tx: Tx,
  scope: SQL | undefined,
  values: { status: 'validated' | 'withdrawn' } | { status: 'rejected'; rejectionReason: string },
) {
  const before = await tx.query.affiliations.findFirst({ where: scope });
  if (!before) throw notFound('Affiliation');
  const alreadyDone = new HttpError(409, 'Cette affiliation a déjà été traitée');
  if (before.status !== 'pending') throw alreadyDone;
  const [after] = await tx
    .update(affiliations)
    .set(values)
    .where(and(scope, eq(affiliations.status, 'pending')))
    .returning();
  if (!after) throw alreadyDone;
  return { before, after };
}

/** The insurer validates or rejects an affiliation declared to it. */
export function decideAffiliation(
  tx: Tx,
  insurerId: string,
  affiliationId: string,
  decision: { status: 'validated' } | { status: 'rejected'; rejectionReason: string },
) {
  return leavePending(
    tx,
    and(eq(affiliations.id, affiliationId), eq(affiliations.insurerId, insurerId)),
    decision,
  );
}

/** The declaring center takes back a declaration the insurer has not decided yet. */
export function withdrawAffiliation(
  tx: Tx,
  centerId: string,
  patientId: string,
  affiliationId: string,
) {
  return leavePending(
    tx,
    and(
      eq(affiliations.id, affiliationId),
      eq(affiliations.patientId, patientId),
      eq(affiliations.declaredByOrganizationId, centerId),
    ),
    { status: 'withdrawn' },
  );
}
