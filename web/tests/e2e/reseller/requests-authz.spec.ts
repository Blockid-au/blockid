// POST /api/reseller/requests pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright
// must cover the reseller-admin endpoints so a regression in the
// getCurrentUser → scopedReseller ordering surfaces before the endpoint
// fires the reseller_requests INSERT or the reseller_audit_log(file_request)
// write).
//
// Track A P9.3 shipped tick 31 (see reseller-module-goal.md
// P9.3_requests_inbox). requests-validation.spec.ts already probes the
// post-scope input-validation branches surfaced by
// validateResellerRequestBody (invalid_payload / invalid_request_type /
// invalid_tier_pct / suffix_bad_format / collateral_url_required /
// purpose_required) behind the QA_RESELLER_ADMIN_EMAIL harness, but the
// pre-scope auth-chain rows have no explicit dry-run — every other
// reseller-lens mutation endpoint has one (reveal-email tick 100,
// drawer tick 101, me tick 102, admin-* ticks 103-111,
// reseller-crons tick 112, create-startup tick 113,
// showcase-reviews tick 114, credit-grant tick 115). This spec closes
// that last outlier.
//
// Two branches are harness-free and safe against staging (no rows
// written to reseller_requests, no reseller_audit_log(file_request)
// row, no reseller_admins SELECT beyond the scopedReseller probe):
//
//   1. unauthenticated       — POST with no session          → 401 { ok:false, reason:"unauthorised" }
//                              (getCurrentUser null → returns before
//                              scopedReseller, resellerSupabase,
//                              selfReseller, validateResellerRequestBody,
//                              reseller_requests INSERT, or audit log)
//   2. non_reseller_admin    — POST as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                              (scopedReseller throws ResellerScopeError
//                              code="no_membership" because reseller_admins
//                              has no active row for a founder; validation
//                              never runs, no INSERT, no audit row)
//
// Route reference: web/src/app/api/reseller/requests/route.ts
//   Line 47-50:  getCurrentUser() null                         → 401 { reason: "unauthorised" }
//   Line 52-60:  scopedReseller(user) throws                   → 403 { reason: err.code }
//   Line 62-65:  getSupabaseAdmin() null                       → 503 { reason: "not_configured" }
//   Line 67-71:  selfReseller() null                           → 404 { reason: "reseller_missing" }
//   Line 73-83:  validateResellerRequestBody                   → 400/403 { reason: <validation.reason> }
//   Line 87-110: reseller_requests INSERT + unique-collision   → 409 duplicate_pending_code_request / 500 insert_failed
//   Line 112-132: db.auditLog(action='file_request')           → 500 { reason: "audit_failed" }
//   Line 134-145: 201 { ok:true, request: { id, created_at, ... } }
//   Line 148-186: GET flow — same auth chain then reseller_requests SELECT
//
// The auth-chain rows probe LINE 47-50 (row 1) and LINE 52-60 (row 2)
// exclusively — rows 3-onwards need either the QA_RESELLER_ADMIN_EMAIL
// harness (rows 3-N, covered by requests-validation.spec.ts) or per-test
// seeding which plan §J.2 forbids.
//
// Body shape sent on both probes: a syntactically-valid code_request POST
// body with tier_pct=20 (inside the default allowed_tiers=[0,10,20,30,40]
// seed) so that IF the auth gate were to leak (regression), the request
// would still be a realistic code_request attempt and the resulting error
// surface (400 duplicate_pending_code_request or downstream) would be a
// legitimate signal — never a false positive from a malformed body bailing
// at the wrong branch.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - all validation branches — covered by requests-validation.spec.ts
//     behind the QA_RESELLER_ADMIN_EMAIL harness.
//   - duplicate_pending_code_request (409) — needs an existing pending
//     code_request row for the same reseller; per-test seeding.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (201) — fires the full validation + INSERT + audit chain
//     against the harness reseller; belongs to the temp-reseller mint
//     fixture follow-up alongside ticks 94..115.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/api/reseller/requests";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const VALID_CODE_REQUEST_BODY = {
  request_type: "code_request",
  payload: { tier_pct: 20 },
} as const;

test.describe("Reseller requests pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      data: VALID_CODE_REQUEST_BODY,
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scopedReseller, validateResellerRequestBody, reseller_requests INSERT, or audit log. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — POST as a founder QA account returns 403 no_membership", async ({
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
      data: VALID_CODE_REQUEST_BODY,
    });
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before validateResellerRequestBody, reseller_requests INSERT, or audit log. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});
