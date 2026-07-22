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
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

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

// P10 wave-3 row 150 — no_capability variant probes decideGrant() gate 2
// (`!can_grant_credits` → capability_disabled) via the credit-grant-authz.spec
// surface. Order per web/src/lib/reseller/credit-grants.ts:117-121 (decideGrant):
//   1. !isFinite || amount<=0 || !isInteger → invalid_amount   (400)
//   2. !can_grant_credits                   → capability_disabled ← THIS
//   3. projected <= monthly_credit_budget   → ok / over_budget=false
//   4. admin_over_budget_approved           → ok / over_budget=true
//   5. otherwise                            → over_budget_requires_approval (402)
//
// no_capability seed shape (web/scripts/seed-qa-reseller.mjs:119-131):
//   status="active", billing_model="wholesale", can_grant_credits=false,
//   monthly_credit_budget=20000 → gate 1 passes on positive integer amount,
//   gate 2 fires before any budget arithmetic can short-circuit the assertion.
//
// Route mapping (credits/grant/route.ts:128-134):
//   invalid_amount           → 400
//   capability_disabled      → 403                                       ← THIS
//   over_budget_requires_..  → 402
//
// Body shape mirrors the unauthenticated + non_reseller_admin probes above
// (positive integer amount + fixture.attributedUserId as target_user_id) so
// the only variance is the session identity and the expected status.
//
// Prerequisite: finding-2's coupled seed + fixture delta (tick 198) — the
// seed script now plants a reseller_attributions row against the no_capability
// variant so decideReveal() clears `not_in_scope` (403) BEFORE decideGrant
// fires. If the seed re-run against staging has not landed on this host,
// `fixture.attributionExists` stays false and the spec skips cleanly.
test.describe("Credit-grant × no_capability × capability_disabled — P10 wave-3 row 150", () => {
  test("no_capability — POST as reseller-admin returns 403 with reason=capability_disabled", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("no_capability");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('no_capability') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("no_capability"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: { target_user_id: targetUserId, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `no_capability returned ${resp.status()} — expected 403 (decideGrant gate 2). Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      monthly_credit_budget?: number;
      already_granted_this_month?: number;
      remaining_budget?: number;
    };
    expect(
      body.ok,
      `no_capability body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("capability_disabled");
  });
});

// P10 wave-3 row 151 — no_budget variant probes decideGrant() gate 5
// (`projected > monthly_credit_budget && !admin_over_budget_approved` →
// over_budget_requires_approval) via the credit-grant-authz.spec surface.
// Same decideGrant order as row 150; here can_grant_credits=true so gate 2
// clears and monthly_credit_budget=100 forces gate 5 for any amount > 100
// (with already_granted_this_month=0 on a fresh reseller).
//
// no_budget seed shape (web/scripts/seed-qa-reseller.mjs:145-157):
//   status="active", billing_model="wholesale", can_grant_credits=true,
//   monthly_credit_budget=100 → gate 1 passes on positive integer amount,
//   gate 2 clears (can_grant_credits=true), gate 5 fires when amount > 100.
//
// Route mapping (credits/grant/route.ts:128-134):
//   invalid_amount           → 400
//   capability_disabled      → 403
//   over_budget_requires_..  → 402                                       ← THIS
//
// amount=200 chosen so the over-budget condition holds even if a prior spec
// run (or an admin-approve fan-out from row 175 when it lands) inserted a
// small grant into reseller_credit_grants for the current month_key —
// the endpoint returns 402 BEFORE the mirror insert so no side effect
// accumulates from failed calls, but a healthy safety margin over the 100
// budget avoids a false negative under any accumulated state.
//
// Prerequisite: same finding-2 coupled seed + fixture delta as row 150 —
// the seed script plants a reseller_attributions row against the no_budget
// variant so decideReveal() clears `not_in_scope` BEFORE decideGrant fires.
test.describe("Credit-grant × no_budget × over_budget_requires_approval — P10 wave-3 row 151", () => {
  test("no_budget — POST as reseller-admin returns 402 with reason=over_budget_requires_approval", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("no_budget");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('no_budget') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_budget"),
      );
      return;
    }
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("no_budget"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_budget"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: { target_user_id: targetUserId, amount: 200 },
    });
    expect(
      resp.status(),
      `no_budget returned ${resp.status()} — expected 402 (decideGrant gate 5). Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      monthly_credit_budget?: number;
      already_granted_this_month?: number;
      remaining_budget?: number;
    };
    expect(
      body.ok,
      `no_budget body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("over_budget_requires_approval");
    expect(
      body.monthly_credit_budget,
      `no_budget body.monthly_credit_budget should surface the reseller's seeded 100 cap: ${JSON.stringify(body)}`,
    ).toBe(100);
  });
});
