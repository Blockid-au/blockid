// POST /api/reseller/billing/save-default-payment-method input-validation
// contract — P10 dry-run per plan §U.4 (billing mechanics) + §J.2 (Playwright
// must cover the reseller-admin endpoints so a regression in the auth →
// feature-gate → scope → role → invalid_json ordering surfaces before the
// endpoint fires stripe.setupIntents.retrieve, the
// invoice_settings.default_payment_method update, the
// resellers.stripe_default_payment_method_id persist, or the
// reseller_audit_log(save_default_payment_method) write).
//
// Track A P10 dry-run posture. billing-authz.spec.ts already probes the pre-
// scope auth chain (unauthenticated → 401 Authentication required;
// non_reseller_admin → 402 feature_locked / reseller.console) across BOTH
// billing routes (setup-intent + save-default-payment-method) and explicitly
// deferred invalid_json to a spec run behind QA_RESELLER_ADMIN_EMAIL because
// the request.json() catch sits BEHIND gateRequireFeature + scopedReseller +
// canProvisionSandbox and therefore needs a real reseller-admin session to
// surface. This tick lands that sibling twin of reveal-email-validation /
// drawer-validation / reports-signed-url-validation / requests-validation /
// credit-grant-validation / create-startup-validation — the single post-scope
// validation branch on save-default-payment-method that is safe to exercise
// without touching Stripe state or writing an audit-log row.
//
// One branch is harness-only and safe against staging (no
// stripe.setupIntents.retrieve, no invoice_settings.default_payment_method
// update, no stripe_default_payment_method_id persist, no
// reseller_audit_log(save_default_payment_method) row is written —
// request.json() rejects and the route returns BEFORE any of the Stripe/DB
// side effects fire):
//
//   invalid_json — POST with malformed JSON body → 400 { ok:false, reason:"invalid_json" }
//                  (request.json() catch at route.ts:68-76; short-circuits
//                   BEFORE isStripeConfigured/getSupabaseAdmin,
//                   db.selfReseller(), saveResellerDefaultPaymentMethod(),
//                   or db.auditLog(save_default_payment_method).)
//
// Route reference:
//   web/src/app/api/reseller/billing/save-default-payment-method/route.ts
//     Line 47-49: gateRequireFeature("reseller.console")   → 401/402
//     Line 51-59: scopedReseller throws                    → 403 { reason: err.code }
//     Line 61-66: canProvisionSandbox(scope.role) false    → 403 insufficient_role
//     Line 68-76: request.json() catch                     → 400 invalid_json  ← this spec
//     Line 80-87: !isStripeConfigured / !supabase          → 503 not_configured
//     Line 89-93: !selfReseller                            → 404 reseller_missing
//     Line 107-123: saveResellerDefaultPaymentMethod       → 400 / 200
//     Line 141-146: audit-log INSERT catch                 → 500 audit_failed
//
// Deliberately out of scope (needs the reseller QA harness plus per-test
// tampering / staging state which plan §J.2 forbids):
//   - insufficient_role (403) — needs a reseller admin with role='viewer';
//     the QA harness provisions owner/admin.
//   - reseller_missing (404) — needs a reseller_admins row without a matching
//     resellers row; per-test seeding.
//   - not_configured (503) — needs STRIPE_SECRET_KEY / SUPABASE_URL unset,
//     which would break every other Playwright spec in the same worker.
//   - saveResellerDefaultPaymentMethod 400 branches (setup_intent_not_found /
//     mismatched customer / retrieval failure) — need per-test tampering with
//     the Stripe SetupIntent state which plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail, which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with stripe_customer_id + payment_method_id +
//     setup_intent_id) — mints a real Stripe SetupIntent for the harness
//     reseller, updates invoice_settings.default_payment_method, persists
//     stripe_default_payment_method_id, and writes reseller_audit_log —
//     folded into the temp-reseller mint fixture follow-up alongside every
//     other deferred happy-path row from ticks 94..119.
//
// Note on the sibling /api/reseller/billing/setup-intent route: setup-intent
// accepts no request body and has no post-scope validators — once
// gateRequireFeature + scopedReseller + canProvisionSandbox + isStripeConfigured
// + selfReseller() all pass, the very next call is
// ensureResellerStripeCustomer() which either mints or retrieves a real
// Stripe Customer. There is no pre-side-effect branch under the QA harness to
// probe, so no dry-run rows exist for that route beyond the pre-scope auth
// pair already covered by billing-authz.spec.ts. This asymmetry mirrors the
// reveal-email → reveal-email-validation split (route has post-scope
// validators) vs. me → me-attribution (no post-scope validators, single spec
// file).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

const ROUTE = "/api/reseller/billing/save-default-payment-method";

test.describe("Reseller billing input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_json — save-default-payment-method with malformed JSON body returns 400 invalid_json", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    // Raw non-JSON payload (mirrors credit-grant-validation.spec.ts invalid_body
    // row). request.json() throws SyntaxError, the route's try/catch returns
    // 400 { ok:false, reason:"invalid_json" } and the Stripe/DB/audit chain
    // never fires.
    const resp = await page.request.post(ROUTE, {
      data: "not-json-{",
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `invalid_json returned ${resp.status()} — expected 400 before stripe.setupIntents.retrieve, invoice_settings.default_payment_method update, stripe_default_payment_method_id persist, or reseller_audit_log(save_default_payment_method) write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `invalid_json body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("invalid_json");
  });
});
