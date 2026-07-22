// POST /api/admin/resellers input-validation contract — ACTIVATED
// wave-5 row 166 per docs/plans/p10-deferred-spec-activation-order.md.
// The entire spec runs behind loadAdminHarness() (qa-admin-1@blockid.au)
// so the requireAdmin() gate at route.ts:60-68 passes without needing
// the per-variant reseller cohort. Plan §C.5 (admin surfaces) and §J.2
// (Playwright must cover the admin surfaces so a regression in the
// resellers POST body validator surfaces before the endpoint fires the
// resellers INSERT or breaks the wholesale GST/ABN invariant from
// U.15.1 D2-CFO-01 + D4-CLO-03).
//
// admin-resellers-create-authz.spec.ts (tick 109) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the five post-admin body
// validators its header explicitly deferred to a spec run behind a QA
// admin harness:
//
//   1. invalid_body            — POST with unparseable JSON     → 400 { ok:false, reason:"invalid_body" }
//                                (bails at request.json() catch before
//                                normaliseResellerCode, display_name check,
//                                wholesale GST/ABN validation, or the
//                                resellers INSERT)
//   2. code_required           — POST with omitted/blank code   → 400 { ok:false, reason:"code_required" }
//                                (bails after normaliseResellerCode returns
//                                null-equivalent before display_name check
//                                or the resellers INSERT)
//   3. display_name_required   — POST with omitted display_name → 400 { ok:false, reason:"display_name_required" }
//                                (bails after code normalises but
//                                !body.display_name before wholesale
//                                validation or the resellers INSERT)
//   4. wholesale_requires_gst  — POST with billing_model=wholesale but no
//                                gst_registered flag             → 400 { ok:false, reason:"wholesale_requires_gst" }
//                                (bails at the U.15.1 D2-CFO-01 gate before
//                                the wholesale ABN format check or the
//                                resellers INSERT)
//   5. wholesale_requires_abn  — POST with billing_model=wholesale +
//                                gst_registered=true but missing ABN
//                                                                → 400 { ok:false, reason:"wholesale_requires_abn",
//                                                                        hint:"format: NN NNN NNN NNN" }
//                                (bails at the U.15.1 D4-CLO-03 gate on the
//                                !body.abn branch of the regex guard before
//                                the resellers INSERT)
//   6. invalid_abn_format      — POST with billing_model=wholesale +
//                                gst_registered=true + a malformed ABN string
//                                that fails the /^\d{2} \d{3} \d{3} \d{3}$/
//                                regex                            → 400 { ok:false, reason:"wholesale_requires_abn",
//                                                                        hint:"format: NN NNN NNN NNN" }
//                                (bails at the U.15.1 D4-CLO-03 gate on the
//                                regex-fail branch of the same guard —
//                                distinguished from row 5 by exercising the
//                                right-hand disjunct of the || rather than
//                                the left-hand !body.abn branch; a route
//                                refactor that dropped the regex would flip
//                                THIS row to 201 while row 5 stayed at 400)
//
// All six branches return BEFORE the resellers INSERT fires (row 1 short-
// circuits at request.json() catch; rows 2-6 short-circuit at their
// respective validator gates), so the spec is safe against staging (no
// resellers row is written, no reseller_promotion_codes row is written, no
// (reseller_id, tier_pct) unique index is consumed).
//
// Twin of showcase-reviews-validation (tick 121) / reports-signed-url-
// validation (tick 119) / drawer-validation (tick 118) / reveal-email-
// validation (tick 117) / billing-validation (tick 120) / requests-
// validation (tick 92) / credit-grant-validation (tick 93) / create-startup-
// validation (tick 94) — same structural shape: pre-auth authz covered by a
// sibling *-authz spec that runs harness-free, post-auth validators covered
// here behind a QA harness (loadAdminHarness() rather than
// loadResellerHarness() because the requireAdmin() gate under
// web/src/lib/reseller/require-admin.ts is a different auth dimension from
// scopedReseller()).
//
// Route reference: web/src/app/api/admin/resellers/route.ts
//   Line 60-68:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-resellers-create-authz)
//   Line 70-75:  request.json() catch                   → 400 invalid_body          ← this spec (row 1)
//   Line 77-80:  normaliseResellerCode                  → 400 code_required         ← this spec (row 2)
//   Line 81-83:  display_name check                     → 400 display_name_required ← this spec (row 3)
//   Line 87-100: wholesale invariants                   → 400 wholesale_requires_gst / wholesale_requires_abn  ← this spec (rows 4-5)
//   Line 102-105: getSupabaseAdmin                      → 503 not_configured        (out of scope — would break sibling specs)
//   Line 107-142: resellers INSERT                      → 409 code_taken / 500 insert_failed / 201 ok  (out of scope — writes real DB rows)
//
// Deliberately out of scope (needs per-test seeding which plan §J.2 forbids
// or would poison every other admin-facing spec in the same worker):
//   - code_taken (409) — needs a seeded resellers row whose code matches the
//     POSTed value. Would need the temp-reseller mint fixture to allocate a
//     collision-free probe code per test run.
//   - insert_failed (500) — needs a broken resellers INSERT which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (201) — writes a new resellers row that would poison the
//     sibling PATCH / DELETE / list authz specs sharing the same worker AND
//     consume (reseller_id, tier_pct) unique index slots under
//     reseller_promotion_codes for later P9.4 code-mint approval flows.
//     Folded into the temp-reseller mint fixture follow-up alongside the
//     deferred rows from ticks 94..121.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//
// Common valid body — each case overrides exactly one field (or the raw
// payload) to trip its target gate, so a passing assertion proves that
// specific branch fires (rather than an earlier-in-order gate absorbing the
// failure). Gate order per route.ts: json parse → normaliseResellerCode →
// display_name → wholesale gst → wholesale abn.
//
// PROBE_CODE_BASE — a stable lowercase-kebab prefix that will not collide
// with any real reseller_code (INFOVISION, ACCEL_*, etc.). Rows 4-5 append
// a suffix so a shape drift that lets the wholesale gate silently fall open
// still hits code_taken / insert_failed on the eventual INSERT rather than
// persisting a real reseller row.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const ROUTE = "/api/admin/resellers";
const PROBE_CODE_BASE = "qa-probe-should-not-persist";

