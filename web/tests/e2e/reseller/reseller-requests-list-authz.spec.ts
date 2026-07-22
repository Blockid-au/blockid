// GET /api/reseller/requests pre-read authorization contract — P10 dry-run
// per plan §C.5 (admin approval flows) and §J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the auth → scope gate ordering
// surfaces before the endpoint reads reseller_requests).
//
// Mirrors drawer-authz.spec.ts (tick 101) and reveal-email-authz.spec.ts
// (tick 100) — same getCurrentUser() + scopedReseller() chokepoint used by
// every scopedReseller()-gated GET/POST route under /api/reseller/**. The
// response envelope is { ok:false, reason: <string> } rather than the
// { ok:false, error, feature } shape emitted by gateRequireFeature. This
// closes the last GET surface under /api/reseller/** whose scopedReseller()
// gate was not yet regression-guarded at the Playwright lens — the sibling
// POST /api/reseller/requests validation branches are already covered by
// requests-validation.spec.ts, but that spec exercises the validator branches
// AFTER auth via loginAs(harness.admin.email), leaving the pre-auth chain
// unguarded on both verbs. This spec fills the GET half of that hole.
//
// Two branches are harness-free and safe against staging (no reseller_requests
// SELECT fires, no reseller_audit_log row is written — GET path takes no
// query params so both harness-free rows return BEFORE any URL parse fires):
//
//   1. unauthenticated      — GET with no session          → 401 { ok:false, reason:"unauthorised" }
//                             (getCurrentUser null → returns before scope,
//                             getSupabaseAdmin, or the reseller_requests SELECT)
//   2. non_reseller_admin   — GET as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                             (scopedReseller throws ResellerScopeError code="no_membership"
//                             because reseller_admins has no active row for a founder;
//                             getSupabaseAdmin and the reseller_requests SELECT never run)
//
// Route reference: web/src/app/api/reseller/requests/route.ts
//   Line 148-152: getCurrentUser() null           → 401 { reason: "unauthorised" }
//   Line 154-162: scopedReseller(user) throws     → 403 { reason: err.code }
//   Line 164-167: getSupabaseAdmin() null         → 503 { reason: "not_configured" }
//   Line 169-183: reseller_requests SELECT        → 500 query_failed
//   Line 185:     200 { ok: true, requests: [...] }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the sibling admin authz specs (ticks 103/105/106/107/108/109) and the
//   sibling reseller authz specs (drawer-authz, reveal-email-authz,
//   reports-signed-url-authz, sandbox-setup-authz, billing-authz).
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - query_failed (500) — needs a broken reseller_requests SELECT which
//     requires per-test tampering plan §J.2 forbids.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (200 with requests[]) — fires the reseller_requests SELECT
//     against the harness reseller_id; folded into the temp-reseller mint
//     fixture follow-up alongside the deferred rows from ticks 94..109.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/reseller/requests";

test.describe("Reseller requests list pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, getSupabaseAdmin, or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — GET as a founder QA account returns 403 no_membership", async ({
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
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before getSupabaseAdmin or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});
