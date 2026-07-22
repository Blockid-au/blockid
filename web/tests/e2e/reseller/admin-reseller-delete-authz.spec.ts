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
//   - Happy path (200) — fires a resellers UPDATE that flips status to
//     "terminated" against the seed InfoVision row (P1.5 still
//     HUMAN-BLOCKED on H.20 anyway); folded into the admin QA harness
//     follow-up alongside the deferred rows from ticks 94..105.
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
