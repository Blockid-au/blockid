// GET /api/reseller/customers/[id]/drawer input-validation contract —
// P10 dry-run per plan § U.7 (three-tab customer drawer) + § H.10
// (reveal-on-click logs to reseller_audit_log; drawer shares the same
// decideReveal id → scope → allowedCustomerIds chokepoint at
// route.ts:62-68) + § J.2 (Playwright must cover the reseller-admin
// endpoints so a regression in the id → scope → decideReveal ordering
// surfaces before the endpoint fires the app_users SELECT, the
// Promise.all fan-out across svi_analyses / revenue_events /
// credit_transactions / credit_balances, or the
// reseller_audit_log(view_customer_drawer) write).
//
// Track A P4.2 shipped tick 22 (see reseller-module-goal.md
// P4.2_customer_drawer). drawer-authz.spec.ts (tick 101) already probes
// the pre-scope auth chain (unauthenticated + non_reseller_admin). This
// spec closes the last remaining coverage gap: the post-scope validation
// branches surfaced by decideReveal(id, allowedCustomerIds) BEFORE the
// app_users SELECT, the fan-out, or the audit-log write.
//
// Twin of reveal-email-validation.spec.ts (tick 117) — same two branches,
// same OUT_OF_SCOPE_UUID sentinel, same harness posture. The routes share
// the decideReveal chokepoint verbatim (customer-reveal.ts is imported by
// both handlers), so the two specs together assert that a regression in
// the shared helper surfaces via both the POST reveal-email lens AND the
// GET drawer lens. Distinct from reveal-email-validation in one dimension
// only — this is the READ lens (GET) rather than the WRITE lens (POST),
// whose blast radius is a durable audit-log row + a joined view-model
// (Overview + Progression + SVI curve + Reports) leaving the boundary
// rather than a single plaintext email.
//
// Two branches are harness-only and safe against staging (no app_users
// SELECT fires, no Promise.all fan-out fires, no
// reseller_audit_log(view_customer_drawer) row is written — decideReveal
// short-circuits BEFORE getSupabaseAdmin, the app_users SELECT, the
// parallel joins, or the audit-log write):
//
//   1. invalid_id   — [id] path segment is not a UUID       → 400 { ok:false, reason:"invalid_id" }
//                     (decideReveal UUID_RE.test() false;
//                     never hits app_users SELECT or audit log)
//   2. not_in_scope — [id] is a well-formed UUID that is    → 403 { ok:false, reason:"not_in_scope" }
//                     not in the reseller's allowedCustomerIds
//                     set (allowed.includes() false;
//                     never hits app_users SELECT or audit log)
//
// Route reference: web/src/app/api/reseller/customers/[id]/drawer/route.ts
//   Line 47-50: getCurrentUser null                     → 401 { reason: "unauthorised" }
//   Line 52-60: scopedReseller throws                   → 403 { reason: err.code }
//   Line 62-68: decideReveal(id, allowedCustomerIds)    → 400 invalid_id | missing_id
//                                                          403 not_in_scope
//   Line 70-73: getSupabaseAdmin() null                 → 503 { reason: "not_configured" }
//   Line 77-87: app_users SELECT + maybeSingle          → 500 lookup_failed / 404 not_found
//   Line 90-135: Promise.all + db.auditLog              → 500 audit_failed
//   Line 148:   200 { ok:true, overview, progression, svi_curve, reports }
//
// Rows 1-2 cover Line 62-68 exclusively. The missing_id branch of
// decideReveal (customerId.length === 0) cannot surface via a live HTTP
// request because Next.js dynamic route matching rejects an empty [id]
// segment and returns 404 at the router before route.ts:47 runs — so
// missing_id is unit-tested in customer-reveal.test.ts (tick 21, 7/7)
// but not reachable here.
//
// Deliberately out of scope (needs per-test seeding which plan §J.2
// forbids or would break sibling specs sharing the same worker):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - not_found (404) — needs decideReveal to pass BUT then the app_users
//     SELECT to return no row, which requires per-test tampering with
//     app_users (an in-scope customer id that has since been deleted).
//   - lookup_failed (500) — needs the app_users SELECT to error, which
//     requires per-test tampering plan §J.2 forbids.
//   - audit_failed (500) — needs the reseller_audit_log INSERT to fail,
//     which requires per-test tampering plan §J.2 forbids.
//   - Happy path (200 with overview + progression + svi_curve + reports)
//     — fires the app_users SELECT + Promise.all fan-out across
//     svi_analyses / revenue_events / credit_transactions /
//     credit_balances + the reseller_audit_log(view_customer_drawer)
//     write against the harness reseller + attributed customer. Belongs
//     to the temp-reseller mint fixture follow-up alongside the deferred
//     rows from credit-grant-validation ticks 94..115, the
//     reveal-email-validation happy-path probe (tick 117), and the
//     sandbox-setup / drawer / me happy-path probes.
//
// Random UUID that's astronomically unlikely to match any real app_users
// row so the not_in_scope branch fires deterministically. Passes
// decideReveal's UUID_RE shape guard on line 20, then fails the
// allowedCustomerIds membership check on line 23. Mirrored from
// reveal-email-validation.spec.ts so the two specs use identical
// sentinels — if the value ever needs to change (collision with a
// real row) both specs update in lockstep.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

const OUT_OF_SCOPE_UUID = "00000000-0000-4000-8000-000000000001";
const INVALID_ID_SEGMENT = "not-a-uuid";

test.describe("Reseller customer-drawer input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("invalid_id — [id] path segment is not a UUID returns 400 invalid_id", async ({
    page,
  }) => {
    await loginAs(page, harness!.admin.email);
    const resp = await page.request.get(
      `/api/reseller/customers/${INVALID_ID_SEGMENT}/drawer`,
    );
    expect(
      resp.status(),
      `invalid_id returned ${resp.status()} — expected 400 before getSupabaseAdmin, app_users SELECT, Promise.all fan-out, or reseller_audit_log write. Body: ${await resp.text()}`,
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
    const resp = await page.request.get(
      `/api/reseller/customers/${OUT_OF_SCOPE_UUID}/drawer`,
    );
    expect(
      resp.status(),
      `not_in_scope returned ${resp.status()} — expected 403 before getSupabaseAdmin, app_users SELECT, Promise.all fan-out, or reseller_audit_log write. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `not_in_scope body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_in_scope");
  });
});
