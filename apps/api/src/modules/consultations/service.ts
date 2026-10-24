import type {
  Consultation,
  ConsultationSummary,
  Icd10Code,
  UpdateConsultationInput,
} from '@medical-ins/shared';
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import {
  consultationAddenda,
  consultations,
  diagnoses,
  icd10Codes,
  organizations,
  users,
} from '../../db/schema.js';
import { HttpError, notFound } from '../../lib/errors.js';

const SEARCH_LIMIT = 20;

export function searchIcd10(db: Db, q: string): Promise<Icd10Code[]> {
  return db
    .select()
    .from(icd10Codes)
    .where(or(ilike(icd10Codes.code, `${q}%`), ilike(icd10Codes.label, `%${q}%`)))
    .orderBy(icd10Codes.code)
    .limit(SEARCH_LIMIT);
}

/** A reader sees signed consultations, and drafts only when they wrote them. */
const visibleTo = (readerId: string) =>
  or(isNotNull(consultations.signedAt), eq(consultations.doctorId, readerId));

const withNames = {
  consultation: consultations,
  doctor: { fullName: users.fullName },
  organization: { name: organizations.name },
};

function selectConsultations(db: Db | Tx) {
  return db
    .select(withNames)
    .from(consultations)
    .innerJoin(users, eq(users.id, consultations.doctorId))
    .innerJoin(organizations, eq(organizations.id, consultations.organizationId));
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

export async function listPatientConsultations(
  db: Db | Tx,
  patientId: string,
  readerId: string,
): Promise<ConsultationSummary[]> {
  const rows = await selectConsultations(db)
    .where(and(eq(consultations.patientId, patientId), visibleTo(readerId)))
    .orderBy(desc(consultations.createdAt));
  const primaries = await db
    .select({
      consultationId: diagnoses.consultationId,
      code: icd10Codes.code,
      label: icd10Codes.label,
    })
    .from(diagnoses)
    .innerJoin(icd10Codes, eq(icd10Codes.code, diagnoses.code))
    .where(
      and(
        eq(diagnoses.isPrimary, true),
        inArray(
          diagnoses.consultationId,
          rows.map((r) => r.consultation.id),
        ),
      ),
    );
  return rows.map(({ consultation: c, doctor, organization }) => {
    const primary = primaries.find((p) => p.consultationId === c.id);
    return {
      id: c.id,
      organizationId: c.organizationId,
      patientId: c.patientId,
      doctorId: c.doctorId,
      reason: c.reason,
      signedAt: iso(c.signedAt),
      createdAt: c.createdAt.toISOString(),
      doctor,
      organization,
      primaryDiagnosis: primary ? { code: primary.code, label: primary.label } : null,
    };
  });
}

/** The consultation with its diagnoses and addenda, if `readerId` may see it. */
export async function findConsultation(
  db: Db | Tx,
  id: string,
  readerId: string,
): Promise<Consultation> {
  const [row] = await selectConsultations(db).where(
    and(eq(consultations.id, id), visibleTo(readerId)),
  );
  if (!row) throw notFound('Consultation');
  const { consultation: c, doctor, organization } = row;

  const [diagnosisRows, addendumRows] = await Promise.all([
    db
      .select({ code: icd10Codes.code, label: icd10Codes.label, primary: diagnoses.isPrimary })
      .from(diagnoses)
      .innerJoin(icd10Codes, eq(icd10Codes.code, diagnoses.code))
      .where(eq(diagnoses.consultationId, id))
      .orderBy(asc(diagnoses.position)),
    db
      .select({
        id: consultationAddenda.id,
        content: consultationAddenda.content,
        createdAt: consultationAddenda.createdAt,
        author: { fullName: users.fullName },
      })
      .from(consultationAddenda)
      .innerJoin(users, eq(users.id, consultationAddenda.authorId))
      .where(eq(consultationAddenda.consultationId, id))
      .orderBy(asc(consultationAddenda.createdAt)),
  ]);

  return {
    id: c.id,
    organizationId: c.organizationId,
    patientId: c.patientId,
    doctorId: c.doctorId,
    appointmentId: c.appointmentId,
    reason: c.reason,
    examination: c.examination,
    vitals: c.vitals,
    notes: c.notes,
    signedAt: iso(c.signedAt),
    createdAt: c.createdAt.toISOString(),
    doctor,
    organization,
    diagnoses: diagnosisRows,
    addenda: addendumRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}

/**
 * The author's own draft, written in `organizationId`: the only consultation one may change.
 * Its row stays locked until `tx` ends, so a concurrent edit or signature waits for this one and
 * then sees the consultation as signed, instead of changing it after the check.
 */
export async function requireOwnDraft(
  tx: Tx,
  organizationId: string,
  id: string,
  authorId: string,
): Promise<Consultation> {
  await tx
    .select({ id: consultations.id })
    .from(consultations)
    .where(eq(consultations.id, id))
    .for('update');
  const consultation = await findConsultation(tx, id, authorId);
  if (consultation.organizationId !== organizationId || consultation.doctorId !== authorId) {
    throw notFound('Consultation');
  }
  if (consultation.signedAt) throw new HttpError(409, 'Consultation signée : ajoutez un avenant');
  return consultation;
}

async function requireKnownCodes(db: Db | Tx, codes: string[]) {
  if (codes.length === 0) return;
  const known = await db
    .select({ code: icd10Codes.code })
    .from(icd10Codes)
    .where(inArray(icd10Codes.code, codes));
  const unknown = codes.filter((code) => !known.some((k) => k.code === code));
  if (unknown.length > 0) {
    throw new HttpError(400, `Code CIM-10 inconnu : ${unknown.join(', ')}`);
  }
}

export async function updateDraft(tx: Tx, id: string, input: UpdateConsultationInput) {
  const { diagnoses: list, ...fields } = input;
  if (Object.keys(fields).length > 0) {
    await tx.update(consultations).set(fields).where(eq(consultations.id, id));
  }
  if (list) {
    await requireKnownCodes(
      tx,
      list.map((d) => d.code),
    );
    await tx.delete(diagnoses).where(eq(diagnoses.consultationId, id));
    if (list.length > 0) {
      await tx.insert(diagnoses).values(
        list.map((d, position) => ({
          consultationId: id,
          code: d.code,
          isPrimary: d.primary,
          position,
        })),
      );
    }
  }
}

/** Signs the draft and returns when it was signed. */
export async function markSigned(tx: Tx, id: string): Promise<Date> {
  const [row] = await tx
    .update(consultations)
    .set({ signedAt: sql`now()` })
    .where(eq(consultations.id, id))
    .returning({ signedAt: consultations.signedAt });
  return row!.signedAt!;
}
