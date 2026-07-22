// POST /api/reseller/requests input-validation contract — P10 dry-run
// per plan §C.5 (admin approval flows) and §J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the request-body validator
// surfaces before the endpoint fires a DB insert into reseller_requests).
//
// This spec probes the reseller_state-independent validation branches
// surfaced by web/src/lib/reseller/requests.ts::validateResellerRequestBody
// (routed through web/src/app/api/reseller/requests/route.ts before the
// endpoint touches reseller_requests or reseller_audit_log):
//
//   1. invalid_payload         — POST with no JSON body                → 400
//   2. invalid_request_type    — request_type not in the three-value   → 400
//                                enum (code_request | over_budget_approval
//                                | collateral_approval)
//   3. code_request → invalid_tier_pct — tier_pct outside {0,10,20,30, → 400
//                                40} (99 is deliberately out-of-range)
//   4. code_request → suffix_bad_format — suggested_suffix contains    → 400
//                                characters outside [A-Z0-9] or is too
//                                long (>16 chars)
//   5. collateral_approval → collateral_url_required — non-https URL   → 400
//   6. collateral_approval → purpose_required — url ok but purpose     → 400
//                                blank
//
// All six rows return before the reseller_requests INSERT fires, so the spec
// is safe against staging (no queue pollution, no reseller_audit_log entry).
//
// Skips:
//   describe-scope on loadResellerHarness() (needs QA_RESELLER_ADMIN_EMAIL +
//     QA_RESELLER_ATTRIBUTED_CUSTOMER_ID) — same posture as
//     create-startup-validation.spec.ts, credit-grant-validation.spec.ts,
//     audit-log-writes.spec.ts, audit-anomaly-scan.spec.ts,
//     attribution-timing.spec.ts, scope-boundary.spec.ts.
//
// Deliberately out of scope (need per-reseller column state that the QA
// harness cannot promise without per-test seeding, forbidden by plan §J.2):
//   - tier_not_allowed          (needs allowed_tiers to exclude the probe
//                                tier — the default seed carries [0,10,20,30,
//                                40] so no tier value can trip it)
//   - capability_disabled       (needs can_grant_credits=false on the
//                                reseller row; QA harness assumes wholesale
//                                admin with can_grant_credits=true)
//   - target_user_id_required   (over_budget_approval gate order runs
//                                capability_disabled FIRST — asserting the
//                                target_user_id branch would require a
//                                second QA reseller row with
//                                can_grant_credits=true which is already
//                                the default; folded into the harness-
//                                expansion follow-up)
//   - invalid_amount            (same over_budget_approval gate-ordering
//                                caveat as target_user_id_required)
//   - duplicate_pending_code_request (409 — needs an existing pending
//                                code_request row for the same reseller,
//                                which is per-test seeding)

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

interface ValidationCase {
  label: string;
  body: unknown;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedReason:
    | "invalid_payload"
    | "invalid_request_type"
    | "invalid_tier_pct"
    | "suffix_bad_format"
    | "collateral_url_required"
    | "purpose_required";
}

const CASES: ValidationCase[] = [
  {
    label: "invalid_payload — POST with no JSON body returns 400",
    body: "not-json",
    headers: { "content-type": "text/plain" },
    expectedStatus: 400,
    expectedReason: "invalid_payload",
  },
  {
    label: "invalid_request_type — request_type outside the three-value enum returns 400",
    body: { request_type: "something_else", payload: {} },
    expectedStatus: 400,
    expectedReason: "invalid_request_type",
  },
  {
    label: "code_request invalid_tier_pct — tier_pct=99 (outside {0,10,20,30,40}) returns 400",
    body: { request_type: "code_request", payload: { tier_pct: 99 } },
    expectedStatus: 400,
    expectedReason: "invalid_tier_pct",
  },
  {
    label: "code_request suffix_bad_format — suggested_suffix has illegal chars returns 400",
    body: {
      request_type: "code_request",
      payload: { tier_pct: 20, suggested_suffix: "bad suffix!" },
    },
    expectedStatus: 400,
    expectedReason: "suffix_bad_format",
  },
  {
    label: "collateral_approval collateral_url_required — non-https URL returns 400",
    body: {
      request_type: "collateral_approval",
      payload: { collateral_url: "http://example.com/asset.pdf", purpose: "launch flyer" },
    },
    expectedStatus: 400,
    expectedReason: "collateral_url_required",
  },
  {
    label: "collateral_approval purpose_required — https URL but blank purpose returns 400",
    body: {
      request_type: "collateral_approval",
      payload: { collateral_url: "https://cdn.example.com/asset.pdf", purpose: "   " },
    },
    expectedStatus: 400,
    expectedReason: "purpose_required",
  },
];

test.describe("Reseller requests input validation — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const resp = await page.request.post(`/api/reseller/requests`, {
        data: c.body as never,
        headers: c.headers ?? { "content-type": "application/json" },
      });
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (validator rejects before reseller_requests INSERT). Body: ${await resp.text()}`,
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
