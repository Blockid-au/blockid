// POST /api/reseller/create-startup input-validation contract — P10 dry-run
// per plan §C.1.5 (wholesale provisioning form) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in
// normaliseCreateStartupInput surfaces before the endpoint fires DB writes).
//
// This spec probes the four normalise-error branches surfaced by
// web/src/lib/reseller/create-startup.ts::normaliseCreateStartupInput():
//   1. invalid_email        — blank/malformed founder_email
//   2. company_name_required — blank company_name
//   3. invalid_plan_tier    — plan_tier !== WHOLESALE_PLAN_ID
//   4. invalid_discount_tier — tier outside {0,10,20,30,40}
//
// Each row POSTs a deliberately-malformed body, expects HTTP 400, and asserts
// body.reason matches the CreateStartupError enum literal. No DB writes fire
// on the 400 path (the route bails at the normalise gate before touching
// app_users / projects / reseller_attributions), so the spec runs safely
// against staging without pollution.
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     audit-log-writes.spec.ts, audit-anomaly-scan.spec.ts,
//     attribution-timing.spec.ts.
//
// Downstream reasons (reseller_not_active / capability_disabled /
// billing_model_not_wholesale / tier_not_allowed / existing_active_attribution
// / promotion_code_missing) fire from decideCreateStartup() after the
// normalise gate. Those need a real reseller row with specific column values
// (e.g. billing_model='retail' for billing_model_not_wholesale) — asserting
// them here would either need per-test row seeding (forbidden by plan §J.2)
// or a bespoke harness that mints a temp reseller with the target state.
// Tracked in the "deliberately out of scope" list of the tick 94 log entry.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

interface ValidationCase {
  label: string;
  body: Record<string, unknown>;
  expectedReason:
    | "invalid_email"
    | "company_name_required"
    | "invalid_plan_tier"
    | "invalid_discount_tier";
}

// Common valid fields — each case overrides exactly one field to trip its
// target gate, so a passing assertion proves that specific branch fires
// (rather than an earlier-in-order gate absorbing the failure). Gate order
// per normaliseCreateStartupInput: email → company → plan_tier → discount_tier.
const VALID_BASE = {
  founder_email: "qa-createstartup-probe@blockid.au",
  company_name: "QA Probe Co",
  plan_tier: "founder_growth",
  discount_tier: 20,
};

const CASES: ValidationCase[] = [
  {
    label: "invalid_email — blank founder_email",
    body: { ...VALID_BASE, founder_email: "" },
    expectedReason: "invalid_email",
  },
  {
    label: "company_name_required — blank company_name",
    body: { ...VALID_BASE, company_name: "   " },
    expectedReason: "company_name_required",
  },
  {
    label: "invalid_plan_tier — non-wholesale plan_tier",
    body: { ...VALID_BASE, plan_tier: "founder_scale" },
    expectedReason: "invalid_plan_tier",
  },
  {
    label: "invalid_discount_tier — tier outside {0,10,20,30,40}",
    body: { ...VALID_BASE, discount_tier: 15 },
    expectedReason: "invalid_discount_tier",
  },
];

test.describe("Reseller create-startup input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(`/api/reseller/create-startup`, {
        data: c.body,
        headers: { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected 400 (normalise gate rejects before decideCreateStartup / DB writes). Body: ${await resp.text()}`,
      ).toBe(400);
      const body = (await resp.json()) as { ok: boolean; reason: string; message?: string };
      expect(body.ok, `${c.label} body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
      expect(
        body.message,
        `${c.label} response should include human-readable message from CREATE_STARTUP_ERROR_MESSAGES`,
      ).toBeTruthy();
    });
  }
});
