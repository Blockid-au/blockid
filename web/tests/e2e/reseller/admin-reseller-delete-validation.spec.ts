// DELETE /api/admin/resellers/[code] input-validation contract — P10 dry-run
// per plan §C.5 (admin surfaces) and §J.2 (Playwright must cover the admin
// surfaces so a regression in the pre-load validators surfaces before the
// endpoint reads a resellers row or writes the soft-delete UPDATE that flips
// status to "terminated").
//
// admin-reseller-delete-authz.spec.ts (tick 104) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the two pre-write body-and-
// path validators that fire BEFORE the resellers UPDATE runs, both safely
// exercisable against staging without seeding a resellers row (plan §J.2):
//
//   1. code_required — DELETE with a path segment that normalises to null
//                      (all-punctuation "---") after normaliseResellerCode's
//                      trim/uppercase/[^A-Z0-9] strip           → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:196-197 before loadReseller, before
//                      the resellers UPDATE status=terminated)
//
//   2. not_found      — DELETE with a well-formed code path that does not
//                       resolve to a resellers row              → 404 { ok:false, reason:"not_found" }
//                       (loadReseller returns error='not_found' at route.ts
//                       :199-202 before the resellers UPDATE)
//
// Both branches return BEFORE the resellers UPDATE fires (row 1 short-circuits
// at code check; row 2 at loadReseller not_found), so the spec is safe
// against staging (no resellers row is flipped to "terminated", no
// updated_at bump lands, no P1.5 InfoVision seed is touched even after H.20
// clears).
//
// Twin of admin-reseller-patch-validation.spec.ts (tick 123) — same route
// file, same pre-load validators, same normaliseResellerCode source (URL
// path segment via params.code, not request body). Differs in one dimension
// only — DELETE takes no request body so there is no invalid_body row, and
// no validateAdminResellerPatch call downstream. The full row set collapses
// from three (code_required + invalid_body + not_found) to two
// (code_required + not_found).
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-delete-authz)
//   Line 195-197: normaliseResellerCode(params.code)   → 400 code_required          ← this spec (row 1)
//   Line 199-211: loadReseller                          → 404 not_found / 503 not_configured / 500 query_failed  ← this spec (row 2)
//   Line 215-225: resellers UPDATE status=terminated   → 500 terminate_failed / 200 ok  (needs a seeded resellers row + writes real DB — deferred to temp-reseller mint fixture)
//
// Deliberately out of scope (needs a seeded resellers row which plan §J.2
// forbids per-test or would poison every other admin-facing spec in the same
// worker):
//   - Happy path (200) — writes a real resellers UPDATE that flips status to
//     "terminated" and revokes attribution for every attributed customer of
//     the target reseller. Folded into the temp-reseller mint fixture
//     follow-up alongside the deferred rows from ticks 94..124.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed / terminate_failed (500) — need a broken resellers SELECT/
//     UPDATE which requires per-test tampering plan §J.2 forbids.
//
// Path-segment probes:
//   Row 1 uses "---" so normaliseResellerCode('---'.trim().toUpperCase()
//   .replace(/[^A-Z0-9]/g, '')) returns "" → null, tripping the code_required
//   guard before any downstream side effect.
//   Row 2 uses PROBE_CODE = "qa-probe-should-not-persist" — a stable
//   lowercase-kebab prefix that will not collide with any real reseller_code
//   (INFOVISION, ACCEL_*, etc.). normaliseResellerCode strips the hyphens
//   and uppercases, yielding "QAPROBESHOULDNOTPERSIST" — a 22-char code that
//   safely does not match any seeded row (P1.5 InfoVision seed remains
//   HUMAN-BLOCKED on H.20 anyway).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const PROBE_CODE = "qa-probe-should-not-persist";
const ALL_PUNCT_CODE = "---";

interface ValidationCase {
  label: string;
  code: string;
  expectedStatus: 400 | 404;
  expectedReason: "code_required" | "not_found";
}

const CASES: ValidationCase[] = [
  {
    label:
      "code_required — DELETE with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "not_found — DELETE with well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller DELETE input validation — P10 dry-run", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.delete(route);
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-write validator rejects before resellers UPDATE status=terminated). Body: ${await resp.text()}`,
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
