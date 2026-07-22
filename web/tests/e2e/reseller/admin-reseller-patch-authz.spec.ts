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
//   - code_required (400) — ACTIVATED wave-5 row 169 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + ALL_PUNCT_CODE ("---")
//     path segment that normalises to null, tripping route.ts:130-132
//     BEFORE JSON parse or loadReseller.
//   - invalid_body (400) — ACTIVATED wave-5 row 169 below via
//     loadAdminHarness() + a well-formed code + a body that fails
//     JSON.parse (bytes '{'), tripping route.ts:134-139 BEFORE loadReseller.
//   - not_found (404) — ACTIVATED wave-5 row 169 below via
//     loadAdminHarness() + PROBE_CODE ("qa-probe-should-not-persist") +
//     a well-formed JSON body, so loadReseller returns error='not_found'
//     at route.ts:141-153 BEFORE any resellers UPDATE fires.
//   - validation reasons (400) — need an admin session PLUS a resellers row
//     PLUS an invariant-violating patch (e.g. wholesale without GST/ABN per
//     U.15.1); folded into the admin QA harness follow-up (wave-5 row 170
//     admin-reseller-patch-validation).
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
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CODE = "test-placeholder-code";
const ROUTE = `/api/admin/resellers/${PLACEHOLDER_CODE}`;
const PATCH_BODY = { display_name: "PATCH placeholder — should not reach DB" };

const ALL_PUNCT_CODE = "---";
const PROBE_CODE = "qa-probe-should-not-persist";
const WELL_FORMED_PATCH_BODY = {
  display_name: "PATCH probe — should not reach DB (not_found)",
};

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

// P10 wave-5 row 169 — admin PATCH pre-write validation contract post
// requireAdmin() gate. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   169 | admin-reseller-patch-authz.spec.ts | active_wholesale |
//         code_required / invalid_body / not_found | 400 / 400 / 404
//
// Three branches all fire BEFORE the resellers UPDATE runs, so all three
// are safely exercisable against staging without seeding or mutating any
// resellers row (plan §J.2). The active_wholesale variant column in the
// wave-5 table refers to the ambient reseller cohort — no per-variant
// fixture is required for these three rows because none of them reach
// loadReseller with a code that matches an existing row (code_required
// bails at normaliseResellerCode; invalid_body bails at JSON.parse;
// not_found reaches loadReseller with a code that is guaranteed not to
// resolve).
//
//   1. code_required — PATCH with a path segment that normalises to null
//                      (all-punctuation "---") after
//                      normaliseResellerCode's trim/uppercase/[^A-Z0-9]
//                      strip                                → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:130-132 BEFORE JSON parse or
//                      loadReseller or resellers UPDATE)
//
//   2. invalid_body  — PATCH with a well-formed code + a body that fails
//                      JSON.parse (raw bytes '{')          → 400 { ok:false, reason:"invalid_body" }
//                      (bails at route.ts:134-139 BEFORE loadReseller
//                      or resellers UPDATE — the code check passes first
//                      at route.ts:130-132 because PROBE_CODE normalises
//                      to QAPROBESHOULDNOTPERSIST)
//
//   3. not_found     — PATCH with PROBE_CODE ("qa-probe-should-not-persist")
//                      + a valid JSON body                 → 404 { ok:false, reason:"not_found" }
//                      (loadReseller returns error='not_found' at
//                      route.ts:141-153 BEFORE validateAdminResellerPatch
//                      or resellers UPDATE — no P1.5 InfoVision seed row
//                      is touched even after H.20 clears because the code
//                      is deliberately unmatching)
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (unauth + non_admin above)
//   Line 130-132: normaliseResellerCode(params.code)     → 400 code_required        ← this block row 1
//   Line 134-139: JSON.parse(request body)               → 400 invalid_body          ← this block row 2
//   Line 141-153: loadReseller                            → 404 not_found / 503 not_configured / 500 query_failed  ← this block row 3
//   Line 157-169: validateAdminResellerPatch              → 400 <validation reason>  (wave-5 row 170 admin-reseller-patch-validation)
//   Line 171-183: resellers UPDATE                        → 500 update_failed / 200 ok (needs seeded resellers row + write path — deferred to temp-reseller mint fixture)
//
// Twin coverage posture: row 168 (admin-reseller-detail-validation code_
// required + not_found) + row 172 (admin-reseller-delete-validation code_
// required + not_found) already pin the same pre-load validator surface
// from the GET + DELETE lenses. Row 169 adds PATCH's invalid_body branch
// which is unique to the PATCH verb (GET has no request body; DELETE
// takes no request body). A route refactor that swapped
// normaliseResellerCode for a bespoke check would light up in all three
// specs on the next `npx playwright test` pass; a refactor that dropped
// the JSON.parse error handler would light up only in this file.
//
// Non-Stripe / non-GST discipline preserved: no Stripe network call, no
// InfoVision dependency, no revenue_events read. Net side-effect budget
// per CI pass: 0 writes. P8.5 + P1.5 remain neither a dependency nor a
// consequence.
//
// State-pollution posture: all three rows short-circuit BEFORE the
// resellers UPDATE fires, so no fixture cleanup wiring is required. The
// block is idempotent under CI replay and safe against parallel workers
// because no shared state is mutated.
//
// Skip discipline: harness-level skip via test.skip(!harness,
// adminHarnessSkipReason()) at describe scope, then a per-test try/catch
// around loginAs so a fresh CI host missing /tmp/blockid-qa-accounts.txt
// surfaces the exact seeder command rather than a hard failure. Mirrors
// the row 168 + row 172 skip posture.
interface PatchValidationCase {
  label: string;
  code: string;
  data: string | Record<string, unknown>;
  expectedStatus: 400 | 404;
  expectedReason: "code_required" | "invalid_body" | "not_found";
}

