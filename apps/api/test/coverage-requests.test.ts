import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { affiliations, coverageRequestItems, patients, users } from '../src/db/schema.js';
import { type CoverageFixture, coverageFixture } from './coverage-fixtures.js';
import { TEST_DATABASE_URL, createUser, login, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('coverage requests: drafts and submission', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let f: CoverageFixture;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    f = await coverageFixture(ctx);
  });

  const items = (id: string) =>
    ctx.db
      .select()
      .from(coverageRequestItems)
      .where(eq(coverageRequestItems.coverageRequestId, id))
      .orderBy(coverageRequestItems.position);

  describe('creating a draft', () => {
    it('answers with the id only, and computes the estimate on the server', async () => {
      const response = await f.create(f.doctor, { estimatedAmount: 1, insurerId: f.otherInsurer });
      expect(response.statusCode).toBe(201);
      const { id } = response.json<{ id: string }>();
      expect(response.json()).toEqual({ id });

      const request = await f.row(id);
      expect(request).toMatchObject({
        status: 'draft',
        centerId: f.center,
        insurerId: f.insurer, // from the affiliation, never from the client
        patientId: f.patientId,
        diagnosisCode: 'B54',
        estimatedAmount: 70000,
        grantedAmount: null,
      });
      expect(await items(id)).toMatchObject([
        {
          actCode: 'CONS-GEN',
          actLabel: 'Consultation de médecine générale',
          quantity: 2,
          lineAmount: 30000,
        },
        { actCode: 'ECG', actLabel: 'Électrocardiogramme', quantity: 1, lineAmount: 40000 },
      ]);
    });

    it('takes the reference price when the line gives none', async () => {
      const response = await f.create(f.doctor, { items: [{ actCode: 'bio-gly', quantity: 3 }] });
      const { id } = response.json<{ id: string }>();
      expect(await items(id)).toMatchObject([
        { actCode: 'BIO-GLY', unitPrice: 8000, lineAmount: 24000 },
      ]);
      expect((await f.row(id)).estimatedAmount).toBe(24000);
    });

    it('records a first event and an audit entry without medical content', async () => {
      const id = await f.draft();
      const [doctorUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, (await f.row(id)).createdBy));
      expect(doctorUser!.email).toMatch(/^doctor\./);
      expect(await f.events(id)).toMatchObject([
        { fromStatus: null, toStatus: 'draft', actorUserId: doctorUser!.id, reason: null },
      ]);
      expect(await f.audits('coverage_request.create')).toMatchObject([
        {
          entityId: id,
          organizationId: f.center,
          after: { patientId: f.patientId, affiliationId: f.affiliationId, insurerId: f.insurer },
        },
      ]);
    });

    it('refuses unknown or foreign references', async () => {
      const [stranger] = await ctx.db
        .insert(patients)
        .values({ lastName: 'Rabe', firstNames: 'Paul', birthDate: '1990-01-01', sex: 'male' })
        .returning();
      const [foreign] = await ctx.db
        .insert(affiliations)
        .values({
          patientId: stranger!.id,
          insurerId: f.insurer,
          memberNumber: 'OS-999',
          holderStatus: 'holder',
          startsOn: '2000-01-01',
          status: 'validated',
          declaredByOrganizationId: f.center,
        })
        .returning();
      expect((await f.create(f.doctor, { patientId: stranger!.id })).statusCode).toBe(404);
      expect((await f.create(f.doctor, { affiliationId: foreign!.id })).statusCode).toBe(404);
      expect(
        (await f.create(f.doctor, { items: [{ actCode: 'NOPE', quantity: 1 }] })).statusCode,
      ).toBe(404);
      expect((await f.create(f.doctor, { diagnosisCode: 'Z99.9' })).statusCode).toBe(404);
    });

    it('is for the doctors of the center only', async () => {
      await createUser(ctx.db, {
        email: 'root@example.mg',
        password: 'pass-12345',
        isSuperAdmin: true,
      });
      const root = (await login(ctx.app, 'root@example.mg', 'pass-12345')).cookie;
      for (const cookie of [f.reception, f.advisor, root]) {
        expect((await f.create(cookie)).statusCode).toBe(403);
      }
      expect((await f.create('')).statusCode).toBe(401);
    });
  });

  describe('editing', () => {
    it('replaces the lines, recomputes the estimate and audits the field names only', async () => {
      const id = await f.draft();
      const response = await f.inject('PATCH', `${f.base()}/${id}`, f.doctor, {
        items: [{ actCode: 'ECHO-ABD', quantity: 1 }],
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id });
      expect(await items(id)).toMatchObject([{ actCode: 'ECHO-ABD', lineAmount: 60000 }]);
      expect((await f.row(id)).estimatedAmount).toBe(60000);
      expect(await f.audits('coverage_request.update')).toMatchObject([
        { entityId: id, after: { fields: ['items'] } },
      ]);
    });

    it("lets another doctor of the center take over a colleague's draft", async () => {
      const id = await f.draft();
      const { cookie } = await f.colleague('doctor', f.center);
      const patch = await f.inject('PATCH', `${f.base()}/${id}`, cookie, { diagnosisCode: 'J00' });
      expect(patch.statusCode).toBe(200);
      expect((await f.move(id, cookie, { to: 'submitted' })).statusCode).toBe(200);
    });

    it('changes insurer only on a draft, never under review by the first one', async () => {
      const [bsa] = await ctx.db
        .insert(affiliations)
        .values({
          patientId: f.patientId,
          insurerId: f.otherInsurer,
          memberNumber: 'BSA-1',
          holderStatus: 'holder',
          startsOn: '2000-01-01',
          status: 'validated',
          declaredByOrganizationId: f.center,
        })
        .returning();
      const patch = (id: string) =>
        f.inject('PATCH', `${f.base()}/${id}`, f.doctor, { affiliationId: bsa!.id });

      const draftId = await f.draft();
      expect((await patch(draftId)).statusCode).toBe(200);
      expect((await f.row(draftId)).insurerId).toBe(f.otherInsurer);

      const sentBack = await f.underReview();
      await f.move(
        sentBack,
        f.advisor,
        { to: 'info_requested', reason: 'Ordonnance ?' },
        f.insurer,
      );
      expect((await patch(sentBack)).statusCode).toBe(409);
      expect((await f.row(sentBack)).insurerId).toBe(f.insurer);
    });

    it('refuses once submitted, and from another center', async () => {
      const id = await f.submitted();
      const patch = (cookie: string, organizationId = f.center) =>
        f.inject('PATCH', `${f.base(organizationId)}/${id}`, cookie, { diagnosisCode: 'J00' });
      expect((await patch(f.doctor)).statusCode).toBe(409);
      const otherDoctor = await f.as('doctor', f.otherCenter);
      expect((await patch(otherDoctor, f.otherCenter)).statusCode).toBe(404);
    });
  });

  describe('submitting', () => {
    it('moves a draft to submitted, with its event and an audit of the move only', async () => {
      const id = await f.draft();
      const response = await f.move(id, f.doctor, { to: 'submitted' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id, status: 'submitted' });
      expect((await f.events(id)).map((e) => e.toStatus)).toEqual(['draft', 'submitted']);
      expect(await f.audits('coverage_request.submitted')).toMatchObject([
        { entityId: id, after: { from: 'draft', to: 'submitted' } },
      ]);
    });

    it('refuses an affiliation that is not active today', async () => {
      const cases = [
        { status: 'pending' as const },
        { status: 'rejected' as const },
        { status: 'withdrawn' as const },
        { endsOn: '2001-01-01' },
        { startsOn: '2999-01-01', endsOn: null },
      ];
      for (const change of cases) {
        const id = await f.draft();
        await ctx.db.update(affiliations).set(change).where(eq(affiliations.id, f.affiliationId));
        const response = await f.move(id, f.doctor, { to: 'submitted' });
        expect(response.statusCode, JSON.stringify(change)).toBe(400);
        expect(response.json().message).toMatch(/affiliation/i);
        expect((await f.row(id)).status).toBe('draft');
        await ctx.db
          .update(affiliations)
          .set({ status: 'validated', startsOn: '2000-01-01', endsOn: null })
          .where(eq(affiliations.id, f.affiliationId));
      }
    });
  });

  describe('medical acts referential', () => {
    it('searches the code or the label for any signed-in user', async () => {
      const search = (q: string, cookie = f.reception) =>
        f.inject('GET', `/api/referentials/medical-acts?q=${encodeURIComponent(q)}`, cookie);
      expect((await search('echo')).json()).toEqual(
        expect.arrayContaining([
          { code: 'ECHO-ABD', label: 'Échographie abdominale', referencePrice: 60000 },
        ]),
      );
      expect((await search('bio-gly')).json()).toMatchObject([{ code: 'BIO-GLY' }]);
      expect((await search('%')).json()).toEqual([]);
      expect((await search('ecg', '')).statusCode).toBe(401);
    });
  });
});
