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

// Tick 277 — decision_reason length ≤ REASON_MAX tightening on the reseller-
// scoped GET at /api/reseller/requests/route.ts:169-173 (sixth column of the
// SELECT projection). Natural next pick option (a) from tick 276 — sibling
// companion to the payload.notes / payload.reason length pins landed at tick
// 261. reseller_requests.decision_reason is a plain nullable `text` column at
// 0095:36 with no DB-side CHECK — so the writer contract is enforced only in
// validateAdminDecision at web/src/lib/reseller/requests.ts:293-300 which
// rejects the mutation with reason='reason_too_long' whenever
// String(input.decision_reason).trim().length > REASON_MAX (200) and stores the
// already-trimmed `r` on approve/deny/cancel. Pre-tick-277 posture pinned only
// null-or-typeof-string at line 491-494 (landed at tick 224) leaving the
// length invariant silent — a route regression that projected decision_reason
// from a different column, or a validator regression that widened REASON_MAX,
// would pass the null-or-string guard but fail this length tightening on the
// next CI pass. Two-part guard: (a) preserved null-or-typeof-string pin at
// line 491-494 fires first (matches ticks 265-276 layering discipline
// verbatim), (b) new null-or-(typeof-string-AND-length ≤ REASON_MAX) pin
// fires only after the typeof-string guard passes so tighter existing pins
// surface first. Reuses the REASON_MAX=200 module-scope constant hoisted at
// tick 261 line 91 — no new module-scope constant needed. Coverage-per-guard
// posture: the wave-3 row 155 seeded pending over_budget_approval row carries
// decision_reason=NULL on the wire per validator + ck_decision_shape (pending
// rows never carry a decision), so the ===null branch of the null-or-length
// guard exercises on every green CI run; the non-null length branch has
// zero-coverage on the wire today because no approve/deny fixture seeds a
// decided reseller_requests row that this GET would return — matches the
// tick 261 zero-coverage-per-guard rationale (the pin still closes the writer
// contract so a length-regression across the null-or-string surface would
// surface on the next CI pass whenever a decide-fixture seeds a row).
// Sibling-surface parity: sibling admin-side spec admin-requests-patch-authz
// .spec.ts already pins the same column length invariant at tick 272 so this
// tick mirrors that companion onto the reseller-scoped list surface — a
// decision_reason length drift now surfaces on both admin and reseller lenses
// simultaneously (second cross-surface companion after tick 275's created_at
// pin and tick 276's decision_at pin).
//
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

// Tick 278 — status enum value pin hoisted as a shared module-scope constant on
// the reseller-scoped GET at /api/reseller/requests/route.ts:169-173 (third
// column of the SELECT projection). Natural next pick option (a) from tick 277.
// reseller_requests.status is a NOT NULL text column DEFAULT 'pending'
// (0095:31-32) with a CHECK constraint pinning it to one of four enum values
// ('pending','approved','denied','cancelled'); the validator side mirrors the
// terminal three at web/src/lib/reseller/requests.ts:17-21 (ResellerRequestStatus
// union) and the admin route mirrors all four at
// /api/admin/resellers/requests/route.ts:13 (ALLOWED_STATUS set). Pre-tick-278
// posture pinned the enum via an inline `["pending","approved","denied",
// "cancelled"].toContain(...)` literal at line ~370 which closed the enum-value
// invariant but not the module-scope symmetry with the sibling admin surface.
// admin-requests-patch-authz.spec.ts:467-472 already hoists the same set as
// ALLOWED_STATUS_VALUES (landed at tick 270); this tick mirrors that hoist
// verbatim onto the reseller-scoped list surface so a schema-side enum
// extension (CHECK widening at 0095:32 or a validator widening at
// requests.ts:17-21) lands as a single spec edit on both admin and reseller
// lenses simultaneously — matches the source-of-truth hoist discipline used
// for ALLOWED_TIER_PCT_VALUES / SUFFIX_RE / HTTPS_URL_RE / REASON_MAX /
// PURPOSE_MAX at tick 261 and ISO_TIMESTAMP_RE at tick 275. Two-part guard:
// (a) preserved typeof-string pin at line ~369 fires first (matches ticks
// 265-277 layering discipline verbatim), (b) new ALLOWED_STATUS_VALUES.has()
// set-membership pin fires only after the typeof-string guard passes so
// tighter existing pins surface first. Coverage-per-guard posture: green-path
// wave-4 row 161 exercises the 'pending' enum value on every green CI run
// (wave-3 row 155 seeds the pending over_budget_approval fixture); the
// approved/denied/cancelled enum values have zero-coverage on the wire today
// because no decide-fixture seeds a decided row that this GET would return —
// matches the tick 261 zero-coverage-per-guard rationale (the set still closes
// the writer contract so a route regression that returned a non-enum status
// would surface on the next CI pass whenever any row is seeded). Sibling-
// surface parity: fourth cross-surface companion pin after tick 275's
// created_at ISO pin, tick 276's decision_at ISO pin, and tick 277's
// decision_reason length pin — a status enum extension now lands as a single
// spec edit on both admin and reseller lenses simultaneously.
const ALLOWED_STATUS_VALUES = new Set([
  "pending",
  "approved",
  "denied",
  "cancelled",
]);

