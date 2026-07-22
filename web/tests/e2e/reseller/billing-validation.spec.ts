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
//
// ACTIVATED wave-5 row 183 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe covers
// the env-based loadResellerHarness contract for hosts that hold the
// QA_RESELLER_ADMIN_EMAIL env-var; the new describe covers the QAPROBE
// cohort (per seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1) so a
// spec-worker that never sets QA_RESELLER_ADMIN_EMAIL still exercises the
// same invalid_json branch. Both blocks assert the identical invariant
// (malformed JSON body → 400 { reason:"invalid_json" } BEFORE the Stripe/DB/
// audit chain fires) so a regression in the request.json() catch, in
// gateRequireFeature ordering, in scopedReseller ordering, or in
// canProvisionSandbox ordering lights up on either path. Mirror-shape of
// wave-5 row 181 (scope-boundary twin describe tick 177) but with the
// simplest possible fixture usage — no attachAttributedCustomer, no
// attachReportRow, no projects lookup, because request.json() rejects at
// route.ts:68-76 before the endpoint ever reads reseller state or the
// attributed customer graph.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

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

// Wave-5 row 183 — save-default-payment-method invalid_json branch driven via
// the temp-reseller mint fixture's active_wholesale variant. Twin of the pre-
// existing describe: uses fixture.adminEmail (P10 Option A per-variant slot)
// instead of the env-based QA_RESELLER_ADMIN_EMAIL, so a QAPROBE-cohort host
// covers the branch without setting either QA_* env var. Fixture wiring is
// intentionally minimal — no attachAttributedCustomer, no attachReportRow, no
// projects lookup — because request.json() rejects at route.ts:68-76 BEFORE
// isStripeConfigured, selfReseller, saveResellerDefaultPaymentMethod, or the
// reseller_audit_log(save_default_payment_method) row are touched. Two skip
// conditions:
//   1. fixture null / fixtureError → tempResellerSkipReason.
//   2. fixture.adminUserId null → per-variant admin app_users row missing.
// attributedUserId + attributionExists are NOT checked because this route
// operates on self-scope (the reseller's own Stripe Customer), not on an
// attributed customer's records — the auth chain never touches
// scopedReseller().allowedCustomerIds(). Mirror-shape follows the row-181
// scope-boundary posture (beforeAll fixture load + afterAll cleanup) so a
// side-by-side diff against scope-boundary.spec.ts shows only the branch
// difference (single invalid_json probe vs. the four scope-refusal probes).
test.describe("Reseller billing input validation — P10 wave-5 row 183 happy path", () => {
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
        // Bubble so a partial cleanup fails the run rather than leaking
        // fixture state into the next spec worker. Matches row 181 posture.
        throw new Error(
          `wave-5 row 183 cleanup failed: ${(err as Error).message}`,
        );
      }
    }
  });

  test("active_wholesale — save-default-payment-method invalid_json POST as reseller-admin returns 400 invalid_json", async ({
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
    if (!fixture.adminUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller-admin app_users row missing for ${fixture.adminEmail}. Run seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate the per-variant admin row.`,
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

    // Raw non-JSON payload identical to the pre-existing describe's row so a
    // regression in the request.json() catch surfaces on either path. Content-
    // type header set to application/json so the framework does not silently
    // coerce the payload into form-urlencoded.
    const resp = await page.request.post(ROUTE, {
      data: "not-json-{",
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `active_wholesale + invalid_json returned ${resp.status()} — expected 400 before stripe.setupIntents.retrieve, invoice_settings.default_payment_method update, stripe_default_payment_method_id persist, or reseller_audit_log(save_default_payment_method) write. A 401 here means the QAPROBE cohort's reseller-admin session did not land (investigate seed-qa-reseller.mjs output + /tmp/blockid-qa-accounts.txt). A 402 feature_locked means the QAPROBE cohort's admin lacks the reseller.console entitlement (investigate seed-qa-reseller.mjs entitlements insert). A 403 insufficient_role means canProvisionSandbox rejected the seeded role (should be owner/admin per seed). Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `active_wholesale + invalid_json body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("invalid_json");
  });
});
