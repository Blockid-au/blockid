// DELETE /api/admin/resellers/[code] pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright
// must cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads resellers or writes the
// soft-delete UPDATE that flips status to "terminated").
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103) and
// admin-requests-patch-authz.spec.ts (tick 105) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see route.ts:21-32),
// same { ok:false, reason: AdminGateError.code } envelope pair at HTTP 401
// for BOTH the no_user and not_admin branches (route.ts:27-29). Symmetric
// shape means a refactor that collapses the two 401 reasons into a single
// "unauthorised", swaps requireAdmin() for a bespoke inline check, or
// flips the status code to 403 lights up in all three specs on the next
// `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no resellers
// SELECT fires, no soft-delete UPDATE is issued, no attributed customers
// lose their attribution):
//
//   1. unauthenticated  — DELETE with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE code normalisation, resellers SELECT,
//                          or resellers UPDATE status=terminated)
//   2. non_admin        — DELETE as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE code normalisation,
//                          resellers SELECT, or resellers UPDATE)
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 188-197: DELETE handler entry + normaliseResellerCode → 400 code_required
//   Line 199-211: loadReseller           → 404 not_found / 503 not_configured / 500 query_failed
//   Line 215-218: resellers UPDATE status=terminated → 500 terminate_failed / 200 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   admin-reseller-patch-authz.spec.ts and admin-requests-patch-authz.spec.ts.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:197 vs :192),
//     so surfacing it needs a real admin session PLUS an ill-formed code
//     segment.
//   - not_found (404) — sits BEHIND requireAdmin, needs an admin session
//     PLUS a code that does not resolve to a resellers row.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - terminate_failed (500) — needs a broken resellers UPDATE which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (200) — ACTIVATED wave-5 row 171 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'terminated') (fetches the QAPROBETERMINATED seed row). Twin of
//     wave-5 row 172 (admin-reseller-delete-validation.spec.ts happy 200
//     tick 172) — same route file, same fixture wiring, same idempotent
//     'terminated' variant chosen so the resellers UPDATE that flips
//     status → 'terminated' + bumps updated_at is a no-op vs prior state.
//
// Placeholder code used in the URL path: "test-placeholder-code". Both
// harness-free rows return BEFORE the code path segment is inspected
// (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// normaliseResellerCode. A lowercase-kebab code keeps the URL well-formed
// against router validation and mirrors the shape the real admin UI
// DELETEs (see web/src/app/admin/resellers/[code]/reseller-edit-client.tsx).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CODE = "test-placeholder-code";
const ROUTE = `/api/admin/resellers/${PLACEHOLDER_CODE}`;

