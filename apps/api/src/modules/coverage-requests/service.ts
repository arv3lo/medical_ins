import type { CreateCoverageRequestInput, UpdateCoverageRequestInput } from '@medical-ins/shared';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import {
  affiliations,
  coverageRequestEvents,
  coverageRequestItems,
  coverageRequests,
  icd10Codes,
  medicalActs,
} from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { escapeLike } from '../../lib/sql.js';
import { requireLinkedPatient } from '../patients/service.js';

const SEARCH_LIMIT = 50;

export type CoverageRequestRow = typeof coverageRequests.$inferSelect;

export function searchMedicalActs(db: Db, q = '') {
  const pattern = `%${escapeLike(q.trim())}%`;
  return db
    .select({
      code: medicalActs.code,
      label: medicalActs.label,
      referencePrice: medicalActs.referencePrice,
    })
    .from(medicalActs)
    .where(or(ilike(medicalActs.code, pattern), ilike(medicalActs.label, pattern)))
    .orderBy(medicalActs.code)
    .limit(SEARCH_LIMIT);
}

/**
 * The request, its row locked until `tx` ends: a concurrent move or edit waits for this one, then
 * sees the new status instead of acting on the old one (constitution, principle V).
 */
export async function lockCoverageRequest(tx: Tx, id: string): Promise<CoverageRequestRow> {
  const [request] = await tx
    .select()
    .from(coverageRequests)
    .where(eq(coverageRequests.id, id))
    .for('update');
  if (!request) throw notFound('Demande de prise en charge');
  return request;
}

/** The affiliation, if it belongs to the patient. */
export async function requirePatientAffiliation(db: Db | Tx, patientId: string, id: string) {
  const affiliation = await db.query.affiliations.findFirst({
    where: and(eq(affiliations.id, id), eq(affiliations.patientId, patientId)),
  });
  if (!affiliation) throw notFound('Affiliation');
  return affiliation;
}

async function requireKnownDiagnosis(db: Db | Tx, code: string) {
  const known = await db.query.icd10Codes.findFirst({ where: eq(icd10Codes.code, code) });
  if (!known) throw notFound(`Code CIM-10 ${code}`);
}

/** Lines priced from the acts referential when they carry no price; label and price are copied. */
async function priceItems(db: Db | Tx, items: CreateCoverageRequestInput['items']) {
  const codes = [...new Set(items.map((i) => i.actCode))];
  const acts = await db.select().from(medicalActs).where(inArray(medicalActs.code, codes));
  const unknown = codes.filter((code) => !acts.some((a) => a.code === code));
  if (unknown.length > 0) throw notFound(`Acte ${unknown.join(', ')}`);
  return items.map((item, position) => {
    const act = acts.find((a) => a.code === item.actCode)!;
    const unitPrice = item.unitPrice ?? act.referencePrice;
    return {
      actCode: act.code,
      actLabel: act.label,
      quantity: item.quantity,
      unitPrice,
      lineAmount: item.quantity * unitPrice,
      position,
    };
  });
}

type PricedItem = Awaited<ReturnType<typeof priceItems>>[number];

const total = (items: PricedItem[]) => items.reduce((sum, i) => sum + i.lineAmount, 0);

/** A draft for a patient of `centerId`; the insurer is always the affiliation's. */
export async function insertCoverageRequest(
  tx: Tx,
  centerId: string,
  authorId: string,
  input: CreateCoverageRequestInput,
): Promise<CoverageRequestRow> {
  await requireLinkedPatient(tx, centerId, input.patientId);
  const affiliation = await requirePatientAffiliation(tx, input.patientId, input.affiliationId);
  await requireKnownDiagnosis(tx, input.diagnosisCode);
  const items = await priceItems(tx, input.items);

  const [request] = await tx
    .insert(coverageRequests)
    .values({
      centerId,
      insurerId: affiliation.insurerId,
      patientId: input.patientId,
      affiliationId: affiliation.id,
      diagnosisCode: input.diagnosisCode,
      estimatedAmount: total(items),
      createdBy: authorId,
    })
    .returning();
  await tx
    .insert(coverageRequestItems)
    .values(items.map((item) => ({ ...item, coverageRequestId: request!.id })));
  await tx
    .insert(coverageRequestEvents)
    .values({ coverageRequestId: request!.id, toStatus: 'draft', actorUserId: authorId });
  return request!;
}

/** Only a draft, or a request sent back for more information, changes (FR-009). */
export async function updateCoverageRequest(
  tx: Tx,
  request: CoverageRequestRow,
  input: UpdateCoverageRequestInput,
): Promise<void> {
  if (request.status !== 'draft' && request.status !== 'info_requested') {
    throw new HttpError(409, 'Seule une demande en brouillon ou en complément demandé se modifie');
  }
  const fields: Partial<typeof coverageRequests.$inferInsert> = {};
  if (input.affiliationId) {
    const affiliation = await requirePatientAffiliation(tx, request.patientId, input.affiliationId);
    // Once submitted, the request belongs to its insurer: more information never moves it away.
    if (request.status !== 'draft' && affiliation.insurerId !== request.insurerId) {
      throw new HttpError(409, "Une demande déjà soumise ne change pas d'assureur");
    }
    fields.affiliationId = affiliation.id;
    fields.insurerId = affiliation.insurerId;
  }
  if (input.diagnosisCode) {
    await requireKnownDiagnosis(tx, input.diagnosisCode);
    fields.diagnosisCode = input.diagnosisCode;
  }
  if (input.items) {
    const items = await priceItems(tx, input.items);
    await tx
      .delete(coverageRequestItems)
      .where(eq(coverageRequestItems.coverageRequestId, request.id));
    await tx
      .insert(coverageRequestItems)
      .values(items.map((item) => ({ ...item, coverageRequestId: request.id })));
    fields.estimatedAmount = total(items);
  }
  await tx.update(coverageRequests).set(fields).where(eq(coverageRequests.id, request.id));
}

export async function countItems(db: Db | Tx, id: string): Promise<number> {
  const rows = await db
    .select({ id: coverageRequestItems.id })
    .from(coverageRequestItems)
    .where(eq(coverageRequestItems.coverageRequestId, id));
  return rows.length;
}
