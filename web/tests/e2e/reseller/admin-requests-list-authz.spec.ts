// GET /api/admin/resellers/requests pre-read authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright
// must cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads reseller_requests).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103),
// admin-requests-patch-authz.spec.ts (tick 105), and
// admin-reseller-delete-authz.spec.ts (tick 106) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see route.ts:20-29),
// same { ok:false, reason: AdminGateError.code } envelope pair at HTTP 401
// for BOTH the no_user and not_admin branches (route.ts:25-27). Symmetric
// shape means a refactor that collapses the two 401 reasons into a single
// "unauthorised", swaps requireAdmin() for a bespoke inline check, or
// flips the status code to 403 lights up in all four specs on the next
// `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no
// reseller_requests SELECT fires, no write is issued, no admin state
// changes):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE getSupabaseAdmin, ?status=/?request_type=
//                          parse, or the reseller_requests SELECT)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE getSupabaseAdmin, query
//                          param parse, or the reseller_requests SELECT)
//
// Route reference: web/src/app/api/admin/resellers/requests/route.ts
//   Line 20-29:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 31-34:  getSupabaseAdmin → 503 not_configured
//   Line 36-52:  URL parse + reseller_requests SELECT
//   Line 54-62:  query result → 500 query_failed / 200 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the three sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken reseller_requests SELECT which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (200) — reads real reseller_requests rows, requires a
//     real admin session; folded into the admin QA harness follow-up
//     alongside the deferred rows from ticks 94..106.
//
// Route uses default status filter "pending" when ?status= is omitted, and
// omits the ?request_type= filter when absent — both harness-free rows
// return BEFORE those params are parsed (row 1 bails in gate() →
// getCurrentUser; row 2 bails in gate() → requireAdmin), so no query
// params are needed on either request.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/resellers/requests";

test.describe("Admin reseller-requests list pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before getSupabaseAdmin, query param parse, or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — GET as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before getSupabaseAdmin, query param parse, or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});
