// PATCH /api/admin/resellers/[code] pre-write authorization contract — P10
// dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads resellers, validates the
// patch, or writes the resellers UPDATE row).
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
// SELECT fires, no validateAdminResellerPatch runs, no resellers UPDATE
// is issued):
//
//   1. unauthenticated  — PATCH with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE code normalisation, body JSON parse,
//                          resellers SELECT, or resellers UPDATE)
//   2. non_admin        — PATCH as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE code normalisation, body
//                          JSON parse, resellers SELECT, or resellers UPDATE)
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 130-132: normaliseResellerCode → 400 code_required
//   Line 134-139: JSON parse            → 400 invalid_body
//   Line 141-153: loadReseller          → 404 not_found / 503 not_configured / 500 query_failed
//   Line 157-169: validateAdminResellerPatch → 400 <validation reason>
//   Line 171-183: resellers UPDATE      → 500 update_failed / 200 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   sandbox-setup-authz.spec.ts, billing-authz.spec.ts,
//   reveal-email-authz.spec.ts, drawer-authz.spec.ts, and
//   me-attribution.spec.ts.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:130 vs :127),
//     so surfacing it needs a real admin session PLUS an ill-formed code
//     segment.
//   - invalid_body (400) — sits BEHIND requireAdmin (route.ts:134 vs :127),
//     needs an admin session PLUS a non-JSON body.
//   - not_found (404) — sits BEHIND requireAdmin, needs an admin session PLUS
//     a code that does not resolve to a resellers row.
//   - validation reasons (400) — need an admin session PLUS a resellers row
//     PLUS an invariant-violating patch (e.g. wholesale without GST/ABN per
//     U.15.1); folded into the admin QA harness follow-up.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - update_failed (500) — needs a broken resellers UPDATE which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (200) — fires a resellers UPDATE + updated_at bump against
//     the seed InfoVision row (P1.5 still HUMAN-BLOCKED on H.20 anyway);
//     folded into the admin QA harness follow-up alongside the deferred
//     rows from ticks 94/95/96/97/98/99/100/101/102.
//
// Placeholder code used in the URL path: "test-placeholder-code". Both
// harness-free rows return BEFORE the code path segment is inspected
// (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// normaliseResellerCode. Any string that satisfies Next.js dynamic-segment
// matching would work — a lowercase-kebab code keeps the URL well-formed
// against router validation and mirrors the shape the real admin UI PATCHes
// (see web/src/app/admin/resellers/[code]/reseller-edit-client.tsx).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CODE = "test-placeholder-code";
const ROUTE = `/api/admin/resellers/${PLACEHOLDER_CODE}`;
const PATCH_BODY = { display_name: "PATCH placeholder — should not reach DB" };

test.describe("Admin reseller PATCH pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — PATCH with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before code normalisation, body JSON parse, resellers SELECT, or resellers UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — PATCH as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before code normalisation, body JSON parse, resellers SELECT, or resellers UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});
