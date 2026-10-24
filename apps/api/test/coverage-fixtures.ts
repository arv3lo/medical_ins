import type { Role } from '@medical-ins/shared';
import { eq } from 'drizzle-orm';
import {
  affiliations,
  auditLogs,
  coverageRequestEvents,
  coverageRequests,
  memberships,
  organizations,
} from '../src/db/schema.js';
import { createUser, login, memberCookie, resetDb, type setupTestApp } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof setupTestApp>>;

/** The lines of the spec's examples: 2 × 15 000 + 1 × 40 000 = 70 000 Ar. */
export const ITEMS = [
  { actCode: 'CONS-GEN', quantity: 2, unitPrice: 15000 },
  { actCode: 'ECG', quantity: 1, unitPrice: 40000 },
];

/**
 * Two centers and two insurers, a doctor of center A, a medical advisor of each insurer, and a
 * patient of center A with an affiliation validated by insurer A and open since 2000.
 */
export async function coverageFixture(ctx: Ctx) {
  await resetDb(ctx.db);
  const orgs = await ctx.db
    .insert(organizations)
    .values([
      { type: 'health_center', name: 'CSB A' },
      { type: 'health_center', name: 'CSB B' },
      { type: 'insurer', name: 'OSTIE' },
      { type: 'insurer', name: 'BSA' },
    ])
    .returning();
  const [center, otherCenter, insurer, otherInsurer] = orgs.map((o) => o.id) as [
    string,
    string,
    string,
    string,
  ];
  const as = (role: Role, organizationId: string) =>
    memberCookie(ctx.app, ctx.db, role, organizationId);
  const reception = await as('reception', center);
  const doctor = await as('doctor', center);
  const advisor = await as('medical_advisor', insurer);
  const otherAdvisor = await as('medical_advisor', otherInsurer);

  const inject = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    cookie?: string,
    payload?: object,
  ) => ctx.app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });

  const patient = await inject('POST', `/api/organizations/${center}/patients`, reception, {
    lastName: 'Rakoto',
    firstNames: 'Jean',
    birthDate: '1985-03-12',
    sex: 'male',
  });
  const patientId = patient.json<{ id: string }>().id;
  const [affiliation] = await ctx.db
    .insert(affiliations)
    .values({
      patientId,
      insurerId: insurer,
      memberNumber: 'OS-123456',
      holderStatus: 'holder',
      startsOn: '2000-01-01',
      status: 'validated',
      declaredByOrganizationId: center,
    })
    .returning();

  const base = (organizationId = center) =>
    `/api/organizations/${organizationId}/coverage-requests`;

  /** A second account with `role` in `organizationId` (memberCookie names one per role). */
  async function colleague(role: Role, organizationId: string) {
    const email = `second.${role}.${organizationId.slice(0, 8)}@example.mg`;
    const user = await createUser(ctx.db, { email, password: 'pass-12345' });
    await ctx.db.insert(memberships).values({ userId: user.id, organizationId, role });
    return { userId: user.id, cookie: (await login(ctx.app, email, 'pass-12345')).cookie };
  }

  const create = (cookie = doctor, payload: object = {}) =>
    inject('POST', base(), cookie, {
      patientId,
      affiliationId: affiliation!.id,
      diagnosisCode: 'B54',
      items: ITEMS,
      ...payload,
    });

  async function draft() {
    return (await create()).json<{ id: string }>().id;
  }

  const move = (id: string, cookie: string, payload: object, organizationId = center) =>
    inject('POST', `${base(organizationId)}/${id}/transitions`, cookie, payload);

  /** A request moved along `steps`, each `[cookie, payload, organization]`. */
  async function requestAt(...steps: [string, object, string?][]) {
    const id = await draft();
    for (const [cookie, payload, organizationId] of steps) {
      const response = await move(id, cookie, payload, organizationId);
      if (response.statusCode !== 200) throw new Error(`setup failed: ${response.body}`);
    }
    return id;
  }

  const submitted = () => requestAt([doctor, { to: 'submitted' }]);
  const underReview = () =>
    requestAt([doctor, { to: 'submitted' }], [advisor, { to: 'under_review' }, insurer]);

  const row = async (id: string) =>
    (await ctx.db.select().from(coverageRequests).where(eq(coverageRequests.id, id)))[0]!;
  const events = (id: string) =>
    ctx.db
      .select()
      .from(coverageRequestEvents)
      .where(eq(coverageRequestEvents.coverageRequestId, id))
      .orderBy(coverageRequestEvents.createdAt);
  const audits = (action: string) =>
    ctx.db.select().from(auditLogs).where(eq(auditLogs.action, action));

  return {
    center,
    otherCenter,
    insurer,
    otherInsurer,
    reception,
    doctor,
    advisor,
    otherAdvisor,
    patientId,
    affiliationId: affiliation!.id,
    as,
    colleague,
    inject,
    base,
    create,
    draft,
    move,
    requestAt,
    submitted,
    underReview,
    row,
    events,
    audits,
  };
}

export type CoverageFixture = Awaited<ReturnType<typeof coverageFixture>>;
