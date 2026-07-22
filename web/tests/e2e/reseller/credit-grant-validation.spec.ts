// POST /api/reseller/credits/grant input-validation contract — P10 dry-run
// per plan §D.3 (reseller_credit_grants mirror) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in the target/amount
// gate ordering surfaces before the endpoint fires DB writes).
//
// This spec probes the input-validation branches surfaced by
// web/src/app/api/reseller/credits/grant/route.ts before the endpoint
// touches credit_balances / credit_transactions / reseller_credit_grants:
//
//   1. invalid_body   — POST with no JSON body → 400
//   2. missing_id     — target_user_id absent from body      → 400
//                       (decideReveal returns reason='missing_id')
//   3. invalid_id     — target_user_id is not a UUID         → 400
//                       (decideReveal returns reason='invalid_id')
//   4. not_in_scope   — target_user_id is a random UUID that  → 403
//                       is not in the reseller's allowedCustomerIds
//                       (decideReveal returns reason='not_in_scope')
//   5. invalid_amount — amount ≤ 0 or non-integer, target is  → 400
//                       in scope so decideReveal passes but decideGrant
//                       bails at the invalid_amount gate
//                       (decideGrant returns reason='invalid_amount')
//
// Rows 1-4 return before any DB read fires; row 5 reads the monthly-grant
// rollup for the reseller but never writes, so the spec is safe against
// staging (no credit ledger pollution, no reseller_credit_grants row
// insertion).
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     create-startup-validation.spec.ts, audit-log-writes.spec.ts,
//     audit-anomaly-scan.spec.ts, attribution-timing.spec.ts,
//     scope-boundary.spec.ts.
//
// Downstream reasons (capability_disabled / over_budget_requires_approval
// / reseller_missing / not_configured) each need bespoke reseller-column
// state (can_grant_credits=false; already_granted_this_month ≥ budget; a
// scope that resolves to no reseller row; supabase-admin unavailable) —
// asserting them here would need per-test row seeding (forbidden by plan
// §J.2) or a QA-only mode toggle. Tracked as follow-up alongside the
// decideCreateStartup gate rows deferred by tick 94.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

// Random UUID that's astronomically unlikely to match any real app_users row
// so the not_in_scope branch fires deterministically. Passes decideReveal's
// UUID shape guard, then fails the allowedCustomerIds membership check.
const OUT_OF_SCOPE_UUID = "00000000-0000-4000-8000-000000000001";

test.describe("Reseller credit-grant input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_body — POST with no JSON body returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      // Deliberately send raw non-JSON so request.json() rejects and the
      // route hits its `if (!body)` guard.
      data: "not-json",
      headers: { "content-type": "text/plain" },
    });
    expect(
      resp.status(),
      `invalid_body returned ${resp.status()} — expected 400 before DB reads. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok, `invalid_body body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
    expect(body.reason).toBe("invalid_body");
  });

  test("missing_id — target_user_id absent returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `missing_id returned ${resp.status()} — expected 400 before DB writes. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("missing_id");
  });

  test("invalid_id — target_user_id not a UUID returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { target_user_id: "not-a-uuid", amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before DB writes. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_id");
  });

  test("not_in_scope — well-formed UUID outside allowedCustomerIds returns 403", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: { target_user_id: OUT_OF_SCOPE_UUID, amount: 100 },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before DB writes. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });

  test("invalid_amount — target in scope but amount ≤ 0 returns 400", async ({ page }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(`/api/reseller/credits/grant`, {
      data: {
        target_user_id: harness!.attributedCustomerId,
        amount: 0,
      },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `invalid_amount returned ${resp.status()} — expected 400 before any credit_balances write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_amount");
  });
});
