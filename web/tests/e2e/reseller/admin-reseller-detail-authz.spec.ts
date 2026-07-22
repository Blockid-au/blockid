// GET /api/admin/resellers/[code] pre-read authorization contract — P10
// dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads resellers, the promotion
// codes list, the admin memberships list, the attributions list, or the
// commissions ledger).
//
// Unlike the /api/reseller/** routes which use scopedReseller() +
// gateRequireFeature(), the admin surface uses the shared requireAdmin()
// middleware from web/src/lib/reseller/require-admin.ts (see route.ts:21-32).
// The gate throws AdminGateError with code="no_user" | "not_admin" and the
// route emits { ok: false, reason: <code> } at HTTP 401 for BOTH branches
// (route.ts:27-29). This matches the existing convention in every other
// /api/admin/* route so refactors that swap requireAdmin() for a bespoke
// check would light up here.
//
// Two branches are harness-free and safe against staging (no resellers
// SELECT fires, no promotion_codes/admins/attributions/commissions SELECT
// fires, no payload leaks):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE code normalisation, resellers SELECT, or
//                          the four related-rows SELECTs)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE code normalisation,
//                          resellers SELECT, or the four related-rows SELECTs)
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 47-56:  code normalisation → 400 code_required
//   Line 58-70:  loadReseller → 404 not_found / 503 not_configured / 500 query_failed
//   Line 74-97:  promotion_codes + admins + attributions + commissions SELECT (Promise.all)
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins, attributions_summary, commissions }
//
// Why this shape mirrors the earlier admin-scope specs
// (admin-reseller-patch-authz tick 103, admin-requests-patch-authz tick 105,
// admin-reseller-delete-authz tick 106, admin-requests-list-authz tick 107,
// admin-resellers-list-authz tick 108, admin-resellers-create-authz tick 109):
// all seven routes use requireAdmin() from web/src/lib/reseller/require-admin.ts
// and all seven emit { ok:false, reason: AdminGateError.code } at HTTP 401 for
// BOTH the no_user and not_admin branches. Symmetric envelope means a
// refactor that swaps requireAdmin() for a bespoke inline check, or that
// collapses the two 401 reasons into a single "unauthorised", or that flips
// the status code to 403, lights up in all seven specs on the next
// `npx playwright test` run. Distinct from ticks 103/105/106/107/108/109 in
// ONE dimension only — this is the DETAIL READ surface (GET on the [code]
// segment) which fans out into resellers + reseller_promotion_codes (incl.
// stripe_coupon_id + stripe_promotion_code_id) + reseller_admins (user_id +
// role) + reseller_attributions + reseller_commissions_current (list_price
// + discount_pct + commission_aud_cents + net_owed_cents), so a regression
// that lets an anonymous or non-admin caller reach these SELECTs would leak
// commercially-sensitive reseller state — plan §C.5 restricts this detail
// view to platform admins only.
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the six earlier admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:54 vs :51),
//     so surfacing it needs a real admin session PLUS an ill-formed code
//     segment.
//   - not_found (404) — sits BEHIND requireAdmin, needs an admin session PLUS
//     a code that does not resolve to a resellers row.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (200) — reads the seed InfoVision row (P1.5 still
//     HUMAN-BLOCKED on H.20 anyway) or any real resellers row plus its
//     related codes/admins/attributions/commissions; folded into the admin
//     QA harness follow-up alongside the deferred rows from ticks
//     94..110.
//
// Placeholder code used in the URL path: "test-placeholder-code". Both
// harness-free rows return BEFORE the code path segment is inspected
// (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// normaliseResellerCode. Any string that satisfies Next.js dynamic-segment
// matching would work — a lowercase-kebab code keeps the URL well-formed
// against router validation and mirrors the shape the real admin UI GETs
// (see web/src/app/admin/resellers/[code]/page.tsx).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CODE = "test-placeholder-code";
const ROUTE = `/api/admin/resellers/${PLACEHOLDER_CODE}`;

test.describe("Admin reseller GET pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before code normalisation, resellers SELECT, or the four related-rows SELECTs. Body: ${await resp.text()}`,
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
      `non_admin returned ${resp.status()} — expected 401 not_admin before code normalisation, resellers SELECT, or the four related-rows SELECTs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});
