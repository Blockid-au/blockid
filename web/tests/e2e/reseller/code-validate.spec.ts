// POST /api/reseller/code/validate input-validation contract — P10 dry-run
// per plan §C.2 (redemption UX) and §J.2 (Playwright must cover the reseller
// public endpoints so a regression in the validator surfaces before the
// consent modal / checkout flow diverges from the response envelope).
//
// This endpoint is intentionally UNAUTHENTICATED — the code is applied
// pre-signup so no viewer identity exists to scope on (r-01-exempt in the
// route file). That means the spec does NOT depend on the reseller QA
// harness and runs against staging with zero writes: rows 1-4 bail before
// any DB read fires, and row 5 hits only the reseller_promotion_codes
// SELECT with a code chosen to be astronomically unlikely to collide with
// a real row.
//
// Branches probed (all pre-write, all safe against staging):
//   1. invalid_payload_no_json — POST with content-type: text/plain body    → 400 reason="invalid"
//   2. missing_code            — body {} with no `code` field               → 400 reason="invalid"
//   3. blank_code              — body { code: "" } (empty string)           → 400 reason="invalid"
//   4. punctuation_only        — body { code: "!!!" } (normalises to "")    → 400 reason="invalid"
//   5. code_not_found          — well-formed random code that does not      → 404 reason="invalid"
//                                exist in reseller_promotion_codes
//
// Route reference: web/src/app/api/reseller/code/validate/route.ts
//   Line 32-36: JSON parse error → 400 { reason: "invalid" }
//   Line 38-41: normaliseResellerCode() returns null → 400 { reason: "invalid" }
//   Line 61-63: promo row missing OR promo.active=false → 404 { reason: "invalid" }
//   Line 72-74: reseller missing OR status !== "active" → 404 { reason: "inactive" }
//   Line 44-46: SUPABASE_URL/SERVICE_ROLE unset → 503 { reason: "not_configured" }
//
// Deliberately out of scope (need reseller row column state that plan §J.2
// forbids per-test seeding for):
//   - inactive (404) — needs a promo whose reseller.status='terminated' or
//     'paused' — requires a bespoke QA reseller mint fixture.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - Happy path (200 ok + reseller.display_name + tier_pct) — needs a
//     real active reseller_promotion_codes row; folded into the temp-
//     reseller mint fixture follow-up alongside the deferred rows from
//     ticks 94/95/96.

import { test, expect } from "@playwright/test";

interface ValidationCase {
  label: string;
  body: unknown;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedReason: "invalid" | "inactive" | "not_configured";
}

// A well-formed but astronomically unlikely-to-exist reseller code. The
// normaliser strips non-alphanumerics and uppercases, so this passes the
// null gate at line 39-41 and hits the reseller_promotion_codes SELECT.
// Prefix marks it as a Playwright probe so any operator inspecting the
// DB after a run can identify test traffic.
const NON_EXISTENT_CODE = "PWNONEXIST" + Math.random().toString(36).slice(2, 8).toUpperCase();

const CASES: ValidationCase[] = [
  {
    label: "invalid_payload_no_json — POST with text/plain body returns 400",
    body: "not-json",
    headers: { "content-type": "text/plain" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "missing_code — body without code field returns 400",
    body: {},
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "blank_code — body with empty code string returns 400",
    body: { code: "" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "punctuation_only — code with no alphanumerics normalises to null returns 400",
    body: { code: "!!!" },
    expectedStatus: 400,
    expectedReason: "invalid",
  },
  {
    label: "code_not_found — well-formed but non-existent code returns 404",
    body: { code: NON_EXISTENT_CODE },
    expectedStatus: 404,
    expectedReason: "invalid",
  },
];

test.describe("Reseller code/validate input validation — P10 dry-run", () => {
  for (const c of CASES) {
    test(c.label, async ({ request }) => {
      const resp = await request.post(`/api/reseller/code/validate`, {
        data: c.body as never,
        headers: c.headers ?? { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (route rejects before any write; only row 5 hits a SELECT). Body: ${await resp.text()}`,
      ).toBe(c.expectedStatus);
      const body = (await resp.json()) as { ok: boolean; reason: string };
      expect(body.ok, `${c.label} body.ok should be false: ${JSON.stringify(body)}`).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
    });
  }
});
