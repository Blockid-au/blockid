// POST /api/reseller/billing/setup-intent and
// POST /api/reseller/billing/save-default-payment-method pre-write
// authorization contract — P10 dry-run per plan §U.4 (billing mechanics)
// and §J.2 (Playwright must cover the reseller-admin endpoints so a
// regression in the auth → feature-gate → scope → role gate ordering
// surfaces before the Stripe SetupIntent mint or the
// reseller_audit_log(mint_setup_intent / save_default_payment_method) row).
//
// Both routes share the same top auth chain:
//   1. gateRequireFeature("reseller.console") → 401 / 402 before scope
//   2. scopedReseller(user)                    → 403 { reason: err.code }
//   3. canProvisionSandbox(scope.role) false   → 403 { reason: "insufficient_role" }
//   4. Stripe/Supabase not configured          → 503 { reason: "not_configured" }
//   5. selfReseller() null                     → 404 { reason: "reseller_missing" }
//   6. Stripe API branch                       → 400 / 200
//
// Two branches per route are harness-free and safe against staging (no
// SetupIntent minted, no reseller_audit_log row written, no
// stripe_default_payment_method_id persisted):
//
//   unauthenticated       — POST with no session          → 401 error="Authentication required"
//                            (gateRequireFeature bails before scope/DB/Stripe read)
//   non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.console"
//                            (gateRequireFeature bails because founder plans
//                            do not grant reseller.console; scopedReseller,
//                            selfReseller, and Stripe are never touched)
//
// Route references:
//   web/src/app/api/reseller/billing/setup-intent/route.ts
//     Line 52-54: gateRequireFeature("reseller.console") → 401/402
//     Line 56-64: scopedReseller(user) throws            → 403
//     Line 66-73: canProvisionSandbox(scope.role) false  → 403 insufficient_role
//     Line 75-82: !isStripeConfigured/!supabase          → 503 not_configured
//     Line 84-88: !selfReseller                          → 404 reseller_missing
//     Line 90-135: ensureResellerStripeCustomer + createResellerSetupIntent → 400 / 200
//
//   web/src/app/api/reseller/billing/save-default-payment-method/route.ts
//     Line 47-49: gateRequireFeature("reseller.console") → 401/402
//     Line 51-59: scopedReseller(user) throws            → 403
//     Line 61-66: canProvisionSandbox(scope.role) false  → 403 insufficient_role
//     Line 68-76: request.json() catch                   → 400 invalid_json
//     Line 80-87: !isStripeConfigured/!supabase          → 503 not_configured
//     Line 89-93: !selfReseller                          → 404 reseller_missing
//     Line 107-123: saveResellerDefaultPaymentMethod    → 400 / 200
//
// Skips:
//   Non-reseller-admin rows skip at test-scope if the qa-founder-1 account
//   is not seeded (loginAs throws). Unauthenticated rows always run — no
//   harness required — so this spec lights up in CI on the next
//   `npx playwright test` pass alongside sandbox-setup-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - insufficient_role (403) — needs a reseller admin with role='viewer';
//     QA harness assumes owner/admin.
//   - no_membership (403 via scopedReseller) — needs entitlement without
//     reseller_admins row; inconsistent state never occurs in production.
//   - invalid_json (400 on save-default-payment-method) — sits BEHIND the
//     auth chain (gateRequireFeature + scopedReseller + canProvisionSandbox
//     all fire first), so surfacing it needs a real reseller-admin session.
//   - reseller_missing (404) — needs reseller_admins row without matching
//     resellers row; per-test seeding.
//   - not_configured (503) — needs STRIPE_SECRET_KEY/SUPABASE_URL unset,
//     which would break every other Playwright spec in the same worker.
//   - Happy path (200 with client_secret + setup_intent_id, or 200 with
//     payment_method_id) — mints a real Stripe SetupIntent + writes
//     reseller_audit_log against the harness reseller; folded into the
//     temp-reseller mint fixture follow-up alongside ticks 94/95/96/97/98.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTES = [
  "/api/reseller/billing/setup-intent",
  "/api/reseller/billing/save-default-payment-method",
] as const;

test.describe("Reseller billing pre-write authorization — P10 dry-run", () => {
  for (const route of ROUTES) {
    test(`unauthenticated — POST ${route} with no session returns 401`, async ({
      request,
    }) => {
      const resp = await request.post(route);
      expect(
        resp.status(),
        `unauthenticated returned ${resp.status()} — expected 401 before scope, Stripe, or DB read. Body: ${await resp.text()}`,
      ).toBe(401);
      const body = (await resp.json()) as { ok: boolean; error?: string };
      expect(
        body.ok,
        `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(body.error).toBe("Authentication required");
    });

    test(`non_reseller_admin — POST ${route} as a founder QA account returns 402 feature_locked`, async ({
      page,
    }) => {
      try {
        await loginAs(page, NON_RESELLER_FOUNDER_EMAIL);
      } catch (err) {
        test.skip(
          true,
          `Non-reseller founder account not seeded: ${(err as Error).message}. ` +
            `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
        );
        return;
      }
      const resp = await page.request.post(route);
      expect(
        resp.status(),
        `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope, Stripe, or DB read. Body: ${await resp.text()}`,
      ).toBe(402);
      const body = (await resp.json()) as {
        ok: boolean;
        error?: string;
        feature?: string;
        reason?: string;
      };
      expect(
        body.ok,
        `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(body.error).toBe("feature_locked");
      expect(body.feature).toBe("reseller.console");
    });
  }
});
