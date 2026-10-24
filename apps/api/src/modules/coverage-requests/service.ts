import type {
  CoverageRequestStatus,
  CreateCoverageRequestInput,
  UpdateCoverageRequestInput,
} from '@medical-ins/shared';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db, Tx } from '../../db/client.js';
import {
  affiliations,
  coverageRequestEvents,
  coverageRequestItems,
  coverageRequests,
  icd10Codes,
  medicalActs,
  organizations,
  patients,
  users,
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

/** Who acts or reads: the requesting center, or the insurer the request is addressed to. */
export type Side = { actor: 'center' | 'insurer'; organizationId: string };

/**
 * The only home of who may reach a request (FR-012, FR-014): the requesting center always; the
 * insurer only once the request has been submitted to it, which its append-only history proves.
 * A draft cancelled before being sent was never the insurer's: it stays out of its reach.
 */
const reachableBy = ({ actor, organizationId }: Side) =>
  actor === 'center'
    ? eq(coverageRequests.centerId, organizationId)
    : and(
        eq(coverageRequests.insurerId, organizationId),
        sql`EXISTS (SELECT 1 FROM ${coverageRequestEvents}
          WHERE ${coverageRequestEvents.coverageRequestId} = ${coverageRequests.id}
          AND ${coverageRequestEvents.toStatus} = 'submitted')`,
      );

/**
 * The request as `side` may act on it (404 otherwise), its row locked until `tx` ends: a
 * concurrent move or edit waits for this one, then sees the new status instead of acting on the
 * old one (constitution, principle V).
 */
export async function lockCoverageRequest(
  tx: Tx,
  id: string,
  side: Side,
): Promise<CoverageRequestRow> {
  const [request] = await tx
    .select()
    .from(coverageRequests)
    .where(and(eq(coverageRequests.id, id), reachableBy(side)))
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

const center = alias(organizations, 'center');
const insurer = alias(organizations, 'insurer');

const iso = (date: Date) => date.toISOString();

/**
 * One request as both sides see it (FR-012): explicit columns only, never a table spread, so a
 * new column never reaches an insurer by accident. Nothing else of the record is joined.
 */
export async function findCoverageRequest(db: Db | Tx, id: string, side: Side) {
  const [row] = await db
    .select({
      request: coverageRequests,
      center: { id: center.id, name: center.name },
      insurer: { id: insurer.id, name: insurer.name },
      patient: {
        id: patients.id,
        lastName: patients.lastName,
        firstNames: patients.firstNames,
        birthDate: patients.birthDate,
        nationalId: patients.nationalId,
      },
      affiliation: {
        id: affiliations.id,
        memberNumber: affiliations.memberNumber,
        holderStatus: affiliations.holderStatus,
        planName: affiliations.planName,
        startsOn: affiliations.startsOn,
        endsOn: affiliations.endsOn,
        status: affiliations.status,
      },
      diagnosis: { code: icd10Codes.code, label: icd10Codes.label },
      createdBy: { fullName: users.fullName },
    })
    .from(coverageRequests)
    .innerJoin(center, eq(center.id, coverageRequests.centerId))
    .innerJoin(insurer, eq(insurer.id, coverageRequests.insurerId))
    .innerJoin(patients, eq(patients.id, coverageRequests.patientId))
    .innerJoin(affiliations, eq(affiliations.id, coverageRequests.affiliationId))
    .innerJoin(icd10Codes, eq(icd10Codes.code, coverageRequests.diagnosisCode))
    .innerJoin(users, eq(users.id, coverageRequests.createdBy))
    .where(and(eq(coverageRequests.id, id), reachableBy(side)));
  if (!row) throw notFound('Demande de prise en charge');

  const items = await db
    .select({
      actCode: coverageRequestItems.actCode,
      actLabel: coverageRequestItems.actLabel,
      quantity: coverageRequestItems.quantity,
      unitPrice: coverageRequestItems.unitPrice,
      lineAmount: coverageRequestItems.lineAmount,
    })
    .from(coverageRequestItems)
    .where(eq(coverageRequestItems.coverageRequestId, id))
    .orderBy(coverageRequestItems.position);
  const events = await db
    .select({
      fromStatus: coverageRequestEvents.fromStatus,
      toStatus: coverageRequestEvents.toStatus,
      actorName: users.fullName,
      reason: coverageRequestEvents.reason,
      createdAt: coverageRequestEvents.createdAt,
    })
    .from(coverageRequestEvents)
    .leftJoin(users, eq(users.id, coverageRequestEvents.actorUserId))
    .where(eq(coverageRequestEvents.coverageRequestId, id))
    .orderBy(coverageRequestEvents.createdAt);

  const { request } = row;
  return {
    id: request.id,
    status: request.status,
    center: row.center,
    insurer: row.insurer,
    patient: row.patient,
    affiliation: row.affiliation,
    diagnosis: row.diagnosis,
    items,
    estimatedAmount: request.estimatedAmount,
    grantedAmount: request.grantedAmount,
    patientShare: request.patientShare,
    validUntil: request.validUntil,
    createdBy: row.createdBy,
    createdAt: iso(request.createdAt),
    updatedAt: iso(request.updatedAt),
    events: events.map(({ actorName, createdAt, ...event }) => ({
      ...event,
      actor: actorName === null ? null : { fullName: actorName },
      createdAt: iso(createdAt),
    })),
  };
}

export const COVERAGE_REQUEST_PAGE_SIZE = 50;

/** A page of requests, without diagnosis nor lines: who, which status, which amounts. */
export function listCoverageRequests(
  db: Db | Tx,
  side: Side,
  filter: { status?: CoverageRequestStatus; patientId?: string; offset: number },
) {
  return db
    .select({
      id: coverageRequests.id,
      status: coverageRequests.status,
      patient: { lastName: patients.lastName, firstNames: patients.firstNames },
      center: { name: center.name },
      insurer: { name: insurer.name },
      estimatedAmount: coverageRequests.estimatedAmount,
      grantedAmount: coverageRequests.grantedAmount,
      validUntil: coverageRequests.validUntil,
      updatedAt: coverageRequests.updatedAt,
    })
    .from(coverageRequests)
    .innerJoin(center, eq(center.id, coverageRequests.centerId))
    .innerJoin(insurer, eq(insurer.id, coverageRequests.insurerId))
    .innerJoin(patients, eq(patients.id, coverageRequests.patientId))
    .where(
      and(
        reachableBy(side),
        filter.status ? eq(coverageRequests.status, filter.status) : undefined,
        filter.patientId ? eq(coverageRequests.patientId, filter.patientId) : undefined,
      ),
    )
    .orderBy(desc(coverageRequests.updatedAt), coverageRequests.id)
    .limit(COVERAGE_REQUEST_PAGE_SIZE)
    .offset(filter.offset);
}
