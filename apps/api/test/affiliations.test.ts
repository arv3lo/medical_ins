import type { Role } from '@medical-ins/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs, organizations } from '../src/db/schema.js';
import { TEST_DATABASE_URL, memberCookie, resetDb, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('affiliations', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let center: string;
  let otherCenter: string;
  let ostie: string;
  let bsa: string;
  let reception: string;
  let patientId: string;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.db);
    const rows = await ctx.db
      .insert(organizations)
      .values([
        { type: 'health_center', name: 'CSB A' },
        { type: 'health_center', name: 'CSB B' },
        { type: 'insurer', name: 'OSTIE' },
        { type: 'insurer', name: 'BSA' },
      ])
      .returning();
    [center, otherCenter, ostie, bsa] = rows.map((o) => o.id) as [string, string, string, string];
    reception = await as('reception', center);
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${center}/patients`,
      headers: { cookie: reception },
      payload: { lastName: 'Rakoto', firstNames: 'Jean', birthDate: '1985-03-12', sex: 'male' },
    });
    patientId = created.json<{ id: string }>().id;
  });

  const as = (role: Role, organizationId: string) =>
    memberCookie(ctx.app, ctx.db, role, organizationId);

  const declare = (cookie: string, payload: Record<string, unknown> = {}, orgId = center) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${orgId}/patients/${patientId}/affiliations`,
      headers: { cookie },
      payload: {
        insurerId: ostie,
        memberNumber: 'os-123456',
        holderStatus: 'holder',
        employer: 'JIRAMA',
        startsOn: '2026-01-01',
        ...payload,
      },
    });

  const createPatient = async (lastName: string) => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${center}/patients`,
      headers: { cookie: reception },
      payload: { lastName, firstNames: 'Marie', birthDate: '1990-01-01', sex: 'female' },
    });
    return created.json<{ id: string }>().id;
  };

  /** Declares OSTIE's holder number OS-123456 for `forPatient`, from the first center. */
  const declareHolder = (forPatient: string, payload: Record<string, unknown> = {}) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${center}/patients/${forPatient}/affiliations`,
      headers: { cookie: reception },
      payload: {
        insurerId: ostie,
        memberNumber: 'OS-123456',
        holderStatus: 'holder',
        startsOn: '2026-01-01',
        ...payload,
      },
    });

  const decideAs = async (affiliationId: string, decision: 'validate' | 'reject') =>
    inject(
      'POST',
      `/api/organizations/${ostie}/affiliations/${affiliationId}/${decision}`,
      await as('insurer_manager', ostie),
      decision === 'reject' ? { reason: 'Numéro inconnu' } : undefined,
    );

  const withdraw = (cookie: string, affiliationId: string, orgId = center) =>
    inject(
      'POST',
      `/api/organizations/${orgId}/patients/${patientId}/affiliations/${affiliationId}/withdraw`,
      cookie,
    );

  /** Waits until `count` other sessions are blocked on a lock held by the test. */
  const waitForLockWaiters = async (count: number) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await ctx.db.execute<{ waiting: number }>(
        sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (row!.waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`${count} sessions never waited on the lock`);
  };

  const inject = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: { cookie }, payload });

  it('lets reception declare an affiliation, pending until the insurer validates it', async () => {
    const response = await declare(reception);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      memberNumber: 'OS-123456',
      status: 'pending',
      insurerName: 'OSTIE',
    });

    const list = await inject(
      'GET',
      `/api/organizations/${center}/patients/${patientId}/affiliations`,
      await as('billing', center),
    );
    expect(list.json()).toHaveLength(1);
  });

  it('refuses a declaration to roles without patient.update or for an unlinked patient', async () => {
    expect((await declare(await as('doctor', center))).statusCode).toBe(403);
    expect((await declare(await as('reception', otherCenter), {}, otherCenter)).statusCode).toBe(
      404,
    );
  });

  it('refuses an insurer id that is not an insurer', async () => {
    expect((await declare(reception, { insurerId: otherCenter })).statusCode).toBe(404);
  });

  it('answers 400, not 500, for a start date that does not exist', async () => {
    expect((await declare(reception, { startsOn: '2023-02-30' })).statusCode).toBe(400);
  });

  it('keeps a member number unique among the holders of one insurer', async () => {
    await declare(reception);
    const other = await ctx.app.inject({
      method: 'POST',
      url: `/api/organizations/${center}/patients`,
      headers: { cookie: reception },
      payload: { lastName: 'Rasoa', firstNames: 'Marie', birthDate: '1990-01-01', sex: 'female' },
    });
    const url = `/api/organizations/${center}/patients/${other.json<{ id: string }>().id}/affiliations`;
    const payload = { insurerId: ostie, memberNumber: 'OS-123456', startsOn: '2026-01-01' };

    const holder = await inject('POST', url, reception, { ...payload, holderStatus: 'holder' });
    expect(holder.statusCode).toBe(409);
    // A dependent carries the holder's number.
    const dependent = await inject('POST', url, reception, {
      ...payload,
      holderStatus: 'dependent',
    });
    expect(dependent.statusCode).toBe(201);
    // The same number at another insurer is another person.
    const elsewhere = await inject('POST', url, reception, {
      ...payload,
      insurerId: bsa,
      holderStatus: 'holder',
    });
    expect(elsewhere.statusCode).toBe(201);
  });

  it('frees a holder number once the insurer rejects the declaration', async () => {
    const wrong = (await declareHolder(patientId)).json<{ id: string }>();
    expect((await decideAs(wrong.id, 'reject')).statusCode).toBe(200);

    // The real holder can now be declared, and so can a corrected declaration.
    expect((await declareHolder(await createPatient('Rasoa'))).statusCode).toBe(201);
    expect((await declareHolder(patientId, { memberNumber: 'OS-654321' })).statusCode).toBe(201);
  });

  it('lets the same holder declare a new period, but no other patient', async () => {
    const ended = (
      await declareHolder(patientId, { startsOn: '2025-01-01', endsOn: '2025-12-31' })
    ).json<{ id: string }>();
    expect((await decideAs(ended.id, 'validate')).statusCode).toBe(200);

    expect((await declareHolder(patientId, { startsOn: '2026-01-01' })).statusCode).toBe(201);
    expect((await declareHolder(await createPatient('Rasoa'))).statusCode).toBe(409);
  });

  it('lets the declaring center withdraw a pending declaration, audited', async () => {
    const affiliation = (await declareHolder(patientId)).json<{ id: string }>();

    expect((await withdraw(await as('doctor', center), affiliation.id)).statusCode).toBe(403);
    const otherReception = await as('reception', otherCenter);
    expect((await withdraw(otherReception, affiliation.id, otherCenter)).statusCode).toBe(404);

    const withdrawn = await withdraw(reception, affiliation.id);
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json()).toMatchObject({ status: 'withdrawn' });
    // Withdrawn is final, and the insurer can no longer decide it.
    expect((await withdraw(reception, affiliation.id)).statusCode).toBe(409);
    expect((await decideAs(affiliation.id, 'validate')).statusCode).toBe(409);

    // The number is free again.
    expect((await declareHolder(await createPatient('Rasoa'))).statusCode).toBe(201);
    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'affiliation.withdraw'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ organizationId: center, entityId: affiliation.id });
  });

  it('cannot withdraw a declaration the insurer has decided', async () => {
    const affiliation = (await declareHolder(patientId)).json<{ id: string }>();
    await decideAs(affiliation.id, 'validate');
    expect((await withdraw(reception, affiliation.id)).statusCode).toBe(409);
  });

  it('shows each insurer only its own affiliations, with identity but nothing medical', async () => {
    await declare(reception);
    await declare(reception, { insurerId: bsa, memberNumber: 'B-1' });

    const list = await inject(
      'GET',
      `/api/organizations/${ostie}/affiliations?status=pending`,
      await as('insurer_manager', ostie),
    );
    expect(list.statusCode).toBe(200);
    const rows = list.json<Record<string, unknown>[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberNumber: 'OS-123456',
      patient: { lastName: 'Rakoto', birthDate: '1985-03-12' },
    });
    expect(Object.keys(rows[0]!.patient as object).sort()).toEqual([
      'birthDate',
      'firstNames',
      'lastName',
      'nationalId',
    ]);
  });

  it('lets only the insurer manager validate or reject, audited', async () => {
    const affiliation = (await declare(reception)).json<{ id: string }>();
    const url = `/api/organizations/${ostie}/affiliations/${affiliation.id}`;

    expect(
      (await inject('POST', `${url}/validate`, await as('medical_advisor', ostie))).statusCode,
    ).toBe(403);
    // Another insurer cannot reach it, whether through OSTIE's URL or its own.
    const bsaManager = await as('insurer_manager', bsa);
    expect((await inject('POST', `${url}/validate`, bsaManager)).statusCode).toBe(403);
    const viaBsa = `/api/organizations/${bsa}/affiliations/${affiliation.id}/validate`;
    expect((await inject('POST', viaBsa, bsaManager)).statusCode).toBe(404);

    const manager = await as('insurer_manager', ostie);
    const validated = await inject('POST', `${url}/validate`, manager);
    expect(validated.statusCode).toBe(200);
    expect(validated.json()).toMatchObject({ status: 'validated' });

    // A decision is final: a validated affiliation cannot be rejected afterwards.
    expect((await inject('POST', `${url}/reject`, manager, { reason: 'Erreur' })).statusCode).toBe(
      409,
    );

    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'affiliation.validate'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.organizationId).toBe(ostie);
  });

  it('checks access before validating the reject body', async () => {
    const affiliation = (await declare(reception)).json<{ id: string }>();
    const url = `/api/organizations/${ostie}/affiliations/${affiliation.id}/reject`;

    const anonymous = await ctx.app.inject({ method: 'POST', url, payload: {} });
    expect(anonymous.statusCode).toBe(401);
    expect((await inject('POST', url, await as('medical_advisor', ostie), {})).statusCode).toBe(
      403,
    );
  });

  it('lets only the first of two concurrent decisions through', async () => {
    const affiliation = (await declare(reception)).json<{ id: string }>();
    const url = `/api/organizations/${ostie}/affiliations/${affiliation.id}`;
    const manager = await as('insurer_manager', ostie);

    // Hold the row so that both requests have read it as pending before either one writes.
    const decisions = await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM affiliations WHERE id = ${affiliation.id} FOR UPDATE`);
      const both = Promise.all([
        inject('POST', `${url}/validate`, manager),
        inject('POST', `${url}/reject`, manager, { reason: 'Numéro inconnu' }),
      ]);
      await waitForLockWaiters(2);
      // Not awaited here: the requests can only finish once this transaction releases the row.
      return { both };
    });
    const [validated, rejected] = await decisions.both;

    expect([validated.statusCode, rejected.statusCode].sort()).toEqual([200, 409]);
    const entries = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, affiliation.id));
    expect(entries.map((d) => d.action).filter((a) => a !== 'affiliation.create')).toHaveLength(1);
  });

  it('requires a reason to reject', async () => {
    const affiliation = (await declare(reception)).json<{ id: string }>();
    const url = `/api/organizations/${ostie}/affiliations/${affiliation.id}/reject`;
    const manager = await as('insurer_manager', ostie);

    expect((await inject('POST', url, manager, {})).statusCode).toBe(400);
    const rejected = await inject('POST', url, manager, { reason: 'Numéro inconnu' });
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Numéro inconnu',
    });
  });

  it('finds a patient by member number', async () => {
    await declare(reception);
    const search = await inject(
      'GET',
      `/api/organizations/${center}/patients?q=os-1234`,
      reception,
    );
    expect(search.json()).toMatchObject([{ lastName: 'Rakoto' }]);
  });

  it('lists the insurers any signed-in user can choose from', async () => {
    const insurers = await inject('GET', '/api/insurers', reception);
    expect(insurers.json()).toEqual([
      { id: bsa, name: 'BSA' },
      { id: ostie, name: 'OSTIE' },
    ]);
  });
});