// Tick 279 — request_type enum value pin hoisted as a shared module-scope
// constant on the reseller-scoped GET at /api/reseller/requests/route.ts:169-173
// (second column of the SELECT projection). Natural next pick option (a) from
// tick 278. reseller_requests.request_type is a NOT NULL text column with a
// CHECK constraint pinning it to one of three enum values ('code_request',
// 'over_budget_approval', 'collateral_approval') at 0095:29-30; the validator
// side mirrors the same set at web/src/lib/reseller/requests.ts:12-15
// (ResellerRequestType union) and the invalid_request_type gate at
// requests.ts:218-221. Pre-tick-279 posture pinned the enum via an inline
// `["code_request","over_budget_approval","collateral_approval"].toContain(...)`
// literal at line ~408 which closed the enum-value invariant but not the
// module-scope symmetry with the sibling admin surface.
// admin-requests-patch-authz.spec.ts:462-466 already hoists the same set as
// ALLOWED_REQUEST_TYPES (landed at tick 269); this tick mirrors that hoist
// verbatim onto the reseller-scoped list surface so a schema-side enum
// extension (CHECK widening at 0095:30 or a validator widening at
// requests.ts:12-15) lands as a single spec edit on both admin and reseller
// lenses simultaneously — matches the source-of-truth hoist discipline used
// for ALLOWED_TIER_PCT_VALUES / SUFFIX_RE / HTTPS_URL_RE / REASON_MAX /
// PURPOSE_MAX at tick 261, ISO_TIMESTAMP_RE at tick 275, and
// ALLOWED_STATUS_VALUES at tick 278. Two-part guard: (a) preserved
// typeof-string pin at line ~407 fires first (matches ticks 265-278 layering
// discipline verbatim), (b) new ALLOWED_REQUEST_TYPES.has() set-membership
// pin fires only after the typeof-string guard passes so tighter existing
// pins surface first. Coverage-per-guard posture: green-path wave-4 row 161
// exercises the 'over_budget_approval' enum value on every green CI run
// (wave-3 row 155 seeds the pending over_budget_approval fixture); the
// code_request/collateral_approval enum values have zero-coverage on the wire
// today because no fixture seeds those variants that this GET would return —
// matches the tick 261 zero-coverage-per-guard rationale (the set still
// closes the writer contract so a route regression that returned a non-enum
// request_type would surface on the next CI pass whenever any row is
// seeded). Sibling-surface parity: fifth cross-surface companion pin after
// tick 275's created_at ISO pin, tick 276's decision_at ISO pin, tick 277's
// decision_reason length pin, and tick 278's status enum hoist — a
// request_type enum extension now lands as a single spec edit on both admin
// and reseller lenses simultaneously.
const ALLOWED_REQUEST_TYPES = new Set([
  "code_request",
  "over_budget_approval",
  "collateral_approval",
]);

