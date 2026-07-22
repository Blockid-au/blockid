// POST /api/admin/resellers pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin surfaces) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint parses the body, normalises the
// code, or writes the resellers INSERT row).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103),
// admin-requests-patch-authz.spec.ts (tick 105),
// admin-reseller-delete-authz.spec.ts (tick 106),
// admin-requests-list-authz.spec.ts (tick 107), and
// admin-resellers-list-authz.spec.ts (tick 108) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see
// route.ts:60-68), same { ok:false, reason: AdminGateError.code }
// envelope pair at HTTP 401 for BOTH the no_user and not_admin branches
// (route.ts:64-66). Symmetric shape means a refactor that collapses the
// two 401 reasons into a single "unauthorised", swaps requireAdmin() for
// a bespoke inline check, or flips the status code to 403 lights up in
// all six specs on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no resellers
// INSERT fires, no body JSON parse runs, no code normalisation fires,
// no wholesale/GST/ABN validation fires, no resellers row is written):
//
//   1. unauthenticated  — POST with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE JSON parse, normaliseResellerCode,
//                          display_name check, wholesale GST/ABN
//                          validation, getSupabaseAdmin, or resellers
//                          INSERT)
//   2. non_admin        — POST as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE JSON parse,
//                          normaliseResellerCode, display_name check,
//                          wholesale GST/ABN validation, getSupabaseAdmin,
//                          or resellers INSERT)
//
// Route reference: web/src/app/api/admin/resellers/route.ts
//   Line 60-68:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 70-75:  JSON parse                  → 400 invalid_body
//   Line 77-80:  normaliseResellerCode       → 400 code_required
//   Line 81-83:  display_name check          → 400 display_name_required
//   Line 87-100: wholesale invariants        → 400 wholesale_requires_gst / wholesale_requires_abn
//   Line 102-105: getSupabaseAdmin           → 503 not_configured
//   Line 107-142: resellers INSERT           → 409 code_taken / 500 insert_failed / 201 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the five sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - invalid_body (400) — sits BEHIND requireAdmin (route.ts:70 vs :62),
//     needs an admin session PLUS a non-JSON body.
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:77 vs :62),
//     needs an admin session PLUS an omitted/blank code field.
//   - display_name_required (400) — sits BEHIND requireAdmin (route.ts:81
//     vs :62), needs an admin session PLUS an omitted display_name.
//   - wholesale_requires_gst / wholesale_requires_abn (400) — sits BEHIND
//     requireAdmin (route.ts:87-100 vs :62), needs an admin session PLUS
//     a wholesale body missing gst_registered or ABN in NN NNN NNN NNN
//     format per U.15.1 D2-CFO-01 + D4-CLO-03.
//   - code_taken (409) — sits BEHIND requireAdmin, needs an admin session
//     PLUS a code already present in resellers.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - insert_failed (500) — needs a broken resellers INSERT which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (201) — writes a new resellers row that would then
//     poison every subsequent admin-facing spec in the worker (including
//     the sibling PATCH/DELETE/list authz specs) and would also require
//     downstream cleanup for the (code, tier) unique constraint under
//     reseller_promotion_codes; folded into the admin QA harness
//     follow-up alongside the deferred rows from ticks 94..108.
//
// Placeholder body used on both rows: an object with a lowercase-kebab
// code and a display_name, safe enough that even if the requireAdmin
// gate silently fell open the eventual INSERT would still hit the
// code_taken / insert_failed branches rather than persist a real row.
// Both harness-free rows return BEFORE JSON parse fires (row 1 bails in
// gate() → getCurrentUser; row 2 bails in gate() → requireAdmin), so
// the placeholder body never reaches the resellers table.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/resellers";
const CREATE_BODY = {
  code: "test-placeholder-code",
  display_name: "POST placeholder — should not reach DB",
};

test.describe("Admin resellers POST pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before JSON parse, normaliseResellerCode, display_name check, wholesale GST/ABN validation, getSupabaseAdmin, or the resellers INSERT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — POST as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.post(ROUTE, { data: CREATE_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before JSON parse, normaliseResellerCode, display_name check, wholesale GST/ABN validation, getSupabaseAdmin, or the resellers INSERT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});
