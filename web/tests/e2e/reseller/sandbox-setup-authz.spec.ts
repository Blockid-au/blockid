// POST /api/reseller/sandbox/setup pre-write authorization contract —
// P10 dry-run per plan §U.4 (sandbox mechanics) and §J.2 (Playwright must
// cover the reseller-admin endpoints so a regression in the auth → feature-
// gate → scope → role gate ordering surfaces before the endpoint fires the
// projects INSERT or the reseller_audit_log(provision_sandbox) row).
//
// The sandbox-setup route has NO input-validation branches — it takes no
// body — so the pre-write assertions probe the auth chain instead. Two
// branches are harness-free and safe against staging (no rows written to
// projects or reseller_audit_log):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails before scope/DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.console"
//                              (gateRequireFeature bails because founder plans
//                              do not grant reseller.console; scopedReseller
//                              never runs and reseller_admins is never queried)
//
// Route reference: web/src/app/api/reseller/sandbox/setup/route.ts
//   Line 41-43: gateRequireFeature("reseller.console") → 401/402 before scope
//   Line 45-53: scopedReseller(user) throws            → 403 { reason: err.code }
//   Line 55-60: canProvisionSandbox(scope.role) false  → 403 { reason: "insufficient_role" }
//   Line 62-65: getSupabaseAdmin() null                → 503 { reason: "not_configured" }
//   Line 67-74: scope.sandboxProjectId() truthy        → 200 { ok:true, already_existed:true }
//   Line 76-80: !self (reseller_admins → no resellers) → 404 { reason: "reseller_missing" }
//   Line 89-115: projects.insert() OR audit failure    → 500 / race → 200 already_existed
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   code-validate.spec.ts.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - insufficient_role (403) — needs a reseller admin with role='viewer';
//     QA harness assumes owner/admin.
//   - no_membership (403 via scopedReseller) — would need a user who has
//     reseller.console entitlement but no reseller_admins row; that's an
//     inconsistent state that never occurs in production because the two
//     are provisioned together.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - already_existed (200 idempotent replay) — needs a sandbox project
//     already provisioned for the harness reseller; folded into the
//     temp-reseller mint fixture follow-up alongside ticks 94/95/96/97.
//   - Happy path (200 with project_id/slug/name) — ACTIVATED as P10 wave-3
//     row 154 below via loadTempReseller("active_wholesale") +
//     fixture.adminEmail loginAs + fixture.trackProjectForCleanup on the
//     returned project_id; skips when the fixture is null or adminUserId is
//     null (reseller_admins mirror missing). Audit-log write side-effect is
//     captured by wave-5 row 179 (audit-log-writes.spec.ts) so this row
//     focuses on the wire envelope with a fresh project_id/slug/name and a
//     defensive already_existed branch that keeps the row idempotent under
//     replay (see row 154 note below).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const SANDBOX_SETUP_ROUTE = "/api/reseller/sandbox/setup";

