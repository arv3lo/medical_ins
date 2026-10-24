import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  affiliations,
  auditLogs,
  coverageRequestEvents,
  coverageRequests,
} from '../src/db/schema.js';
import { type CoverageFixture, coverageFixture } from './coverage-fixtures.js';
import { TEST_DATABASE_URL, setupTestApp, withAuditFailing } from './helpers.js';

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

  // SC-004: whatever a scenario did, each request's last history event is its current status.
  afterEach(async () => {
    const requests = await ctx.db.select().from(coverageRequests);
    for (const request of requests) {
      const history = await f.events(request.id);
      expect(history.at(-1)?.toStatus, `history of ${request.id}`).toBe(request.status);
    }
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

  describe('the center completes the cycle', () => {
    const granted = () =>
      f.requestAt(
        [f.doctor, { to: 'submitted' }],
        [f.advisor, { to: 'under_review' }, f.insurer],
        [f.advisor, { to: 'granted', grantedAmount: 70000, validUntil: '2999-12-31' }, f.insurer],
      );

    it('answers a request for more information and submits again', async () => {
      const id = await f.underReview();
      await decide(id, { to: 'info_requested', reason: 'Ordonnance manquante' });
      const patch = await f.inject('PATCH', `${f.base()}/${id}`, f.doctor, {
        items: [{ actCode: 'ECG', quantity: 1 }],
      });
      expect(patch.statusCode).toBe(200);
      expect((await f.move(id, f.doctor, { to: 'submitted' })).statusCode).toBe(200);
      const history = (await f.events(id)).map((e) => e.toStatus);
      expect(history).toEqual([
        'draft',
        'submitted',
        'under_review',
        'info_requested',
        'submitted',
      ]);
    });

    it('cancels a draft freely, a sent request only with a reason, and for good', async () => {
      const draftId = await f.draft();
      expect((await f.move(draftId, f.doctor, { to: 'cancelled' })).statusCode).toBe(200);

      const sent = [await f.submitted(), await f.underReview()];
      const sentBack = await f.underReview();
      await decide(sentBack, { to: 'info_requested', reason: 'Préciser' });
      for (const id of [...sent, sentBack]) {
        expect((await f.move(id, f.doctor, { to: 'cancelled' })).statusCode).toBe(400);
        const cancel = await f.move(id, f.doctor, { to: 'cancelled', reason: 'Patient transféré' });
        expect(cancel.statusCode).toBe(200);
      }
      expect((await f.move(draftId, f.doctor, { to: 'submitted' })).statusCode).toBe(409);
    });

    it('marks a grant used until its validity date, not after', async () => {
      const id = await granted();
      expect((await f.move(id, f.doctor, { to: 'used' })).statusCode).toBe(200);

      const late = await granted();
      await ctx.db
        .update(coverageRequests)
        .set({ validUntil: '2000-01-01' })
        .where(eq(coverageRequests.id, late));
      const response = await f.move(late, f.doctor, { to: 'used' });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/expiré/);
    });

    it('leaves expiry and billing to the system, out of reach over HTTP', async () => {
      const id = await granted();
      expect((await f.move(id, f.doctor, { to: 'expired' })).statusCode).toBe(409);
      expect((await decide(id, { to: 'expired' })).statusCode).toBe(409);
      await f.move(id, f.doctor, { to: 'used' });
      expect((await f.move(id, f.doctor, { to: 'billed' })).statusCode).toBe(409);
    });
  });

  describe('history and audit', () => {
    it('writes nothing when the audit entry fails: status, event and audit go together', async () => {
      const id = await f.draft();
      const response = await withAuditFailing(ctx.db, () =>
        f.move(id, f.doctor, { to: 'submitted' }),
      );
      expect(response.statusCode).toBe(500);
      expect((await f.row(id)).status).toBe('draft');
      expect((await f.events(id)).map((e) => e.toStatus)).toEqual(['draft']);
    });

    it('keeps diagnosis, act labels and reasons out of every audit entry (SC-002)', async () => {
      const MARKER = 'MOTIF-REPERABLE-7731';
      const id = await f.draft();
      const patch = (payload: object) => f.inject('PATCH', `${f.base()}/${id}`, f.doctor, payload);
      expect((await patch({ items: [{ actCode: 'ECHO-ABD', quantity: 1 }] })).statusCode).toBe(200);
      await f.move(id, f.doctor, { to: 'submitted' });
      await decide(id, { to: 'under_review' });
      await decide(id, { to: 'info_requested', reason: `${MARKER} ordonnance ?` });
      expect((await patch({ diagnosisCode: 'J00' })).statusCode).toBe(200);
      await f.move(id, f.doctor, { to: 'submitted' });
      await decide(id, { to: 'under_review' });
      const granted = await decide(id, {
        to: 'granted',
        grantedAmount: 50000,
        validUntil: '2999-12-31',
        reason: `${MARKER} plafond`,
      });
      expect(granted.statusCode).toBe(200);
      expect((await f.move(id, f.doctor, { to: 'used' })).statusCode).toBe(200);
      await f.inject('GET', `${f.base()}/${id}`, f.doctor);

      const entries = JSON.stringify(await ctx.db.select().from(auditLogs));
      for (const secret of [
        MARKER,
        'Échographie abdominale',
        'Paludisme',
        'Rhinopharyngite',
        '"B54"',
        '"J00"',
      ]) {
        expect(entries).not.toContain(secret);
      }
      // The reasons are kept where they belong: in the request's own history.
      expect((await f.events(id)).filter((e) => e.reason?.includes(MARKER))).toHaveLength(2);
    });

    it('lets exactly one of two concurrent decisions through (SC-003)', async () => {
      const id = await f.underReview();
      let pending!: Promise<{ statusCode: number }[]>;
      await ctx.db.transaction(async (tx) => {
        // Holds the request so both decisions queue on its lock, then lets them run.
        await tx.select().from(coverageRequests).where(eq(coverageRequests.id, id)).for('update');
        pending = Promise.all([
          decide(id, { to: 'granted', grantedAmount: 70000, validUntil: '2999-12-31' }),
          decide(id, { to: 'rejected', reason: 'Hors contrat' }),
        ]);
        while ((await waitingOnLock()) < 2) await new Promise((r) => setTimeout(r, 10));
      });
      const codes = (await pending).map((r) => r.statusCode).sort();
      expect(codes).toEqual([200, 409]);
      const decisions = (await f.events(id)).filter((e) => e.fromStatus === 'under_review');
      expect(decisions).toHaveLength(1);
    });

    it('never changes or deletes a history event', async () => {
      const id = await f.draft();
      await expect(
        ctx.db
          .update(coverageRequestEvents)
          .set({ reason: 'réécrit' })
          .where(eq(coverageRequestEvents.coverageRequestId, id)),
      ).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/append-only \((UPDATE|DELETE) rejected\)/) },
      });
      await expect(
        ctx.db.delete(coverageRequestEvents).where(eq(coverageRequestEvents.coverageRequestId, id)),
      ).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/append-only \((UPDATE|DELETE) rejected\)/) },
      });
    });
  });

  async function waitingOnLock() {
    const rows = await ctx.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return rows[0]!.n;
  }
});
