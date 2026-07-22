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
//
// ACTIVATED wave-5 row 180 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe covers
// the env-based loadResellerHarness contract for hosts that keep the
// QA_RESELLER_ADMIN_EMAIL / QA_RESELLER_ATTRIBUTED_CUSTOMER_ID env-var
// contract alive; the new describe covers the temp-reseller mint fixture
// route so a QAPROBE-cohort host (per seed-qa-reseller.mjs with
// QA_RESELLER_MULTI_ADMIN=1) gets identical hotspot coverage without
// setting either QA_* env-var. Both blocks assert the same invariant
// (READ_BURST privileged drawer reads inflate actor_hotspots +
// subject_hotspots at threshold=READ_BURST) so a regression in the scan
// endpoint's aggregation or reseller-scoping lights up on either path.
// Mirror-shape of wave-5 row 179 (audit-log-writes twin describe tick
// 175).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
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

// Wave-5 row 180 — admin cron happy 200 with anomaly summary against the
// temp-reseller mint fixture's active_wholesale variant. Twin of the pre-
// existing describe: uses fixture.resellerId + fixture.adminUserId +
// fixture.attributedUserId (all resolved via loadTempReseller) instead of
// leaning on the env-based loadResellerHarness contract + findUserIdByEmail
// + findResellerIdForAdmin lookups. That means a QAPROBE-cohort host —
// which mints per-variant reseller rows via seed-qa-reseller.mjs with
// QA_RESELLER_MULTI_ADMIN=1 — covers the same scan-endpoint invariant
// without a second env-var flip. Mirror-shape of wave-5 row 179
// (audit-log-writes twin describe tick 175): fixture in beforeAll, five-
// step skip discipline (fixture null / attributedUserId null /
// !attributionExists / adminUserId null / attach null), attach the cache
// column via attachAttributedCustomer() so the drawer burst clears
// scopedReseller().allowedCustomerIds(), fire READ_BURST=5 drawer reads,
// then GET /api/cron/reseller-audit-anomaly-scan pinned to
// fixture.resellerId + threshold=READ_BURST and assert both hotspot lists
// surface the (actor, subject, reseller) triple.
test.describe("Reseller audit-log anomaly scan — P10 wave-5 row 180 happy path", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // attribution_reseller_id state into the next spec worker.
        throw new Error(
          `wave-5 row 180 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  test(`fires ${READ_BURST} drawer reads → scan surfaces actor + subject hotspots`, async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    if (!fixture.attributionExists) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so scopedReseller().allowedCustomerIds() would return 403 not_in_scope on drawer reads. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attribution row lands alongside the reseller_admins mirror.`,
      );
      return;
    }
    if (!fixture.adminUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller-admin app_users row missing for ${fixture.adminEmail}. Run seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate the per-variant admin row.`,
      );
      return;
    }

    // attachAttributedCustomer() hydrates app_users.attribution_reseller_id
    // for the attributed founder against THIS variant's reseller_id so the
    // reseller-admin session's first drawer request clears
    // scopedReseller().allowedCustomerIds() without depending on a cache-
    // warming side effect from a sibling spec. Restore closure runs in
    // afterAll via fixture.cleanup() so a failing assertion cannot leak the
    // cache flip.
    const attach = await fixture.attachAttributedCustomer();
    if (!attach) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }

    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const actorId = fixture.adminUserId;
    const subjectId = attach.attributedUserId;
    const resellerId = fixture.resellerId;

    // Fire the burst of privileged reads against the fixture-attributed
    // customer. Each drawer GET writes reseller_audit_log(action=
    // 'view_customer_drawer', actor_user_id=adminUserId, subject_user_id=
    // attributedUserId, reseller_id=resellerId) BEFORE returning the payload
    // (per P4.2 wiring), so by the time the burst resolves the count should
    // be ≥ READ_BURST.
    for (let i = 0; i < READ_BURST; i++) {
      const resp = await page.request.get(
        `/api/reseller/customers/${subjectId}/drawer`,
      );
      expect(
        resp.ok(),
        `drawer request #${i + 1} returned ${resp.status()} — expected 200. Body: ${await resp.text()}`,
      ).toBe(true);
    }

    // Anchor the window end slightly in the future so the just-fired reads
    // fall inside the scan's [now - window_days, now] range even under clock
    // skew. Scoping to fixture.resellerId keeps rows from any other active
    // tenant out of the hotspot rollup — critical when the QAPROBE cohort
    // mints multiple variants against the same admin account slot.
    const now = new Date(Date.now() + 60 * 1000).toISOString();
    const scanUrl =
      `/api/cron/reseller-audit-anomaly-scan?threshold=${SCAN_THRESHOLD}` +
      `&reseller_id=${resellerId}` +
      `&actions=view_customer_drawer` +
      `&now=${encodeURIComponent(now)}`;
    const scanResp = await page.request.get(scanUrl, {
      headers: cronAuthHeaders(),
    });
    expect(
      scanResp.ok(),
      `scan endpoint returned ${scanResp.status()} — expected 200; set CRON_SECRET in the Playwright env if the endpoint requires auth. Body: ${await scanResp.text()}`,
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
      (h) => h.subject_user_id === subjectId && h.reseller_id === resellerId,
    );
    expect(
      subjectHit,
      `expected subject_hotspots to include (subject=${subjectId}, reseller=${resellerId}); got ${JSON.stringify(body.summary!.subject_hotspots)}`,
    ).toBeDefined();
    expect(subjectHit!.count).toBeGreaterThanOrEqual(READ_BURST);
  });
});
