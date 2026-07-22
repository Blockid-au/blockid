// POST /api/reseller/credits/grant pre-write authorization contract —
// P10 dry-run per plan §U.4 (reseller capabilities) and §J.2 (Playwright
// must cover the reseller-admin endpoints so a regression in the auth →
// feature-gate → scope → decideReveal → decideGrant ordering surfaces before
// the endpoint fires the credit_balances upsert / credit_transactions insert /
// reseller_credit_grants mirror / reseller_audit_log(grant_credits) row).
//
// Track A P6.3 shipped tick 26 (see reseller-module-goal.md P6.3_grant_api).
// credit-grant-validation.spec.ts already covers the input-validation
// branches surfaced after the auth gate (invalid_body / missing_id /
// invalid_id / not_in_scope / invalid_amount) but skips the pre-scope
// auth-chain rows because they need harness-free session shapes rather
// than the QA_RESELLER_ADMIN_EMAIL / QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
// pair. This spec closes that gap alongside the other reseller-lens
// auth-chain specs (reveal-email tick 100, drawer tick 101, me tick 102,
// admin-* ticks 103-111, reseller-crons tick 112, create-startup tick 113,
// showcase-reviews tick 114).
//
// Two branches are harness-free and safe against staging (no rows written
// to credit_balances / credit_transactions / reseller_credit_grants /
// reseller_audit_log):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails at getCurrentUser()
//                              null before scope, allowedCustomerIds,
//                              decideReveal, decideGrant, or any DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.grant_credits"
//                              (gateRequireFeature bails because founder plans
//                              do not grant reseller.grant_credits;
//                              scopedReseller never runs and reseller_admins
//                              is never queried)
//
// Route reference: web/src/app/api/reseller/credits/grant/route.ts
//   Line 53-54: gateRequireFeature("reseller.grant_credits") → 401/402
//   Line 57-65: scopedReseller(user) throws                  → 403 { reason: err.code }
//   Line 67-70: req.json() null / bad JSON                   → 400 { reason: "invalid_body" }
//   Line 82-87: decideReveal(target_user_id, allowed)        → 400 missing/invalid_id | 403 not_in_scope
//   Line 89-92: getSupabaseAdmin() null                      → 503 { reason: "not_configured" }
//   Line 96-99: !self (reseller_admins → no resellers)       → 404 { reason: "reseller_missing" }
//   Line 103-113: reseller_credit_grants rollup SELECT       → 500 { reason: "rollup_failed" }
//   Line 120-148: decideGrant                                 → 400 invalid_amount | 403 capability_disabled | 402 over_budget_requires_approval
//   Line 152-224: credit_balances upsert + credit_transactions
//                 insert + reseller_credit_grants mirror     → 500 each on failure
//   Line 227-248: db.auditLog(action='grant_credits')        → 500 { reason: "audit_failed" }
//   Line 250-260: 200 { ok:true, balance, credit_transaction_id, ... }
//
// The auth-chain rows probe LINE 53-54 exclusively — rows 3-onwards need
// either QA_RESELLER_ADMIN_EMAIL session (rows 3-N) or per-test seeding
// which plan §J.2 forbids.
//
// Body shape sent on both probes: a syntactically-valid POST body with a
// well-formed uuid target_user_id + positive integer amount so that IF the
// auth gate were to leak (regression), the request would still be a
// realistic grant attempt and the resulting error surface (403 not_in_scope
// or downstream) would be a legitimate signal — never a false positive
// from a malformed body bailing at the wrong branch.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - insufficient_role / no_membership (403) — needs a reseller admin
//     with a specific role or a mismatched reseller_admins state.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - capability_disabled (403) — needs a reseller row with
//     can_grant_credits=false; per-test seeding.
//   - over_budget_requires_approval (402) — needs a reseller row with
//     monthly_credit_budget set + prior reseller_credit_grants rows
//     summing to > budget; per-test seeding.
//   - Happy path (200) — fires the full 4-write chain (credit_balances +
//     credit_transactions + reseller_credit_grants + reseller_audit_log)
//     against the harness reseller + attributed customer; belongs to the
//     temp-reseller mint fixture follow-up alongside ticks 94..114.
//
// Placeholder UUIDs: all-zeros values that will never match a real
// app_users.id or reseller_attributions.subject_user_id row because the
// signup flow uses crypto.randomUUID(); the auth gate should reject the
// request BEFORE decideReveal walks these values.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/api/reseller/credits/grant";
const PLACEHOLDER_TARGET_USER_ID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_AMOUNT = 10;

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("Reseller credit-grant pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(ROUTE, {
      data: { target_user_id: PLACEHOLDER_TARGET_USER_ID, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, decideReveal, decideGrant, or any DB read. Body: ${await resp.text()}`,
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
    const resp = await page.request.post(ROUTE, {
      data: { target_user_id: PLACEHOLDER_TARGET_USER_ID, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope, decideReveal, decideGrant, or any DB read. Body: ${await resp.text()}`,
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
    expect(body.feature).toBe("reseller.grant_credits");
  });
});
