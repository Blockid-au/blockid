// PATCH /api/admin/resellers/[code] input-validation contract — P10 dry-run
// per plan §C.5 (admin surfaces) and §J.2 (Playwright must cover the admin
// surfaces so a regression in the pre-load validators surfaces before the
// endpoint reads a resellers row, runs validateAdminResellerPatch, or writes
// the resellers UPDATE row).
//
// admin-reseller-patch-authz.spec.ts (tick 103) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the three pre-load body-and-
// path validators that fire BEFORE loadReseller runs, all safely exercisable
// against staging without seeding a resellers row (plan §J.2):
//
//   1. code_required — PATCH with a path segment that normalises to null
//                      (all-punctuation "---") after normaliseResellerCode's
//                      trim/uppercase/[^A-Z0-9] strip           → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:131-132 before the request.json()
//                      try/catch, before loadReseller, before
//                      validateAdminResellerPatch, before the resellers UPDATE)
//
//   2. invalid_body   — PATCH with a well-formed code path + unparseable JSON
//                       body ("not-json-{")                     → 400 { ok:false, reason:"invalid_body" }
//                       (bails at route.ts:134-139 in the request.json()
//                       try/catch before loadReseller,
//                       validateAdminResellerPatch, or the resellers UPDATE)
//
//   3. not_found      — PATCH with a well-formed code path that does not
//                       resolve to a resellers row + valid empty body       → 404 { ok:false, reason:"not_found" }
//                       (loadReseller returns error='not_found' at route.ts
//                       :141-145 before validateAdminResellerPatch or the
//                       resellers UPDATE)
//
// All three branches return BEFORE validateAdminResellerPatch runs (row 1
// short-circuits at code check; row 2 at JSON parse; row 3 at loadReseller
// not_found), so the spec is safe against staging (no resellers row is
// written, no updated_at bump lands, no P1.5 InfoVision seed is touched
// even if it eventually lands per H.20).
//
// Twin of admin-resellers-create-validation (tick 122) / showcase-reviews-
// validation (tick 121) / reports-signed-url-validation (tick 119) / drawer-
// validation (tick 118) / reveal-email-validation (tick 117) / billing-
// validation (tick 120) / requests-validation (tick 92) / credit-grant-
// validation (tick 93) / create-startup-validation (tick 94) — same
// structural shape: pre-auth authz covered by a sibling *-authz spec that
// runs harness-free (admin-reseller-patch-authz.spec.ts tick 103); the
// pre-load post-admin validators covered here behind the QA admin harness
// (loadAdminHarness() from tick 122). Differs from admin-resellers-create-
// validation in one dimension only — that route lives at the collection URL
// /api/admin/resellers and inspects the body's code field via
// normaliseResellerCode(body.code); this route lives at the resource URL
// /api/admin/resellers/[code] and inspects the URL path segment via
// normaliseResellerCode(params.code). Same normaliser, different source, so
// a regression that skips one won't necessarily skip the other.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-patch-authz)
//   Line 130-132: normaliseResellerCode(params.code)   → 400 code_required          ← this spec (row 1)
//   Line 134-139: request.json() try/catch             → 400 invalid_body            ← this spec (row 2)
//   Line 141-153: loadReseller                          → 404 not_found / 503 not_configured / 500 query_failed  ← this spec (row 3)
//   Line 157-169: validateAdminResellerPatch            → 400 <validation reason>    (needs a seeded resellers row — deferred to temp-reseller mint fixture)
//   Line 171-183: resellers UPDATE                      → 500 update_failed / 200 ok (needs a seeded resellers row + writes real DB — deferred)
//
// Deliberately out of scope (needs a seeded resellers row which plan §J.2
// forbids per-test or would poison every other admin-facing spec in the same
// worker):
//   - validateAdminResellerPatch reject branches (empty_patch,
//     display_name_blank, invalid_billing_model, tiers_bad_value,
//     abn_bad_format, wholesale_requires_gst — folded into six branches per
//     wave-5 batching heuristic) — ACTIVATED wave-5 row 170 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'active_wholesale') (fetches the QAPROBEWHOLESALEACTIVE seed row so
//     loadReseller resolves and validateAdminResellerPatch runs, then each
//     branch trips a distinct validator rule and returns 400 BEFORE the
//     resellers UPDATE fires — no cleanup needed because every branch bails
//     at route.ts:166-169 without writing).
//   - Remaining validator reasons (invalid_status, wholesale_requires_abn,
//     budget_negative, sandbox_negative, commission_out_of_range,
//     primary_color_bad_format) — deferred to a P10 follow-up tick; wave-5
//     row 170 activates the six branches called out in the p10-deferred-
//     spec-activation-order.md schedule and leaves the rest for a targeted
//     follow-up if regressions appear. Note: the validator does NOT emit
//     an "unknown_field" reason — unknown patch keys are silently ignored,
//     so a patch of only-unknown keys collapses into empty_patch, which is
//     already covered by row 170.
//   - Happy path (200) — writes a real resellers UPDATE that would poison
//     sibling PATCH / DELETE / list authz specs sharing the same worker AND
//     leaves an updated_at bump on whichever row the harness happens to
//     resolve to.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed / update_failed (500) — need a broken resellers SELECT/
//     UPDATE which requires per-test tampering plan §J.2 forbids.
//
// Path-segment probes:
//   Row 1 uses "---" so normaliseResellerCode('---'.trim().toUpperCase()
//   .replace(/[^A-Z0-9]/g, '')) returns "" → null, tripping the code_required
//   guard before any downstream side effect. Route ordering matters: the
//   code check sits BEFORE JSON parse so a raw:"not-json-{" body attached to
//   this row would still trigger code_required (the JSON is never inspected).
//   Rows 2 + 3 use PROBE_CODE = "qa-probe-should-not-persist" — a stable
//   lowercase-kebab prefix that will not collide with any real reseller_code
//   (INFOVISION, ACCEL_*, etc.). normaliseResellerCode strips the hyphens
//   and uppercases, yielding "QAPROBESHOULDNOTPERSIST" — a 22-char code that
//   safely does not match any seeded row (P1.5 InfoVision seed remains
//   HUMAN-BLOCKED on H.20 anyway). Row 2 attaches a raw non-JSON body to
//   trip invalid_body BEFORE loadReseller fires; row 3 attaches an empty
//   JSON object {} which parses fine, so loadReseller runs and returns
//   not_found for the non-existent code. Row 3's empty body will not reach
//   validateAdminResellerPatch (which would otherwise complain about
//   empty_patch) because not_found short-circuits at loadReseller.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const PROBE_CODE = "qa-probe-should-not-persist";
const ALL_PUNCT_CODE = "---";