// Module-scope UUID_RE mirrors the sibling constants in admin-requests-list-
// authz.spec.ts:81, reseller-requests-list-authz.spec.ts:73, credit-grant-
// authz.spec.ts:101, credit-grant-validation.spec.ts:250, requests-authz.spec
// .ts:250, admin-requests-patch-authz.spec.ts:139, and audit-log-writes.spec
// .ts:75. Extracted in tick 218 to close the review_history tick 217 "natural
// next pick" option (a) — sweep the OTHER spec files under
// web/tests/e2e/reseller/ that still inlined the UUID regex. Only one call
// site in this file (row 154 active_wholesale happy path), but the hoist
// keeps the FK-echo shape lens name-consistent with the sibling files so a
// future audit sweep that greps `UUID_RE =` across the reseller e2e tree
// finds every constant with one query. Case-insensitive `/i` flag preserves
// the sibling constants' posture so upper-case UUIDs (which PostgreSQL uuid
// columns can return via ::text depending on the client library) still match.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("Reseller sandbox-setup pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(`/api/reseller/sandbox/setup`);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope or DB read. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(body.ok, `unauthenticated body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
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
    const resp = await page.request.post(`/api/reseller/sandbox/setup`);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope/DB read. Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      error?: string;
      feature?: string;
      reason?: string;
    };
    expect(body.ok, `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
    expect(body.error).toBe("feature_locked");
    expect(body.feature).toBe("reseller.console");
  });
});

// P10 wave-3 row 154 — active_wholesale variant probes the sandbox-setup
// happy path (reseller-admin session → 200 with project_id + slug + name for
// a fresh insert, or 200 already_existed:true with just project_id on an
// idempotent replay). Per docs/plans/p10-deferred-spec-activation-order.md
// wave 3:
//   154 | sandbox-setup-authz.spec.ts | active_wholesale | happy 200 with
//         project_id + slug | 200
//
// Route order per web/src/app/api/reseller/sandbox/setup/route.ts:
//   Line 40-43: gateRequireFeature bails                → 401/402 (rows 1 + 2)
//   Line 45-53: scopedReseller throws                   → 403 no_membership
//   Line 55-60: canProvisionSandbox(role) false         → 403 insufficient_role
//   Line 62-65: getSupabaseAdmin() null                 → 503 not_configured
//   Line 67-74: scope.sandboxProjectId() truthy         → 200 already_existed:true
//   Line 76-80: reseller_admins → no resellers          → 404 reseller_missing
//   Line 89-114: projects.insert / race resolve         → 500 / 200 already_existed
//   Line 139-145: 200 ok:true project_id + slug + name  ← THIS
//
// Fixture wiring (mirrors wave-2 row 146/148 posture verbatim — no seed or
// fixture delta needed per wave-3 preflight tick 152):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins so
//     scopedReseller() returns owner|admin (canProvisionSandbox passes).
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//   - fixture.trackProjectForCleanup(project_id) registers the freshly
//     provisioned sandbox for afterEach cleanup. Next run through this spec
//     starts from an empty projects table for this reseller, so the
//     assertion path picks up the fresh insert branch again (already_existed
//     stays false across replays whenever cleanup fires).
//
// Skip conditions (mirrors row 146/148 posture verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// Attribution NOT required. sandbox-setup does not consult
// reseller_attributions — the sandbox is a per-reseller workspace, not
// per-customer. So this row is safe to run against variants where
// attributionExists is false (unlike wave-2 rows 146-149 which depend on
// allowedCustomerIds()). This is why row 154 sits inside the wave-3-
// active_wholesale subwave (152 / 154 / 155 / 156) that ticks 152 flagged
// as activation-ready without any seed/fixture delta.
//
// Replay contract: the route is idempotent. First run → creates the projects
// row + returns 200 with { project_id, slug, name, already_existed:false }.
// Subsequent runs against a NOT-YET-cleaned reseller → returns 200 with
// { project_id, already_existed:true } (no slug/name in the envelope; see
// route.ts:67-74). The assertion budget below therefore pins the
// slug + name only on the already_existed:false branch — a replay against a
// dirty host still surfaces a project_id + ok:true regression rather than
// false-failing on the missing slug. When afterEach cleanup fires
// (fixture.cleanup deletes the tracked projects row), the next run always
// re-enters the fresh-insert branch.
//
// Assertion budget: five expects (200 + body.ok + typeof project_id + branch
// on already_existed + conditional slug/name) — sits at the "2-3 assertions
// per row + one branch guard" ceiling the schedule doc's wave-3 prep-cost
// note calls for.
//
// Non-Stripe / non-GST discipline: sandbox-setup writes one projects row +
// one reseller_audit_log(provision_sandbox) row. No promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Reseller sandbox-setup — P10 wave-3 happy path", () => {
  test("active_wholesale — POST as reseller-admin returns 200 with project_id", async ({
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
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
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
    try {
      const resp = await page.request.post(SANDBOX_SETUP_ROUTE);
      expect(
        resp.status(),
        `active_wholesale returned ${resp.status()} — expected 200 with project_id (fresh or already_existed). Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok: boolean;
        project_id?: string;
        slug?: string;
        name?: string;
        already_existed?: boolean;
        reason?: string;
      };
      expect(
        body.ok,
        `active_wholesale body.ok should be true: ${JSON.stringify(body)}`,
      ).toBe(true);
      expect(typeof body.project_id).toBe("string");
      expect(body.project_id ?? "").toMatch(UUID_RE);
      if (body.project_id) {
        fixture.trackProjectForCleanup(body.project_id);
      }
      // Fresh-insert branch pins the full slug + name envelope per plan
      // §U.4. Idempotent-replay branch (already_existed:true) drops slug/name
      // per route.ts:67-74 so we intentionally do NOT assert those fields
      // there — a replay-only run against a dirty host still catches an
      // ok:false or missing project_id regression via the assertions above.
      if (body.already_existed === false) {
        expect(typeof body.slug).toBe("string");
        expect(body.slug ?? "").not.toBe("");
        expect(typeof body.name).toBe("string");
        expect(body.name ?? "").not.toBe("");
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
