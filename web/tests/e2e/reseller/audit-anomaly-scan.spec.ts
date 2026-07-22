// Reseller audit-log anomaly scan — P10_hardening dry-run per plan
// Verification #5 (docs/plans/reseller-module-plan.md line 1223):
// "anomaly alert triggers at > 200 subject-reads/week (simulate)."
//
// This spec covers the second half of Verification #5 by hitting the
// standalone /api/cron/reseller-audit-anomaly-scan endpoint (tick 90) against
// a pinned low threshold. Fires N privileged reads (view_customer_drawer)
// against the harness-attributed customer, then asserts that both hotspot
// lists surface the (actor, subject) pair. The endpoint is scoped to the
// harness reseller via ?reseller_id= so audit rows from any other active
// tenant cannot inflate the hotspot count.
//
// The production weekly digest fold-in (tick 89) exercises the same
// buildAnomalySummary primitive with DEFAULT_ANOMALY_THRESHOLD=200 — infeasible
// to simulate under Playwright's per-test wall clock. This spec pins
// threshold=N (small integer) so the assertion runs in seconds.
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     audit-log-writes.spec.ts.
//   per-test on loadSupabaseAdmin() (needs SUPABASE_URL +
//     SUPABASE_SERVICE_ROLE_KEY).
//   per-test on findResellerIdForAdmin() returning null (would happen if the
//     harness admin email exists in app_users but has no active
//     reseller_admins membership — misconfigured seed rather than missing
//     env, so we skip with a specific reason instead of failing).
//
// CRON_SECRET: forwarded as `Authorization: Bearer …` when set in the spec
// env; the endpoint accepts unauthenticated requests when CRON_SECRET is
// unset (matching sibling reseller-* cron routes).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";
import {
  findResellerIdForAdmin,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

const READ_BURST = 5;
const SCAN_THRESHOLD = READ_BURST;

function cronAuthHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

test.describe("Reseller audit-log anomaly scan — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test(`fires ${READ_BURST} drawer reads → scan surfaces actor + subject hotspots`, async ({
    page,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    await loginAs(page, harness!.admin.email);
    const actorId = await findUserIdByEmail(supabase!, harness!.admin.email);
    expect(
      actorId,
      `expected app_users row for reseller admin ${harness!.admin.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    const resellerId = await findResellerIdForAdmin(supabase!, actorId!);
    test.skip(
      !resellerId,
      `reseller admin ${harness!.admin.email} has no active reseller_admins row — seed a membership before running this spec`,
    );

    // Fire a burst of privileged reads against the harness-attributed customer.
    // Each drawer GET writes reseller_audit_log(action='view_customer_drawer',
    // actor_user_id=admin, subject_user_id=attributedCustomerId,
    // reseller_id=resellerId) BEFORE returning the payload (per P4.2 wiring),
    // so by the time the burst resolves the count should be ≥ READ_BURST.
    for (let i = 0; i < READ_BURST; i++) {
      const resp = await page.request.get(
        `/api/reseller/customers/${harness!.attributedCustomerId}/drawer`,
      );
      expect(
        resp.ok(),
        `drawer request #${i + 1} returned ${resp.status()} — expected 200`,
      ).toBe(true);
    }

    // Anchor the window end slightly in the future so the just-fired reads
    // fall inside the scan's [now - window_days, now] range even under clock
    // skew. Scoping to reseller_id keeps rows from any other active tenant
    // out of the hotspot rollup.
    const now = new Date(Date.now() + 60 * 1000).toISOString();
    const scanUrl =
      `/api/cron/reseller-audit-anomaly-scan?threshold=${SCAN_THRESHOLD}` +
      `&reseller_id=${resellerId!}` +
      `&actions=view_customer_drawer` +
      `&now=${encodeURIComponent(now)}`;
    const scanResp = await page.request.get(scanUrl, {
      headers: cronAuthHeaders(),
    });
    expect(
      scanResp.ok(),
      `scan endpoint returned ${scanResp.status()} — expected 200; set CRON_SECRET in the Playwright env if the endpoint requires auth`,
    ).toBe(true);

    const body = (await scanResp.json()) as {
      ok: boolean;
      summary: {
        actor_hotspots: Array<{ actor_user_id: string; count: number; reseller_id: string }>;
        subject_hotspots: Array<{
          subject_user_id: string;
          count: number;
          reseller_id: string;
        }>;
      } | null;
      resellers_scanned: number;
    };
    expect(body.ok, `scan payload missing ok=true: ${JSON.stringify(body)}`).toBe(true);
    expect(
      body.resellers_scanned,
      `resellers_scanned mismatch — expected 1 when ?reseller_id= is pinned`,
    ).toBe(1);
    expect(body.summary, "scan summary should not be null when resellers_scanned=1").not.toBeNull();

    const actorHit = body.summary!.actor_hotspots.find(
      (h) => h.actor_user_id === actorId && h.reseller_id === resellerId,
    );
    expect(
      actorHit,
      `expected actor_hotspots to include (actor=${actorId}, reseller=${resellerId}); got ${JSON.stringify(body.summary!.actor_hotspots)}`,
    ).toBeDefined();
    expect(actorHit!.count).toBeGreaterThanOrEqual(READ_BURST);

    const subjectHit = body.summary!.subject_hotspots.find(
      (h) =>
        h.subject_user_id === harness!.attributedCustomerId && h.reseller_id === resellerId,
    );
    expect(
      subjectHit,
      `expected subject_hotspots to include (subject=${harness!.attributedCustomerId}, reseller=${resellerId}); got ${JSON.stringify(body.summary!.subject_hotspots)}`,
    ).toBeDefined();
    expect(subjectHit!.count).toBeGreaterThanOrEqual(READ_BURST);
  });
});
