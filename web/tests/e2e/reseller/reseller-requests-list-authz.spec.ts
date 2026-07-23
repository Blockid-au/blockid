// GET /api/reseller/requests pre-read authorization contract — P10 dry-run
// per plan §C.5 (admin approval flows) and §J.2 (Playwright must cover the
// reseller-admin endpoints so a regression in the auth → scope gate ordering
// surfaces before the endpoint reads reseller_requests).
//
// Mirrors drawer-authz.spec.ts (tick 101) and reveal-email-authz.spec.ts
// (tick 100) — same getCurrentUser() + scopedReseller() chokepoint used by
// every scopedReseller()-gated GET/POST route under /api/reseller/**. The
// response envelope is { ok:false, reason: <string> } rather than the
// { ok:false, error, feature } shape emitted by gateRequireFeature. This
// closes the last GET surface under /api/reseller/** whose scopedReseller()
// gate was not yet regression-guarded at the Playwright lens — the sibling
// POST /api/reseller/requests validation branches are already covered by
// requests-validation.spec.ts, but that spec exercises the validator branches
// AFTER auth via loginAs(harness.admin.email), leaving the pre-auth chain
// unguarded on both verbs. This spec fills the GET half of that hole.
//
// Two branches are harness-free and safe against staging (no reseller_requests
// SELECT fires, no reseller_audit_log row is written — GET path takes no
// query params so both harness-free rows return BEFORE any URL parse fires):
//
//   1. unauthenticated      — GET with no session          → 401 { ok:false, reason:"unauthorised" }
//                             (getCurrentUser null → returns before scope,
//                             getSupabaseAdmin, or the reseller_requests SELECT)
//   2. non_reseller_admin   — GET as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                             (scopedReseller throws ResellerScopeError code="no_membership"
//                             because reseller_admins has no active row for a founder;
//                             getSupabaseAdmin and the reseller_requests SELECT never run)
//
// Route reference: web/src/app/api/reseller/requests/route.ts
//   Line 148-152: getCurrentUser() null           → 401 { reason: "unauthorised" }
//   Line 154-162: scopedReseller(user) throws     → 403 { reason: err.code }
//   Line 164-167: getSupabaseAdmin() null         → 503 { reason: "not_configured" }
//   Line 169-183: reseller_requests SELECT        → 500 query_failed
//   Line 185:     200 { ok: true, requests: [...] }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the sibling admin authz specs (ticks 103/105/106/107/108/109) and the
//   sibling reseller authz specs (drawer-authz, reveal-email-authz,
//   reports-signed-url-authz, sandbox-setup-authz, billing-authz).
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - query_failed (500) — needs a broken reseller_requests SELECT which
//     requires per-test tampering plan §J.2 forbids.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (200 with requests[]) — ACTIVATED as P10 wave-4 row 161
//     below via loadTempReseller("active_wholesale") + fixture.adminEmail
//     loginAs. Twins with row 156 in requests-validation.spec.ts (which
//     pins the same wire envelope from the validation-spec side) so a
//     regression to the auth chain in either file surfaces here first
//     before the SELECT wire envelope pins downstream.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/reseller/requests";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tick 261 — per-key payload content invariants mirrored from
// web/src/lib/reseller/requests.ts so the discriminated-union pin below
// echoes the same source-of-truth shapes the validator writes:
//   - ALLOWED_TIER_PCT_VALUES ← ALLOWED_TIER_VALUES at requests.ts:63
//   - SUFFIX_RE               ← SUFFIX_RE at requests.ts:64
//   - HTTPS_URL_RE            ← HTTPS_URL_RE at requests.ts:65
//   - REASON_MAX              ← REASON_MAX at requests.ts:66
//   - PURPOSE_MAX             ← PURPOSE_MAX at requests.ts:67
// Kept as module-scope constants for parity with the tick 259 hoist onto
// admin-requests-list-authz.spec.ts:117-121 and the tick 260 hoist onto
// requests-validation.spec.ts (whenever a validator-side invariant exists,
// the spec echoes it verbatim rather than re-deriving inline).
const ALLOWED_TIER_PCT_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;

