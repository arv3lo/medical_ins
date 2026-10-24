import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  affiliations,
  coverageRequestItems,
  coverageRequests,
  medicalActs,
  memberships,
  patients,
  users,
} from '../src/db/schema.js';
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

    it('refuses a total too large to store, with a message instead of a crash', async () => {
      // 30 × 100 caesareans at their reference price: 3.6 billion Ar.
      const items = Array.from({ length: 30 }, () => ({ actCode: 'ACC-CESAR', quantity: 100 }));
      const response = await f.create(f.doctor, { items });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/montant/i);
      const id = await f.draft();
      const patch = await f.inject('PATCH', `${f.base()}/${id}`, f.doctor, { items });
      expect(patch.statusCode).toBe(400);
    });

    it('refuses on edit a single line too large to store, priced at the reference', async () => {
      // Reference prices have no bound: 100 × 30 million Ar overflows one line on its own.
      await ctx.db
        .insert(medicalActs)
        .values({ code: 'TEST-COSTLY', label: 'Acte coûteux', referencePrice: 30_000_000 })
        .onConflictDoNothing();
      try {
        const id = await f.draft();
        const patch = await f.inject('PATCH', `${f.base()}/${id}`, f.doctor, {
          items: [{ actCode: 'TEST-COSTLY', quantity: 100 }],
        });
        expect(patch.statusCode).toBe(400);
        expect(patch.json().message).toMatch(/montant/i);
      } finally {
        await ctx.db.delete(medicalActs).where(eq(medicalActs.code, 'TEST-COSTLY'));
      }
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

  describe('reading', () => {
    const KEYS = [
      'affiliation',
      'center',
      'createdAt',
      'createdBy',
      'diagnosis',
      'estimatedAmount',
      'events',
      'grantedAmount',
      'id',
      'insurer',
      'items',
      'patient',
      'patientShare',
      'status',
      'updatedAt',
      'validUntil',
    ];
    const read = (id: string, cookie: string, organizationId = f.center) =>
      f.inject('GET', `${f.base(organizationId)}/${id}`, cookie);
    const reads = () => f.audits('medical_record.read');

    it('shows the center what the contract lists, and audits the read', async () => {
      const id = await f.submitted();
      const response = await read(id, f.doctor);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual(KEYS);
      expect(body).toMatchObject({
        id,
        status: 'submitted',
        center: { id: f.center, name: 'CSB A' },
        insurer: { id: f.insurer, name: 'OSTIE' },
        patient: {
          id: f.patientId,
          lastName: 'Rakoto',
          firstNames: 'Jean',
          birthDate: '1985-03-12',
        },
        affiliation: { id: f.affiliationId, memberNumber: 'OS-123456', status: 'validated' },
        diagnosis: { code: 'B54', label: 'Paludisme, sans précision' },
        items: [
          { actCode: 'CONS-GEN', quantity: 2, unitPrice: 15000, lineAmount: 30000 },
          { actCode: 'ECG', quantity: 1, unitPrice: 40000, lineAmount: 40000 },
        ],
        estimatedAmount: 70000,
        grantedAmount: null,
        createdBy: { fullName: expect.stringMatching(/^doctor\./) },
        events: [
          { fromStatus: null, toStatus: 'draft', reason: null },
          { fromStatus: 'draft', toStatus: 'submitted' },
        ],
      });
      expect(await reads()).toMatchObject([
        { entityType: 'coverage_request', entityId: id, organizationId: f.center },
      ]);
    });

    it('shows the insurer the same request and nothing else, never a draft', async () => {
      const id = await f.submitted();
      const response = await read(id, f.advisor, f.insurer);
      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json()).sort()).toEqual(KEYS);
      expect(response.json().center).toEqual({ id: f.center, name: 'CSB A' });
      expect((await read(await f.draft(), f.advisor, f.insurer)).statusCode).toBe(404);
    });

    it('never shows the insurer a request the center cancelled before submitting it', async () => {
      const neverSent = await f.draft();
      expect((await f.move(neverSent, f.doctor, { to: 'cancelled' })).statusCode).toBe(200);
      const withdrawn = await f.submitted();
      await f.move(withdrawn, f.doctor, { to: 'cancelled', reason: 'Patient transféré' });

      expect((await read(neverSent, f.advisor, f.insurer)).statusCode).toBe(404);
      const list = await f.inject('GET', f.base(f.insurer), f.advisor);
      expect(list.json().map((r: { id: string }) => r.id)).toEqual([withdrawn]);
      const move = await f.move(neverSent, f.advisor, { to: 'under_review' }, f.insurer);
      expect(move.statusCode).toBe(404);
      // Once sent, a request stays visible to its insurer, whatever happens to it next.
      expect((await read(withdrawn, f.advisor, f.insurer)).statusCode).toBe(200);
    });

    it('finds nothing from another center or insurer', async () => {
      const id = await f.submitted();
      const otherDoctor = await f.as('doctor', f.otherCenter);
      expect((await read(id, otherDoctor, f.otherCenter)).statusCode).toBe(404);
      expect((await read(id, f.otherAdvisor, f.otherInsurer)).statusCode).toBe(404);
    });

    it('keeps the request readable by the center when its author leaves', async () => {
      const id = await f.draft();
      const author = (await f.row(id)).createdBy;
      await ctx.db
        .delete(memberships)
        .where(and(eq(memberships.userId, author), eq(memberships.organizationId, f.center)));
      const { cookie } = await f.colleague('doctor', f.center);
      expect((await read(id, cookie)).statusCode).toBe(200);
    });

    it('refuses the roles without a coverage permission, and the super admin alone', async () => {
      const id = await f.submitted();
      await createUser(ctx.db, {
        email: 'root@example.mg',
        password: 'pass-12345',
        isSuperAdmin: true,
      });
      const root = (await login(ctx.app, 'root@example.mg', 'pass-12345')).cookie;
      const nurse = await f.as('nurse', f.center);
      const billing = await f.as('billing', f.center);
      for (const cookie of [f.reception, nurse, billing, root]) {
        expect((await read(id, cookie)).statusCode).toBe(403);
      }
      expect(await reads()).toEqual([]);
    });

    describe('the list', () => {
      const list = (cookie: string, organizationId = f.center, query = '') =>
        f.inject('GET', `${f.base(organizationId)}?${query}`, cookie);

      it('shows the center all its requests and the insurer all but drafts, audited', async () => {
        const draftId = await f.draft();
        const submittedId = await f.submitted();
        const center = await list(f.doctor);
        expect(
          center
            .json()
            .map((r: { id: string }) => r.id)
            .sort(),
        ).toEqual([draftId, submittedId].sort());
        expect(center.json()[0]).not.toHaveProperty('diagnosis');
        expect(center.json()[0]).not.toHaveProperty('items');
        const insurer = await list(f.advisor, f.insurer);
        expect(insurer.json()).toMatchObject([
          {
            id: submittedId,
            status: 'submitted',
            patient: { lastName: 'Rakoto' },
            center: { name: 'CSB A' },
          },
        ]);
        expect(await reads()).toMatchObject([
          { entityType: 'coverage_request', after: { coverageRequestIds: expect.any(Array) } },
          { entityType: 'coverage_request', after: { coverageRequestIds: [submittedId] } },
        ]);
      });

      it('filters by status and patient, and pages by 50', async () => {
        const submittedId = await f.submitted();
        await f.draft();
        expect((await list(f.doctor, f.center, 'status=submitted')).json()).toMatchObject([
          { id: submittedId },
        ]);
        const [stranger] = await ctx.db
          .insert(patients)
          .values({ lastName: 'Rabe', firstNames: 'Paul', birthDate: '1990-01-01', sex: 'male' })
          .returning();
        expect((await list(f.doctor, f.center, `patientId=${stranger!.id}`)).json()).toEqual([]);

        const template = await f.row(submittedId);
        const { id: _, ...values } = template;
        await ctx.db.insert(coverageRequests).values(Array.from({ length: 50 }, () => values));
        expect((await list(f.doctor)).json()).toHaveLength(50);
        expect((await list(f.doctor, f.center, 'offset=50')).json()).toHaveLength(2);
      });
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
