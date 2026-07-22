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
//   - Happy path (200 with email) — ACTIVATED as P10 wave-2 row 148 below
//     via loadTempReseller("active_wholesale") + fixture.adminEmail loginAs +
//     fixture.attributedUserId in the URL path; skips when the fixture is
//     null, adminUserId is null (reseller_admins mirror missing), or
//     attributionExists is false (reseller_attributions row missing —
//     allowedCustomerIds() would 403 not_in_scope). Audit-log write
//     side-effect is captured by wave-5 row 179 (audit-log-writes.spec.ts)
//     so this row focuses on the 200 wire envelope with plaintext email —
//     a route regression that swallowed the audit_failed 500 surfaces as
//     a body.ok=false rather than as an incorrect audit-row assertion.
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
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/reseller/customers/${PLACEHOLDER_CUSTOMER_ID}/reveal-email`;
const REVEAL_ROUTE = (customerId: string) =>
  `/api/reseller/customers/${customerId}/reveal-email`;

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

// P10 wave-2 row 148 — active_wholesale variant probes the reveal-email
// happy path (reseller-admin session → 200 with plaintext email in
// body.email). Per docs/plans/p10-deferred-spec-activation-order.md wave 2:
//   148 | reveal-email-authz.spec.ts | active_wholesale | happy 200 with
//         plaintext email + audit-log side effect | 200
//
// Route order per web/src/app/api/reseller/customers/[id]/reveal-email/route.ts:
//   Line 32-34: getCurrentUser null                        → 401 (row 1)
//   Line 37-45: scopedReseller throws                      → 403 (row 2 / no_membership)
//   Line 47-52: decideReveal(id, allowedCustomerIds)       → 400 invalid_uuid / 403 not_in_scope
//   Line 55-57: getSupabaseAdmin() null                    → 503 not_configured
//   Line 60-73: app_users lookup                           → 500 lookup_failed / 404 not_found
//   Line 76-93: db.auditLog(reveal_email)                  → 500 audit_failed
//   Line 95:    200 { ok: true, email } ← THIS
//
// Fixture wiring (wave-2 helper landed tick 147; row 146 landed tick 148
// added attributionExists guard; row 147 landed tick 149; this tick reuses
// the same skeleton for the sibling POST reveal-email route):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins.
//   - fixture.attributionExists asserts the seeder also planted a
//     reseller_attributions row so scopedReseller().allowedCustomerIds()
//     surfaces fixture.attributedUserId. Without the row the reveal-email
//     route returns 403 not_in_scope (see route.ts:49-52); the fixture flag
//     lets the spec skip cleanly rather than false-fail as a code regression.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions (mirrors row 146/147 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not in app_users).
//   - fixture.attributionExists false (reseller_attributions row missing —
//     reveal-email would 403 not_in_scope).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// Coverage-vs-duplication call: pin body.ok=true + body.email is a plaintext
// string containing '@' (never a mask; the reveal-email contract is
// specifically to return plaintext for authorised reseller-admin clicks per
// plan §H.10). Do NOT pin the exact email string — the seeded attributed
// founder email is DEFAULT_ATTRIBUTED_FOUNDER_EMAIL (qa-founder-attributed-
// 1@blockid.au) but a host that overrides QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL
// (see fixtures/reseller.ts) would surface an unrelated spec failure that
// tracks env drift rather than a code regression. The shape assertions
// (typeof string + contains '@' + does NOT contain a '*') are enough to
// pin the plaintext contract.
//
// Non-Stripe / non-GST discipline: the reveal-email route reads app_users
// (id + email columns only) and writes one reseller_audit_log row via
// db.auditLog(). No promotion_code lookup, no Stripe network call, no
// InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor a
// consequence. The audit-log write side-effect is captured by wave-5 row
// 179 (audit-log-writes.spec.ts) so this row focuses on the wire envelope
// — the 500 audit_failed branch means a broken audit-log write would
// surface as body.ok=false here rather than as a missing audit row that
// only row 179 could detect. This is the same posture used by row 146
// for the drawer route's audit-log write.
test.describe("Reseller reveal-email — P10 wave-2 happy path", () => {
  test("active_wholesale — POST as reseller-admin returns 200 with plaintext email", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const attributedUserId = fixture.attributedUserId;
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    const resp = await page.request.post(REVEAL_ROUTE(attributedUserId));
    expect(
      resp.status(),
      `active_wholesale returned ${resp.status()} — expected 200 with plaintext email. Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      email?: string;
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    // Plaintext contract per plan §H.10 — reveal-email must return the raw
    // app_users.email column, never the masked form the list view uses.
    // A regression that piped the value through maskEmail() would surface
    // here via the '*' assertion.
    expect(typeof body.email).toBe("string");
    expect(body.email ?? "").toContain("@");
    expect(body.email ?? "").not.toMatch(/\*/);
  });
});