// Row 3 uses a well-formed JSON body so the JSON.parse guard passes and
// loadReseller runs — the code is guaranteed not to resolve because
// normaliseResellerCode('qa-probe-should-not-persist') yields
// "QAPROBESHOULDNOTPERSIST" (22 chars, alnum-only) which will not match
// any seeded reseller_code (INFOVISION, ACCEL_*, QAPROBEWHOLESALEACTIVE,
// etc.).
//
// Row 2 uses the raw string "{" so request.json() throws SyntaxError —
// Next.js returns the caught SyntaxError up through the catch at
// route.ts:137-139 which emits invalid_body. Passing a string via
// Playwright's data option bypasses JSON.stringify; combined with an
// explicit application/json content-type this exercises the exact
// path a hostile client would take when posting garbage under the
// api/json content-type header.
const PATCH_CASES: PatchValidationCase[] = [
  {
    label:
      "code_required — PATCH with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    data: WELL_FORMED_PATCH_BODY,
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "invalid_body — PATCH with a well-formed code but a body that fails JSON.parse returns 400 invalid_body",
    code: PROBE_CODE,
    data: "{",
    expectedStatus: 400,
    expectedReason: "invalid_body",
  },
  {
    label:
      "not_found — PATCH with a well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    data: WELL_FORMED_PATCH_BODY,
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller PATCH input validation — P10 wave-5 row 169 post-requireAdmin", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of PATCH_CASES) {
    test(c.label, async ({ page }) => {
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

      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.patch(route, {
        data: c.data,
        headers:
          typeof c.data === "string"
            ? { "content-type": "application/json" }
            : undefined,
      });

      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-write validator rejects BEFORE resellers UPDATE). Body: ${await resp.text()}`,
      ).toBe(c.expectedStatus);
      const body = (await resp.json()) as { ok: boolean; reason?: string };
      expect(
        body.ok,
        `${c.label} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
    });
  }
});