interface ValidationCase {
  label: string;
  code: string;
  raw?: string;
  body?: Record<string, unknown>;
  expectedStatus: 400 | 404;
  expectedReason: "code_required" | "invalid_body" | "not_found";
}

const CASES: ValidationCase[] = [
  {
    label:
      "code_required — PATCH with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    body: { display_name: "placeholder should not reach validator" },
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "invalid_body — PATCH with well-formed code + unparseable JSON body returns 400 invalid_body",
    code: PROBE_CODE,
    raw: "not-json-{",
    expectedStatus: 400,
    expectedReason: "invalid_body",
  },
  {
    label:
      "not_found — PATCH with well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    body: {},
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller PATCH input validation — P10 dry-run", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.patch(route, {
        data: c.raw ?? c.body ?? {},
        headers: { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-load validator rejects before validateAdminResellerPatch or resellers UPDATE). Body: ${await resp.text()}`,
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

// P10 wave-5 row 170 — validateAdminResellerPatch reject-branch cluster
// against the QAPROBEWHOLESALEACTIVE seed row. Per docs/plans/p10-deferred-
// spec-activation-order.md wave 5:
//   170 | admin-reseller-patch-validation.spec.ts | active_wholesale |
//         4–6 validator branches (empty_patch / unknown_field /
//         display_name_required / invalid_tier / invalid_billing_model /
//         wholesale_requires_gst) folded into one tick | 400 × 6
//
// Six branches all trip route.ts:166-169 (validation.ok === false path)
// which returns BEFORE the resellers UPDATE at route.ts:171-183 fires, so
// the block is safe against the shared active_wholesale seed row — no
// UPDATE lands, no updated_at bump, no fixture cleanup needed. loadReseller
// DOES succeed (fixture.code === "QAPROBEWHOLESALEACTIVE") so the validator
// runs; each patch is crafted to fail one specific validator rule and
// return the expected reason.
//
// Actual validator reason codes vs plan wording (web/src/lib/reseller/
// admin-validator.ts AdminResellerValidationError):
//   - empty_patch              → matches plan
//   - display_name_blank       → plan called it "display_name_required"
//                                (validator emits display_name_blank)
//   - invalid_billing_model    → matches plan
//   - tiers_bad_value          → plan called it "invalid_tier"
//                                (validator emits tiers_bad_value)
//   - abn_bad_format           → not in plan's example list but included
//                                to hit the ABN_RE guard at admin-validator.
//                                ts:93; leaves invalid_status / wholesale_
//                                requires_abn / budget_negative / sandbox_
//                                negative / commission_out_of_range /
//                                primary_color_bad_format for a follow-up
//                                if regressions appear
//   - wholesale_requires_gst   → matches plan; requires
//                                current.billing_model === "wholesale"
//                                which active_wholesale guarantees; PATCH
//                                { gst_registered: false } merges with
//                                current wholesale billing_model to trip
//                                admin-validator.ts:169-170
//
// The plan's "unknown_field" bullet is not a real validator reason — the
// validator silently ignores unknown patch keys (only known keys populate
// `out`), so a patch of only-unknown keys collapses into empty_patch which
// is already covered here. Documented in the "Deliberately out of scope"
// block above so future authors don't chase a non-existent reason code.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-patch-authz rows 1-2)
//   Line 130-132: normaliseResellerCode → 400 code_required  (wave-5 row 169)
//   Line 134-139: JSON parse → 400 invalid_body  (wave-5 row 169)
//   Line 141-153: loadReseller → 404 not_found / 503 / 500  (wave-5 row 169)
//   Line 157-169: validateAdminResellerPatch → 400 <reason>  ← this block (wave-5 row 170)
//   Line 171-183: resellers UPDATE → 500 / 200  (deferred — needs write-path fixture)
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au — a real admin
//     session so requireAdmin() returns without throwing.
//   - loadTempReseller('active_wholesale') reads the QAPROBEWHOLESALEACTIVE
//     seed row so loadReseller returns a real row for the validator to
//     inspect. adminUserId is NOT needed here because we log in as the
//     platform admin, not the per-variant reseller-admin — mirrors row 167
//     + row 168 fixture posture.
//
// Skip discipline mirrors row 168 (admin-reseller-detail-validation happy)
// verbatim: harness-level skip via test.skip(!harness, adminHarnessSkipReason())
// at describe scope, then two test-scope skips around loadTempReseller
// null vs throw and loginAs throw. Each skip carries a
// tempResellerSkipReason("active_wholesale") pointer so a fresh CI host
// sees the exact seeder command.
//
// State-pollution posture: every branch rejects at route.ts:166-169 (return
// NextResponse.json({ ok: false, reason: validation.reason }, {status})).
// No INSERT / UPDATE / DELETE fires from any branch. Idempotent under CI
// replay and safe against parallel workers because no shared state is
// mutated. No fixture.trackProjectForCleanup / fixture.cleanup() call is
// needed because loadTempReseller only reads the shared seed row for
// active_wholesale — never writes.
//
// Non-Stripe / non-GST discipline preserved: no Stripe network call, no
// InfoVision dependency, no revenue_events read. P8.5 + P1.5 remain
// neither a dependency nor a consequence.
interface PatchRejectCase {
  label: string;
  patch: Record<string, unknown>;
  expectedReason:
    | "empty_patch"
    | "display_name_blank"
    | "invalid_billing_model"
    | "tiers_bad_value"
    | "abn_bad_format"
    | "wholesale_requires_gst";
}

const PATCH_REJECT_CASES: PatchRejectCase[] = [
  {
    label:
      "empty_patch — PATCH with empty JSON body returns 400 empty_patch",
    patch: {},
    expectedReason: "empty_patch",
  },
  {
    label:
      "display_name_blank — PATCH with whitespace-only display_name returns 400 display_name_blank",
    patch: { display_name: "   " },
    expectedReason: "display_name_blank",
  },
  {
    label:
      "invalid_billing_model — PATCH with unknown billing_model returns 400 invalid_billing_model",
    patch: { billing_model: "premium" },
    expectedReason: "invalid_billing_model",
  },
  {
    label:
      "tiers_bad_value — PATCH with tier value outside {0,10,20,30,40} returns 400 tiers_bad_value",
    patch: { allowed_tiers: [15] },
    expectedReason: "tiers_bad_value",
  },
  {
    label:
      "abn_bad_format — PATCH with malformed ABN returns 400 abn_bad_format",
    patch: { abn: "not-a-real-abn" },
    expectedReason: "abn_bad_format",
  },
  {
    label:
      "wholesale_requires_gst — PATCH gst_registered=false against wholesale row returns 400 wholesale_requires_gst",
    patch: { gst_registered: false },
    expectedReason: "wholesale_requires_gst",
  },
];

test.describe("Admin reseller PATCH validator reject cluster — P10 wave-5 row 170", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of PATCH_REJECT_CASES) {
    test(c.label, async ({ page }) => {
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

      const route = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
      const resp = await page.request.patch(route, {
        data: c.patch,
        headers: { "content-type": "application/json" },
      });

      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected 400 after validateAdminResellerPatch rejects the patch (route.ts:166-169) BEFORE the resellers UPDATE fires. Body: ${await resp.text()}`,
      ).toBe(400);
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
