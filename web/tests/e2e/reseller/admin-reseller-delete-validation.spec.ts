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
//   - Happy path (200) — ACTIVATED wave-5 row 172 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'terminated') (fetches the QAPROBETERMINATED seed row).
//     Deviates from the plan §963 which lists variant='active_wholesale'
//     because DELETE flips status → terminated + bumps updated_at, so
//     targeting an already-terminated row keeps the write idempotent
//     under CI replay — the shared active_wholesale seed row would be
//     corrupted for every downstream wave-5 spec that reads it (rows
//     167, 168, 169, 170) if we flipped it. Reason for the deviation
//     is captured in tick 171's review_history "natural next picks (i)"
//     note. updated_at drifts by one row-write per CI pass on the
//     terminated seed only; no other spec asserts on that column.
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

// P10 wave-5 row 172 happy path — terminated variant + admin harness → 200
// idempotent soft-delete. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   172 | admin-reseller-delete-validation.spec.ts | active_wholesale |
//         code_required / happy 200 | 400 / 200
//
// The code_required (400) + not_found (404) reject branches above are
// harness-free (they short-circuit before loadReseller fires). This block
// closes the happy 200 row from the same file's contract table — the
// control that proves the two reject branches genuinely reject on their
// specific validator logic and not on a stale auth or a broken URL contract.
//
// Variant deviation vs plan: the plan lists variant='active_wholesale' but
// DELETE flips status → terminated + bumps updated_at, so targeting the
// shared active_wholesale seed row would poison rows 167 / 168 / 169 / 170
// that read it. We use the pre-existing `terminated` variant instead
// (seed-qa-reseller.mjs line 107-113 mints QAPROBETERMINATED with
// status='terminated'). Re-running DELETE against a row already in
// status='terminated' bumps updated_at only — no visible state change to
// any other spec. Tick 171 recap "natural next picks (i)" documents the
// design intent.
//
// Twin of row 168 (admin-reseller-detail-validation happy 200 tick 168) —
// same route file, same fixture wiring pattern, same
// coverage-vs-duplication call. Kept in this spec so a future tightening
// of the pre-write validators cannot silently reject well-formed admin
// DELETEs — the happy row runs in the same file as the reject rows.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin (admin-reseller-delete-authz)
//   Line 195-197: code normalisation → 400 code_required (rows above)
//   Line 199-211: loadReseller → 404 not_found / 503 / 500 (rows above)
//   Line 215-225: resellers UPDATE status=terminated → 500 terminate_failed / 200 ok  ← this block
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au — a real admin
//     session so requireAdmin() returns without throwing.
//   - loadTempReseller('terminated') reads the QAPROBETERMINATED seed row
//     so fixture.code is the real DB code. adminUserId is NOT needed here
//     because we log in as the ADMIN, not the reseller-admin for the
//     variant — the admin gate is independent of scopedReseller().
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded).
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBETERMINATED seed row missing).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: DELETE flips status → 'terminated' + bumps
// updated_at. Idempotent under CI replay against the terminated variant
// (row was already 'terminated' pre-write). No fixture cleanup wiring
// registered because there is no state to restore — the row started
// terminated and stays terminated. Zero collateral effect on any other
// spec because the terminated variant is a distinct seed row from
// active_wholesale / active_retail / paused / no_capability /
// tier_only_zero / no_budget.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true only. The route
// returns exactly {ok: true} with no additional envelope keys on the
// happy path (route.ts:227). Do NOT assert on reseller state changes at
// the DB level because that would require a follow-up SELECT plan §J.2
// forbids in-spec.
//
// Non-Stripe / non-GST discipline: writes only to resellers.status +
// resellers.updated_at. No Stripe network call, no revenue_events read,
// no InfoVision dependency. P8.5 + P1.5 remain neither a dependency nor
// a consequence.
test.describe("Admin reseller DELETE input validation — P10 wave-5 row 172 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("terminated — DELETE with well-formed code as qa-admin-1 returns 200 (idempotent soft-delete)", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("terminated");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('terminated') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("terminated"),
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("terminated"));
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

    const deleteRoute = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
    const resp = await page.request.delete(deleteRoute);
    expect(
      resp.status(),
      `terminated + happy DELETE returned ${resp.status()} — expected 200 after requireAdmin() passes, normaliseResellerCode accepts the fixture code, loadReseller resolves the QAPROBETERMINATED row, and the resellers UPDATE status='terminated' + updated_at bump succeeds. A 400 code_required means the fixture code was rejected by normalisation (attribution.ts:25-29). A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs --variant=terminated). A 500 terminate_failed means the UPDATE hit a DB error (route.ts:220-224). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as { ok?: unknown };
    expect(
      body.ok,
      `happy body.ok should be true (route.ts:227 returns exactly {ok: true}): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
