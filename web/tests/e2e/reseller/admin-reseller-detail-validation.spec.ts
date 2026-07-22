// GET /api/admin/resellers/[code] input-validation contract — P10 dry-run
// per plan §C.5 (admin surfaces) and §J.2 (Playwright must cover the admin
// surfaces so a regression in the pre-load validators surfaces before the
// endpoint reads the resellers row or the four related-rows Promise.all
// fan-out that follows).
//
// admin-reseller-detail-authz.spec.ts (tick 104) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the two pre-read body-and-
// path validators that fire BEFORE the resellers SELECT + the
// promotion_codes/admins/attributions/commissions Promise.all, both safely
// exercisable against staging without seeding a resellers row (plan §J.2):
//
//   1. code_required — GET with a path segment that normalises to null
//                      (all-punctuation "---") after normaliseResellerCode's
//                      trim/uppercase/[^A-Z0-9] strip           → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:55-56 before loadReseller, before
//                      the four related-rows Promise.all runs)
//
//   2. not_found      — GET with a well-formed code path that does not
//                       resolve to a resellers row              → 404 { ok:false, reason:"not_found" }
//                       (loadReseller returns error='not_found' at route.ts
//                       :58-62 before the four related-rows Promise.all runs)
//
// Both branches return BEFORE the four related-rows Promise.all fires (row 1
// short-circuits at code check; row 2 at loadReseller not_found), so the
// spec is safe against staging (no resellers row is read, no promotion_codes
// / admins / attributions / commissions payload leaks, no P1.5 InfoVision
// seed is touched even after H.20 clears).
//
// Twin of admin-reseller-delete-validation.spec.ts (tick 125) — same route
// file, same pre-load validators, same normaliseResellerCode source (URL
// path segment via params.code, not request body). Differs in one dimension
// only — GET is a read (loadReseller + Promise.all fan-out) rather than a
// write (resellers UPDATE status=terminated), but the pre-load validator
// surface is IDENTICAL: code_required + not_found return in the same order,
// with the same envelope, before any DB read fires. The full row set stays
// at two (code_required + not_found).
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-detail-authz)
//   Line 47-56:   normaliseResellerCode(params.code)   → 400 code_required          ← this spec (row 1)
//   Line 58-70:   loadReseller                         → 404 not_found / 503 not_configured / 500 query_failed  ← this spec (row 2)
//   Line 74-97:   promotion_codes + admins + attributions + commissions Promise.all (needs a seeded resellers row + reads real DB — deferred to temp-reseller mint fixture)
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins, attributions_summary, commissions }
//
// Deliberately out of scope (needs a seeded resellers row which plan §J.2
// forbids per-test or would poison every other admin-facing spec in the same
// worker):
//   - Happy path (200) — reads a real resellers row + fans out into the four
//     related-rows Promise.all which returns promotion_codes / admins /
//     attributions_summary / commissions payloads. Folded into the temp-
//     reseller mint fixture follow-up alongside the deferred rows from
//     ticks 94..125.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
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
      "code_required — GET with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "not_found — GET with well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller GET input validation — P10 dry-run", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.get(route);
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-read validator rejects before loadReseller + related-rows Promise.all). Body: ${await resp.text()}`,
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
