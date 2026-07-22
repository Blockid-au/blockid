// POST /api/reseller/customers/[id]/reveal-email pre-write authorization
// contract — P10 dry-run per plan §H.10 (masked list + reveal-on-click writes
// reseller_audit_log) and §J.2 (Playwright must cover the reseller-admin
// endpoints so a regression in the auth → scope gate ordering surfaces before
// the endpoint reads app_users or writes the
// reseller_audit_log(reveal_email) row).
//
// Unlike the sandbox/billing routes which use gateRequireFeature("reseller.
// console"), reveal-email uses getCurrentUser() + scopedReseller() directly
// (route.ts:32 + :39). The response shape is therefore
// { ok: false, reason: <string> } rather than the { ok: false, error, feature }
// envelope produced by gateRequireFeature. Two branches are harness-free and
// safe against staging (no app_users SELECT fires and no
// reseller_audit_log(reveal_email) row is written):
//
//   1. unauthenticated      — POST with no session          → 401 { ok:false, reason:"unauthorised" }
//                             (getCurrentUser null → returns before scope, decideReveal,
//                             app_users SELECT, or audit log)
//   2. non_reseller_admin   — POST as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                             (scopedReseller throws ResellerScopeError code="no_membership"
//                             because reseller_admins has no active row for a founder;
//                             decideReveal never runs, app_users is never queried, no audit row)
//
// Route reference: web/src/app/api/reseller/customers/[id]/reveal-email/route.ts
//   Line 32-35: getCurrentUser() null           → 401 { reason: "unauthorised" }
//   Line 37-45: scopedReseller(user) throws     → 403 { reason: err.code }
//   Line 47-53: decideReveal(id, allowed)       → 400 invalid_uuid / 403 not_in_scope
//   Line 55-58: getSupabaseAdmin() null         → 503 { reason: "not_configured" }
//   Line 60-73: app_users SELECT + not_found    → 500 lookup_failed / 404 not_found
//   Line 78-93: db.auditLog(reveal_email)       → 500 audit_failed
//   Line 95:    200 { ok: true, email }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   sandbox-setup-authz.spec.ts and billing-authz.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_uuid (400) — sits BEHIND scopedReseller (route.ts:49 vs :39),
//     so surfacing it needs a real reseller-admin session and any
//     ill-formed id path segment.
//   - not_in_scope (403 via decideReveal) — same reason as invalid_uuid:
//     scope must resolve first, then decideReveal is called with a UUID
//     not in allowedCustomerIds; needs harness plus a well-formed-but-
//     foreign UUID.
//   - not_found (404) — needs a well-formed UUID inside allowedCustomerIds
//     but not present in app_users; per-test seeding constraint.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (200 with email) — fires the app_users SELECT +
//     reseller_audit_log(reveal_email) write against the harness reseller;
//     folded into the temp-reseller mint fixture follow-up alongside the
//     deferred rows from ticks 94/95/96/97/98/99.
//
// Placeholder UUID used in the URL path: 00000000-0000-0000-0000-000000000000.
// Both harness-free rows return BEFORE the id path param is inspected
// (row 1 bails in getCurrentUser; row 2 bails in scopedReseller), so the
// placeholder value never reaches decideReveal — any string that satisfies
// Next.js dynamic-segment matching would work, but a valid-shaped UUID
// keeps the URL well-formed against router validation and mirrors the
// shape the real UI POSTs.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/reseller/customers/${PLACEHOLDER_CUSTOMER_ID}/reveal-email`;

test.describe("Reseller reveal-email pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, decideReveal, app_users SELECT, or audit log. Body: ${await resp.text()}`,
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
    const resp = await page.request.post(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before decideReveal, app_users SELECT, or audit log. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});
