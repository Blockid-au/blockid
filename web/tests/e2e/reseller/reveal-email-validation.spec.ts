// POST /api/reseller/customers/[id]/reveal-email input-validation contract —
// P10 dry-run per plan §C.1.2 (masked email chokepoint) + §H.10 (reveal-on-
// click logs to reseller_audit_log) + §J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the id → scope → decideReveal
// ordering surfaces before the endpoint fires app_users SELECT or the
// reseller_audit_log(reveal_email) write).
//
// Track A P4.1 shipped tick 21 (see reseller-module-goal.md
// P4.1_reveal_email_audit). reveal-email-authz.spec.ts (tick 100) already
// probes the pre-scope auth chain (unauthenticated + non_reseller_admin).
// This spec closes the last remaining coverage gap: the post-scope
// validation branches surfaced by decideReveal(id, allowedCustomerIds)
// BEFORE the app_users SELECT and reseller_audit_log write. Mirrors the
// credit-grant-validation / requests-validation / create-startup-validation
// posture — validation rows fire behind loadResellerHarness() so the QA
// harness owns the scoped reseller session and no per-test row seeding is
// needed.
//
// Two branches are harness-only and safe against staging (no app_users
// SELECT fires, no reseller_audit_log(reveal_email) row is written —
// decideReveal short-circuits BEFORE getSupabaseAdmin, the app_users
// SELECT, or the audit-log write):
//
//   1. invalid_id   — [id] path segment is not a UUID       → 400 { ok:false, reason:"invalid_id" }
//                     (decideReveal UUID_RE.test() false;
//                     never hits app_users SELECT or audit log)
//   2. not_in_scope — [id] is a well-formed UUID that is    → 403 { ok:false, reason:"not_in_scope" }
//                     not in the reseller's allowedCustomerIds
//                     set (allowed.includes() false;
//                     never hits app_users SELECT or audit log)
//
// Route reference: web/src/app/api/reseller/customers/[id]/reveal-email/route.ts
//   Line 32-35: getCurrentUser null                     → 401 { reason: "unauthorised" }
//   Line 37-45: scopedReseller throws                   → 403 { reason: err.code }
//   Line 47-53: decideReveal(id, allowedCustomerIds)    → 400 invalid_id | missing_id
//                                                          403 not_in_scope
//   Line 55-58: getSupabaseAdmin() null                 → 503 { reason: "not_configured" }
//   Line 60-74: app_users SELECT + maybeSingle          → 500 lookup_failed / 404 not_found
//   Line 76-93: db.auditLog(action='reveal_email')      → 500 { reason: "audit_failed" }
//   Line 95:    200 { ok:true, email }
//
// Rows 1-2 cover Line 47-53 exclusively. The missing_id branch of decideReveal
// (customerId.length === 0) cannot surface via a live HTTP request because
// Next.js dynamic route matching rejects an empty [id] segment and returns
// 404 at the router before route.ts:32 runs — so missing_id is unit-tested
// in customer-reveal.test.ts (tick 21, 7/7) but not reachable here.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - not_found (404) — needs decideReveal to pass BUT then the app_users
//     SELECT to return no row, which requires per-test tampering with
//     app_users (an in-scope customer id that has since been deleted).
//   - lookup_failed (500) — needs the app_users SELECT to error, which
//     requires per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail,
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with email) — fires the full app_users SELECT +
//     reseller_audit_log(reveal_email) chain against the harness reseller
//     + attributed customer. Belongs to the temp-reseller mint fixture
//     follow-up alongside the deferred rows from credit-grant-validation
//     ticks 94..115 and the sandbox-setup / drawer / me happy-path probes.
//
// Random UUID that's astronomically unlikely to match any real app_users
// row so the not_in_scope branch fires deterministically. Passes decideReveal's
// UUID_RE shape guard on line 20, then fails the allowedCustomerIds
// membership check on line 23.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

const OUT_OF_SCOPE_UUID = "00000000-0000-4000-8000-000000000001";
const INVALID_ID_SEGMENT = "not-a-uuid";

test.describe("Reseller reveal-email input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_id — [id] path segment is not a UUID returns 400 invalid_id", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(
      `/api/reseller/customers/${INVALID_ID_SEGMENT}/reveal-email`,
    );
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before getSupabaseAdmin, app_users SELECT, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(400);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `invalid_id body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("invalid_id");
  });

  test("not_in_scope — well-formed UUID outside allowedCustomerIds returns 403 not_in_scope", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.post(
      `/api/reseller/customers/${OUT_OF_SCOPE_UUID}/reveal-email`,
    );
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before getSupabaseAdmin, app_users SELECT, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `not_in_scope body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });
});
