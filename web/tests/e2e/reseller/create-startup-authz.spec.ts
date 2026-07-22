// POST /api/reseller/create-startup pre-write authorization contract —
// P10 dry-run per plan §C.1.5 (wholesale provisioning form) and §J.2
// (Playwright must cover the reseller-admin endpoints so a regression in
// the auth → feature-gate → scope → normalise → DB-write ordering surfaces
// before the endpoint fires app_users / projects / reseller_attributions
// inserts, mints a magic-link, dispatches sendWholesaleWelcome, or writes
// reseller_audit_log(provision_startup)).
//
// The sibling normalise-error branches (invalid_email / company_name_required
// / invalid_plan_tier / invalid_discount_tier) already ship via
// create-startup-validation.spec.ts (tick 94). Those probes reach the
// normalise gate via a reseller-admin session, so the pre-auth chain (no
// session, non-reseller founder) was uncovered — this spec closes that gap
// with the same two-row pattern used by sandbox-setup-authz.spec.ts and
// billing-authz.spec.ts.
//
// Two branches are harness-free and safe against staging (no rows written
// to app_users / projects / reseller_attributions / reseller_audit_log, no
// magic-link mint, no email dispatch, no Stripe subscription create):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails before scope, body,
//                              or DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.create_startup"
//                              (gateRequireFeature bails because founder
//                              plans do not grant reseller.create_startup;
//                              scopedReseller, readBody, and every DB /
//                              Stripe / email branch is never touched)
//
// Route reference: web/src/app/api/reseller/create-startup/route.ts
//   Line 459-460: gateRequireFeature("reseller.create_startup") → 401/402 before scope
//   Line 463-471: scopedReseller(user) throws                   → 403 { reason: err.code }
//   Line 473-484: normaliseCreateStartupInput → invalid_* branch → 400 (covered by create-startup-validation.spec.ts)
//   Line 487-494: db.selfReseller null                           → 404 { reason: "reseller_missing" }
//   Line 518-521: getSupabaseAdmin() null                        → 503 { reason: "not_configured" }
//   Line 458+: decideCreateStartup → capability/tier/attribution gates → 400
//   Line 458+: execute() → app_users/projects/reseller_attributions writes → 200 / 500
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   sandbox-setup-authz.spec.ts, billing-authz.spec.ts, and
//   credit-grant-validation.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - no_membership (403 via scopedReseller) — needs a user with the
//     reseller.create_startup entitlement but no reseller_admins row;
//     inconsistent state that never occurs in production because the two
//     are provisioned together.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - reseller_not_active (400) / capability_disabled (400) /
//     billing_model_not_wholesale (400) / tier_not_allowed (400) /
//     existing_active_attribution (400) / promotion_code_missing (400)
//     — all six decideCreateStartup() branches sit BEHIND the auth chain
//     and need a real reseller row with specific column values (e.g.
//     billing_model='retail' for billing_model_not_wholesale, status
//     ='paused' for reseller_not_active, allowed_tiers not containing the
//     requested tier for tier_not_allowed). Asserting them here would
//     either need per-test row seeding (forbidden by plan §J.2) or a
//     bespoke harness that mints a temp reseller with the target state.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - Happy path (200 with project_id/user_id/magic_link_sent/stripe_wiring)
//     — fires app_users + projects + reseller_attributions inserts,
//     requestMagicLink mint, sendWholesaleWelcome dispatch, and
//     reseller_audit_log write against the harness reseller; folded into
//     the temp-reseller mint fixture follow-up alongside ticks 94/95/96/97/98.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/api/reseller/create-startup";
const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("Reseller create-startup pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, body parse, or DB read. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  test("non_reseller_admin — POST as a founder QA account returns 402 feature_locked", async ({
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
    const resp = await page.request.post(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope, body parse, or DB read. Body: ${await resp.text()}`,
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
    expect(body.feature).toBe("reseller.create_startup");
  });
});
