import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { affiliations } from '../src/db/schema.js';
import { type CoverageFixture, coverageFixture } from './coverage-fixtures.js';
import { TEST_DATABASE_URL, setupTestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('coverage requests: transitions', () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  let f: CoverageFixture;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    f = await coverageFixture(ctx);
  });

  /** A move by the medical advisor of the insurer (or another cookie), through the insurer's URL. */
  const decide = (id: string, payload: object, cookie = f.advisor, organizationId = f.insurer) =>
    f.move(id, cookie, payload, organizationId);

  describe('the medical advisor decides', () => {
    it('takes a submitted request under review', async () => {
      const id = await f.submitted();
      const response = await decide(id, { to: 'under_review' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id, status: 'under_review' });
    });

    it('grants in full, with no share left to the patient', async () => {
      const id = await f.underReview();
      const response = await decide(id, {
        to: 'granted',
        grantedAmount: 70000,
        validUntil: '2999-12-31',
      });
      expect(response.statusCode).toBe(200);
      expect(await f.row(id)).toMatchObject({
        status: 'granted',
        grantedAmount: 70000,
        patientShare: 0,
        validUntil: '2999-12-31',
      });
      expect(await f.audits('coverage_request.granted')).toMatchObject([
        {
          entityId: id,
          after: {
            from: 'under_review',
            to: 'granted',
            grantedAmount: 70000,
            validUntil: '2999-12-31',
          },
        },
      ]);
    });

    it('grants in part with a reason, the rest falling to the patient', async () => {
      const id = await f.underReview();
      const response = await decide(id, {
        to: 'granted',
        grantedAmount: 50000,
        validUntil: '2999-12-31',
        reason: 'Plafond annuel',
      });
      expect(response.statusCode).toBe(200);
      expect(await f.row(id)).toMatchObject({ grantedAmount: 50000, patientShare: 20000 });
      expect((await f.events(id)).at(-1)).toMatchObject({
        toStatus: 'granted',
        reason: 'Plafond annuel',
      });
    });

    it('refuses a grant out of bounds, without a date to come, or partial without a reason', async () => {
      const id = await f.underReview();
      const grant = { to: 'granted', validUntil: '2999-12-31' };
      for (const payload of [
        { ...grant, grantedAmount: 50000 },
        { ...grant, grantedAmount: 70001 },
        { ...grant, grantedAmount: 0 },
        { ...grant, grantedAmount: -5 },
        { to: 'granted', grantedAmount: 70000, validUntil: '2000-01-01' },
      ]) {
        expect((await decide(id, payload)).statusCode, JSON.stringify(payload)).toBe(400);
      }
      expect((await f.row(id)).status).toBe('under_review');
    });

    it('requires a reason to reject or to ask for more information', async () => {
      const id = await f.underReview();
      expect((await decide(id, { to: 'rejected' })).statusCode).toBe(400);
      expect((await decide(id, { to: 'info_requested' })).statusCode).toBe(400);
      expect((await decide(id, { to: 'rejected', reason: 'Acte hors contrat' })).statusCode).toBe(
        200,
      );
    });

    it('still decides when the affiliation ended after submission', async () => {
      const id = await f.underReview();
      await ctx.db
        .update(affiliations)
        .set({ status: 'withdrawn' })
        .where(eq(affiliations.id, f.affiliationId));
      expect((await decide(id, { to: 'rejected', reason: 'Affiliation retirée' })).statusCode).toBe(
        200,
      );
    });
  });

  describe('who may decide', () => {
    it('never the center', async () => {
      const id = await f.underReview();
      const response = await f.move(id, f.doctor, {
        to: 'granted',
        grantedAmount: 70000,
        validUntil: '2999-12-31',
      });
      expect(response.statusCode).toBe(409);
    });

    it('never another insurer, nor any insurer on a draft', async () => {
      const id = await f.underReview();
      const other = await decide(
        id,
        { to: 'rejected', reason: 'x' },
        f.otherAdvisor,
        f.otherInsurer,
      );
      expect(other.statusCode).toBe(404);
      const draftId = await f.draft();
      expect((await decide(draftId, { to: 'under_review' })).statusCode).toBe(404);
    });

    it('not an insurer acting through the URL of an organization it does not belong to', async () => {
      const id = await f.submitted();
      expect((await decide(id, { to: 'under_review' }, f.otherAdvisor, f.insurer)).statusCode).toBe(
        403,
      );
    });
  });
});