// Tick 276 — decision_at ISO-8601 wire-shape tightening on the reseller-scoped
// GET at /api/reseller/requests/route.ts:169-173 (fifth column of the SELECT
// projection). Natural next pick option (a) from tick 275 — sibling companion
// to the tick-275 created_at ISO pin. reseller_requests.decision_at is a
// `timestamptz` NULLABLE column per 0095:35 governed by the ck_decision_shape
// CHECK at 0095:41-45 which requires decision_at NON-NULL when status ∈
// ('approved','denied','cancelled') and permits NULL only when status='pending'.
// Pre-tick-276 posture pinned only null-or-typeof-string at line 440-443
// (landed at tick 224) leaving the ISO shape silent whenever decision_at is
// non-null. A route regression that dropped decision_at from the SELECT would
// surface as undefined here (undefined fails both the ===null branch and the
// typeof-string branch), but a serialisation drift (PostgREST returning an
// epoch integer stringified as "1735689600", or a column swap to a text field
// that stores freeform values) would pass the typeof-string guard but fail
// this ISO regex tightening. Three-part guard: (a) preserved null-or-typeof-
// string pin at line 440-443 fires first (matches ticks 265-275 layering
// discipline verbatim), (b) new null-or-ISO_TIMESTAMP_RE-match pin fires only
// after the typeof-string guard passes so tighter existing pins surface first,
// (c) reuses the ISO_TIMESTAMP_RE module-scope constant hoisted at tick 275 —
// no ninth module-scope constant needed. Coverage-per-guard posture: the
// wave-3 row 155 seeded pending over_budget_approval row exercises the NULL
// branch of the null-or-ISO guard on every green CI run (pending rows carry
// decision_at IS NULL per ck_decision_shape); the NON-NULL ISO branch has
// zero-coverage on the wire today because no approve/deny fixture seeds a
// decided reseller_requests row that this GET would return — matches the
// tick 261 zero-coverage-per-guard rationale (the pin still closes the writer
// contract so a serialisation regression across the null-or-string surface
// would surface on the next CI pass whenever a decide-fixture seeds a row).
// Symmetric-across-surfaces posture: the same decision_at ISO pin now fires
// on the admin patch read-back rows (via the tick 265 pin at admin-requests-
// patch-authz.spec.ts:801-804) and this reseller-scoped list route so a
// projection-side or serialisation-side regression on reseller_requests
// .decision_at surfaces on both admin and reseller lenses simultaneously.
//
// Tick 275 — created_at ISO-8601 wire-shape pin mirrored from the admin-side
// tick 267 pin at admin-requests-patch-authz.spec.ts:460-461. Reseller-scoped
// GET at /api/reseller/requests/route.ts:169-173 projects created_at as the
// tail column of the SELECT list; reseller_requests.created_at is a
// `timestamptz NOT NULL DEFAULT now()` column at 0095:39 populated at INSERT
// time and never touched by any PATCH branch — so the read-back MUST carry a
// non-null ISO-8601 string on every green-path CI run regardless of row
// status. Pre-tick-275 posture pinned only typeof-string on created_at at
// line 274 leaving the ISO shape silent — a route regression that stripped
// created_at from the SELECT projection where it is the seventh column
// would fail the typeof guard (undefined is not a string), but a column-
// type flip from timestamptz to say a bigint created_at_ms clock migration
// would surface as a number here and be caught by the existing typeof pin
// too. This tick adds the ISO regex tightening so a serialisation drift
// (e.g. PostgREST returning an epoch integer as a stringified number, or a
// column swap to a text field that stores freeform values) also surfaces.
// Two-part guard matches the admin-side tick 267 pattern: typeof-string
// (already in place at line 274) + ISO_TIMESTAMP_RE match. Same regex
// source-of-truth as the sibling hoist at admin-requests-patch-authz
// .spec.ts:460-461. Symmetric-across-surfaces posture: the same created_at
// ISO pin now fires on both the admin list route (via the tick 267 pin) and
// the reseller-scoped list route (via this pin) so a projection-side or
// serialisation-side regression surfaces on both admin and reseller lenses
// simultaneously.
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

test.describe("Reseller requests list pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, getSupabaseAdmin, or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — GET as a founder QA account returns 403 no_membership", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_RESELLER_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-reseller founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before getSupabaseAdmin or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});