// Tick 371 — reseller_requests-row ck_decision_shape cross-column
// invariant summary cross-surface twin-lift onto reseller-requests-
// list-authz.spec.ts. Executes tick 370 next-pick option (i) verbatim:
// opens the third reseller-scope surface's cross-surface twin axis by
// hoisting the ck_decision_shape module-scope summary from requests-
// authz.spec.ts (tick 365 — reseller-scope POST surface) and
// requests-validation.spec.ts (tick 368 — reseller-scope GET wire-
// shape surface) onto this file (the reseller-scope GET auth surface).
// First of three possible reseller-scope cross-surface companion
// ticks per tick 370 next-pick option (i). Post-tick 371, the
// reseller_requests-row cluster reaches 3-surface parity on
// ck_decision_shape alone across the reseller-scope triple: 1/3 on
// this file with ck_decision_shape landing here, 3/3 on requests-
// authz.spec.ts per tick 367 close-out, 3/3 on requests-validation.
// spec.ts per tick 370 close-out. Follow-on ticks 372/373 can lift
// ck_credit_link + ck_promo_link onto this file to bring it to 3/3
// summary parity, matching the tick 366+367 companion-hoist posture
// on requests-authz.spec.ts and the tick 369+370 companion-hoist
// posture on requests-validation.spec.ts. Pure documentation-only
// doc-block hoist — no new imports, no new module-scope const, no
// fixture change, no route change, no per-column assert added; the
// existing UUID_RE + ALLOWED_TIER_PCT_VALUES + SUFFIX_RE +
// HTTPS_URL_RE + REASON_MAX + PURPOSE_MAX + ISO_TIMESTAMP_RE +
// ALLOWED_STATUS_VALUES + ALLOWED_REQUEST_TYPES module-scope consts
// declared adjacent at lines 73-274 remain the sole module-scope
// consts on this file.
//
// Cross-column invariant summary — reseller_requests.{status,
// decision_by, decision_at, decision_reason} ⇔ ck_decision_shape
//   Writer-side source: IDENTICAL to tick 365 on the sibling
//   requests-authz.spec.ts surface and tick 368 on the sibling
//   requests-validation.spec.ts surface — DB CHECK
//   ck_decision_shape at web/supabase/migrations/0095_reseller_
//   requests.sql:41-45 enforces the disjunction
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
//   companion twins are pending at follow-on ticks 372/373 per tick
//   370 next-pick option (i) chain. This tick's summary opens the
//   cross-surface twin axis on reseller-requests-list-authz.spec.ts
//   with ck_decision_shape alone, mirroring the tick 362 opening
//   posture on the admin-requests-list-authz.spec.ts surface and
//   the tick 368 opening posture on the requests-validation.spec.ts
//   surface (both opened their cross-surface twin axis with
//   ck_decision_shape as the first of the three summary companions).
//   Application write path: IDENTICAL to tick 365 and tick 368 — the
//   reseller-scope POST at web/src/app/api/reseller/requests/route.
//   ts:87-97 INSERTs a fresh reseller_requests row with only
//   reseller_id + request_type + payload + created_by (status takes
//   its DB default 'pending' via 0095:32; decision_by / decision_at
//   / decision_reason default to NULL per 0095:34-36). Every row
//   born on this route sits on the NULL branch of ck_decision_shape
//   (status='pending' AND decision_by IS NULL AND decision_at IS
//   NULL); the NON-NULL branch is UNREACHABLE from the reseller-
//   scope POST route because it has no update mode. The NON-NULL
//   branch is exclusively produced by the admin PATCH stamper at
//   /api/admin/resellers/requests/[id]/route.ts:305-320 narrated in
//   the tick 359 doc-block on admin-requests-patch-authz.spec.ts.
//   Read path: IDENTICAL to tick 368 — the reseller-scope GET at
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
//   history table). Same wire granularity as the sibling
//   requests-validation.spec.ts surface (tick 368 lens): both
//   reseller-scope GET surfaces observe the SAME three-column
//   projection of ck_decision_shape (status + decision_at +
//   decision_reason with decision_by stripped) because they hit
//   the SAME route.ts:169-176 SELECT list. Four-surface granularity
//   ladder unchanged from tick 368: (a) full four-column tuple on
//   the admin list route (tick 362 lens); (b) three-column tuple
//   on the admin PATCH echo (tick 359 lens — omits decision_by);
//   (c) single-column tuple on the reseller POST envelope (tick
//   365 lens — projects only status); (d) three-column tuple on
//   the reseller GET envelope surfaced BOTH from requests-
//   validation.spec.ts (tick 368 lens) AND this file (THIS tick
//   lens — same route, twin observability across the two GET
//   spec files that share the wire). Granularity (d) matches
//   granularity (b) at the column-count level (three of four)
//   with the SAME omission (decision_by) for the same privacy-
//   narrowing rationale narrated at tick 368: the reseller
//   boundary MUST not surface which admin decided the request
//   (leaking decision_by would let a reseller correlate admin
//   activity patterns across their own request history — a
//   privacy narrowing separate from ck_decision_shape itself but
//   which happens to land on the same column). So the
//   ck_decision_shape invariant is observable at three DIFFERENT
//   projection granularities across the four surfaces the cluster
//   now spans, with decision_by only surfacing on the admin-list
//   surface (tick 362 lens).
//   Runtime enforcement in this spec: the wave-4 row 161 happy GET
//   at lines 392-540 iterates body.requests ?? [] and pins per-row
//   status ∈ ALLOWED_STATUS_VALUES via the tick 278 hoist (four-
//   value enum guard on the ck_decision_shape status column),
//   decision_at null-or-typeof-string via the tick 224 pin at lines
//   ~615 + null-or-ISO_TIMESTAMP_RE via the tick 276 tightening at
//   lines ~628 with the ck_decision_shape at 0095:41-45 cross-
//   reference in the failure message (two-part guard — asserts the
//   birth-state timestamp column is null on the pending row +
//   observably-typed on any post-decision row a future decide-
//   fixture surfaces), decision_reason null-or-typeof-string via
//   the tick 224 pin + null-or-(typeof-string-AND-length ≤
//   REASON_MAX) via the tick 277 tightening (nullable across all
//   row states per 0095:36 with no CHECK tying it to status). The
//   per-row shape pins fire once per row in body.requests[]; with
//   the wave-3 row 155 seeder in requests-authz.spec.ts landing a
//   fresh pending over_budget_approval row per green CI run against
//   the active_wholesale variant, this GET observes ≥1 pending row
//   per pass (fresh hosts hit 1; hosts where row 155 has run in
//   prior CI passes have ≥N cumulative). Neither wave-4 row 161
//   nor any sibling row asserts decision_by on the wire — because
//   that column is stripped from the GET envelope (see Read path
//   above) and therefore NOT observable on this surface. A route
//   regression that leaked decision_by onto the envelope would
//   surface via a `row.decision_by` undefined → non-undefined
//   delta on downstream consumers, but this spec deliberately does
//   not assert its absence (symmetric-to-presence "should not
//   exist" pin adds cost without adding correctness, same posture
//   as tick 365's + tick 368's narration of the reseller POST +
//   validation-spec GET envelope's projection lists).
//   Coverage-per-guard posture: DEGENERATE-SYMMETRIC relative to
//   tick 368. Tick 368 narrates the reseller-scope GET wire-shape
//   surface observing the SAME NULL/pending branch on the READ
//   side. This tick narrates the reseller-scope GET authz surface
//   observing the SAME NULL/pending branch via the SAME route on
//   the SAME wave-4 row 161 fixture — the two GET spec files share
//   the wire envelope so the per-row pins fire in parallel across
//   both specs on the same CI pass. So the read-side probe count
//   is ≥1 per pass per spec (bounded above by 100 per the .limit(
//   100) in route.ts:176); the ck_decision_shape NULL branch fires
//   on every projected row + every green CI run across both GET
//   surfaces. NON-NULL branch coverage on this GET surface is
//   currently ZERO because no decide-fixture has landed a terminal-
//   status row visible to the reseller-scope GET (P8.5 approve
//   flows are blocked; P9.3 deny + cancel flows land at a future
//   wave but the QA harness doesn't seed a terminal row on the
//   active_wholesale variant today). Together the reseller-scope
//   surface triple (this tick + tick 365 + tick 368) covers the
//   NULL/pending branch on ALL THREE reseller-scope surfaces (POST
//   INSERT + GET wire-shape + GET authz) at module scope, matching
//   the admin-scope surface pair (ticks 359 + 362) which cover
//   the NON-NULL/terminal branch on BOTH write-side UPDATE + read-
//   side list envelopes. Post-tick 371, the four-surface cluster
//   observes both halves of the ck_decision_shape disjunction
//   across both read+write axes at module scope on distinct scoped
//   surfaces, with reseller-scope side now at three-surface parity
//   on the NULL/pending branch — the maximum observability
//   granularity the cluster can carry without landing a decide-
//   fixture that produces a reseller-visible terminal-status row.
//   Symmetric-cluster posture: this hoist OPENS the reseller-scope
//   3-surface parity axis on ck_decision_shape (matches the tick
//   368 opening posture on the reseller-scope 2-surface parity
//   axis which reached 2-surface parity for the same invariant
//   before ticks 369+370 filled the ck_credit_link + ck_promo_link
//   companion twins on requests-validation.spec.ts). Post-tick 371,
//   the reseller_requests-row cluster sits at three-surface + one-
//   invariant × two-scope-family × three-axis parity for
//   ck_decision_shape on the reseller-scope side (POST INSERT +
//   GET wire-shape + GET authz all carry the invariant summary).
//   Follow-on ticks can rotate along four dimensions per tick 370's
//   rotation menu adapted for this cross-surface opening: (a)
//   cross-surface twin-lift ck_credit_link onto THIS file so this
//   reseller-scope GET-authz surface reaches 2/3 summary parity
//   (matches the tick 366+369 companion-hoist posture on requests-
//   authz.spec.ts + requests-validation.spec.ts); (b) cross-surface
//   twin-lift ck_promo_link onto THIS file so this reseller-scope
//   GET-authz surface reaches 3/3 summary parity (matches the tick
//   367+370 closing posture on the sibling reseller-scope
//   surfaces); (c) rotate to /admin/resellers/requests/[id] detail
//   surface for a THIRD-surface companion of any admin summary the
//   admin-scope cluster now carries at 3/3 × 2-surface parity; (d)
//   idle — frontier remains tight (P1.5 + P8.5 HUMAN-BLOCKED, P11
//   never_completes, Track B closed, P10 continues accepting
//   incremental pin-tightening + summary-hoist ticks).

