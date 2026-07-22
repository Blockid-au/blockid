// GET /api/reseller/customers/[id]/drawer pre-read authorization contract —
// P10 dry-run mirror of reveal-email-authz.spec.ts (tick 100).
//
// Per plan § U.7 the drawer is the second reseller-admin route that uses the
// direct getCurrentUser() + scopedReseller() chain (route.ts:47 + :54) rather
// than gateRequireFeature(). The response envelope is therefore
// { ok: false, reason: <string> } rather than the { ok: false, error, feature }
// shape gateRequireFeature emits. Two branches are harness-free and safe
// against staging (no app_users SELECT fires and no
// reseller_audit_log(view_customer_drawer) row is written):
//
//   1. unauthenticated      — GET with no session          → 401 { ok:false, reason:"unauthorised" }
//                             (getCurrentUser null → returns before scope, decideReveal,
//                             app_users SELECT, parallel fan-out, or audit log)
//   2. non_reseller_admin   — GET as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                             (scopedReseller throws ResellerScopeError code="no_membership"
//                             because reseller_admins has no active row for a founder;
//                             decideReveal never runs, no DB reads, no audit row)
//
// Route reference: web/src/app/api/reseller/customers/[id]/drawer/route.ts
//   Line 47-50: getCurrentUser() null           → 401 { reason: "unauthorised" }
//   Line 52-60: scopedReseller(user) throws     → 403 { reason: err.code }
//   Line 62-68: decideReveal(id, allowed)       → 400 invalid_uuid / 403 not_in_scope
//   Line 70-73: getSupabaseAdmin() null         → 503 { reason: "not_configured" }
//   Line 77-87: app_users SELECT + not_found    → 500 lookup_failed / 404 not_found
//   Line 90-135: fan-out + db.auditLog          → 500 audit_failed
//   Line 148:   200 { ok: true, overview, progression, svi_curve, reports }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   reveal-email-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_uuid (400) — sits BEHIND scopedReseller (route.ts:64 vs :54),
//     so surfacing it needs a real reseller-admin session and any
//     ill-formed id path segment.
//   - not_in_scope (403 via decideReveal) — same reason as invalid_uuid.
//   - not_found (404) — needs a well-formed UUID inside allowedCustomerIds
//     but not present in app_users; per-test seeding constraint.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - lookup_failed / audit_failed (500) — requires per-test tampering that
//     plan §J.2 forbids.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (200 with overview + progression + svi_curve + reports) —
//     fires the app_users SELECT + Promise.all fan-out across svi_analyses,
//     revenue_events, credit_transactions, credit_balances + the
//     reseller_audit_log(view_customer_drawer) write against the harness
//     reseller; folded into the temp-reseller mint fixture follow-up
//     alongside the deferred rows from ticks 94/95/96/97/98/99/100.
//
// Placeholder UUID used in the URL path: 00000000-0000-0000-0000-000000000000.
// Both harness-free rows return BEFORE the id path param is inspected
// (row 1 bails in getCurrentUser; row 2 bails in scopedReseller), so the
// placeholder value never reaches decideReveal — any string that satisfies
// Next.js dynamic-segment matching would work, but a valid-shaped UUID
// keeps the URL well-formed against router validation and mirrors the
// shape the real UI GETs from drawer-opener.tsx.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/reseller/customers/${PLACEHOLDER_CUSTOMER_ID}/drawer`;

test.describe("Reseller customer-drawer pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, decideReveal, app_users SELECT, parallel fan-out, or audit log. Body: ${await resp.text()}`,
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
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before decideReveal, app_users SELECT, parallel fan-out, or audit log. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});