interface ValidationCase {
  label: string;
  raw?: string;
  body?: Record<string, unknown>;
  expectedReason:
    | "invalid_body"
    | "code_required"
    | "display_name_required"
    | "wholesale_requires_gst"
    | "wholesale_requires_abn";
}

const CASES: ValidationCase[] = [
  {
    label: "invalid_body — POST with unparseable JSON returns 400 invalid_body",
    raw: "not-json-{",
    expectedReason: "invalid_body",
  },
  {
    label: "code_required — POST with blank code returns 400 code_required",
    body: { code: "", display_name: "Probe Co" },
    expectedReason: "code_required",
  },
  {
    label:
      "display_name_required — POST with omitted display_name returns 400 display_name_required",
    body: { code: `${PROBE_CODE_BASE}-3` },
    expectedReason: "display_name_required",
  },
  {
    label:
      "wholesale_requires_gst — wholesale without gst_registered returns 400 wholesale_requires_gst",
    body: {
      code: `${PROBE_CODE_BASE}-4`,
      display_name: "Probe Co",
      billing_model: "wholesale",
    },
    expectedReason: "wholesale_requires_gst",
  },
  {
    label:
      "wholesale_requires_abn — wholesale + gst without ABN returns 400 wholesale_requires_abn",
    body: {
      code: `${PROBE_CODE_BASE}-5`,
      display_name: "Probe Co",
      billing_model: "wholesale",
      gst_registered: true,
    },
    expectedReason: "wholesale_requires_abn",
  },
  {
    label:
      "invalid_abn_format — wholesale + gst with malformed ABN returns 400 wholesale_requires_abn",
    body: {
      code: `${PROBE_CODE_BASE}-6`,
      display_name: "Probe Co",
      billing_model: "wholesale",
      gst_registered: true,
      // Malformed on purpose — "123" is 3 chars, fails the
      // /^\d{2} \d{3} \d{3} \d{3}$/ regex at route.ts:94. The route
      // folds the missing-ABN and malformed-ABN cases into the same
      // reason=wholesale_requires_abn envelope, so this row asserts
      // the regex-fail branch runs (rather than the !body.abn branch
      // exercised by row 5). A future refactor that split the two
      // reasons — e.g. reason=invalid_abn_format — would flip this
      // row red while row 5 stayed green.
      abn: "123",
    },
    expectedReason: "wholesale_requires_abn",
  },
];

test.describe("Admin resellers POST input validation — P10 wave-5 row 166", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(ROUTE, {
        data: c.raw ?? c.body ?? {},
        headers: { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected 400 (validator rejects before resellers INSERT). Body: ${await resp.text()}`,
      ).toBe(400);
      const body = (await resp.json()) as { ok: boolean; reason?: string; hint?: string };
      expect(
        body.ok,
        `${c.label} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
      if (c.expectedReason === "wholesale_requires_abn") {
        expect(
          body.hint,
          `${c.label} expected hint carrying the ABN format 'NN NNN NNN NNN' so the admin UI can render inline help`,
        ).toBe("format: NN NNN NNN NNN");
      }
    });
  }
});