// P10 wave-4 row 161 — active_wholesale variant probes the GET
// /api/reseller/requests happy path (reseller-admin session → 200 with
// body.ok=true + Array.isArray(body.requests) + per-row envelope shape).
// Per docs/plans/p10-deferred-spec-activation-order.md wave 4:
//   161 | reseller-requests-list-authz.spec.ts | active_wholesale |
//         happy 200 with request rows | 200
//
// Twins with row 156 in requests-validation.spec.ts: row 156 pins the
// GET happy envelope from the validation-spec surface; row 161 pins the
// SAME wire envelope from the authz-spec surface so the file that owns
// the 401/403 branches also owns its own happy 200 case, closing the
// authz matrix for the GET half of /api/reseller/requests. A regression
// to the auth chain in reseller-requests-list-authz.spec.ts would
// surface here before the SELECT wire envelope pin in row 156 fires.
//
// Route reference (web/src/app/api/reseller/requests/route.ts):
//   Line 148-152: getCurrentUser null                          → 401 unauthorised
//   Line 154-162: scopedReseller throws                         → 403 { reason: err.code }
//   Line 164-167: getSupabaseAdmin null                         → 503 not_configured
//   Line 169-176: SELECT reseller_requests WHERE reseller_id=$1
//                 ORDER BY created_at DESC LIMIT 100 (envelope
//                 pins id, request_type, status, payload,
//                 decision_at, decision_reason, created_at)
//   Line 178-183: query error                                   → 500 query_failed
//   Line 185: 200 { ok:true, requests: [...] } ← THIS
//
// Fixture wiring (mirrors row 156 posture verbatim):
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
//     attributionExists is intentionally NOT required.
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
// from this endpoint. Route GET handler does NOT audit-log (unlike the POST
// handler at route.ts:113-126 which writes reseller_audit_log(action=
// 'file_request')). No projects.id created → no fixture.trackProjectForCleanup
// / cleanup() wiring needed. Perfectly idempotent under CI replay.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + Array.isArray(
// body.requests) + for every row {id: string matching UUID_RE, request_type:
// string ∈ {code_request, over_budget_approval, collateral_approval},
// status: string ∈ {pending, approved, denied, cancelled}, created_at:
// string}. Do NOT pin the array length (fresh hosts may have zero rows;
// hosts where row 155 has run in prior CI passes will have ≥1 pending rows).
// Pin decision_at / decision_reason with null-or-typeof-string discipline
// (both nullable per 0095:35-36; NULL on pending rows per ck_decision_shape
// at 0095:41-45 but string once P9.3 approve/deny lands a decision) — see
// inline expects below for the tightening landed at tick 224. Same per-row
// shape pins as row 156 — the twin posture is intentional so a route
// regression that dropped a field from the SELECT list surfaces across
// both spec files simultaneously.
//
// Non-Stripe / non-GST discipline: the GET requests route reads
// reseller_requests only. No promotion_code lookup, no credit_balances /
// credit_transactions write, no revenue_events read, no Stripe network
// call, no InfoVision dependency. P8.5 + P1.5 remain neither a
// dependency nor a consequence.
test.describe("Reseller requests list — P10 wave-4 happy path", () => {
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
      // Tick 275 — ISO_TIMESTAMP_RE tightening on created_at. See module-
      // scope doc-block above ISO_TIMESTAMP_RE for the rationale. Mirrors
      // the admin-side tick 267 pin at admin-requests-patch-authz.spec.ts
      // read-back rows onto the reseller-scoped GET surface. Fires ONLY
      // after the typeof-string guard above passes so tighter existing
      // pins surface first.
      expect(
        ISO_TIMESTAMP_RE.test(row.created_at as string),
        `active_wholesale + happy GET row.created_at '${String(row.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // tick 223 option (b) — extend row 161 with the three nullable/jsonb
      // pins the sibling row 174 discipline (admin-requests-list-authz.spec
      // .ts tick 221 FK-echo + tick 222 nested-embed shape) leaves open on
      // the reseller-side envelope. Route SELECT at web/src/app/api/reseller
      // /requests/route.ts:169-173 emits payload + decision_at +
      // decision_reason on every row; pre-tick posture pinned only id +
      // request_type + status + created_at leaving those three silent. A
      // route regression that dropped any of the three from the SELECT list
      // would surface only at the /reseller/requests inbox visual QA lens.
      //   payload — jsonb NOT NULL DEFAULT '{}' per 0095:33 so every row
      //   carries a plain object (never null, never array). Object-plain
      //   guard mirrors admin-requests-list-authz.spec.ts tick 222
      //   resellers-embed shape assertion — three-part pattern chosen over
      //   expect.objectContaining(...) for spec-local consistency.
      //   decision_at — timestamptz nullable per 0095:35, NULL on pending
      //   rows per ck_decision_shape at 0095:41-45. Assertion is (null OR
      //   typeof string), matching credit-grant-authz row 152 discipline
      //   for nullable timestamp echoes.
      //   decision_reason — text nullable per 0095:36 with no CHECK tying
      //   it to status, so may be null even on approved/denied/cancelled
      //   rows. Assertion is (null OR typeof string).
      expect(
        row.payload !== null &&
          typeof row.payload === "object" &&
          !Array.isArray(row.payload),
        `active_wholesale + happy GET row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33; a PostgREST view that mistyped the column would surface here). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
      // Tick 261 — per-key payload content pins per tick 260 next-pick
      // option (r3). Mirrors the tick 259 discriminated-union guard
      // verbatim from admin-requests-list-authz.spec.ts:341-432 (admin
      // list surface) and the tick 260 twin at requests-validation
      // .spec.ts (reseller-side happy GET twin) onto this third list
      // surface — the reseller-side /api/reseller/requests GET at
      // web/src/app/api/reseller/requests/route.ts:169-173 echoes the
      // payload jsonb column straight through so the reseller-lens sees
      // the exact same per-type key shape the admin lens sees. The tick
      // 223 plain-object guard above closes the "is this a jsonb
      // object" invariant, but leaves the per-request-type key shapes
      // silent. This tick extends coverage into the discriminated union
      // documented at web/src/lib/reseller/requests.ts:41-44:
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
      // so the over_budget_approval branch is exercised by this happy-
      // path reseller GET, while the code_request + collateral_approval
      // branches depend on future QA seeding to fire. Coverage-per-
      // guard on the two unseeded branches is zero today, but the pin
      // still closes the writer contract so a route regression that
      // dropped a key from the SELECT (route.ts:169-173 echoes payload
      // jsonb straight through) or a validator regression that swapped
      // a key shape at requests.ts would surface across all three list
      // surfaces on the next CI pass — matches the tick 259/260 zero-
      // coverage-per-guard rationale.
      //
      // TYPEOF + VALUE-tighten pins per key so a rename OR a shape
      // drift (e.g. tier_pct swapped for tier, or reason no longer
      // trimmed) both surface. Symmetric with the tick 259 admin-side
      // pin and the tick 260 requests-validation twin — spec-local
      // convention is that whenever a validator-side invariant exists,
      // the pin echoes it verbatim so a drift surfaces across every
      // surface that echoes the column.
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
      // Tick 276 — ISO_TIMESTAMP_RE tightening on decision_at, sibling
      // companion to the tick-275 created_at ISO pin above. Fires ONLY when
      // decision_at is non-null so the wave-3 row 155 pending fixture's
      // decision_at=NULL still passes cleanly; a decided-row fixture (future
      // approve/deny seed) would exercise the ISO regex branch. See module-
      // scope doc-block above ISO_TIMESTAMP_RE (tick 276 paragraph) for the
      // ck_decision_shape + PostgREST serialisation rationale.
      expect(
        row.decision_at === null ||
          (typeof row.decision_at === "string" &&
            ISO_TIMESTAMP_RE.test(row.decision_at)),
        `active_wholesale + happy GET row.decision_at '${String(row.decision_at)}' should be null or an ISO 8601 timestamp string (timestamptz per 0095:35 serialised via PostgREST; NULL on pending rows per ck_decision_shape at 0095:41-45); a drift to a non-ISO string, a number, or a locale-formatted date would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        row.decision_reason === null || typeof row.decision_reason === "string",
        `active_wholesale + happy GET row.decision_reason should be null or a string (nullable per 0095:36; no CHECK ties it to status so nullable across all row states). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
    }
  });
});
