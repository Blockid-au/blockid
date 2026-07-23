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
//   - Happy GET (200 with body.requests array) — ACTIVATED as P10 wave-3
//     row 156 below via loadTempReseller("active_wholesale") + fixture.
//     adminEmail loginAs. Sits inside the wave-3-active_wholesale subwave
//     (152 / 154 / 155 / 156) that tick 152's preflight flagged as
//     activation-ready without any seed/fixture delta.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const ROUTE = "/api/reseller/requests";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      const resp = await page.request.post(ROUTE, {
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

// P10 wave-3 row 156 — active_wholesale variant probes the GET /api/reseller/
// requests happy path (reseller-admin session → 200 with body.ok=true +
// Array.isArray(body.requests) + per-row envelope shape). Per docs/plans/
// p10-deferred-spec-activation-order.md wave 3:
//   156 | requests-validation.spec.ts | active_wholesale |
//         happy GET 200 (returns pending list) | 200
//
// Partners with row 155 (requests-authz.spec.ts × active_wholesale × happy
// POST 201) — row 155 inserts a pending over_budget_approval row into
// reseller_requests scoped to the QAPROBEWHOLESALEACTIVE reseller_id, and
// this row's GET enumerates the same scope so a regression that dropped
// either the reseller_id filter (route.ts:174) or the envelope shape
// (route.ts:170-173 select-list) would surface across both rows.
//
// Route reference (web/src/app/api/reseller/requests/route.ts):
//   Line 149-152: getCurrentUser null                          → 401 unauthorised
//   Line 154-162: scopedReseller throws                         → 403 { reason: err.code }
//   Line 164-167: getSupabaseAdmin null                         → 503 not_configured
//   Line 169-176: SELECT reseller_requests WHERE reseller_id=$1
//                 ORDER BY created_at DESC LIMIT 100 (envelope
//                 pins id, request_type, status, payload,
//                 decision_at, decision_reason, created_at)
//   Line 178-183: query error                                   → 500 query_failed
//   Line 185: 200 { ok:true, requests: [...] } ← THIS
//
// Fixture wiring (mirrors row 155 posture verbatim — same describe pattern
// hoisted here; no seed or fixture delta needed per wave-3 preflight tick
// 152):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins so
//     scopedReseller() returns a live scope with reseller_id set to the
//     QAPROBEWHOLESALEACTIVE row.
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//   - No attributedUserId dependency — the GET route reads reseller_requests
//     scoped by reseller_id (route.ts:174), not by subject_user_id, so
//     attributionExists is intentionally NOT required (unlike wave-2 rows
//     146-149 which hit scopedReseller().allowedCustomerIds()).
//
// Skip conditions:
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE fires
// from this endpoint (audit-log write is on the POST side only per
// route.ts:113-126, GET does not audit-log per route.ts:148-186). No
// projects.id created → no fixture.trackProjectForCleanup / cleanup()
// wiring needed. Perfectly idempotent under CI replay.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + Array.isArray(
// body.requests) + when the array is non-empty, EVERY row has string id +
// string request_type + string status + string created_at. Do NOT pin the
// array length (fresh hosts may have zero rows; hosts where row 155 has
// run in prior CI passes will have ≥1 pending rows accumulated). Do NOT
// pin decision_at / decision_reason (both nullable in the schema and null
// for pending rows). The per-row shape pins catch (a) a route regression
// that dropped a field from the SELECT list (route.ts:170-173), (b) a
// route regression that returned the wrong id type (bigint from a stale
// migration rather than UUID string), and (c) a route regression that
// returned a non-array envelope (e.g. wrapping in { requests: { rows: [] } }).
//
// Twin-row accounting vs row 155 (active_wholesale × happy POST 201): row
// 155 pins the INSERT envelope (body.request.id + request_type + status);
// row 156 pins the SELECT envelope (body.requests[].id + request_type +
// status + created_at). A regression that mis-echoed request_type or
// swapped status defaults between INSERT and SELECT would surface across
// both rows. UUID_RE hoisted to module scope (same posture as row 155 in
// requests-authz.spec.ts + row 152 in credit-grant-validation.spec.ts +
// row 154 in sandbox-setup-authz.spec.ts) so future wave-4/wave-5 rows
// landing in this file reuse the constant.
//
// Non-Stripe / non-GST discipline: the GET requests route reads
// reseller_requests only (no promotion_code lookup, no credit_balances /
// credit_transactions write, no revenue_events read, no Stripe network
// call, no InfoVision dependency). P8.5 + P1.5 remain neither a
// dependency nor a consequence.
test.describe("Reseller requests — P10 wave-3 happy GET", () => {
  test("active_wholesale — GET as reseller-admin returns 200 with body.requests array", async ({
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
    if (!fixture || !fixture.adminUserId) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `active_wholesale + happy GET returned ${resp.status()} — expected 200 with body.requests array. A 403 no_membership here means reseller_admins mirror lost the per-variant row (seed drift). A 5xx means the reseller_requests SELECT leaked through (route.ts:178-183 query_failed branch). Body: ${await resp.text()}`,
    ).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      requests?: Array<{
        id?: string;
        request_type?: string;
        status?: string;
        payload?: unknown;
        decision_at?: string | null;
        decision_reason?: string | null;
        created_at?: string;
      }>;
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale + happy GET body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.requests),
      `active_wholesale + happy GET body.requests should be an array: ${JSON.stringify(body)}`,
    ).toBe(true);
    for (const row of body.requests ?? []) {
      expect(typeof row.id).toBe("string");
      expect(row.id ?? "").toMatch(UUID_RE);
      expect(typeof row.request_type).toBe("string");
      expect(["code_request", "over_budget_approval", "collateral_approval"]).toContain(
        row.request_type,
      );
      expect(typeof row.status).toBe("string");
      expect(["pending", "approved", "denied", "cancelled"]).toContain(row.status);
      expect(typeof row.created_at).toBe("string");
      // tick 224 option (b) — symmetrise the tick 223 row 161 sibling pins
      // onto this file so the twin discipline established at rows 155/156/
      // 161 stays coherent across the reseller-requests spec pair. Tick
      // 223 extended reseller-requests-list-authz.spec.ts row 161 with
      // three nullable/jsonb shape pins; this tick lands the same three
      // pins on requests-validation.spec.ts row 156 so a route SELECT
      // regression at web/src/app/api/reseller/requests/route.ts:169-173
      // that dropped any of payload / decision_at / decision_reason
      // surfaces across both spec files simultaneously (matching the
      // "twin posture" comment on line 180 of the authz sibling).
      //   payload — jsonb NOT NULL DEFAULT '{}' per 0095:33 so every row
      //   carries a plain object (never null, never array). Object-plain
      //   guard mirrors admin-requests-list-authz.spec.ts tick 222
      //   resellers-embed shape assertion + reseller-requests-list-authz
      //   .spec.ts tick 223 payload assertion — three-part pattern
      //   (`x !== null && typeof x === "object" && !Array.isArray(x)`)
      //   chosen over expect.objectContaining(...) for spec-local
      //   consistency across the tick 222 + tick 223 + tick 224 chain.
      //   decision_at — timestamptz nullable per 0095:35, NULL on pending
      //   rows per ck_decision_shape at 0095:41-45. Assertion is (null OR
      //   typeof string), matching credit-grant-authz row 152 discipline
      //   for nullable timestamp echoes + tick 223 row 161 assertion.
      //   decision_reason — text nullable per 0095:36 with no CHECK tying
      //   it to status, so may be null even on approved/denied/cancelled
      //   rows. Assertion is (null OR typeof string). Empty-string
      //   decision_reason is intentionally NOT forbidden — P9.3 deny-flow
      //   may write "" when the admin submits an empty reason field.
      expect(
        row.payload !== null &&
          typeof row.payload === "object" &&
          !Array.isArray(row.payload),
        `active_wholesale + happy GET row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33; a PostgREST view that mistyped the column would surface here). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
      expect(
        row.decision_at === null || typeof row.decision_at === "string",
        `active_wholesale + happy GET row.decision_at should be null or a string timestamp (nullable per 0095:35; NULL on pending rows per ck_decision_shape at 0095:41-45). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
      expect(
        row.decision_reason === null || typeof row.decision_reason === "string",
        `active_wholesale + happy GET row.decision_reason should be null or a string (nullable per 0095:36; no CHECK ties it to status so nullable across all row states). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
    }
  });
});
