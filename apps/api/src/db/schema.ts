import { ORGANIZATION_TYPES, ROLES, SEXES } from '@medical-ins/shared';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
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
