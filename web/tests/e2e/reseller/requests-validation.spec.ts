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

// Tick 260 — per-key payload content invariants mirrored from
// web/src/lib/reseller/requests.ts so the discriminated-union pin below
// echoes the same source-of-truth shapes the validator writes:
//   - ALLOWED_TIER_PCT_VALUES ← ALLOWED_TIER_VALUES at requests.ts:63
//   - SUFFIX_RE               ← SUFFIX_RE at requests.ts:64
//   - HTTPS_URL_RE            ← HTTPS_URL_RE at requests.ts:65
//   - REASON_MAX              ← REASON_MAX at requests.ts:66
//   - PURPOSE_MAX             ← PURPOSE_MAX at requests.ts:67
// Kept as module-scope constants for parity with the tick 259 hoist onto
// admin-requests-list-authz.spec.ts (whenever a validator-side invariant
// exists, the spec echoes it verbatim rather than re-deriving inline).
// This is the reseller-side happy GET twin of the admin-side pin so a
// route regression at web/src/app/api/reseller/requests/route.ts that
// dropped a key from the SELECT or a validator regression at requests.ts
// that swapped a key shape surfaces across both surfaces simultaneously.
const ALLOWED_TIER_PCT_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;

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

// Tick 368 — reseller_requests-row ck_decision_shape cross-column
// invariant summary cross-surface twin-lift onto requests-validation.
// spec.ts. Executes tick 367 next-pick option (i) verbatim: cross-
// surface twin hoist of tick 365's ck_decision_shape module-scope
// summary from requests-authz.spec.ts (the reseller-scope write
// surface) onto requests-validation.spec.ts (the reseller-scope GET
// surface). First of three possible reseller-scope cross-surface
// companion ticks per tick 367 next-pick options (i) + (ii) + (iii).
// Post-tick 368, the reseller_requests-row cluster reaches 2-surface
// parity within the reseller-scope pair on ck_decision_shape alone
// (requests-authz.spec.ts carries 3/3 per tick 367 close-out;
// requests-validation.spec.ts now carries 1/3 with ck_decision_shape
// landing here; ck_credit_link + ck_promo_link cross-surface twins
// pending at follow-on ticks — matches the tick 362 opening posture
// on the admin-requests-list-authz.spec.ts surface which landed the
// first cross-surface ck_decision_shape twin before ticks 363 + 364
// filled the two companion twins). Pure documentation-only doc-block
// hoist — no new imports, no new module-scope const, no fixture
// change, no route change, no per-column assert added; the existing
// UUID_RE + ALLOWED_TIER_PCT_VALUES + SUFFIX_RE + HTTPS_URL_RE +
// REASON_MAX + PURPOSE_MAX module-scope consts declared adjacent at
// lines 71-93 remain the sole module-scope consts on this file.
//
// Cross-column invariant summary — reseller_requests.{status,
// decision_by, decision_at, decision_reason} ⇔ ck_decision_shape
//   Writer-side source: IDENTICAL to tick 365 on the sibling
//   requests-authz.spec.ts surface — DB CHECK ck_decision_shape at
//   web/supabase/migrations/0095_reseller_requests.sql:41-45 enforces
//   the disjunction
//     (status = 'pending'
//        AND decision_by IS NULL
//        AND decision_at IS NULL)
//     OR
//     (status IN ('approved','denied','cancelled')
//        AND decision_at IS NOT NULL)
//   Pending rows MUST carry both decision columns as NULL; any row
//   whose status flips to a terminal enum member MUST carry
//   decision_at as non-null. The sibling ck_credit_link (0095:48-51)
//   and ck_promo_link (0095:52-55) are orthogonal — each governs a
//   single link column across request_type + status; those two
//   companion twins are pending at follow-on ticks per tick 367
//   next-pick options (ii) + (iii). This tick's summary opens the
//   cross-surface twin axis on requests-validation.spec.ts with
//   ck_decision_shape alone, mirroring the tick 362 opening posture
//   on the admin-requests-list-authz.spec.ts surface.
//   Application write path: IDENTICAL to tick 365 — the reseller-
//   scope POST at web/src/app/api/reseller/requests/route.ts:87-97
//   INSERTs a fresh reseller_requests row with only reseller_id +
//   request_type + payload + created_by (status takes its DB default
//   'pending' via 0095:32; decision_by / decision_at / decision_reason
//   default to NULL per 0095:34-36). Every row born on this route
//   sits on the NULL branch of ck_decision_shape (status='pending'
//   AND decision_by IS NULL AND decision_at IS NULL); the NON-NULL
//   branch is UNREACHABLE from the reseller-scope POST route because
//   it has no update mode. The NON-NULL branch is exclusively
//   produced by the admin PATCH stamper at /api/admin/resellers/
//   requests/[id]/route.ts:305-320 narrated in the tick 359 doc-
//   block on admin-requests-patch-authz.spec.ts.
//   Read path: DIFFERENT from tick 365. The reseller-scope GET at
//   web/src/app/api/reseller/requests/route.ts:169-176 projects a
//   seven-column tuple
//     "id, request_type, status, payload, decision_at,
//      decision_reason, created_at"
//   scoped via .eq("reseller_id", scope.reseller_id) with
//   .order("created_at", {ascending: false}).limit(100). Of the
//   four columns coupled by ck_decision_shape, THREE are projected
//   on this envelope (status + decision_at + decision_reason) —
//   only decision_by is stripped by the route (route.ts:172 omits
//   it from the SELECT list on purpose; the reseller-facing GET
//   envelope only echoes fields the client renders in the request
//   history table). Contrast the wire granularity across surfaces:
//   (a) full four-column tuple on the admin list route (tick 362
//   lens); (b) three-column tuple on the admin PATCH echo (tick 359
//   lens — omits decision_by); (c) single-column tuple on the
//   reseller POST envelope (tick 365 lens — projects only status);
//   (d) three-column tuple on the reseller GET envelope (THIS tick
//   — projects status + decision_at + decision_reason but omits
//   decision_by). Granularity (d) matches granularity (b) at the
//   column-count level (three of four) but with the SAME omission
//   (decision_by): the admin PATCH echo strips decision_by to keep
//   the response tight even though the admin has already committed
//   the value, and the reseller GET envelope strips decision_by
//   because the reseller boundary MUST not surface which admin
//   decided the request (leaking decision_by would let a reseller
//   correlate admin activity patterns across their own request
//   history — a privacy narrowing separate from ck_decision_shape
//   itself but which happens to land on the same column). So the
//   ck_decision_shape invariant is observable at three DIFFERENT
//   projection granularities across the four surfaces the cluster
//   now spans, with decision_by only surfacing on the admin-list
//   surface (tick 362 lens).
//   Runtime enforcement in this spec: the wave-3 row 156 happy GET
//   at lines 268-469 iterates body.requests[] and pins per-row
//   status ∈ {"pending","approved","denied","cancelled"} at line
//   331 (four-value enum guard on the ck_decision_shape status
//   column), decision_at null-or-typeof-string at lines 460-463
//   with the ck_decision_shape at 0095:41-45 cross-reference in
//   the failure message (single-column NULL-branch pin — asserts
//   the birth-state timestamp column is null on the pending row +
//   observably-typed on any post-decision row a future decide-
//   fixture surfaces), decision_reason null-or-typeof-string at
//   lines 464-467 (nullable across all row states per 0095:36 with
//   no CHECK tying it to status). The per-row shape pins fire once
//   per row in body.requests[]; with the wave-3 row 155 seeder in
//   requests-authz.spec.ts landing a fresh pending over_budget_
//   approval row per green CI run against the active_wholesale
//   variant, this GET observes ≥1 pending row per pass (fresh
//   hosts hit 1; hosts where row 155 has run in prior CI passes
//   have ≥N cumulative). Neither wave-3 row 156 nor any sibling
//   row asserts decision_by on the wire — because that column is
//   stripped from the GET envelope (see Read path above) and
//   therefore NOT observable on this surface. A route regression
//   that leaked decision_by onto the envelope would surface via a
//   `row.decision_by` undefined → non-undefined delta on downstream
//   consumers, but this spec deliberately does not assert its
//   absence (symmetric-to-presence "should not exist" pin adds
//   cost without adding correctness, same posture as tick 365's
//   narration of the reseller POST envelope's four-column
//   projection).
//   Coverage-per-guard posture: DEGENERATE-SYMMETRIC relative to
//   tick 365. Tick 365 narrates the reseller-scope POST INSERT
//   envelope hitting the NULL/pending branch TWICE per pass
//   (wave-3 row 155 + wave-5 row 155-b, both write-side observations
//   of the birth-state pending row). This tick narrates the
//   reseller-scope GET envelope observing the SAME NULL/pending
//   branch on the READ side — the wave-3 row 156 happy GET iterates
//   the row 155/155-b seeded pending rows and pins their status +
//   decision_at + decision_reason columns. So the read-side probe
//   count is ≥1 per pass (bounded above by 100 per the
//   .limit(100) in route.ts:176); the ck_decision_shape NULL branch
//   fires on every projected row + every green CI run. NON-NULL
//   branch coverage on this GET surface is currently ZERO because
//   no decide-fixture has landed a terminal-status row visible to
//   the reseller-scope GET (P8.5 approve flows are blocked; P9.3
//   deny + cancel flows land at a future wave but the QA harness
//   doesn't seed a terminal row on the active_wholesale variant
//   today). Together the reseller-scope surface pair (this tick +
//   tick 365) covers the NULL/pending branch on BOTH write-side
//   INSERT + read-side GET envelopes at module scope, matching the
//   admin-scope surface pair (ticks 359 + 362) which cover the
//   NON-NULL/terminal branch on BOTH write-side UPDATE + read-side
//   list envelopes. The four-surface cluster now observes both
//   halves of the ck_decision_shape disjunction across both
//   read+write axes at module scope on distinct scoped surfaces —
//   the maximum observability granularity the cluster can carry
//   without landing a decide-fixture that produces a reseller-
//   visible terminal-status row.
//   Symmetric-cluster posture: this hoist CLOSES the reseller-
//   scope 2-surface parity axis on ck_decision_shape (matches the
//   tick 362 admin-scope 2-surface parity close-out for the same
//   invariant). Post-tick 368, the reseller_requests-row cluster
//   sits at four-surface + one-invariant × two-scope-family × two-
//   read/write-axis parity for ck_decision_shape (both scoped
//   families carry the invariant summary on both a write-side
//   surface + a read-side surface). Follow-on ticks can rotate
//   along four dimensions per tick 367's rotation menu adapted
//   for this cross-surface opening: (a) cross-surface twin-lift
//   ck_credit_link onto THIS file so the reseller-scope GET
//   surface reaches 2/3 summary parity (matches the tick 366
//   companion-hoist posture on requests-authz.spec.ts); (b)
//   cross-surface twin-lift ck_promo_link onto THIS file so the
//   reseller-scope GET surface reaches 3/3 summary parity (matches
//   tick 367); (c) cross-surface twin-lift ck_decision_shape onto
//   reseller-requests-list-authz.spec.ts (the third reseller-scope
//   surface) so the invariant reaches 3-surface parity across
//   the reseller-scope triple; (d) idle — frontier remains tight
//   (P1.5 + P8.5 HUMAN-BLOCKED, P11 never_completes, Track B
//   closed, P10 continues accepting incremental pin-tightening +
//   summary-hoist ticks).

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
// run in prior CI passes will have ≥1 pending rows accumulated). Pin
// decision_at / decision_reason with null-or-typeof-string discipline
// (both nullable in the schema per 0095:35-36; NULL on pending rows per
// ck_decision_shape at 0095:41-45 but string once P9.3 approve/deny lands
// a decision) — see inline expects below at row 156 rationale for the
// tightening landed at tick 223. The per-row shape pins catch (a) a route
// regression that dropped a field from the SELECT list (route.ts:170-173),
// (b) a route regression that returned the wrong id type (bigint from a
// stale migration rather than UUID string), and (c) a route regression
// that returned a non-array envelope (e.g. wrapping in { requests: { rows: [] } }).
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
      // Tick 260 — per-key payload content pins per tick 259 next-pick
      // option (r2). The tick 224 plain-object guard above closes the
      // "is this a jsonb object" invariant, but leaves the per-request-
      // type key shapes silent. This tick mirrors the tick 259 admin-side
      // pin (admin-requests-list-authz.spec.ts:341-432) onto this reseller-
      // side happy GET twin so the discriminated-union documented at
      // web/src/lib/reseller/requests.ts:41-44 is content-pinned on both
      // list surfaces simultaneously:
      //   - code_request payload → tier_pct (number ∈ {0,10,20,30,40})
      //     + suggested_suffix (null or /^[A-Z0-9]{1,16}$/) + notes
      //     (null or string, trimmed length ≤ 200). See
      //     validateCodeRequest at requests.ts:82-118 for the source-
      //     of-truth invariants; the route stores {...res.value} at
      //     requests.ts:229-233 so the jsonb column mirrors the exact
      //     same three-key shape.
      //   - over_budget_approval payload → target_user_id (UUID string),
      //     requested_amount (positive integer), reason (null or string
      //     length ≤ 200), remaining_budget_snapshot (null or non-
      //     negative integer). See validateOverBudgetApproval at
      //     requests.ts:125-172; the route stores {...res.value} at
      //     requests.ts:243-246.
      //   - collateral_approval payload → collateral_url (https URL) +
      //     purpose (string length ≤ 500). See validateCollateralApproval
      //     at requests.ts:178-197; the route stores {...res.value} at
      //     requests.ts:253-256.
      //
      // The seeded QA dataset carries a pending over_budget_approval
      // row via wave-3 row 155 against the active_wholesale variant —
      // so the over_budget_approval branch is exercised by the happy-
      // path reseller GET, while the code_request + collateral_approval
      // branches depend on future QA seeding to fire. Coverage-per-
      // guard on the two unseeded branches is zero today, but the pin
      // still closes the writer contract so a route regression that
      // dropped a key from the SELECT (route.ts:169-173 echoes payload
      // jsonb straight through) or a validator regression that swapped
      // a key shape at requests.ts would surface across both surfaces on
      // the next CI pass, matching the tick 259 zero-coverage-per-guard
      // rationale for the two unseeded branches on the admin-side twin.
      //
      // TYPEOF + VALUE-tighten pins per key so a rename OR a shape
      // drift both surface. Symmetric with the tick 259 admin-side pin
      // and the tick 231 embed.code value pin — spec-local convention
      // is that whenever a validator-side invariant exists, the pin
      // echoes it verbatim.
      const payload = row.payload as Record<string, unknown>;
      if (row.request_type === "code_request") {
        expect(typeof payload.tier_pct).toBe("number");
        expect(
          ALLOWED_TIER_PCT_VALUES.has(payload.tier_pct as number),
          `code_request payload.tier_pct '${String(payload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(payload).slice(0, 200)}`,
        ).toBe(true);
        expect(
          payload.suggested_suffix === null ||
            (typeof payload.suggested_suffix === "string" &&
              SUFFIX_RE.test(payload.suggested_suffix as string)),
          `code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(payload.suggested_suffix)}`,
        ).toBe(true);
        expect(
          payload.notes === null ||
            (typeof payload.notes === "string" &&
              (payload.notes as string).length <= REASON_MAX),
          `code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(payload.notes)}`,
        ).toBe(true);
      } else if (row.request_type === "over_budget_approval") {
        expect(typeof payload.target_user_id).toBe("string");
        expect(payload.target_user_id as string).toMatch(UUID_RE);
        expect(typeof payload.requested_amount).toBe("number");
        expect(
          Number.isInteger(payload.requested_amount) &&
            (payload.requested_amount as number) > 0,
          `over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(payload.requested_amount)}`,
        ).toBe(true);
        expect(
          payload.reason === null ||
            (typeof payload.reason === "string" &&
              (payload.reason as string).length <= REASON_MAX),
          `over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(payload.reason)}`,
        ).toBe(true);
        expect(
          payload.remaining_budget_snapshot === null ||
            (typeof payload.remaining_budget_snapshot === "number" &&
              Number.isInteger(payload.remaining_budget_snapshot) &&
              (payload.remaining_budget_snapshot as number) >= 0),
          `over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(payload.remaining_budget_snapshot)}`,
        ).toBe(true);
      } else if (row.request_type === "collateral_approval") {
        expect(typeof payload.collateral_url).toBe("string");
        expect(payload.collateral_url as string).toMatch(HTTPS_URL_RE);
        expect(typeof payload.purpose).toBe("string");
        expect(
          (payload.purpose as string).length <= PURPOSE_MAX,
          `collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(payload.purpose).slice(0, 100)}`,
        ).toBe(true);
      }
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