// Tick 372 — reseller_requests-row ck_credit_link cross-column
// invariant summary cross-surface twin-lift onto reseller-requests-
// list-authz.spec.ts. Executes tick 371 next-pick option (i) verbatim:
// hoists the ck_credit_link module-scope summary from requests-authz.
// spec.ts (tick 366 — reseller-scope POST surface) and requests-
// validation.spec.ts (tick 369 — reseller-scope GET wire-shape
// surface) onto this file (the reseller-scope GET authz surface).
// Second of three possible reseller-scope cross-surface companion
// ticks on this file per tick 370 next-pick option (i) chain
// (ck_decision_shape landed at tick 371; ck_promo_link twin-lift
// pending at follow-on tick 373). Post-tick 372, ck_credit_link
// reaches 3-surface parity across the reseller-scope triple: 3/3 on
// requests-authz.spec.ts per tick 367 close-out, 3/3 on requests-
// validation.spec.ts per tick 370 close-out, 2/3 on reseller-requests-
// list-authz.spec.ts (this tick lands ck_credit_link as the second
// companion after tick 371's ck_decision_shape opening). The
// reseller_requests-row cluster now spans 14 module-scope cross-column
// invariant summaries across five surfaces × three CHECK constraints:
// 3 on requests-authz.spec.ts + 3 on requests-validation.spec.ts + 3
// on admin-requests-list-authz.spec.ts + 3 on admin-requests-patch-
// authz.spec.ts + 2 on this file (ck_decision_shape at tick 371 +
// ck_credit_link landing here). Pure documentation-only doc-block
// hoist — no new imports, no new module-scope const, no fixture
// change, no route change, no per-column assert added; the existing
// UUID_RE + ALLOWED_TIER_PCT_VALUES + SUFFIX_RE + HTTPS_URL_RE +
// REASON_MAX + PURPOSE_MAX + ISO_TIMESTAMP_RE + ALLOWED_STATUS_VALUES
// + ALLOWED_REQUEST_TYPES module-scope consts declared adjacent at
// lines 73-274 remain the sole module-scope consts on this file.
//
// Cross-column invariant summary — reseller_requests.{request_type,
// status, linked_credit_transaction_id} ⇔ ck_credit_link
//   Writer-side source: IDENTICAL to tick 366 on the sibling
//   requests-authz.spec.ts surface and tick 369 on the sibling
//   requests-validation.spec.ts surface — DB CHECK ck_credit_link at
//   web/supabase/migrations/0095_reseller_requests.sql:48-51
//   enforces the disjunction
//     linked_credit_transaction_id IS NULL
//     OR (request_type = 'over_budget_approval'
//         AND status = 'approved')
//   i.e. only over_budget_approval requests that reached the
//   approved terminal state may carry a non-null linked_credit_
//   transaction_id (uuid REFERENCES credit_transactions(id) ON
//   DELETE SET NULL at 0095:37). The other two request_type enum
//   values (code_request + collateral_approval per the CHECK at
//   0095:30) and the other three status enum values (pending +
//   denied + cancelled per the CHECK at 0095:32) MUST leave
//   linked_credit_transaction_id null on the wire. The sibling
//   ck_promo_link (0095:52-55) is the mirror constraint on
//   linked_promotion_code_id: permits non-null ONLY on request_type=
//   'code_request' AND status='approved'. Together the two link-
//   column CHECKs form an XOR partition across the request_type
//   dimension per the tick 360 + 366 + 369 summary blocks — an
//   over_budget_approval approval can only stamp linked_credit_
//   transaction_id (never linked_promotion_code_id), and a
//   code_request approval can only stamp linked_promotion_code_id
//   (never linked_credit_transaction_id). The XOR is an emergent
//   property of the two orthogonal CHECKs; there is no single CHECK
//   enforcing it directly. This tick's summary extends the tick 371
//   cross-surface twin-lift axis on THIS file with ck_credit_link as
//   the second of three summaries, matching the tick 366 axis-
//   extension posture on requests-authz.spec.ts and the tick 369
//   axis-extension posture on requests-validation.spec.ts (both
//   extended their tick 365 / tick 368 opening with ck_credit_link
//   as the second companion).
//   Application write path: IDENTICAL to tick 366 and tick 369 — the
//   reseller-scope POST at web/src/app/api/reseller/requests/route.
//   ts:87-97 INSERTs a fresh reseller_requests row via
//     .insert({
//       reseller_id: scope.reseller_id,
//       requested_by: user.id,
//       request_type,
//       payload,
//       status: "pending",
//     })
//   and NEVER stamps linked_credit_transaction_id. The column takes
//   its DB default: linked_credit_transaction_id is nullable per
//   0095:37 with no DEFAULT clause, so it defaults to NULL on every
//   INSERT. So EVERY row born on this route sits on the NULL branch
//   of ck_credit_link (linked_credit_transaction_id IS NULL); the
//   NON-NULL branch (request_type='over_budget_approval' AND
//   status='approved' AND linked_credit_transaction_id IS NOT NULL)
//   is UNREACHABLE from the reseller-scope POST route because it has
//   no update mode, no side-effect block that mints a credit_
//   transactions row, and no linked_credit_transaction_id column in
//   its INSERT payload. The NON-NULL branch is exclusively produced
//   by the admin PATCH over_budget_approval approve branch at
//   /api/admin/resellers/requests/[id]/route.ts:209-303 narrated in
//   the tick 360 doc-block on admin-requests-patch-authz.spec.ts
//   (route reads credit_balances, upserts the balance + lifetime_
//   earned, INSERTs a credit_transactions row with reason=
//   'reseller_grant_over_budget', writes txRow.id into
//   linkedCreditTransactionId, then stamps it onto reseller_requests
//   via the single UPDATE at route.ts:305-320 alongside status +
//   decision_by + decision_at + decision_reason so ck_decision_shape
//   and ck_credit_link move atomically).
//   Read path: IDENTICAL to tick 369. The reseller-scope GET at
//   web/src/app/api/reseller/requests/route.ts:169-176 projects a
//   seven-column tuple
//     "id, request_type, status, payload, decision_at,
//      decision_reason, created_at"
//   scoped via .eq("reseller_id", scope.reseller_id) with
//   .order("created_at", {ascending: false}).limit(100). Of the
//   three columns coupled by ck_credit_link (request_type + status
//   + linked_credit_transaction_id), TWO are projected on this
//   envelope (request_type + status) — linked_credit_transaction_id
//   is stripped by the route (route.ts:172 omits it from the SELECT
//   list on purpose; the reseller-facing GET envelope only echoes
//   fields the client renders in the request history table, and the
//   internal credit_transactions row id is a ledger-internal
//   identifier the reseller should not need to render inline). Same
//   wire granularity as the sibling requests-validation.spec.ts
//   surface (tick 369 lens): both reseller-scope GET surfaces observe
//   the SAME two-column projection of ck_credit_link (request_type +
//   status with linked_credit_transaction_id stripped) because they
//   hit the SAME route.ts:169-176 SELECT list. Four-surface
//   granularity ladder unchanged from tick 369: (a) full three-column
//   tuple on the admin list route (tick 363 lens); (b) three-column
//   tuple on the admin PATCH echo (tick 360 lens); (c) two-column
//   tuple on the reseller POST envelope (tick 366 lens — projects
//   only request_type + status, strips the link column); (d) two-
//   column tuple on the reseller GET envelope surfaced BOTH from
//   requests-validation.spec.ts (tick 369 lens) AND this file (THIS
//   tick lens — same route, twin observability across the two GET
//   spec files that share the wire). Granularity (d) matches
//   granularity (c) at the column-count level (two of three) with
//   the SAME omission (linked_credit_transaction_id) for the same
//   ledger-internal-identifier narrowing rationale narrated at
//   ticks 366 + 369: the reseller boundary MUST not surface an
//   internal credit_transactions row id inline on the request
//   history row (the reseller consumes credit-ledger detail via
//   /reseller/credits rather than via this envelope). So the
//   ck_credit_link invariant is observable at two DIFFERENT
//   projection granularities across the five surfaces the cluster
//   now spans, with linked_credit_transaction_id only surfacing on
//   the admin-scope pair.
//   Runtime enforcement in this spec: the wave-4 row 161 happy GET
//   at lines 582-720 iterates body.requests ?? [] and pins per-row
//   request_type ∈ ALLOWED_REQUEST_TYPES via the tick 279 hoist at
//   lines 641-654 (three-value enum guard on ck_credit_link's first
//   coupled non-link column — asserts the writer contract across
//   every projected row; the seeded QA dataset via wave-3 row 155's
//   over_budget_approval fixture in requests-authz.spec.ts lands ≥1
//   row on the over_budget_approval discriminator per green CI run
//   so at least ONE row per pass exercises the "candidate for
//   eventual NON-NULL branch" half of the enum), status ∈
//   ALLOWED_STATUS_VALUES via the tick 278 hoist at lines 656-668
//   (four-value enum guard on ck_credit_link's second coupled non-
//   link column; the wave-3 row 155 seeder lands the "pending" enum
//   value which guarantees the NULL/pending branch of ck_credit_link
//   fires on every green CI run through the request_type='over_
//   budget_approval' AND status='pending' orthogonality — 'pending'
//   is ORTHOGONAL to the NON-NULL branch's status='approved'
//   requirement so every observed row on this surface today lands
//   on the NULL branch). Neither wave-4 row 161 nor any sibling row
//   asserts linked_credit_transaction_id on the wire — because the
//   third coupled column is stripped from the GET envelope (see
//   Read path above) and therefore NOT observable on this surface.
//   The pending row's DB-side linked_credit_transaction_id=NULL
//   invariant is captured by the admin-scope surfaces (tick 360 +
//   tick 363) which DO project the link column, so the coverage
//   tally for ck_credit_link's NULL branch already sits at ≥1 per
//   pass on the admin-scope side via the same shared fixture pool;
//   this reseller-scope surface triple (tick 366 + tick 369 + this
//   tick) adds redundant NULL-branch observations on the two coupled
//   non-link columns (request_type + status) across the write-side
//   POST + read-side GET wire-shape + read-side GET authz envelopes.
//   Coverage-per-guard posture: DEGENERATE-SYMMETRIC relative to
//   tick 369 — same shape as the tick 371 relationship to tick 368.
//   Tick 369 narrates the reseller-scope GET wire-shape surface
//   observing the NULL/pending branch on the READ side via the
//   route.ts:169-176 SELECT projection. This tick narrates the
//   reseller-scope GET authz surface observing the SAME NULL/pending
//   branch via the SAME route on the SAME wave-4 row 161 fixture —
//   the two GET spec files share the wire envelope so the per-row
//   pins fire in parallel across both specs on the same CI pass.
//   Read-side probe count is ≥1 per pass per spec (bounded above by
//   100 per the .limit(100) in route.ts:176); the ck_credit_link
//   NULL branch fires on every projected row + every green CI run
//   across both GET surfaces. NON-NULL branch coverage on this GET
//   surface is currently ZERO because no decide-fixture has landed
//   a terminal-status approved over_budget_approval row visible to
//   the reseller-scope GET (P8.5 approve flows are HUMAN-BLOCKED
//   on Stripe env vars; the admin PATCH approve branch that would
//   produce a NON-NULL linked_credit_transaction_id row requires
//   human unblock per P8.5). Together the reseller-scope surface
//   triple (this tick + tick 366 + tick 369) covers the NULL/pending
//   branch on ALL THREE reseller-scope surfaces (POST INSERT + GET
//   wire-shape + GET authz) at module scope on the two coupled non-
//   link columns, matching the admin-scope surface pair (tick 360 +
//   tick 363) which cover BOTH the NULL/pending branch (via deny +
//   cancel PATCH read-backs) AND the NON-NULL/approved branch (via
//   the approve PATCH read-back) on the full three-column tuple
//   including the link column. Post-tick 372, the five-surface
//   cluster observes both branches of the ck_credit_link disjunction
//   on the admin-scope side and one branch (NULL/pending) on the
//   reseller-scope side across both read+write axes at module scope,
//   with the reseller-scope side now at three-surface parity on the
//   NULL/pending branch — the maximum observability granularity the
//   cluster can carry without landing a decide-fixture that produces
//   a reseller-visible terminal-status row.
//   Symmetric-cluster posture: this hoist EXTENDS the tick 371
//   reseller-scope cross-surface twin-lift sequence on THIS file —
//   the reseller-scope GET-authz surface now carries 2/3 possible
//   summaries (ck_decision_shape landed at tick 371; ck_credit_link
//   landing at this tick 372; ck_promo_link pending at follow-on
//   tick 373). Matches the tick 366 axis-extension posture on the
//   reseller-scope POST surface (which extended tick 365 by landing
//   ck_credit_link as the second of three summaries) and the tick
//   369 axis-extension posture on the reseller-scope GET wire-shape
//   surface (which extended tick 368 by landing ck_credit_link as
//   the second of three summaries). Post-tick 372, the reseller_
//   requests-row cluster sits at three-surface + two-invariant ×
//   two-scope-family × three-axis parity for ck_decision_shape +
//   ck_credit_link on the reseller-scope side (both invariants now
//   observed across POST INSERT + GET wire-shape + GET authz).
//   Follow-on ticks can rotate along four dimensions per tick 371's
//   rotation menu adapted for this 2/3 reseller-scope GET-authz
//   parity state: (i) cross-surface twin-lift ck_promo_link onto
//   THIS file so this reseller-scope GET-authz surface reaches 3/3
//   summary parity (matches the tick 367+370 closing posture on the
//   sibling reseller-scope surfaces — natural pick per the tick 371
//   next-pick option (ii) chain); (ii) rotate to /admin/resellers/
//   requests/[id] detail surface for a THIRD-surface companion of
//   any of the three admin summaries the admin-scope cluster now
//   carries at 3/3 × 2-surface parity; (iii) idle — frontier remains
//   tight (P1.5 + P8.5 HUMAN-BLOCKED, P11 never_completes, Track B
//   closed, P10 continues accepting incremental pin-tightening +
//   summary-hoist ticks).

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
      // Tick 279 — ALLOWED_REQUEST_TYPES.has() set-membership pin replacing
      // the pre-tick-279 inline `["code_request","over_budget_approval",
      // "collateral_approval"].toContain(...)` literal. See module-scope
      // doc-block above ALLOWED_REQUEST_TYPES for the source-of-truth
      // rationale (0095:29-30 CHECK + requests.ts:12-15 union +
      // requests.ts:218-221 invalid_request_type gate). Fires ONLY after
      // the typeof-string guard above passes so tighter existing pins
      // surface first. Mirrors the admin-side tick 269 hoist verbatim so
      // a schema-side enum extension lands as a single spec edit on both
      // admin and reseller lenses simultaneously.
      expect(
        ALLOWED_REQUEST_TYPES.has(row.request_type as string),
        `active_wholesale + happy GET row.request_type '${String(row.request_type)}' not in {code_request, over_budget_approval, collateral_approval} per 0095:29-30 + requests.ts:12-15 + requests.ts:218-221; a schema-side CHECK widening or a route regression that returned a stale/mismatched request_type value would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.status).toBe("string");
      // Tick 278 — ALLOWED_STATUS_VALUES.has() set-membership pin replacing
      // the pre-tick-278 inline `["pending","approved","denied","cancelled"]
      // .toContain(...)` literal. See module-scope doc-block above
      // ALLOWED_STATUS_VALUES for the source-of-truth rationale (0095:31-32
      // CHECK + requests.ts:17-21 union + route.ts:13 ALLOWED_STATUS). Fires
      // ONLY after the typeof-string guard above passes so tighter existing
      // pins surface first. Mirrors the admin-side tick 270 hoist verbatim so
      // a schema-side enum extension lands as a single spec edit on both
      // admin and reseller lenses simultaneously.
      expect(
        ALLOWED_STATUS_VALUES.has(row.status as string),
        `active_wholesale + happy GET row.status '${String(row.status)}' not in {pending, approved, denied, cancelled} per 0095:31-32 + requests.ts:17-21 + route.ts:13; a schema-side CHECK widening or a route regression that returned a stale/mismatched status value would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
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
      // Tick 277 — length ≤ REASON_MAX tightening on decision_reason, sibling
      // companion to the payload.notes / payload.reason length pins landed at
      // tick 261 (lines 438-441 + 452-457) and mirroring the admin-side tick
      // 272 pin from admin-requests-patch-authz.spec.ts. Fires ONLY when
      // decision_reason is non-null so the wave-3 row 155 pending fixture's
      // decision_reason=NULL still passes cleanly; a decided-row fixture
      // (future approve/deny seed) would exercise the length branch. See the
      // module-scope doc-block above ISO_TIMESTAMP_RE (tick 277 paragraph)
      // for the validator source-of-truth rationale (requests.ts:293-300 —
      // validateAdminDecision rejects with reason='reason_too_long' whenever
      // trim().length > REASON_MAX and stores the trimmed value, so the wire
      // never carries a longer string on a green path).
      expect(
        row.decision_reason === null ||
          (typeof row.decision_reason === "string" &&
            (row.decision_reason as string).length <= REASON_MAX),
        `active_wholesale + happy GET row.decision_reason should be null or a string of length ≤ ${REASON_MAX} per validator invariant at requests.ts:293-300 (validateAdminDecision rejects with reason='reason_too_long' when trim().length > REASON_MAX=200 and stores the trimmed value); a widening of the validator or a projection swap to a different text column would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
  });
});
