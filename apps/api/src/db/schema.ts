import {
  AFFILIATION_STATUSES,
  APPOINTMENT_STATUSES,
  HOLDER_STATUSES,
  ORGANIZATION_TYPES,
  ROLES,
  SEXES,
  type Vitals,
} from '@medical-ins/shared';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizationType = pgEnum('organization_type', ORGANIZATION_TYPES);
export const role = pgEnum('role', ROLES);
export const sex = pgEnum('sex', SEXES);
export const holderStatus = pgEnum('holder_status', HOLDER_STATUSES);
export const affiliationStatus = pgEnum('affiliation_status', AFFILIATION_STATUSES);
export const appointmentStatus = pgEnum('appointment_status', APPOINTMENT_STATUSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: organizationType('type').notNull(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  region: text('region'),
  address: text('address'),
  ...timestamps,
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: role('role').notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.userId, t.organizationId, t.role)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token: a leaked table does not leak usable sessions. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/** One record per person, shared by every center that treats them. */
export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lastName: text('last_name').notNull(),
    firstNames: text('first_names').notNull(),
    birthDate: date('birth_date').notNull(),
    sex: sex('sex').notNull(),
    nationalId: text('national_id'),
    phone: text('phone'),
    address: text('address'),
    region: text('region'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('patients_national_id_unique')
      .on(t.nationalId)
      .where(sql`${t.nationalId} IS NOT NULL`),
    index('patients_last_name_birth_date_idx').on(sql`lower(${t.lastName})`, t.birthDate),
  ],
);

/** Which centers may see a patient: the ones that registered, received or treated them. */
export const patientCenterLinks = pgTable(
  'patient_center_links',
  {
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.organizationId] }), index().on(t.organizationId)],
);

/** A patient's coverage by an insurer: declared by a center, validated by the insurer. */
export const affiliations = pgTable(
  'affiliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    insurerId: uuid('insurer_id')
      .notNull()
      .references(() => organizations.id),
    memberNumber: text('member_number').notNull(),
    holderStatus: holderStatus('holder_status').notNull(),
    planName: text('plan_name'),
    employer: text('employer'),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    status: affiliationStatus('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    declaredByOrganizationId: uuid('declared_by_organization_id')
      .notNull()
      .references(() => organizations.id),
    ...timestamps,
  },
  (t) => [
    // Dependents carry their holder's number, so only holders make a number unique.
    uniqueIndex('affiliations_holder_member_number_unique')
      .on(t.insurerId, t.memberNumber)
      .where(sql`${t.holderStatus} = 'holder'`),
    index().on(t.patientId),
    index().on(t.insurerId, t.status),
    check('affiliations_dates_check', sql`${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`),
  ],
);

/**
 * A slot with a doctor. An exclusion constraint (migration 0006) keeps a doctor's slots that are
 * still held from overlapping; `ends_at` is stored so the range is an immutable expression.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    reason: text('reason'),
    status: appointmentStatus('status').notNull().default('scheduled'),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.startsAt),
    index().on(t.patientId),
    check('appointments_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** ICD-10 reference: diagnoses can only use a code listed here. */
export const icd10Codes = pgTable('icd10_codes', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
});

/**
 * A visit with a doctor. Editable by its author while a draft; once `signed_at` is set, a trigger
 * (migration 0008) rejects any change to it and to its diagnoses: corrections become addenda.
 */
export const consultations = pgTable(
  'consultations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id),
    appointmentId: uuid('appointment_id')
      .unique()
      .references(() => appointments.id),
    reason: text('reason').notNull(),
    examination: text('examination'),
    vitals: jsonb('vitals').$type<Vitals>().notNull().default({}),
    notes: text('notes'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.patientId), index().on(t.organizationId)],
);

export const diagnoses = pgTable(
  'diagnoses',
  {
    consultationId: uuid('consultation_id')
      .notNull()
      .references(() => consultations.id),
    code: text('code')
      .notNull()
      .references(() => icd10Codes.code),
    isPrimary: boolean('is_primary').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.consultationId, t.code] }),
    uniqueIndex('diagnoses_one_primary')
      .on(t.consultationId)
      .where(sql`${t.isPrimary}`),
  ],
);

/** Append-only notes added to a signed consultation (trigger in migration 0008). */
export const consultationAddenda = pgTable(
  'consultation_addenda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    consultationId: uuid('consultation_id')
      .notNull()
      .references(() => consultations.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.consultationId)],
);

/** Append-only: a database trigger rejects UPDATE and DELETE (see migrations). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    // No ON DELETE action: audited users and organizations are deactivated, never deleted.
    actorUserId: uuid('actor_user_id').references(() => users.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.organizationId, t.at)],
);
