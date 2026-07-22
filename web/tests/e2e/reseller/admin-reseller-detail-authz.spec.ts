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
//     segment. Folded into row 168 (admin-reseller-detail-validation).
//   - not_found (404) — sits BEHIND requireAdmin, needs an admin session PLUS
//     a code that does not resolve to a resellers row. Folded into row 168.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (200) — ACTIVATED wave-5 row 167 (tick 168) below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'active_wholesale') (fetches the QAPROBEWHOLESALEACTIVE seed row).
//     Reads real resellers + reseller_promotion_codes + reseller_admins +
//     reseller_attributions + reseller_commissions_current rows for the
//     variant — pins envelope shape without pinning any array lengths so
//     the row is idempotent under CI replay across fresh + seeded hosts.
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);

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

// P10 wave-5 row 167 — active_wholesale variant + admin harness → happy 200
// with detail payload. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   167 | admin-reseller-detail-authz.spec.ts | active_wholesale |
//         happy 200 with detail payload | 200
//
// Loads loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin()
// gate at route.ts:21-32 passes without needing the per-variant reseller
// cohort auth, PLUS loadTempReseller('active_wholesale') so we know which
// real resellers.code to fetch (QAPROBEWHOLESALEACTIVE). URL is
// lowercased so it mirrors the /admin/resellers/[code]/page.tsx browser
// convention; the server re-uppercases via normaliseResellerCode
// (attribution.ts:25-29) before the resellers SELECT so the DB row
// resolves cleanly regardless of case.
//
// Twin of row 164 (admin-resellers-list-authz happy — pins the LIST
// envelope from behind the same admin gate) and row 173
// (admin-reseller-loop-status-authz happy — pins the on-disk snapshot
// envelope). This row pins the DETAIL envelope so the three admin GETs
// are jointly regression-guarded on the same requireAdmin() gate.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 47-56:  code normalisation → 400 code_required (row 168)
//   Line 58-70:  loadReseller → 404 not_found / 503 / 500
//   Line 74-97:  Promise.all — reseller_promotion_codes + reseller_admins +
//                reseller_attributions + reseller_commissions_current
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins,
//                       attributions_summary: {total, active, by_source},
//                       commissions }
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au (tick 130 admin
//     harness delta) — a real admin session so requireAdmin() returns
//     without throwing.
//   - loadTempReseller('active_wholesale') reads the QAPROBEWHOLESALEACTIVE
//     seed row so fixture.code is the real DB code. adminUserId is NOT
//     needed here because we log in as the ADMIN, not the reseller-admin
//     for the variant — the admin gate is independent of the reseller-
//     admins scope.
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded).
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE
// fires from this endpoint. Idempotent under CI replay.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + reseller shape
// (id UUID, code === fixture.code uppercased, display_name string,
// billing_model ∈ {retail, wholesale}, status ∈ {active, paused,
// terminated}) + Array.isArray on the four related-rows arrays +
// attributions_summary { total: number, active: number, by_source:
// object }. Do NOT pin ANY array length — promotion_codes may hold 0-3
// rows (tiers 20 + 40 seeded for active_wholesale + optional admin
// mints); admins holds ≥1 (per-variant reseller_admins row); commissions
// may be empty on fresh CI or ≥1 on hosts where P3 webhook accrual has
// fired; attributions_summary.total varies with whether the attributed-
// founder seed has been planted. Per-row shape pins on promotion_codes +
// admins catch a route regression that dropped a column from the SELECT
// list (route.ts:75-77 lists exact column set) without depending on
// seed volume.
//
// Non-Stripe / non-GST discipline: reads resellers +
// reseller_promotion_codes + reseller_admins + reseller_attributions +
// reseller_commissions_current only. No Stripe network call, no InfoVision
// dependency. P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Admin reseller GET — P10 wave-5 row 167 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("active_wholesale — GET as qa-admin-1 returns 200 with detail payload", async ({
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
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
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

    const detailRoute = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
    const resp = await page.request.get(detailRoute);
    expect(
      resp.status(),
      `active_wholesale + happy GET returned ${resp.status()} — expected 200 after requireAdmin() passes and loadReseller resolves the QAPROBEWHOLESALEACTIVE row. A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs). A 5xx means one of the four Promise.all SELECTs failed (route.ts:74-97). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      reseller?: {
        id?: unknown;
        code?: unknown;
        display_name?: unknown;
        billing_model?: unknown;
        status?: unknown;
      };
      promotion_codes?: Array<{
        id?: unknown;
        tier_pct?: unknown;
        code?: unknown;
      }>;
      admins?: Array<{
        id?: unknown;
        user_id?: unknown;
        role?: unknown;
        status?: unknown;
      }>;
      attributions_summary?: {
        total?: unknown;
        active?: unknown;
        by_source?: unknown;
      };
      commissions?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Reseller row shape — reads resellers.* (route.ts:37-41).
    expect(body.reseller, "body.reseller should be present").toBeTruthy();
    expect(
      typeof body.reseller?.id === "string" &&
        UUID_RE.test(body.reseller!.id as string),
      `reseller.id should be UUID: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.code,
      `reseller.code should equal fixture.code (uppercase form): ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(fixture.code);
    expect(typeof body.reseller?.display_name).toBe("string");
    expect(
      BILLING_MODELS.has(body.reseller?.billing_model as string),
      `reseller.billing_model should be retail|wholesale: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      STATUSES.has(body.reseller?.status as string),
      `reseller.status should be active|paused|terminated: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Related-rows arrays — do NOT pin length; each row-shape pin catches
    // a SELECT-column drift on the route-side Promise.all (route.ts:74-97).
    expect(
      Array.isArray(body.promotion_codes),
      `promotion_codes should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.promotion_codes ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `promotion_codes[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.tier_pct).toBe("number");
      expect(typeof row.code).toBe("string");
    }

    expect(
      Array.isArray(body.admins),
      `admins should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.admins ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `admins[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        typeof row.user_id === "string" && UUID_RE.test(row.user_id as string),
        `admins[].user_id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.role).toBe("string");
      expect(typeof row.status).toBe("string");
    }

    // Attributions summary — pins the {total, active, by_source} shape
    // computed by route.ts:104-111. Sub-map by_source is an object with
    // numeric counts; not pinning its keys because sources vary.
    expect(
      body.attributions_summary,
      `attributions_summary should be present: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBeTruthy();
    expect(typeof body.attributions_summary?.total).toBe("number");
    expect(typeof body.attributions_summary?.active).toBe("number");
    expect(
      body.attributions_summary?.by_source !== null &&
        typeof body.attributions_summary?.by_source === "object" &&
        !Array.isArray(body.attributions_summary?.by_source),
      `attributions_summary.by_source should be a plain object: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);

    expect(
      Array.isArray(body.commissions),
      `commissions should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