test.describe("Admin reseller DELETE pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — DELETE with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.delete(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before code normalisation, resellers SELECT, or resellers UPDATE status=terminated. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — DELETE as a founder QA account returns 401 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.delete(ROUTE);
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before code normalisation, resellers SELECT, or resellers UPDATE status=terminated. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P10 wave-5 row 171 happy path — terminated variant + admin harness → 200
// idempotent soft-delete. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   171 | admin-reseller-delete-authz.spec.ts | terminated |
//         happy 200 (already terminated → idempotent) | 200
//
// The two pre-scope reject rows above (unauthenticated → 401 no_user;
// non_admin → 401 not_admin) prove that requireAdmin() blocks the wrong
// callers. This block proves the SAME gate lets the RIGHT caller through
// so the resellers UPDATE status='terminated' + updated_at bump succeeds
// end-to-end. Without this row a regression that hardened requireAdmin()
// too far (rejecting even the qa-admin-1 session) would only surface once
// a real admin tried to soft-delete a reseller through the UI.
//
// Twin of wave-5 row 172 (admin-reseller-delete-validation.spec.ts happy
// 200, tick 172) — same route file, same fixture wiring, same terminated
// variant. Kept in this spec ALSO so a future reordering that swapped the
// requireAdmin() gate order or dropped the terminate branch lights up on
// the delete-authz side too, not just the delete-validation side. The two
// blocks fire the same request against the same seed row; on a healthy
// tree they both return 200 with body={ok:true} — a divergence between
// them means the two specs picked up different route builds (e.g. one
// worker warm-cached a stale bundle) and would surface the drift.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 188-193: DELETE handler entry + gate() — getCurrentUser +
//                 requireAdmin → 401 no_user / not_admin (rows above)
//   Line 195-197: normaliseResellerCode → 400 code_required
//                 (admin-reseller-delete-validation row 1)
//   Line 199-211: loadReseller → 404 not_found / 503 / 500
//                 (admin-reseller-delete-validation row 2)
//   Line 215-225: resellers UPDATE status='terminated' → 500
//                 terminate_failed / 200 ok  ← this block
//
// Variant choice — 'terminated':
//   Per tick 171 recap "natural next picks (i)" and the row-172 block that
//   landed tick 172, the plan §962 lists `terminated` for this row already
//   (unlike row 172 where the plan said `active_wholesale` but we
//   deviated). The row is idempotent because the seed row starts with
//   status='terminated' (seed-qa-reseller.mjs:107-113 mints
//   QAPROBETERMINATED with status='terminated' from the start); the DELETE
//   handler flips status → 'terminated' + bumps updated_at, so the write
//   is a no-op on status and only drifts updated_at by one row-write per
//   CI pass. No other spec asserts on that column (grep confirmed the
//   same on tick 172 for row 172 — same seed row, same reasoning).
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au — a real admin
//     session so requireAdmin() returns without throwing (matches row 172
//     posture).
//   - loadTempReseller('terminated') reads the QAPROBETERMINATED seed row
//     so fixture.code is the real DB code. adminUserId is NOT needed here
//     because we log in as the ADMIN, not the reseller-admin for the
//     variant — the requireAdmin() gate is independent of scopedReseller().
//     Mirrors row 167 / 168 / 169 / 170 / 172 pattern.
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded)
//     → describe-scope test.skip via adminHarnessSkipReason().
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBETERMINATED seed row missing) → test-scope
//     test.skip via tempResellerSkipReason("terminated").
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email → test-scope test.skip.
//
// State-pollution posture: DELETE flips status → 'terminated' + bumps
// updated_at. Idempotent under CI replay against the terminated variant
// (row was already 'terminated' pre-write). No fixture cleanup wiring
// registered because there is no state to restore — the row started
// terminated and stays terminated. Zero collateral effect on any other
// spec because the terminated variant is a distinct seed row from
// active_wholesale / active_retail / paused / no_capability /
// tier_only_zero / no_budget.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true only. The route
// returns exactly {ok: true} with no additional envelope keys on the
// happy path (route.ts:227). Do NOT assert on reseller state changes at
// the DB level because that would require a follow-up SELECT plan §J.2
// forbids in-spec.
//
// URL lowercasing: fixture.code is stored uppercase (QAPROBETERMINATED)
// because normaliseResellerCode (attribution.ts:25-29) uppercases +
// alnum-strips before insertion. The [code] URL segment convention uses
// lowercase for aesthetics; the server re-uppercases via the same
// normaliseResellerCode inside the DELETE handler (route.ts:196) before
// the resellers SELECT. Mirrors row 167 + row 168 + row 169 + row 170 +
// row 172 patterns.
//
// Non-Stripe / non-GST discipline: writes only to resellers.status +
// resellers.updated_at. No Stripe network call, no revenue_events read,
// no InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor
// a consequence.
test.describe("Admin reseller DELETE pre-write authorization — P10 wave-5 row 171 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("terminated — DELETE with well-formed code as qa-admin-1 returns 200 (idempotent soft-delete)", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("terminated");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('terminated') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("terminated"),
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("terminated"));
      return;
    }
    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const deleteRoute = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
    const resp = await page.request.delete(deleteRoute);
    expect(
      resp.status(),
      `terminated + happy DELETE returned ${resp.status()} — expected 200 after requireAdmin() passes, normaliseResellerCode accepts the fixture code, loadReseller resolves the QAPROBETERMINATED row, and the resellers UPDATE status='terminated' + updated_at bump succeeds. A 400 code_required means the fixture code was rejected by normalisation (attribution.ts:25-29). A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs --variant=terminated). A 500 terminate_failed means the UPDATE hit a DB error (route.ts:220-224). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as { ok?: unknown };
    expect(
      body.ok,
      `happy body.ok should be true (route.ts:227 returns exactly {ok: true}): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
