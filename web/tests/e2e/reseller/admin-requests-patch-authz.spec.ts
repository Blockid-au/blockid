// PATCH /api/admin/resellers/requests/[id] pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate ordering
// surfaces before the endpoint reads reseller_requests, validates the
// approve/deny/cancel decision, mints a Stripe coupon, or writes any of the
// four downstream tables — credit_balances, credit_transactions,
// reseller_credit_grants, reseller_promotion_codes, reseller_requests).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103) — both routes use the
// shared requireAdmin() middleware from web/src/lib/reseller/require-admin.ts
// (see route.ts:46-54). The gate throws AdminGateError with code="no_user" |
// "not_admin" and the route emits { ok:false, reason:<code> } at HTTP 401 for
// BOTH branches (route.ts:50-51). Symmetric envelope so a refactor that
// collapses either 401 reason or drops the requireAdmin() gate here would
// light up alongside its sibling on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no
// reseller_requests SELECT fires, no validateAdminDecision runs, no Stripe
// coupon is minted, no credit_balances/credit_transactions/reseller_credit_grants
// /reseller_promotion_codes/reseller_requests write happens):
//
//   1. unauthenticated  — PATCH with no session         → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401 BEFORE
//                          params resolution, getSupabaseAdmin, JSON parse,
//                          reseller_requests SELECT, decision validation, any
//                          Stripe mint, or the approve/deny/cancel UPDATE)
//   2. non_admin        — PATCH as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → requireAdmin throws
//                          AdminGateError("not_admin") → gate returns 401 BEFORE
//                          any of the above fires)
//
// Route reference: web/src/app/api/admin/resellers/requests/[id]/route.ts
//   Line 46-54:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 55-57:   (redundant) if (!user) → 401 no_user (dead branch — requireAdmin
//                 already threw; kept as a belt-and-braces guard)
//   Line 59-63:   params await + getSupabaseAdmin → 503 not_configured
//   Line 65:      request.json parse (null-safe)
//   Line 67-80:   reseller_requests SELECT → 500 read_failed / 404 not_found
//   Line 83-87:   validateAdminDecision   → 400 <reason> / 409 already_decided
//   Line 93-224:  approve branch fan-out (Stripe coupon mint, promotion_code
//                 insert, credit ledger writes for over_budget_approval,
//                 collateral_approval status flip)
//   Line 226+:    reseller_requests UPDATE — status flip + linked_credit_transaction_id
//                 / linked_promotion_code_id stamp + decision_reason + decided_at
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   admin-reseller-patch-authz.spec.ts, sandbox-setup-authz.spec.ts,
//   billing-authz.spec.ts, reveal-email-authz.spec.ts, drawer-authz.spec.ts,
//   me-attribution.spec.ts, and reports-signed-url-authz.spec.ts.
//
// Deliberately out of scope (needs the admin QA harness or per-test seeding
// which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which would
//     break every other Playwright spec in the same worker.
//   - not_found (404) — sits BEHIND requireAdmin (route.ts:78 vs :46), needs
//     an admin session PLUS an [id] that does not resolve to a reseller_requests
//     row.
//   - validateAdminDecision (400 <reason> / 409 already_decided) — needs an
//     admin session PLUS a real pending request row PLUS an ill-formed body
//     (missing action, unknown action, or already-decided row).
//   - payload_incomplete (422) — approve branch only, needs an admin session
//     PLUS a code_request row with a non-finite tier_pct payload.
//   - reseller_read_failed / existing_code_read_failed / promotion_code_insert
//     _failed / credit ledger insert failures / update_failed (500) — all fold
//     into the admin QA harness follow-up alongside the deferred rows from
//     ticks 94/95/96/97/98/99/100/101/102/103/104.
//   - Happy path (200) approve branch (code_request) — still fires a Stripe
//     coupon+promotion_code mint. Deferred until Stripe test-mode wiring
//     lands (same posture as wave-5 row 182 billing-authz happy path).
//   - Happy path (200) approve branch (over_budget_approval) — ACTIVATED
//     wave-5 row 175 approve-branch block below via the new
//     attachApproveTarget() fixture helper. The helper snapshot-restores
//     four writes end-to-end (reseller_requests INSERT then reseller_credit
//     _grants + reseller_requests + credit_transactions DELETE + credit_
//     balances restore) so the ledger triple-write (route.ts:200-293) has
//     deterministic control over target_user_id AND the pre/post credit_
//     balances state — the delta assertion pins balanceBefore + amount
//     without cross-run drift. Only the code_request approve branch stays
//     deferred (Stripe mint dependency).
//   - Happy path (200) cancel branch — ACTIVATED wave-5 row 175 cancel-
//     branch block below via loadAdminHarness() (qa-admin-1@blockid.au) once
//     row 155-b seeder landed in requests-authz.spec.ts (tick 164) to insert
//     a second pending over_budget_approval row per CI pass. Cancel mirrors
//     deny at route.ts:296-311 — pure status flip with no Stripe coupon
//     mint, no credit_balances / credit_transactions / reseller_credit_grants
//     write, no revenue_events read. Idempotent net-of-(row-155, row-155-b):
//     deny consumes row 155's seed; cancel consumes row 155-b's seed; the
//     queue nets to zero rather than accumulating pending rows. Fresh CI
//     hosts (where neither row 155 nor row 155-b has run yet) test.skip
//     when the pending enumeration returns fewer than the expected rows.
//   - Happy path (200) DENY branch — ACTIVATED wave-5 row 175 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin() gate
//     passes. Deny is the safest of the three transitions: pure status flip
//     at route.ts:296-311 (no Stripe coupon mint, no credit_balances /
//     credit_transactions / reseller_credit_grants write, no
//     revenue_events read, no reseller_promotion_codes insert). Idempotent
//     under CI replay net-of-row-155: row 155 inserts one pending
//     over_budget_approval row per CI pass; this row consumes it via the
//     PATCH so the queue nets to zero rather than accumulating. Fresh CI
//     hosts (where row 155 has not run yet) test.skip when the pending
//     enumeration returns an empty array — no false failure.
//
// Placeholder id used in the URL path: a well-formed UUID
// (00000000-0000-0000-0000-000000000000) sits in the [id] segment so it passes
// Next.js dynamic-segment matching. Both rows return BEFORE the params await
// runs (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// supabase.from("reseller_requests").eq("id", id).
//
// Body: {action:"approve"} is the smallest well-formed request body that would
// otherwise reach validateAdminDecision. Both rows return BEFORE the JSON
// parse runs so the body is not inspected — any parsable JSON would work.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type AttachApproveTargetResult,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/admin/resellers/requests/${PLACEHOLDER_ID}`;
const PATCH_BODY = { action: "approve" };

const REQUESTS_LIST_ROUTE = "/api/admin/resellers/requests";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tick 262 + 263 + 264 — per-key payload content invariants mirrored from
// web/src/lib/reseller/requests.ts so the discriminated-union pin in the
// deny block's post-PATCH read-back GET (tick 262), the cancel block's
// post-PATCH read-back GET (tick 263), and the approve block's post-PATCH
// read-back GET (tick 264) all echo the same source-of-truth shapes the
// validator writes:
//   - ALLOWED_TIER_PCT_VALUES ← ALLOWED_TIER_VALUES at requests.ts:63
//   - SUFFIX_RE               ← SUFFIX_RE at requests.ts:64
//   - HTTPS_URL_RE            ← HTTPS_URL_RE at requests.ts:65
//   - REASON_MAX              ← REASON_MAX at requests.ts:66
//   - PURPOSE_MAX             ← PURPOSE_MAX at requests.ts:67
// Kept as module-scope constants for parity with the tick 259/260/261/262
// hoists across admin-requests-list-authz.spec.ts / requests-validation.spec.
// ts / reseller-requests-list-authz.spec.ts / this spec's deny block (which
// themselves follow the tick 231 RESELLER_CODE_RE precedent — whenever a
// validator-side invariant exists, the spec echoes it verbatim rather than
// re-deriving inline). Tick 263 reused these five constants verbatim for the
// cancel block's post-PATCH read-back so the same drift check fires on both
// non-default ?status= filter paths (denied + cancelled). Tick 264 reuses
// them a third time for the approve block's post-PATCH read-back under the
// ?status=approved filter path — completing three of the four ALLOWED_STATUS
// enum values (pending covered by the three list surfaces, denied +
// cancelled + approved covered by the three PATCH-branch read-backs).
//
// Tick 265 — sixth module-scope constant ISO_TIMESTAMP_RE mirrors the shape
// PostgREST serialises the reseller_requests.decision_at timestamptz column
// into on the wire (see admin-reseller-loop-status-authz.spec.ts:85-86 for
// the sibling ISO_RE precedent). Landed alongside a decision_at typeof-string
// + regex pin added to each of the three post-PATCH read-back rows (deny +
// cancel + approve) so a drift in the column type from timestamptz to
// something else (e.g. a text column, a Unix epoch integer, a dropped column)
// surfaces on the same six list surfaces the tick 262/263/264 payload pins
// already cover. Regex intentionally permits both the `Z` UTC suffix and the
// `+00:00` numeric offset suffix so a PostgREST config change from `.toISOString`
// (Z suffix) to timezone-offset serialisation does NOT trip this pin —
// tightening beyond that would false-positive on a benign wire-format toggle.
//
// Tick 266 — decision_by UUID wire-shape pin added as the companion column
// to the tick-265 decision_at pin. Reuses the module-scope UUID_RE (line
// 139-140) rather than adding a seventh constant — decision_by is a uuid
// column (0095:34) that references public.app_users(id) ON DELETE SET NULL,
// so the read-back row carries the admin user id as a UUID string on the
// happy path. Pin fires on the same six list surfaces after the tick-265
// decision_at pin so a drift in reseller_requests.decision_by from uuid to
// something else (e.g. a text column, a dropped column, or a route
// regression that stripped decision_by from the list SELECT's column
// projection at route.ts:44) surfaces here. The 0095:43-45 CHECK constraint
// permits decision_by to be null when status ∈ ('approved','denied',
// 'cancelled') — only decision_at is required to be non-null in those
// states — but the PATCH route always stamps decision_by: user.id at
// route.ts:309 for all three branches, and no admin-delete fires between
// the PATCH and the very next GET in the same test, so the read-back MUST
// carry a non-null UUID here.
//
// Tick 267 — created_at ISO-8601 wire-shape pin added as the third
// "row-timestamp" column pin (companion to the tick-265 decision_at + tick-
// 266 decision_by pins). reseller_requests.created_at is a `timestamptz NOT
// NULL DEFAULT now()` column (0095:39) that is populated on INSERT and
// never touched by the PATCH branches — so unlike decision_at (populated at
// PATCH time only, non-null iff status ∈ approved/denied/cancelled per the
// 0095:43-45 CHECK) it is always non-null on every read-back regardless of
// which PATCH branch fired. Reuses the module-scope ISO_TIMESTAMP_RE (line
// 200-201) rather than adding an eighth constant. Pin catches a route
// regression that strips created_at from the list SELECT's column projection
// at route.ts:44 (see 0058-0060 idx `reseller_requests_pending_idx` which is
// keyed on `created_at DESC WHERE status='pending'` — a projection drop
// would still let that idx serve the pending-list query but would break the
// approved/denied/cancelled surfaces this spec exercises), as well as a
// column-type flip from timestamptz to something else (e.g. a bigint
// created_at_ms clock migration would surface as a number here). Two-part
// guard mirrors the decision_at pin: typeof-string + ISO_TIMESTAMP_RE.
//
// Tick 268 — decision_reason value pin added as the fourth per-column pin on
// the same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.decision_reason is a nullable text column (0095:36) that
// the PATCH route trims + writes via validateAdminDecision (requests.ts:293-
// 303) with a REASON_MAX (200) cap before UPDATE at route.ts:305-320. All
// three PATCH branches in this spec send a distinct probe decision_reason
// ("p10_wave5_row_175_<deny|cancel|approve>_probe"), all under 200 chars, so
// the read-back MUST carry that exact string. Reuses the module-scope
// REASON_MAX (line 216) rather than adding a ninth constant — same source
// invariant already backs the per-branch payload.reason / payload.notes
// length checks in the discriminated-union pin below. Three-part guard:
// (a) typeof-string (catches a column-type flip from text to something
// else, or a route regression that returned null after the PATCH stamped a
// non-null value), (b) length ≤ REASON_MAX (catches a validator-side
// widening of the cap that this spec did not track — e.g. bump REASON_MAX
// to 500 in requests.ts without a spec update), (c) exact-string equality
// against the probe (catches a route regression that swapped
// decision_reason for a different column value or a validator regression
// that trimmed/normalised the string in an unexpected way — the probe is
// intentionally ASCII-only + underscore-delimited so PostgREST/PostgreSQL
// text serialisation is guaranteed byte-for-byte round-trip). The PATCH
// response body already pins decision_reason value at route.ts:317-319, but
// the read-back closes the same pin against the list route's SELECT column
// projection at /api/admin/resellers/requests/route.ts:44 — a projection
// drop of decision_reason there would still let the PATCH echo the value
// back on the write envelope but would fail the read-back here.
//
// Tick 274 — resellers-join projection pin added as the tenth per-column pin
// on the same three post-PATCH read-back rows (deny + cancel + approve). Unlike
// the tick 265-273 per-column pins on scalar columns of the reseller_requests
// row itself, this one closes the writer contract on the embedded
// `resellers(code, display_name)` to-one join at the admin list route's SELECT
// projection (/api/admin/resellers/requests/route.ts:44, tail of the column
// list). PostgREST returns the embedded join as a single row object (not an
// array) for a to-one FK on reseller_requests.reseller_id → resellers.id at
// 0095:27 — so a route regression that stripped `resellers(code, display_name)`
// from the SELECT projection would surface here as `resellers === undefined`,
// and a regression that switched the embed to an array-of-rows shape (e.g. a
// PostgREST cardinality mis-config) would surface as `Array.isArray(resellers)
// === true`. Mirrors the tick-222 + tick-231 pattern from admin-requests-list-
// authz.spec.ts:449-469 — the same pin already lives on the pending-list
// surface; this tick brings it to the three PATCH-branch read-back surfaces
// (denied + cancelled + approved) so a projection drop or embed-shape drift
// surfaces on all four ALLOWED_STATUS filter paths, not just the default
// pending one. Both embed columns are NOT NULL text per 0091:24-25
// (resellers.code text NOT NULL UNIQUE = normaliseResellerCode()'s UPPERCASE
// slug family; resellers.display_name text NOT NULL = free-form label), so
// the read-back MUST carry non-null string values here on every green-path
// CI run regardless of which PATCH branch fired (the reseller_requests row
// FK-links to a NOT NULL resellers.id column at 0095:27 ON DELETE RESTRICT,
// which guarantees the parent reseller row cannot vanish mid-fixture leaving
// the embed empty). Four-part guard per key mirrors the sibling admin-
// requests-list pin at line 449-469:
//   (a) plain-object envelope — `resellers !== null && typeof resellers ===
//       "object" && !Array.isArray(resellers)` catches a PostgREST config
//       flip from to-one to to-many that returns the embed as an array;
//   (b) `typeof embed.code === "string"` catches a projection drop of code
//       from the resellers(...) embed at route.ts:44 or a schema-side
//       column-type flip;
//   (c) `RESELLER_CODE_RE.test(embed.code)` catches a normaliser regression
//       at admin-create time (admin-validator.ts) or a schema-side change
//       that removed the UPPERCASE convention — mirrors the tick 231
//       option (j) VALUE-tighten on admin-requests-list-authz.spec.ts:468
//       so a drift here surfaces symmetrically across both admin surfaces;
//   (d) `typeof embed.display_name === "string"` catches a projection drop
//       of display_name from the embed — display_name has no VALUE
//       invariant (free text per 0091:25) so it stays as typeof string only,
//       identical to the sibling pin at admin-requests-list-authz.spec.ts:469.
// Fires ONLY after the tick-272 requested_by pin (deny + cancel) or the
// tick-273 linked_credit_transaction_id pin (approve) has passed on the same
// read-back row so tighter existing pins surface first. Coverage-per-guard
// posture: green-path fixtures always seed a real resellers row via
// loadTempReseller / loadAdminHarness so all three surfaces exercise the
// full four-part guard on every CI pass — no zero-coverage-per-guard risk.
// The 0095:27 ON DELETE RESTRICT semantics guarantee the parent reseller
// cannot be deleted mid-fixture, so a null/undefined/array read-back here
// would surface a bona-fide route or projection regression rather than a
// fixture race.
//
// Tick 273 — linked_credit_transaction_id UUID wire-shape pin added as the
// ninth per-column pin. Unlike tick 265-272's symmetric-across-three-surfaces
// pins, this one is ASYMMETRIC single-surface: only the approve-block read-
// back carries a non-null UUID here. The deny + cancel blocks already pin
// `linked_credit_transaction_id === null` at line 575 + 1038 respectively per
// the ck_credit_link CHECK at 0095:48-51 which permits a non-null value ONLY
// when request_type='over_budget_approval' AND status='approved'. The
// PATCH-response envelope at route.ts:317-319 already pins the same UUID via
// linkedTxId at line 1494-1496 (typeof-string + UUID_RE); this pin closes
// the same contract against the list route's SELECT column projection at
// /api/admin/resellers/requests/route.ts:44 — a projection drop of
// linked_credit_transaction_id there would still let the PATCH echo the
// value back on the write envelope but would fail the read-back here.
// Reuses the module-scope UUID_RE (line 139-140) rather than adding a ninth
// constant — same invariant as the tick-266 decision_by + tick-271
// reseller_id + tick-272 requested_by pins (all four are uuid columns per
// 0095:27-28 + 0095:34 + 0095:37; all four stamp UUID strings via PostgREST
// serialisation). Two-part guard mirrors the sibling UUID pins: typeof-
// string (catches a column-type flip from uuid to say a bigint would surface
// as a number here, or a route regression that stripped
// linked_credit_transaction_id from the list SELECT's column projection
// where it is the tenth column — would fail the guard because undefined is
// not a string) + UUID_RE (a drift in the uuid serialisation shape from
// PostgREST or a route regression that returned a placeholder-string value
// would fail the regex match). Pin fires ONLY after the tick-272
// requested_by pin has passed on the same read-back row so tighter existing
// pins surface first. The 0095:37 ON DELETE SET NULL semantics mean the
// referenced credit_transactions row COULD vanish mid-fixture leaving the
// linked_credit_transaction_id null again — but the fixture's
// attachApproveTarget() snapshot-restore posture (see line 78-84 module-
// scope block) guarantees the credit_transactions row lives from the PATCH
// through the very next GET in the same test, so a null read-back here
// would surface a bona-fide route or projection regression rather than a
// fixture race. Coverage-per-guard posture: green-path fixtures only seed
// over_budget_approval approve targets today (code_request approve is
// blocked on Stripe test-mode wiring per line 72-74) so this pin exercises
// exactly the branch the ck_credit_link CHECK permits — the enum
// exclusivity is verified by the deny + cancel null pins at line 575 + 1038.
//
// Tick 272 — requested_by UUID wire-shape pin added as the eighth per-column
// pin on the same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.requested_by is a `uuid NOT NULL REFERENCES
// public.app_users(id) ON DELETE RESTRICT` column at 0095:28 — populated at
// INSERT time by the reseller-side POST /api/reseller/requests handler and
// never touched by any PATCH branch (deny + cancel + approve at route.ts:305-
// 320 stamp only status + decision_by + decision_at + decision_reason +
// linked_credit_transaction_id + linked_promotion_code_id), so the read-back
// MUST carry a non-null UUID string here on every green-path CI run
// regardless of which PATCH branch fired. Two-part guard mirrors the
// tick-266 decision_by + tick-271 reseller_id pins: typeof-string (catches a
// column-type flip from uuid to say a bigint would surface as a number here,
// or a route regression that stripped requested_by from the list SELECT's
// column projection at /api/admin/resellers/requests/route.ts:43 — where
// requested_by is the third column in the projection list — would fail the
// guard because undefined is not a string) + UUID_RE (a drift in the uuid
// serialisation shape from PostgREST or a route regression that returned a
// placeholder-string value would fail the regex match). Reuses the module-
// scope UUID_RE (line 139-140) rather than adding a ninth constant — same
// invariant as the tick-266 decision_by + tick-271 reseller_id pins (all
// three are uuid columns per 0095:27-28 + 0095:34; all three stamp UUID
// strings via PostgREST serialisation). Pin fires ONLY after the tick-271
// reseller_id UUID pin has passed on the same read-back row so tighter
// existing pins surface first. The 0095:28 ON DELETE RESTRICT semantics
// guarantee the app_users row this request points at cannot vanish
// mid-fixture, so a null read-back here would surface a bona-fide route or
// projection regression rather than a fixture race.
//
// Tick 271 — reseller_id UUID wire-shape pin added as the seventh per-column
// pin on the same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.reseller_id is a `uuid NOT NULL REFERENCES
// public.resellers(id) ON DELETE RESTRICT` column at 0095:27 — populated at
// INSERT time and never touched by any PATCH branch (the deny + cancel +
// approve branches at route.ts:305-320 only stamp status + decision_by +
// decision_at + decision_reason + linked_credit_transaction_id +
// linked_promotion_code_id), so the read-back MUST carry a non-null UUID
// string here on every green-path CI run regardless of which PATCH branch
// fired. Two-part guard mirrors the tick-266 decision_by pin: typeof-string
// (catches a column-type flip from uuid to say a bigint would surface as a
// number here) + UUID_RE (a drift in the uuid serialisation shape or a route
// regression that stripped reseller_id from the list SELECT's column
// projection at /api/admin/resellers/requests/route.ts:44 would fail the
// regex match — the projection at route.ts:44 explicitly lists reseller_id
// as the second column so a drop would be visible). Reuses the module-scope
// UUID_RE (line 139-140) rather than adding a ninth constant — same
// invariant as the tick-266 decision_by pin. Pin fires ONLY after the tick-
// 270 status enum pin has passed on the same read-back row so tighter
// existing pins surface first. The 0095:27 ON DELETE RESTRICT semantics
// guarantee the reseller row this request points at cannot vanish
// mid-fixture, so a null read-back here would surface a bona-fide route or
// projection regression rather than a fixture race.
//
// Tick 270 — status enum value pin added as the sixth per-column pin on the
// same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.status is a NOT NULL text column DEFAULT 'pending'
// (0095:31-32) with a CHECK constraint pinning it to one of four enum values
// ('pending','approved','denied','cancelled'); the validator side mirrors the
// terminal three at web/src/lib/reseller/requests.ts:17-21 (ResellerRequestStatus
// union) and the admin route mirrors all four at /api/admin/resellers/requests/
// route.ts:13 (ALLOWED_STATUS set). New eighth module-scope constant
// ALLOWED_STATUS_VALUES echoes all three source-of-truth sites verbatim so a
// widening/narrowing of the enum at any site surfaces here on the next CI
// pass. Three-part guard: (a) typeof-string (catches a column-type flip from
// text to something else, or a route regression that stripped status from the
// list SELECT's column projection at route.ts:44 — which would fail the guard
// because undefined is not a string), (b) ALLOWED_STATUS_VALUES.has() set
// membership (catches a DB-level enum drift where the CHECK constraint at
// 0095:32 gains a fifth value that the spec did not track, or a route
// regression that returned a stale/mismatched status value), (c) exact-string
// equality against the block-specific expected value ('denied'/'cancelled'/
// 'approved' per the branch). Complements the existing PATCH-response pins at
// line 469 (deny) / 843 (cancel) / 1231 (approve) by closing the same contract
// against the list route's SELECT + .eq('status', status) filter path at
// /api/admin/resellers/requests/route.ts:39+46 — a route regression that
// silently ignored the ?status= filter and returned rows with mixed statuses
// would echo the correct value on the PATCH write envelope but would fail the
// exact-equality check here whenever the list returned a wrong-status row for
// the matching id (typically zero-probability since the row was PATCHed just
// before, but this pin still catches the ?status= filter contract for any
// regression that broke it). Fires ONLY after the tick-269 request_type
// enum pin has passed on the same read-back row so tighter existing pins
// surface first. Zero-coverage-per-guard posture: green-path fixtures never
// exercise status='pending' on the read-back path (pending is the pre-PATCH
// state; the three read-back surfaces filter for denied/cancelled/approved
// respectively) so the pending enum value is never actually pinned here on
// the wire, but the ALLOWED_STATUS_VALUES set still forbids a
// route-regression drift to a non-enum string, which is what the pin
// catches.
//
// Tick 269 — request_type enum value pin added as the fifth per-column pin
// on the same three post-PATCH read-back rows (deny + cancel + approve).
// reseller_requests.request_type is a NOT NULL text column (0095:29-30) with
// a CHECK constraint pinning it to one of three enum values ('code_request',
// 'over_budget_approval', 'collateral_approval'); the validator side mirrors
// the same set at web/src/lib/reseller/requests.ts:12-15 (ResellerRequestType
// union) and 218-221 (invalid_request_type gate). New seventh module-scope
// constant ALLOWED_REQUEST_TYPES echoes both source-of-truth sites verbatim
// so a widening/narrowing of the enum at either site surfaces here on the
// next CI pass. Two-part guard: (a) typeof-string (catches a column-type
// flip from text to something else, or a route regression that stripped
// request_type from the list SELECT's column projection at route.ts:44 —
// which would fail the guard because undefined is not a string), (b)
// ALLOWED_REQUEST_TYPES.has() set membership (catches a DB-level enum drift
// where the CHECK constraint at 0095:30 gains a fourth value that the
// spec did not track, or a route regression that returned a stale/mismatched
// request_type value that no longer maps to the discriminated-union branches
// below at lines ~625/1000/1436). Complements the discriminated-union pin
// below by ensuring the request_type key is present + within the enum
// BEFORE the switch statement runs — today a null/undefined/stale value
// silently skips all three branches so a route regression that dropped
// request_type from the SELECT would light up no assertion. Fires ONLY
// after the tick-268 decision_reason pin has passed on the same read-back
// row so tighter existing pins surface first. Pin is not backed by the
// discriminated-union branches (which are zero-coverage on code_request +
// collateral_approval today) — this is a pure column-level pin that runs
// on every read-back row regardless of which request_type the fixture
// seeded, so all three surfaces exercise the pin on every green-path CI
// run. Zero-coverage-per-guard risk on the enum values themselves —
// green-path fixtures only seed over_budget_approval so the code_request
// + collateral_approval enum values are never exercised as the actual
// wire value, but the ALLOWED_REQUEST_TYPES set still forbids a
// route-regression drift to a non-enum string here, which is what the
// pin catches.
const ALLOWED_TIER_PCT_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_REQUEST_TYPES = new Set([
  "code_request",
  "over_budget_approval",
  "collateral_approval",
]);
const ALLOWED_STATUS_VALUES = new Set([
  "pending",
  "approved",
  "denied",
  "cancelled",
]);
// Tick 274 — resellers.code UPPERCASE-slug invariant mirrors normaliseResellerCode()
// at web/src/lib/reseller/admin-validator.ts and the sibling RESELLER_CODE_RE
// hoists in admin-requests-list-authz.spec.ts:91 + admin-resellers-list-authz.spec
// .ts:81. Used by the tick-274 resellers-join projection pin on the three post-
// PATCH read-back rows below (see the module-scope tick-274 comment for full
// rationale). Kept as a module-scope constant for parity with the other
// enum/regex hoists — whenever the validator-side invariant exists, the spec
// echoes it verbatim rather than re-deriving inline.
const RESELLER_CODE_RE = /^[A-Z0-9]+$/;

// Tick 359 — reseller_requests-row ck_decision_shape cross-column
// invariant summary hoist. Executes tick 358 next-pick option (a)
// verbatim: rotate to a wholly new cluster (reseller_requests[]) on
// a wholly new surface family (admin-requests-*.spec.ts) since the
// summary-lens sweep that tick 358 completed across both detail
// surfaces (admin-reseller-detail-authz + admin-reseller-detail-
// validation) did NOT touch the admin-requests-* family at all.
// This is the FIRST module-scope cross-column invariant summary on
// this surface — none of the reseller_requests-cluster ck_* CHECK
// constraints (ck_decision_shape / ck_credit_link / ck_promo_link)
// have been hoisted to a module-scope doc-block on either admin-
// requests-list-authz or admin-requests-patch-authz today. The tick
// 265-282 per-column pin doc-blocks above (decision_at ISO / decision_
// by UUID / created_at ISO / decision_reason value / resellers-join
// projection) narrate their halves of the shape inline — tick 265
// mentions "ck_decision_shape at 0095:41-45 requires decision_at NON-
// NULL when status ∈ approved/denied/cancelled and permits NULL only
// when status='pending'" and tick 266 mentions "ck_decision_shape
// permits decision_by to be null when status ∈ approved/denied/
// cancelled — only decision_at is required to be non-null in those
// states, but the PATCH route always stamps decision_by:user.id at
// route.ts:309 for all three branches" — but the SUMMARY view naming
// ALL THREE columns (status + decision_by + decision_at) + the single
// CHECK constraint they all key off + the application write-path
// stamper has never lived at module-scope in a form a future rotation
// could lift from without re-reading ticks 265 + 266 + the reseller_
// requests-row schema + the PATCH route in full. Hoisting closes the
// reseller_requests-row cross-column-invariant cluster into its
// symmetric summary state on THIS surface, matching the tick 358
// promotion_codes[] tier ⇔ stripe-id disjunction summary + the tick
// 357 resellers-row ck_wholesale_gst_required summary + the tick 355
// admins[] lifecycle + attributions_summary by_source summaries on
// the sibling detail-validation surface. No new imports, no new
// module-scope const, no per-column assert added, no fixture change,
// no route change — the inline per-column pins across the three
// post-PATCH read-back rows (deny + cancel + approve) plus the
// module-scope constants at rows 460-472 are already the runtime
// enforcement; this hoist is a documentation-only close-out lift.
//
// Cross-column invariant summary — reseller_requests.{status,
// decision_by, decision_at, decision_reason} ⇔ ck_decision_shape
//   Writer-side source: reseller_requests table DB CHECK
//   ck_decision_shape at
//   web/supabase/migrations/0095_reseller_requests.sql:41-45 enforces
//   the disjunction
//     (status = 'pending'
//        AND decision_by IS NULL
//        AND decision_at IS NULL)
//     OR
//     (status IN ('approved','denied','cancelled')
//        AND decision_at IS NOT NULL)
//   i.e. pending rows MUST carry both decision columns as NULL, and
//   any row whose status flips to a terminal enum member MUST carry
//   decision_at as non-null (decision_by is permitted to be NULL at
//   the DB level per the CHECK — the FK reference at 0095:34 declares
//   ON DELETE SET NULL so a decided-then-orphaned admin row would
//   legally sit at decision_by IS NULL / decision_at NOT NULL / status
//   IN terminal). The sibling ck_credit_link (0095:48-51) and
//   ck_promo_link (0095:52-55) CHECKs are orthogonal single-column
//   guards on linked_credit_transaction_id + linked_promotion_code_id
//   — each of those may only be non-null in the (request_type,status)
//   permutation the linked artifact belongs to — and are covered by
//   the tick-273 linked_credit_transaction_id pin on the approve
//   read-back row here + the module-scope tick 271/272 companion pins
//   below.
//   Application write path: validateAdminDecision() at
//   web/src/lib/reseller/requests.ts:276-304 rejects the mutation
//   with reason='already_decided' whenever current.status !==
//   'pending' (285) so the ONLY green branch through the validator
//   is a pending → terminal transition. The PATCH route at
//   web/src/app/api/admin/resellers/requests/[id]/route.ts:305-320
//   then stamps decision_by:user.id + decision_at:now + status:
//   decision.status inside a SINGLE UPDATE with an
//   .eq("id", current.id).eq("status", "pending") WHERE guard so a
//   concurrent second PATCH racing the same row returns 0 rows and
//   surfaces as reason='update_failed' at HTTP 500. This is the
//   ONLY application-layer stamper on decision_by + decision_at —
//   the DB CHECK is the last line of defence, so a route refactor
//   that stamped decision_at without decision_by (permitted by the
//   CHECK) OR a direct-SQL admin action that skipped the route
//   entirely and set status='approved' without decision_at (rejected
//   by the CHECK) would each be caught: the CHECK at 0095:41-45
//   rejects the second case; the .eq("status","pending") WHERE guard
//   at route.ts:316 + the always-both-columns stamp at 309-310 give
//   the first case a coverage floor via the pending idempotency test
//   (once the row has flipped to terminal a re-PATCH returns
//   already_decided at 409 before touching either column).
//   Read path: projected via
//   "id, reseller_id, request_type, status, payload, decision_by,
//    decision_at, decision_reason, ..."
//   on the admin list route at
//   web/src/app/api/admin/resellers/requests/route.ts:44 — all four
//   coupled columns come out on the wire on every default status=
//   pending list GET (which returns the seeded row before the PATCH)
//   AND on every read-back GET that a follow-on ?status=approved /
//   ?status=denied / ?status=cancelled filter surfaces after the
//   PATCH lands. The PATCH response envelope itself projects a
//   narrower "id, status, decision_at, decision_reason, linked_
//   credit_transaction_id, linked_promotion_code_id" tuple at
//   route.ts:317-319 (omits decision_by from the PATCH envelope on
//   purpose — the write is stamped and the reseller-facing surface
//   doesn't need the admin's user id) so the invariant is
//   observable on TWO admin surfaces: the PATCH-write echo (three
//   of four columns) and the list-route follow-up GET (all four
//   columns).
//   Runtime enforcement in this spec: per-column pins across the
//   THREE post-PATCH read-back rows (deny + cancel + approve) at
//     - tick 265 (decision_at typeof-string + ISO_TIMESTAMP_RE, one
//       pin per branch on the read-back rows below)
//     - tick 266 (decision_by typeof-string + UUID_RE)
//     - tick 268 (decision_reason typeof-string + length ≤ REASON_MAX
//       + exact-string equality against the probe)
//     - tick 271-273 discriminated-union pins on the four terminal
//       transitions (deny + cancel branches on over_budget_approval;
//       approve branch on over_budget_approval)
//   fire on every green CI run where loadAdminHarness resolves + the
//   wave-3 seed rows (155, 155-b, over_budget_approval) are
//   available. Neither the deny nor cancel branch has an inline
//   cross-column if/else assert (unlike the linked_credit/promo
//   discriminated-union pin below which DOES branch on status) —
//   because the per-column pins on decision_at + decision_by +
//   decision_reason are sufficient to surface any single-column
//   drift, and the terminal-status enum pin at status ∈ ALLOWED_
//   STATUS_VALUES fires on the third column of the tuple regardless
//   of branch.
//   Coverage-per-guard posture: the deny + cancel + approve blocks
//   BELOW each fire once per green CI run against qa-admin-1's
//   harness — three probes, one per branch, so all four coupled
//   columns exercise their NON-NULL branch (decision_at set,
//   decision_by set, decision_reason set to the branch-specific
//   probe, status set to the branch-specific terminal enum) on
//   every pass. The NULL branch of the invariant (status='pending'
//   AND decision_by IS NULL AND decision_at IS NULL) exercises via
//   the wave-3 row 155 pending over_budget_approval seed which the
//   list-route enumeration surfaces BEFORE the PATCH — see the tick
//   281 module-scope doc-block on admin-requests-list-authz.spec.ts
//   for the coverage rationale on the pending side.
//   Symmetric-cluster posture: this summary hoist mirrors the tick
//   357 resellers-row cross-column ck_wholesale_gst_required
//   summary + the tick 358 promotion_codes[] cross-column ck_stripe
//   _objects_by_tier summary — all three are per-cluster close-out
//   summaries naming a single CHECK/write-path invariant that
//   couples multiple projected columns. Distinct from ticks 357 +
//   358 in ONE dimension: this invariant is on the reseller_
//   requests-row cluster (single row per PATCH) rather than the
//   resellers-row cluster or the promotion_codes[] child-row array,
//   and lives on the admin-requests-* surface family which has never
//   carried a module-scope cross-column invariant summary before —
//   so this hoist opens a new symmetric-cluster axis rather than
//   completing an existing one. Follow-on ticks can extend along
//   two dimensions: (i) hoist companion summaries for ck_credit_link
//   + ck_promo_link on this same file so the reseller_requests-row
//   cluster reaches three-summary parity with the detail-authz
//   detail-route slot count (five per surface); (ii) cross-surface
//   twin hoist onto admin-requests-list-authz.spec.ts so the ck_
//   decision_shape summary reaches two-surface parity with the
//   detail-* pair; (iii) rotate to the reseller-side surface
//   reseller-requests-list-authz.spec.ts + requests-authz.spec.ts +
//   requests-validation.spec.ts for reseller-scope twins.

// Tick 360 — reseller_requests-row ck_credit_link cross-column invariant
// summary hoist. Executes tick 359 next-pick option (a) verbatim:
// hoist the companion summary for the sibling ck_credit_link CHECK on
// the SAME admin-requests-patch-authz.spec.ts surface tick 359 opened
// the ck_decision_shape summary on. Second of three reseller_requests-
// cluster invariant summaries this surface can carry (ck_decision_shape
// landed at tick 359; ck_promo_link pending at follow-on tick). Extends
// the tick 359 axis rather than opening a new one — same surface, same
// row-cluster, different CHECK constraint — so the doc-block cross-
// references the tick 359 header and its writer-side / write-path /
// read-path anchors rather than re-deriving the reseller_requests
// column-set discovery from scratch.
//
// Cross-column invariant summary — reseller_requests.{request_type,
// status, linked_credit_transaction_id} ⇔ ck_credit_link
//   Writer-side source: reseller_requests table DB CHECK
//   ck_credit_link at
//   web/supabase/migrations/0095_reseller_requests.sql:48-51 enforces
//   the disjunction
//     linked_credit_transaction_id IS NULL
//     OR (request_type = 'over_budget_approval' AND status = 'approved')
//   i.e. only over_budget_approval requests that reached the approved
//   terminal state may carry a non-null linked_credit_transaction_id
//   (uuid REFERENCES credit_transactions(id) ON DELETE SET NULL at
//   0095:37). The other two request_type enum values (code_request +
//   collateral_approval per the CHECK at 0095:30) and the other three
//   status enum values (pending + denied + cancelled per the CHECK at
//   0095:32) MUST leave linked_credit_transaction_id null on the wire.
//   The sibling ck_promo_link (0095:52-55) is the mirror constraint
//   on linked_promotion_code_id: permits non-null ONLY on
//   request_type='code_request' AND status='approved'. Together the
//   two link-column CHECKs form an XOR partition across the
//   request_type dimension — an over_budget_approval approval can
//   only stamp linked_credit_transaction_id (never linked_promotion_
//   code_id), and a code_request approval can only stamp linked_
//   promotion_code_id (never linked_credit_transaction_id). This is
//   an emergent property of the two orthogonal CHECKs; there is no
//   single CHECK enforcing the XOR directly, so a schema-side
//   regression that widened either ck_*_link to permit both link
//   columns non-null on the same request row would slip past the
//   individual CHECKs but would surface here via the deny + cancel
//   null pins (see runtime enforcement below).
//   Application write path: the PATCH route at
//   web/src/app/api/admin/resellers/requests/[id]/route.ts:99 declares
//   linkedCreditTransactionId as `let ... : string | null = null` so
//   the default is null. The over_budget_approval approve branch at
//   route.ts:209-303 (a) reads credit_balances for the payload target,
//   (b) upserts the balance + lifetime_earned, (c) INSERTs a
//   credit_transactions row with reason='reseller_grant_over_budget'
//   and returns the new id, (d) writes txRow.id into
//   linkedCreditTransactionId at route.ts:278, (e) INSERTs the
//   reseller_credit_grants mirror row (kind=grant, over_budget=true).
//   The single UPDATE at route.ts:305-320 stamps
//   linked_credit_transaction_id: linkedCreditTransactionId alongside
//   status + decision_by + decision_at + decision_reason inside the
//   same PATCH so ck_decision_shape and ck_credit_link (and the null
//   ck_promo_link on the other side of the XOR) all move atomically.
//   The code_request approve branch at route.ts:102-207 leaves
//   linkedCreditTransactionId at its null default (only touches
//   linkedPromotionCodeId); the collateral_approval approve branch
//   leaves BOTH link columns null; the deny + cancel branches skip
//   ALL side-effect blocks and leave both link columns null. So the
//   only application code path that produces a non-null linked_
//   credit_transaction_id is the over_budget_approval approve branch,
//   matching exactly the enum permutation ck_credit_link permits.
//   Read path: projected via
//   "..., linked_credit_transaction_id, linked_promotion_code_id, ..."
//   on the admin list route at
//   web/src/app/api/admin/resellers/requests/route.ts:44 as columns
//   10 + 11 of the twelve-column SELECT projection. The PATCH
//   response envelope at route.ts:317-319 projects the same two link
//   columns alongside id + status + decision_at + decision_reason so
//   the invariant is observable on TWO admin surfaces per PATCH: the
//   PATCH-write echo (five-column tuple including both link columns)
//   AND the list-route follow-up GET (twelve-column tuple including
//   both link columns).
//   Runtime enforcement in this spec: three per-branch pins on
//   linked_credit_transaction_id across the deny + cancel + approve
//   PATCH-branch read-back rows —
//     - deny branch (line ~1214): asserts linked_credit_transaction_id
//       is null on the PATCH-response envelope AND the follow-up read-
//       back row (see the tick block header at line 705-709 — "Do NOT
//       pin linked_credit_transaction_id / linked_promotion_code_id
//       — both are null for the deny branch"). Pins the ck_credit_
//       link NULL branch: request_type='over_budget_approval' AND
//       status='denied' → linked_credit_transaction_id MUST be null.
//     - cancel branch (line ~1038 per the tick-273 doc block
//       reference): mirror null pin on the cancelled read-back. Pins
//       the same NULL branch: request_type='over_budget_approval' AND
//       status='cancelled' → linked_credit_transaction_id MUST be null.
//     - approve branch (line 1810-1812 on PATCH-response envelope +
//       line 2105 on list-route read-back): typeof-string + UUID_RE
//       pin per tick 273 doc-block. Pins the ck_credit_link NON-NULL
//       branch: request_type='over_budget_approval' AND
//       status='approved' → linked_credit_transaction_id MUST be a
//       UUID string.
//   The three pins together cover ALL FOUR permutations of the
//   coupled columns on the over_budget_approval fixture path (pending
//   read-back covered by the wave-3 row 155 seed on admin-requests-
//   list-authz.spec.ts before the PATCH lands; the pending-side null
//   pin lives on the list surface per the tick 273 coverage-per-guard
//   note). code_request + collateral_approval enum branches are
//   zero-coverage-per-guard today (green-path fixtures only seed
//   over_budget_approval per the tick 273 coverage-per-guard note at
//   line 326-330 — "green-path fixtures only seed over_budget_
//   approval approve targets today (code_request approve is blocked
//   on Stripe test-mode wiring per line 72-74)"); the ck_credit_link
//   CHECK is the last line of defence for those two enum branches
//   until P8.5 unblocks and Stripe test-mode fixtures land.
//   Coverage-per-guard posture: matches the tick 359 ck_decision_
//   shape summary posture in shape — deny + cancel + approve probes
//   exercise the three terminal-status branches on every green CI
//   run; pending branch covered by the wave-3 seed on the sibling
//   list surface. Distinct from tick 359 in ONE dimension: the ck_
//   decision_shape invariant is symmetric across all three terminal
//   status enum values (each fires the same NON-NULL branch), while
//   ck_credit_link is ASYMMETRIC — only the approve branch fires the
//   NON-NULL branch; deny + cancel fire the NULL branch (same
//   asymmetry the tick 273 doc-block already narrates inline for the
//   per-column pin). So this summary hoist inherits the tick 273
//   asymmetric-fixture posture rather than the tick 359 symmetric-
//   fixture posture.
//   Symmetric-cluster posture: this summary hoist extends the tick
//   359 reseller_requests-row cross-column-invariant sweep on THIS
//   file — the row-cluster now carries 2/3 possible summaries (ck_
//   decision_shape landed at tick 359; ck_credit_link landing at
//   this tick 360; ck_promo_link pending at follow-on tick). Distinct
//   from tick 359 in TWO dimensions: (i) opens the second summary
//   on the SAME surface rather than a new surface — matches the tick
//   354/355 detail-authz double-summary rather than the tick 357/358
//   detail-{authz,validation} cross-surface twin; (ii) the invariant
//   couples three columns (request_type + status + linked_credit_
//   transaction_id) across two dimensions of the enum space (the
//   3-way request_type enum + the 4-way status enum) rather than
//   the tick 359 three-column shape across one dimension (the 4-way
//   status enum only) — so the CHECK's null branch surfaces on 11
//   of 12 (request_type, status) permutations while the non-null
//   branch surfaces on 1 of 12. Follow-on ticks can extend along
//   the same two dimensions as tick 359's next-pick options:
//   (i) hoist the ck_promo_link companion summary on this same file
//   to close the reseller_requests-cluster three-summary parity;
//   (ii) cross-surface twin hoist onto admin-requests-list-authz.
//   spec.ts so the ck_credit_link summary reaches two-surface parity
//   with the detail-* pair; (iii) rotate to reseller-side surfaces
//   for reseller-scope twins.

// Tick 361 — reseller_requests-row ck_promo_link cross-column invariant
// summary hoist. Executes tick 360 next-pick option (a) verbatim:
// hoist the companion summary for the sibling ck_promo_link CHECK on
// the SAME admin-requests-patch-authz.spec.ts surface tick 359 opened
// the ck_decision_shape summary + tick 360 opened the ck_credit_link
// summary on. Third and final of three reseller_requests-cluster
// invariant summaries this surface can carry (ck_decision_shape landed
// at tick 359; ck_credit_link landed at tick 360; ck_promo_link
// landing here). Closes the reseller_requests-cluster three-summary
// parity on this surface — matches the five-per-surface detail-* pair
// parity ticks 354 + 355 + 357 + 358 reached across both admin-
// reseller-detail-authz + admin-reseller-detail-validation surfaces
// (resellers-row + promotion_codes[] + commissions[] + admins[] +
// attributions_summary), scaled to the three-CHECK-constraint width
// the reseller_requests row has (ck_decision_shape + ck_credit_link +
// ck_promo_link at 0095:41-45 / 48-51 / 52-55 respectively). Extends
// the tick 359 + 360 axis rather than opening a new one — same
// surface, same row-cluster, third and final CHECK constraint on the
// row — so the doc-block cross-references the tick 359 header + tick
// 360 header + the tick 271/272 inline per-column pin narration
// rather than re-deriving the reseller_requests column-set discovery
// from scratch.
//
// Cross-column invariant summary — reseller_requests.{request_type,
// status, linked_promotion_code_id} ⇔ ck_promo_link
//   Writer-side source: reseller_requests table DB CHECK
//   ck_promo_link at
//   web/supabase/migrations/0095_reseller_requests.sql:52-55 enforces
//   the disjunction
//     linked_promotion_code_id IS NULL
//     OR (request_type = 'code_request' AND status = 'approved')
//   i.e. only code_request rows that reached the approved terminal
//   state may carry a non-null linked_promotion_code_id (uuid
//   REFERENCES reseller_promotion_codes(id) ON DELETE SET NULL at
//   0095:38). The other two request_type enum values (over_budget_
//   approval + collateral_approval per the CHECK at 0095:30) and the
//   other three status enum values (pending + denied + cancelled per
//   the CHECK at 0095:32) MUST leave linked_promotion_code_id null on
//   the wire. The sibling ck_credit_link (0095:48-51) is the mirror
//   constraint on linked_credit_transaction_id: permits non-null ONLY
//   on request_type='over_budget_approval' AND status='approved'.
//   Together the two link-column CHECKs form an XOR partition across
//   the request_type dimension per the tick 360 summary block above —
//   an over_budget_approval approval can only stamp linked_credit_
//   transaction_id (never linked_promotion_code_id), and a code_
//   request approval can only stamp linked_promotion_code_id (never
//   linked_credit_transaction_id). Landing this third summary makes
//   the XOR partition observable at module scope on this surface: the
//   tick 360 ck_credit_link block narrates the over_budget_approval
//   half of the XOR + this tick's ck_promo_link block narrates the
//   code_request half, so future rotations can lift the emergent XOR
//   from a single-file read rather than reconstructing it from the
//   two orthogonal CHECKs at 0095:48-51 + 0095:52-55.
//   Application write path: the PATCH route at
//   web/src/app/api/admin/resellers/requests/[id]/route.ts:100 declares
//   linkedPromotionCodeId as `let ... : string | null = null` so the
//   default is null. The code_request approve branch at route.ts:
//   102-207 (a) reads reseller.code from the resellers table
//   (route.ts:115-125), (b) calls decideCodeMint({reseller, tierPct,
//   suggestedSuffix, resellerRequestId}) at route.ts:127-135 which
//   dispatches attribution_only (tier 0) vs stripe_mint (tier 10/20/
//   30/40) per the tick 336 promotion-code-mint helper, (c) checks
//   for an existing (reseller_id, tier_pct) row on reseller_promotion_
//   codes at route.ts:137-152 so a double-approval reuses the existing
//   row.id (idempotent), (d) on new mints ONLY: calls ensureStripeCoupon
//   + stripe.promotionCodes.create at route.ts:157-181 (tier 0 skips
//   Stripe entirely per the ck_stripe_objects_by_tier CHECK on the
//   sibling promotion_codes table narrated in the tick 358 summary
//   block on admin-reseller-detail-* twins), (e) INSERTs the
//   reseller_promotion_codes row at route.ts:183-194 and assigns the
//   returned row.id into linkedPromotionCodeId at route.ts:205. The
//   single UPDATE at route.ts:305-320 stamps linked_promotion_code_id:
//   linkedPromotionCodeId alongside status + decision_by + decision_at
//   + decision_reason + linked_credit_transaction_id inside the same
//   PATCH so all three ck_* constraints (ck_decision_shape + ck_
//   credit_link + ck_promo_link) move atomically. The over_budget_
//   approval approve branch at route.ts:209-303 leaves
//   linkedPromotionCodeId at its null default (only touches
//   linkedCreditTransactionId); the collateral_approval approve
//   branch leaves BOTH link columns null; the deny + cancel branches
//   skip ALL side-effect blocks and leave both link columns null. So
//   the only application code path that produces a non-null linked_
//   promotion_code_id is the code_request approve branch, matching
//   exactly the enum permutation ck_promo_link permits.
//   Read path: projected via
//   "..., linked_credit_transaction_id, linked_promotion_code_id, ..."
//   on the admin list route at
//   web/src/app/api/admin/resellers/requests/route.ts:44 as column 11
//   of the twelve-column SELECT projection (immediately adjacent to
//   the ck_credit_link column that tick 360 pinned). The PATCH
//   response envelope at route.ts:317-319 projects the same two link
//   columns alongside id + status + decision_at + decision_reason so
//   the invariant is observable on TWO admin surfaces per PATCH: the
//   PATCH-write echo (five-column tuple including both link columns)
//   AND the list-route follow-up GET (twelve-column tuple including
//   both link columns).
//   Runtime enforcement in this spec: three per-branch NULL pins on
//   linked_promotion_code_id across the deny + cancel + approve
//   PATCH-branch read-back rows —
//     - deny branch (line ~982 on PATCH-response envelope inside the
//       deny happy-path assertion — "linked_promotion_code_id ===
//       null" — plus its list-route follow-up read-back mirror per the
//       tick 273 doc-block reference at line 705-709 — "Do NOT pin
//       linked_credit_transaction_id / linked_promotion_code_id —
//       both are null for the deny branch"). Pins the ck_promo_link
//       NULL branch: request_type='over_budget_approval' AND
//       status='denied' → linked_promotion_code_id MUST be null.
//     - cancel branch (line ~1474 on PATCH-response envelope inside
//       the cancel happy-path assertion — "linked_promotion_code_id
//       === null"): mirror NULL pin on the cancelled read-back. Pins
//       the same NULL branch: request_type='over_budget_approval'
//       AND status='cancelled' → linked_promotion_code_id MUST be
//       null.
//     - approve branch (line ~1963 on PATCH-response envelope inside
//       the over_budget_approval approve happy-path assertion —
//       "linked_promotion_code_id === null" — see the coverage-vs-
//       duplication call block at line 1802-1812 which explicitly
//       notes "body.request.linked_promotion_code_id === null (over_
//       budget_approval approve NEVER mints a promotion_code — that
//       path is code_request only)"). Pins the ck_promo_link NULL
//       branch on the ORTHOGONAL enum-crossing case: request_type=
//       'over_budget_approval' AND status='approved' → linked_
//       promotion_code_id MUST be null. This third pin is the
//       coverage floor that catches a regression that folded
//       promotion_code stamping into the over_budget branch — the
//       tick 273 approve-block header at line 351-368 already narrates
//       this exact catch inline.
//   All three pins fire the NULL branch of the ck_promo_link CHECK on
//   every green CI run. The NON-NULL branch (request_type=
//   'code_request' AND status='approved' → linked_promotion_code_id
//   MUST be a UUID string) is ZERO-COVERAGE-PER-GUARD today for the
//   same reason the code_request enum branch is zero-coverage on the
//   ck_credit_link summary at tick 360 — green-path fixtures only
//   seed over_budget_approval targets per the tick 273 coverage-per-
//   guard note at line 326-330 ("green-path fixtures only seed over_
//   budget_approval approve targets today (code_request approve is
//   blocked on Stripe test-mode wiring per line 72-74)"). So the ck_
//   promo_link CHECK is the last line of defence for the code_request
//   approve permutation until P8.5 unblocks and Stripe test-mode
//   fixtures land — a route regression that widened the over_budget
//   branch to stamp linked_promotion_code_id would trip the three
//   NULL pins above, and a route regression that widened the deny +
//   cancel branches to stamp linked_promotion_code_id on any request
//   type would trip the same pins.
//   Coverage-per-guard posture: matches the tick 360 ck_credit_link
//   ASYMMETRIC-fixture posture rather than the tick 359 ck_decision_
//   shape SYMMETRIC-fixture posture — deny + cancel + approve probes
//   all fire the NULL branch (over_budget_approval NEVER mints a
//   promo code), so the three pins probe the same branch of the
//   CHECK on every green CI run. Distinct from tick 360 in ONE
//   dimension: the ck_credit_link ASYMMETRY has the approve branch
//   firing the NON-NULL branch of the CHECK (only 1-of-3 terminal-
//   status probes hits NULL); the ck_promo_link ASYMMETRY here has
//   ALL THREE terminal-status probes firing the NULL branch (0-of-3
//   hit NON-NULL) because the fixture path is over_budget_approval
//   and the NON-NULL branch requires request_type='code_request'.
//   So the NULL-branch coverage on this CHECK is 3× the tick 360
//   coverage; the NON-NULL-branch coverage is 0× the tick 360
//   coverage (tick 360 gets the approve branch on the correct
//   request_type). This asymmetry-of-the-asymmetry is a fixture
//   artefact — once code_request approve fixtures land at P8.5, the
//   coverage rebalances to the tick 360 shape (1 NON-NULL probe + 2
//   NULL probes on this CHECK; 2 NULL probes + 1 NON-NULL probe on
//   the tick 360 CHECK) with the XOR partition observable at
//   fixture level rather than just the module-scope doc-block level.
//   Symmetric-cluster posture: this summary hoist closes the tick
//   359 + tick 360 reseller_requests-row cross-column-invariant sweep
//   on THIS file — the row-cluster now carries 3/3 possible summaries
//   (ck_decision_shape at tick 359 + ck_credit_link at tick 360 +
//   ck_promo_link landing here). Distinct from ticks 359 + 360 in
//   TWO dimensions: (i) closes the third summary on the SAME surface
//   rather than opening a fourth — the reseller_requests row has
//   exactly three CHECK constraints (ck_decision_shape at 0095:41-45
//   + ck_credit_link at 0095:48-51 + ck_promo_link at 0095:52-55) so
//   the three-summary parity IS the close-out on this cluster; (ii)
//   makes the XOR partition observable at module scope for the first
//   time on this surface (see the writer-side source block above —
//   the XOR is emergent across the ck_credit_link + ck_promo_link
//   pair and cannot be lifted from either summary alone). Follow-on
//   ticks can extend along the same two dimensions as tick 360's
//   next-pick options: (i) cross-surface twin hoist of ALL THREE
//   summaries onto admin-requests-list-authz.spec.ts so the ck_*
//   constraint triple reaches two-surface parity with the detail-*
//   pair; (ii) rotate to reseller-side surfaces (requests-authz.
//   spec.ts + requests-validation.spec.ts + reseller-requests-list-
//   authz.spec.ts) for reseller-scope twins — reseller-scope
//   surfaces have not yet carried any module-scope cross-column
//   invariant summary either.

test.describe("Admin reseller requests PATCH pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — PATCH with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — PATCH as a founder QA account returns 401 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P10 wave-5 row 175 — happy path DENY branch. Admin PATCHes a pending
// over_budget_approval row seeded by wave-3 row 155 (see
// requests-authz.spec.ts:253+) and flips status pending → denied via
// {action:"deny", decision_reason:"..."}. Deny is picked over approve /
// cancel per the "Deliberately out of scope" block above — pure status
// flip at web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311
// with no Stripe coupon mint, no credit_balances / credit_transactions /
// reseller_credit_grants write, no revenue_events read. Idempotent net-of-
// row-155: row 155 inserts one pending over_budget_approval row per CI
// pass; this row consumes it via the PATCH so the reseller_requests queue
// nets to zero rather than accumulating pending rows. Fresh CI hosts
// (where row 155 has not run yet) test.skip when the pending enumeration
// returns an empty array — no false failure.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + body.request.id
// matching UUID_RE + body.request.status === "denied" + body.request
// .decision_reason non-empty string. Do NOT pin body.request.decision_at
// (a timestamp string that drifts every run — assert typeof string only).
// Do NOT pin linked_credit_transaction_id / linked_promotion_code_id —
// both are null for the deny branch (approve branch would populate them;
// deferred here), so pin their null-ness so a route regression that leaks
// a stray ledger insert into the deny path surfaces here as a non-null
// linked_credit_transaction_id.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status flip + decision_reason + decision_at + decision_by) but does
// NOT touch credit_balances, credit_transactions, reseller_credit_grants,
// reseller_promotion_codes, revenue_events, or Stripe. Net-of-row-155 the
// pending queue length is unchanged across CI passes. Row 155 was
// intentionally scoped to over_budget_approval (not code_request) so its
// pending row lives outside the reseller_requests_pending_code_uniq
// partial unique index — a rerun that lands a fresh pending row before
// this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the deny branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no
// Stripe network call, no revenue_events read, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list (fresh CI host where row 155 has not run yet) → test-scope
// skip with a pointer at wave-3 row 155. Sibling admin-only rows (164 +
// 173 + 174) use the same pattern; row 174 skips discipline mirrors this
// one but skips at test-scope only for loginAs since its assertion loop
// greens over empty-array too.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (deny)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("deny — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=denied with a decision_reason", async ({
    page,
  }) => {
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

    // Enumerate pending requests to find a row we can safely deny. The
    // list endpoint's default status filter is 'pending' (route.ts:37+46
    // of the list route) so an omit-?status query returns exactly the
    // rows we want. Filter to over_budget_approval to avoid depleting
    // any code_request row that a downstream approve-branch tick may
    // need — over_budget_approval sits outside the pending-code partial
    // unique index (0095:71-73) so denying one does not create a slot
    // race with the code_request seeder.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to deny — " +
          "wave-3 row 155 (requests-authz.spec.ts:253+) has not run yet on " +
          "this host. Run the wave-3 seeder step or execute row 155 before " +
          "this row to populate at least one pending row.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_deny_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "deny", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `deny returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker (fold into the retry posture below if seen); a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("denied");
    // decision_at is a timestamp string set inside the route at now =
    // new Date().toISOString() (route.ts:89) — assert typeof string only
    // so the value can drift.
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Deny branch skips the code_request + over_budget_approval fan-outs
    // so both linked_* columns stay null. A route regression that leaked
    // an approve-branch ledger insert or coupon mint into the deny path
    // would surface here as a non-null linked_credit_transaction_id or
    // linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 262 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 261 next-pick option (s). The PATCH response
    // envelope (route.ts:317-319) only echoes id/status/decision_at/
    // decision_reason/linked_credit_transaction_id/linked_promotion_code_id
    // — payload is NOT re-emitted by the UPDATE ... SELECT. To close the
    // writer contract on the payload jsonb column for this now-flipped row,
    // re-read via the list route with ?status=denied and locate the row by
    // id in the returned array, then apply the same discriminated-union
    // guard that tick 259/260/261 landed on the three list surfaces:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET)
    // Extends the payload-content-pin coverage to a fourth surface — the
    // admin list route under the non-default ?status=denied filter path
    // (route.ts:39 branches on the query param via ALLOWED_STATUS.has()).
    // The prior three ticks all exercise the default status='pending' path
    // so a route regression that broke the ?status= param parse or the
    // .eq("status", status) filter at route.ts:46 would surface only here.
    //
    // Writer-schema justification:
    //   - requests.ts:41-44 defines the ResellerRequestPayload discriminated
    //     union: code_request | over_budget_approval | collateral_approval.
    //     The POST route at /api/reseller/requests/route.ts writes the
    //     validator's `{...res.value}` output (requests.ts:229-233 / 243-246
    //     / 253-256) into reseller_requests.payload (jsonb NOT NULL DEFAULT
    //     '{}' per 0095:33). The PATCH we just fired flipped ONLY status +
    //     decision_by + decision_at + decision_reason + linked_credit_
    //     transaction_id + linked_promotion_code_id (route.ts:305-320) —
    //     payload is untouched by the deny branch so the read-back reflects
    //     exactly what the POST validator wrote.
    //   - Per-branch key shape mirrors the tick 259/260/261 pin verbatim
    //     (same 3 branches, same 5 module-scope constants, same source-line
    //     citations):
    //       - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //         (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //       - over_budget_approval → target_user_id (UUID), requested_amount
    //         (positive integer), reason (null or string ≤ 200),
    //         remaining_budget_snapshot (null or non-negative integer)
    //       - collateral_approval → collateral_url (https URL), purpose
    //         (string ≤ 500)
    //
    // Coverage-per-guard posture:
    //   - The row we just denied was seeded by wave-3 row 155 as an
    //     over_budget_approval type, so the over_budget_approval branch is
    //     exercised on green-path CI runs. code_request + collateral_approval
    //     branches are zero-coverage today (no seeded deny targets carry
    //     those types), but the pin still closes the writer contract for
    //     both branches so a route regression that dropped a key from the
    //     SELECT (route.ts:44 echoes payload jsonb straight through) or a
    //     validator regression that swapped a key shape at requests.ts would
    //     surface across all four list surfaces on the next CI pass —
    //     matches the tick 259/260/261 zero-coverage-per-guard rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=denied query
    // returns an array missing our target id (e.g. concurrent worker
    // cleaned up the row) surfaces as an explicit test.skip pointer rather
    // than a bare undefined-access — deny already flipped one row this run
    // so a missing read-back means the row was consumed externally between
    // the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=denied`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("denied") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=denied filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === targetId,
    ) as
      | {
          id?: unknown;
          reseller_id?: unknown;
          requested_by?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
          resellers?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${targetId} in status=denied list — ` +
          "a concurrent CI worker likely consumed the row between the PATCH " +
          "and this GET. Re-run to pick up a fresh row 155 seed.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin on the list read-back
    // row. Complements the payload jsonb discriminated-union pin above by
    // closing the wire contract on the timestamptz column (0095:35). The
    // deny branch just stamped decision_at at route.ts:98 via new Date()
    // .toISOString() so the pending-then-denied row now carries a non-null
    // value here. Two-part guard: typeof-string (a column-type flip from
    // timestamptz to say bigint would surface as a number here) + ISO regex
    // (a stringify format drift from ISO to say a locale-formatted date
    // string would surface as a non-match). Regex permits Z or +HH:MM
    // offset suffixes so a PostgREST config change from `.toISOString`-style
    // Z serialisation to timezone-offset serialisation is a benign no-op.
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin, companion to the tick-265
    // decision_at pin above. reseller_requests.decision_by is a uuid column
    // (0095:34) that the deny branch just stamped via decision_by: user.id
    // at route.ts:309 (identical assignment on all three PATCH branches).
    // The 0095:43-45 CHECK constraint permits decision_by to be null when
    // status ∈ ('approved','denied','cancelled') — only decision_at is
    // required to be non-null in those states — but the route always sets
    // decision_by to the authenticated admin's uuid and no admin-delete
    // fires between the PATCH and this GET, so on the happy path the read-
    // back carries a non-null UUID string here. Two-part guard mirrors the
    // decision_at pin: typeof-string (column-type flip from uuid to say a
    // bigint would surface as a number) + UUID_RE (a drift in the uuid
    // serialisation shape or a route regression that stripped decision_by
    // from the list SELECT's column projection at route.ts:44 would fail
    // the regex match).
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin, companion to the tick-
    // 265 decision_at + tick-266 decision_by pins on the deny surface. The
    // reseller_requests.created_at column (0095:39) is `timestamptz NOT NULL
    // DEFAULT now()` and is populated at INSERT time only — the deny PATCH
    // branch does NOT touch this column, so the wire value here mirrors
    // whatever row 155's insert stamped. Same two-part guard as the
    // decision_at pin: typeof-string + ISO_TIMESTAMP_RE (Z or +HH:MM
    // suffixes both permitted). See the module-scope tick-267 comment block
    // above for the full rationale.
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin, fourth per-column pin on the
    // deny-branch read-back row. reseller_requests.decision_reason is a
    // nullable text column (0095:36) that the deny PATCH just wrote via
    // validateAdminDecision (requests.ts:293-303 trims + caps at REASON_MAX)
    // and UPDATE at route.ts:305-320. Three-part guard: typeof-string
    // (column-type flip catch), length ≤ REASON_MAX (validator-cap widening
    // catch), exact-string equality against the probe (route swap +
    // validator normalisation catch). Complements the existing PATCH-
    // response pin at line 407 by closing the SELECT column projection at
    // /api/admin/resellers/requests/route.ts:44 — a projection drop of
    // decision_reason there would still let the PATCH echo the value on the
    // write envelope but would fail the read-back here.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Tick 269 — request_type enum value pin, fifth per-column pin on the
    // deny-branch read-back row. reseller_requests.request_type is a NOT
    // NULL text column with a CHECK IN ('code_request','over_budget_
    // approval','collateral_approval') at 0095:29-30, mirrored by
    // ResellerRequestType at requests.ts:12-15. Two-part guard: typeof-
    // string (catches a projection drop of request_type from the list
    // SELECT at route.ts:44, which would fail the guard because undefined
    // is not a string) + ALLOWED_REQUEST_TYPES.has() set membership
    // (catches a DB-level CHECK widening or a route regression that
    // returned a stale/mismatched enum value). Runs BEFORE the
    // discriminated-union switch below so a null/undefined/stale value no
    // longer silently skips all three branches.
    expect(typeof readbackRow.request_type).toBe("string");
    expect(
      ALLOWED_REQUEST_TYPES.has(readbackRow.request_type as string),
      `read-back row.request_type '${String(readbackRow.request_type)}' not in {code_request, over_budget_approval, collateral_approval} per 0095:29-30 + requests.ts:12-15: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 270 — status enum value pin, sixth per-column pin on the deny-
    // branch read-back row. reseller_requests.status is a NOT NULL text
    // column DEFAULT 'pending' (0095:31-32) with CHECK IN ('pending',
    // 'approved','denied','cancelled'), mirrored by ResellerRequestStatus
    // at requests.ts:17-21 and ALLOWED_STATUS at
    // /api/admin/resellers/requests/route.ts:13. Three-part guard: typeof-
    // string (catches a projection drop of status from the list SELECT at
    // route.ts:44, which would fail the guard because undefined is not a
    // string) + ALLOWED_STATUS_VALUES.has() set membership (catches a
    // DB-level CHECK widening or a route regression that returned a
    // stale/mismatched enum value) + exact-string equality against
    // "denied" (catches a route regression that broke the ?status=denied
    // filter contract at route.ts:39+46 by returning rows whose status
    // does not match the filter, or an UPDATE regression at route.ts:305-
    // 320 that stamped the wrong status literal). Fires ONLY after the
    // tick-269 request_type pin has passed on the same read-back row so
    // tighter existing pins surface first.
    expect(typeof readbackRow.status).toBe("string");
    expect(
      ALLOWED_STATUS_VALUES.has(readbackRow.status as string),
      `read-back row.status '${String(readbackRow.status)}' not in {pending, approved, denied, cancelled} per 0095:31-32 + requests.ts:17-21 + route.ts:13: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    expect(readbackRow.status).toBe("denied");
    // Tick 271 — reseller_id UUID wire-shape pin, seventh per-column pin on
    // the deny-branch read-back row. reseller_requests.reseller_id is a
    // `uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT`
    // column (0095:27) populated at INSERT time and never touched by the
    // deny PATCH branch at route.ts:305-320 — so the read-back MUST carry a
    // non-null UUID string here. Two-part guard mirrors the tick-266
    // decision_by pin: typeof-string (column-type flip catch) + UUID_RE
    // (route regression that stripped reseller_id from the list SELECT's
    // column projection at /api/admin/resellers/requests/route.ts:44 — where
    // reseller_id is the second column in the projection list — would fail
    // the regex match here). See the module-scope tick-271 comment for the
    // full rationale.
    expect(typeof readbackRow.reseller_id).toBe("string");
    expect(
      UUID_RE.test(readbackRow.reseller_id as string),
      `read-back row.reseller_id '${String(readbackRow.reseller_id)}' should match UUID shape (uuid NOT NULL per 0095:27, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 272 — requested_by UUID wire-shape pin, eighth per-column pin on
    // the deny-branch read-back row. reseller_requests.requested_by is a
    // `uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT`
    // column (0095:28) populated at INSERT time by the reseller-side POST
    // /api/reseller/requests handler and never touched by the deny PATCH
    // branch at route.ts:305-320 — so the read-back MUST carry a non-null
    // UUID string here. Two-part guard mirrors the tick-266 decision_by +
    // tick-271 reseller_id pins: typeof-string (column-type flip catch, or
    // a route regression that stripped requested_by from the list SELECT's
    // column projection at /api/admin/resellers/requests/route.ts:43 — where
    // requested_by is the third column in the projection list — would fail
    // the guard because undefined is not a string) + UUID_RE (route
    // regression that returned a placeholder-string value would fail the
    // regex match). See the module-scope tick-272 comment for the full
    // rationale.
    expect(typeof readbackRow.requested_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.requested_by as string),
      `read-back row.requested_by '${String(readbackRow.requested_by)}' should match UUID shape (uuid NOT NULL per 0095:28, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 274 — resellers-join projection pin on the deny-branch read-back
    // row. The admin list SELECT at /api/admin/resellers/requests/route.ts:44
    // ends with `resellers(code, display_name)` — a PostgREST to-one FK embed
    // over reseller_requests.reseller_id → resellers.id at 0095:27. The deny
    // PATCH branch does NOT touch either reseller_id or the parent resellers
    // row, so the embed here mirrors the reseller row row-155's INSERT
    // pointed at. Four-part guard mirrors the sibling admin-requests-list-
    // authz.spec.ts:449-469 pin verbatim: (a) plain-object envelope catches
    // an array-shape drift, (b) typeof-string on code catches a projection
    // drop, (c) RESELLER_CODE_RE catches a normaliser regression, (d)
    // typeof-string on display_name catches a projection drop. See the
    // module-scope tick-274 comment for the full rationale.
    expect(
      readbackRow.resellers !== null &&
        typeof readbackRow.resellers === "object" &&
        !Array.isArray(readbackRow.resellers),
      `read-back row.resellers should be a plain object (PostgREST to-one FK embed over reseller_requests.reseller_id → resellers.id per 0095:27; a to-many array shape would surface here): ${JSON.stringify(readbackRow.resellers).slice(0, 200)}`,
    ).toBe(true);
    const denyResellerEmbed = readbackRow.resellers as {
      code?: unknown;
      display_name?: unknown;
    };
    expect(typeof denyResellerEmbed.code).toBe("string");
    expect(
      RESELLER_CODE_RE.test(denyResellerEmbed.code as string),
      `read-back row.resellers.code '${String(denyResellerEmbed.code)}' should match UPPERCASE-slug shape /^[A-Z0-9]+$/ (resellers.code text NOT NULL UNIQUE per 0091:24 + normaliseResellerCode() at admin-validator.ts); a drift to a lowercase or mixed-case string would surface here: ${JSON.stringify(denyResellerEmbed).slice(0, 200)}`,
    ).toBe(true);
    expect(typeof denyResellerEmbed.display_name).toBe("string");
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261 pins. TYPEOF + VALUE-tighten pins per key so a rename OR
    // a shape drift both surface — matches tick 259/260/261 rationale.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }
  });
});

// P10 wave-5 row 175 — happy path CANCEL branch. Admin PATCHes a second
// pending over_budget_approval row (seeded by wave-5 row 155-b in
// requests-authz.spec.ts) and flips status pending → cancelled via
// {action:"cancel", decision_reason:"..."}. Cancel mirrors deny at
// web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311 with the
// same pure status flip — no Stripe coupon mint, no credit_balances /
// credit_transactions / reseller_credit_grants / reseller_promotion_codes /
// revenue_events write. Idempotent net-of-(row-155, row-155-b): the deny
// block above consumes row 155's seed; this block consumes row 155-b's
// seed; the reseller_requests queue nets to zero rather than accumulating.
//
// Coverage-vs-duplication call vs the deny block: pin 200 + body.ok=true +
// body.request.id matching UUID_RE + body.request.status === "cancelled" +
// body.request.decision_reason === "p10_wave5_row_175_cancel_probe" + both
// linked_* columns null. Do NOT pin body.request.decision_at value (a
// timestamp string set at now = new Date().toISOString() inside the route —
// assert typeof string only). The status === "cancelled" pin catches a
// regression that mis-computed the status enum from action (validateAdmin
// Decision at web/src/lib/reseller/requests.ts:301-303 folds action ===
// "cancel" → "cancelled"). Pinning both status enums across the two blocks
// (denied vs cancelled) catches a folded-together regression where cancel
// and deny both round-trip to the same string.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list AFTER the deny block consumed row 155's seed and row 155-b
// has not run yet (fresh CI host or partial-seed) → test-scope skip with a
// pointer at wave-5 row 155-b. The enumeration filter mirrors the deny
// block (request_type === "over_budget_approval") so cancel and deny each
// find a distinct row via the array-order traversal without needing an
// explicit row-id exchange between the two describe blocks.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status pending → cancelled + decision_by + decision_at + decision_reason
// + linked_credit_transaction_id + linked_promotion_code_id, both nulls).
// No credit_balances / credit_transactions / reseller_credit_grants /
// reseller_promotion_codes / revenue_events / Stripe writes. Net-of-
// (row-155, row-155-b) the pending queue length is unchanged across CI
// passes. Row 155-b is scoped to over_budget_approval (not code_request) so
// its seeded row lives outside the reseller_requests_pending_code_uniq
// partial unique index (0095:71-73) — a rerun that lands a fresh pending
// row before this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the cancel branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no Stripe
// network call, no revenue_events read, no InfoVision dependency. P8.5 +
// P1.5 remain neither a dependency nor a consequence.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (cancel)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("cancel — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=cancelled with a decision_reason", async ({
    page,
  }) => {
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

    // Enumerate pending requests to find a row we can safely cancel. The
    // list endpoint's default status filter is 'pending' so an omit-?status
    // query returns exactly the rows we want. Filter to over_budget_approval
    // for the same reason as the deny block above — cancel + deny each need
    // a distinct pending row (row 155 for deny, row 155-b for cancel), and
    // scoping to over_budget_approval leaves any pending code_request row
    // alone for a downstream approve-branch tick that may need it.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to cancel — " +
          "wave-5 row 155-b (requests-authz.spec.ts row 155-b describe " +
          "block) has not run yet on this host, or the deny block above " +
          "consumed the only pending row on a partial-seed host. Run the " +
          "wave-3 + wave-5 seeder blocks or execute rows 155 + 155-b before " +
          "this row to populate at least two pending rows.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_cancel_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "cancel", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `cancel returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker; a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("cancelled");
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Cancel branch skips the code_request + over_budget_approval fan-outs
    // (same as deny) so both linked_* columns stay null. A route regression
    // that leaked an approve-branch ledger insert or coupon mint into the
    // cancel path would surface here as a non-null linked_credit_transaction
    // _id or linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 263 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 262 next-pick option (s2). Mirrors the tick 262
    // deny-branch read-back verbatim onto the cancel-branch surface so the
    // payload jsonb per-type shape contract is now content-pinned on FIVE
    // list read surfaces simultaneously:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list,
    //     default ?status=pending path)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin,
    //     default status=pending path)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET,
    //     default status=pending path)
    //   - admin-requests-patch-authz.spec.ts deny block (tick 262, admin
    //     list under ?status=denied filter path via route.ts:39 branch on
    //     ALLOWED_STATUS.has())
    //   - admin-requests-patch-authz.spec.ts cancel block (this tick, admin
    //     list under ?status=cancelled filter path — third non-default
    //     status enum exercised, complements tick 262's ?status=denied)
    // Extending the same read-back onto the APPROVE branch landed on
    // tick 264 in the approve describe block below (?status=approved
    // filter path).
    //
    // Writer-schema justification: unchanged from the tick 262 deny-branch
    // read-back — the PATCH response envelope at route.ts:317-319 only
    // echoes id/status/decision_at/decision_reason/linked_credit_transaction
    // _id/linked_promotion_code_id (payload is NOT re-emitted by the
    // UPDATE ... SELECT), and the cancel branch flips ONLY status +
    // decision_by + decision_at + decision_reason + linked_credit_
    // transaction_id + linked_promotion_code_id (route.ts:305-320) so the
    // read-back reflects exactly what the POST validator wrote.
    //
    // Per-branch key shape mirrors the tick 259/260/261/262 pin verbatim
    // (same 3 branches, same 5 module-scope constants, same source-line
    // citations):
    //   - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //     (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //   - over_budget_approval → target_user_id (UUID), requested_amount
    //     (positive integer), reason (null or string ≤ 200),
    //     remaining_budget_snapshot (null or non-negative integer)
    //   - collateral_approval → collateral_url (https URL), purpose
    //     (string ≤ 500)
    //
    // Coverage-per-guard posture: the row we just cancelled was seeded by
    // wave-5 row 155-b as an over_budget_approval type (the cancel block
    // filters to over_budget_approval on rows.find above so this is
    // structurally guaranteed on green-path CI runs), so the
    // over_budget_approval branch is exercised on this fifth surface too.
    // code_request + collateral_approval branches remain zero-coverage on
    // this surface for the same reason as ticks 259/260/261/262 — no seeded
    // cancel targets carry those types today. The pin still closes the
    // writer contract for both branches so a route regression that dropped
    // a key from the SELECT (route.ts:44 echoes payload jsonb straight
    // through) or a validator regression that swapped a key shape at
    // requests.ts would surface across all five list surfaces on the next
    // CI pass — matches the tick 259/260/261/262 zero-coverage-per-guard
    // rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=cancelled query
    // returns an array missing our target id (e.g. concurrent worker
    // cleaned up the row) surfaces as an explicit test.skip pointer rather
    // than a bare undefined-access — cancel already flipped one row this
    // run so a missing read-back means the row was consumed externally
    // between the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=cancelled`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("cancelled") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=cancelled filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === targetId,
    ) as
      | {
          id?: unknown;
          reseller_id?: unknown;
          requested_by?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
          resellers?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${targetId} in status=cancelled list — ` +
          "a concurrent CI worker likely consumed the row between the PATCH " +
          "and this GET. Re-run to pick up a fresh row 155-b seed.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin mirrored from the
    // tick-262 deny-block addition onto the cancel-block surface so the
    // timestamptz column shape (0095:35) is content-pinned on the second of
    // the three post-PATCH read-back rows too. Same two-part guard: typeof-
    // string + ISO regex; same rationale for permitting Z or +HH:MM
    // suffixes. The cancel branch just stamped decision_at at route.ts:98
    // (identical route line to deny + approve) so the pending-then-cancelled
    // row now carries a non-null value here.
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the uuid column shape
    // (0095:34) is content-pinned on the second of the three post-PATCH
    // read-back rows too. Same two-part guard as the deny surface: typeof-
    // string + UUID_RE. The cancel branch just stamped decision_by:
    // user.id at route.ts:309 (identical assignment line to deny + approve)
    // so the pending-then-cancelled row now carries a non-null uuid value
    // here. See the deny-block block-scope comment above for full rationale.
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the timestamptz INSERT-time
    // column shape (0095:39) is content-pinned on the second of the three
    // post-PATCH read-back rows too. Same two-part guard as the deny surface:
    // typeof-string + ISO_TIMESTAMP_RE. The cancel PATCH branch does not
    // touch created_at (only decision_at + decision_by + status +
    // decision_reason move on cancel), so the wire value mirrors whatever
    // row 155-b's insert stamped. See the module-scope tick-267 comment
    // block above for the full rationale.
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin mirrored from the deny-block onto
    // the cancel-block surface so the nullable text column (0095:36) is
    // content-pinned on the second of the three post-PATCH read-back rows
    // too. Same three-part guard as the deny surface: typeof-string + length
    // ≤ REASON_MAX + exact-string equality against the cancel probe. The
    // cancel PATCH wrote decision_reason via validateAdminDecision at
    // requests.ts:293-303 (identical validator call as deny + approve;
    // action='cancel' folds to status='cancelled' at requests.ts:301-303 but
    // decision_reason path is unchanged). See the deny-block block-scope
    // comment above and the module-scope tick-268 comment for full rationale.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Tick 269 — request_type enum value pin mirrored from the deny-block
    // onto the cancel-block surface so the NOT NULL text column with
    // CHECK IN ('code_request','over_budget_approval','collateral_approval')
    // at 0095:29-30 is content-pinned on the second of the three post-PATCH
    // read-back rows too. Same two-part guard as the deny surface: typeof-
    // string + ALLOWED_REQUEST_TYPES.has() set membership. See the deny-
    // block block-scope comment above and the module-scope tick-269 comment
    // for full rationale.
    expect(typeof readbackRow.request_type).toBe("string");
    expect(
      ALLOWED_REQUEST_TYPES.has(readbackRow.request_type as string),
      `read-back row.request_type '${String(readbackRow.request_type)}' not in {code_request, over_budget_approval, collateral_approval} per 0095:29-30 + requests.ts:12-15: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 270 — status enum value pin mirrored from the deny-block onto
    // the cancel-block surface so the NOT NULL text column with CHECK IN
    // ('pending','approved','denied','cancelled') at 0095:31-32 is content-
    // pinned on the second of the three post-PATCH read-back rows too.
    // Same three-part guard as the deny surface: typeof-string +
    // ALLOWED_STATUS_VALUES.has() set membership + exact-string equality
    // against "cancelled" (branch-specific expected value — action='cancel'
    // folds to status='cancelled' at requests.ts:301-303 and the UPDATE at
    // route.ts:305-320 stamps that literal). See the deny-block block-
    // scope comment above and the module-scope tick-270 comment for full
    // rationale.
    expect(typeof readbackRow.status).toBe("string");
    expect(
      ALLOWED_STATUS_VALUES.has(readbackRow.status as string),
      `read-back row.status '${String(readbackRow.status)}' not in {pending, approved, denied, cancelled} per 0095:31-32 + requests.ts:17-21 + route.ts:13: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    expect(readbackRow.status).toBe("cancelled");
    // Tick 271 — reseller_id UUID wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the NOT NULL uuid column at
    // 0095:27 is content-pinned on the second of the three post-PATCH read-
    // back rows too. Same two-part guard as the deny surface: typeof-string
    // + UUID_RE. The cancel branch does NOT touch reseller_id at route.ts
    // :305-320 (identical to deny + approve on this column) so the wire
    // value mirrors whatever the seeder INSERTed. See the module-scope
    // tick-271 comment for full rationale.
    expect(typeof readbackRow.reseller_id).toBe("string");
    expect(
      UUID_RE.test(readbackRow.reseller_id as string),
      `read-back row.reseller_id '${String(readbackRow.reseller_id)}' should match UUID shape (uuid NOT NULL per 0095:27, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 272 — requested_by UUID wire-shape pin mirrored from the deny-
    // block onto the cancel-block surface so the NOT NULL uuid column at
    // 0095:28 is content-pinned on the second of the three post-PATCH read-
    // back rows too. Same two-part guard as the deny surface: typeof-string
    // + UUID_RE. The cancel branch does NOT touch requested_by at route.ts
    // :305-320 (identical to deny + approve on this column) so the wire
    // value mirrors whatever the reseller-side POST INSERTed. See the
    // module-scope tick-272 comment for full rationale.
    expect(typeof readbackRow.requested_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.requested_by as string),
      `read-back row.requested_by '${String(readbackRow.requested_by)}' should match UUID shape (uuid NOT NULL per 0095:28, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 274 — resellers-join projection pin mirrored from the deny-block
    // onto the cancel-block surface so the embedded `resellers(code,
    // display_name)` join at route.ts:44 is content-pinned on the second of
    // the three post-PATCH read-back rows too. Same four-part guard as the
    // deny surface: plain-object envelope + typeof-string on code +
    // RESELLER_CODE_RE + typeof-string on display_name. The cancel branch
    // does NOT touch reseller_id or the parent resellers row (identical to
    // deny + approve on this key) so the wire value mirrors whatever the
    // reseller-side POST INSERTed. See the module-scope tick-274 comment
    // for full rationale.
    expect(
      readbackRow.resellers !== null &&
        typeof readbackRow.resellers === "object" &&
        !Array.isArray(readbackRow.resellers),
      `read-back row.resellers should be a plain object (PostgREST to-one FK embed over reseller_requests.reseller_id → resellers.id per 0095:27; a to-many array shape would surface here): ${JSON.stringify(readbackRow.resellers).slice(0, 200)}`,
    ).toBe(true);
    const cancelResellerEmbed = readbackRow.resellers as {
      code?: unknown;
      display_name?: unknown;
    };
    expect(typeof cancelResellerEmbed.code).toBe("string");
    expect(
      RESELLER_CODE_RE.test(cancelResellerEmbed.code as string),
      `read-back row.resellers.code '${String(cancelResellerEmbed.code)}' should match UPPERCASE-slug shape /^[A-Z0-9]+$/ (resellers.code text NOT NULL UNIQUE per 0091:24 + normaliseResellerCode() at admin-validator.ts); a drift to a lowercase or mixed-case string would surface here: ${JSON.stringify(cancelResellerEmbed).slice(0, 200)}`,
    ).toBe(true);
    expect(typeof cancelResellerEmbed.display_name).toBe("string");
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261/262 pins. TYPEOF + VALUE-tighten pins per key so a rename
    // OR a shape drift both surface — matches tick 262 rationale verbatim.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }
  });
});

// P10 wave-5 row 175 — happy path APPROVE branch (over_budget_approval).
// Admin PATCHes a pending over_budget_approval row minted by the temp-
// reseller fixture's attachApproveTarget() helper (fixtures/reseller.ts) and
// approves it via {action:"approve", decision_reason:"..."}. Approve is the
// heavyweight transition at web/src/app/api/admin/resellers/requests/[id]
// /route.ts:200-293: credit_balances UPSERT (bumps balance +
// lifetime_earned by payload.requested_amount) + credit_transactions INSERT
// (reason='reseller_grant_over_budget', metadata carries reseller_request_id
// + approved_by_admin) + reseller_credit_grants INSERT (kind='grant',
// over_budget=true, credit_transaction_id links to the fresh transaction)
// + reseller_requests UPDATE (status pending → approved, decision_by +
// decision_at + decision_reason + linked_credit_transaction_id stamped).
// No Stripe network call — the code_request approve branch is the Stripe-
// dependent path and stays deferred (see "Deliberately out of scope"
// above) pending Stripe test-mode wiring.
//
// Coverage-vs-duplication call vs the deny + cancel blocks: pin 200 +
// body.ok=true + body.request.id matching UUID_RE + body.request.status ===
// "approved" + body.request.decision_reason === explicit probe string +
// body.request.linked_credit_transaction_id matching UUID_RE (non-null,
// distinguishes approve from deny/cancel where both linked_* stay null) +
// body.request.linked_promotion_code_id === null (over_budget_approval
// approve NEVER mints a promotion_code — that path is code_request only).
// The linked_credit_transaction_id UUID pin catches (a) a regression that
// dropped the transaction insert but returned 200 anyway, and (b) a
// regression that folded promotion_code stamping into the over_budget
// branch. Do NOT pin body.request.decision_at value (timestamp drift).
//
// State-pollution posture: attachApproveTarget() snapshot-restores four
// writes end-to-end on fixture.cleanup(). The reseller_credit_grants row
// is filtered by metadata->>'reseller_request_id' = requestId (matches the
// route's metadata write at route.ts:281-286). The reseller_requests row
// is deleted by id. The credit_transactions row is filtered by the same
// metadata path (route.ts:253-259). credit_balances is either UPSERTed
// back to snapshot (balance, lifetime_earned) when a row existed pre-
// attach, or DELETEd entirely when this call minted a fresh row.
// cleanup() runs in afterAll so a failing assertion in the test still
// triggers the restore closure.
//
// Skip discipline mirrors the deny + cancel blocks with three extra
// layers for the fixture: loadAdminHarness null (describe-scope skip via
// adminHarnessSkipReason), loadTempReseller throw (test-scope skip),
// loadTempReseller null (test-scope skip via tempResellerSkipReason),
// attachApproveTarget throw (SQL error — test-scope skip surfaces the
// underlying error), attach null (attributedUserId or adminUserId missing
// on this host — targeted skip pointer at the seeder scripts).
//
// Non-Stripe / non-GST discipline: the approve branch for over_budget_
// approval only writes credit_balances + credit_transactions +
// reseller_credit_grants + reseller_requests. No Stripe network call, no
// revenue_events read, no InfoVision dependency. P8.5 + P1.5 remain
// neither a dependency nor a consequence — the same posture that let the
// deny + cancel blocks land in prior ticks.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (approve over_budget_approval)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  let fixture: TempResellerFixture | null = null;
  let fixtureError: Error | null = null;
  let attach: AttachApproveTargetResult | null = null;
  let attachError: Error | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = err as Error;
      return;
    }
    if (!fixture) return;
    try {
      attach = await fixture.attachApproveTarget();
    } catch (err) {
      attachError = err as Error;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch {
        // Swallow cleanup errors so a teardown regression does not mask
        // the test verdict — the leaked row will surface on the next run
        // via the pending-inbox scan.
      }
    }
  });

  test("approve — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=approved and stamps linked_credit_transaction_id", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${fixtureError.message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (attachError) {
      test.skip(
        true,
        `attachApproveTarget threw: ${attachError.message}. Common ` +
          `causes: migration 0091/0095/0096 not applied on this host, or ` +
          `the credit_balances / credit_transactions / reseller_credit_grants ` +
          `/ reseller_requests table missing.`,
      );
      return;
    }
    if (!attach) {
      test.skip(
        true,
        "attachApproveTarget returned null — attributed founder or " +
          "reseller-admin app_users row missing on this host. Run " +
          "scripts/seed-qa-reseller.mjs + scripts/seed-test-users.mjs " +
          "with QA_RESELLER_MULTI_ADMIN=1 to plant both rows.",
      );
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

    const decisionReason = "p10_wave5_row_175_approve_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${attach.requestId}`,
      {
        data: { action: "approve", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `approve returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() + credit-ledger triple-write. A 401 means the admin session dropped mid-test; a 404 not_found means the fixture-inserted row was deleted (concurrent worker); a 422 payload_incomplete means the fixture's payload lost target_user_id or requested_amount (fixture drift); a 500 balance_read_failed / balance_upsert_failed / transaction_insert_failed / mirror_insert_failed / update_failed means one of the four ledger writes leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(attach.requestId);
    expect(patchBody.request?.status).toBe("approved");
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Approve branch for over_budget_approval MUST populate
    // linked_credit_transaction_id (route.ts:269+303). A regression that
    // dropped the transaction insert but returned 200 anyway would surface
    // here as a null value.
    const linkedTxId = patchBody.request?.linked_credit_transaction_id;
    expect(typeof linkedTxId).toBe("string");
    expect(linkedTxId as string).toMatch(UUID_RE);
    // over_budget_approval NEVER mints a promotion_code — that path is
    // code_request only (route.ts:93-197). A regression that folded
    // promotion_code stamping into the over_budget branch would surface
    // here as a non-null value.
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();

    // Tick 264 — post-PATCH read-back GET with discriminated-union payload
    // content pin per tick 263 next-pick option (s3). Mirrors the tick 262
    // deny-branch + tick 263 cancel-branch read-backs verbatim onto the
    // approve-branch surface so the payload jsonb per-type shape contract
    // is now content-pinned on SIX list read surfaces simultaneously:
    //   - admin-requests-list-authz.spec.ts:341-432 (tick 259, admin list,
    //     default ?status=pending path)
    //   - requests-validation.spec.ts (tick 260, reseller happy GET twin,
    //     default status=pending path)
    //   - reseller-requests-list-authz.spec.ts (tick 261, reseller GET,
    //     default status=pending path)
    //   - admin-requests-patch-authz.spec.ts deny block (tick 262, admin
    //     list under ?status=denied filter path)
    //   - admin-requests-patch-authz.spec.ts cancel block (tick 263, admin
    //     list under ?status=cancelled filter path)
    //   - admin-requests-patch-authz.spec.ts approve block (this tick,
    //     admin list under ?status=approved filter path — fourth
    //     non-default status enum exercised, completing three of the four
    //     ALLOWED_STATUS values via the PATCH-branch read-back trio and
    //     the fourth via the tick 259 default-pending list surface)
    //
    // Writer-schema justification: unchanged from the tick 262 + 263
    // read-backs — the PATCH response envelope at route.ts:317-319 only
    // echoes id/status/decision_at/decision_reason/linked_credit_transaction
    // _id/linked_promotion_code_id (payload is NOT re-emitted by the
    // UPDATE ... SELECT). The approve branch for over_budget_approval flips
    // ONLY status + decision_by + decision_at + decision_reason +
    // linked_credit_transaction_id (route.ts:200-293) — payload is untouched
    // so the read-back reflects exactly what the fixture's
    // attachApproveTarget() INSERT wrote (identical to the deny + cancel
    // branch's payload preservation posture cited in tick 262 + 263).
    //
    // Per-branch key shape mirrors the tick 259/260/261/262/263 pin verbatim
    // (same 3 branches, same 5 module-scope constants, same source-line
    // citations):
    //   - code_request → tier_pct (∈ {0,10,20,30,40}), suggested_suffix
    //     (null or /^[A-Z0-9]{1,16}$/), notes (null or string length ≤ 200)
    //   - over_budget_approval → target_user_id (UUID), requested_amount
    //     (positive integer), reason (null or string ≤ 200),
    //     remaining_budget_snapshot (null or non-negative integer)
    //   - collateral_approval → collateral_url (https URL), purpose
    //     (string ≤ 500)
    //
    // Coverage-per-guard posture: the row we just approved was minted by
    // attachApproveTarget() as an over_budget_approval type (fixture
    // contract — the request_type is guaranteed on green-path runs), so the
    // over_budget_approval branch is exercised on this sixth surface too.
    // code_request + collateral_approval branches remain zero-coverage on
    // this surface for the same reason as ticks 259/260/261/262/263 — no
    // approve targets carry those types today (code_request approve is
    // blocked on Stripe test-mode wiring; collateral_approval approve is
    // not exercised by any fixture yet). The pin still closes the writer
    // contract for both branches so a route regression that dropped a key
    // from the SELECT (route.ts:44 echoes payload jsonb straight through)
    // or a validator regression that swapped a key shape at requests.ts
    // would surface across all six list surfaces on the next CI pass —
    // matches the tick 259/260/261/262/263 zero-coverage-per-guard
    // rationale.
    //
    // Skip discipline: a fresh CI host where the ?status=approved query
    // returns an array missing our target id (e.g. concurrent worker or
    // fixture cleanup raced ahead) surfaces as an explicit test.skip
    // pointer rather than a bare undefined-access — approve already
    // flipped one row this run so a missing read-back means the row was
    // consumed externally between the PATCH and this GET.
    const readbackResp = await page.request.get(
      `${REQUESTS_LIST_ROUTE}?status=approved`,
    );
    expect(
      readbackResp.status(),
      `read-back GET returned ${readbackResp.status()} — expected 200 after requireAdmin() + ALLOWED_STATUS.has("approved") filter path. A 401 means the admin session dropped between the PATCH and this GET; a 5xx means the reseller_requests SELECT under the ?status=approved filter leaked through. Body: ${await readbackResp.text()}`,
    ).toBe(200);
    const readbackBody = (await readbackResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(readbackBody.ok).toBe(true);
    expect(Array.isArray(readbackBody.requests)).toBe(true);
    const readbackRow = ((readbackBody.requests as unknown[]) ?? []).find(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        (row as { id?: unknown }).id === attach.requestId,
    ) as
      | {
          id?: unknown;
          reseller_id?: unknown;
          requested_by?: unknown;
          request_type?: unknown;
          status?: unknown;
          payload?: unknown;
          decision_at?: unknown;
          decision_by?: unknown;
          decision_reason?: unknown;
          created_at?: unknown;
          linked_credit_transaction_id?: unknown;
          resellers?: unknown;
        }
      | undefined;
    if (!readbackRow) {
      test.skip(
        true,
        `read-back could not locate id=${attach.requestId} in status=approved list — ` +
          "a concurrent CI worker or fixture teardown likely consumed the row " +
          "between the PATCH and this GET. Re-run to pick up a fresh " +
          "attachApproveTarget() mint.",
      );
      return;
    }
    // Route SELECT at route.ts:44 echoes the payload jsonb column straight
    // through with no normalisation. The DB column is `payload jsonb NOT
    // NULL DEFAULT '{}'` per 0095:33 so every row carries a plain object
    // (never null, never array). Precondition for the per-key discriminated-
    // union guard below.
    expect(
      readbackRow.payload !== null &&
        typeof readbackRow.payload === "object" &&
        !Array.isArray(readbackRow.payload),
      `read-back row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33): ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 265 — decision_at ISO-8601 wire-shape pin mirrored from the
    // tick-262 deny-block + tick-263 cancel-block additions onto the
    // approve-block surface so the timestamptz column shape (0095:35) is now
    // content-pinned on all three post-PATCH read-back rows. Same two-part
    // guard: typeof-string + ISO regex; same rationale for permitting Z or
    // +HH:MM suffixes. The approve branch just stamped decision_at at
    // route.ts:98 (identical route line to deny + cancel; the approve fan-out
    // at route.ts:200-293 does not touch the timestamp column separately) so
    // the pending-then-approved row now carries a non-null value here. The
    // 0095:43-45 CHECK constraint further guarantees decision_at IS NOT NULL
    // whenever status ∈ ('approved','denied','cancelled'), so this pin is
    // now backed by a database-level invariant across all three PATCH
    // branches — a route regression that returned status='approved' with a
    // null decision_at would violate the CHECK and fail the UPDATE before
    // ever reaching this read-back, but the read-back still catches a
    // read-path regression (e.g. a SELECT that stripped decision_at from the
    // list route's column projection).
    expect(typeof readbackRow.decision_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.decision_at as string),
      `read-back row.decision_at '${String(readbackRow.decision_at)}' should match ISO 8601 shape (timestamptz per 0095:35 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 266 — decision_by UUID wire-shape pin mirrored from the tick-266
    // deny-block + cancel-block additions onto the approve-block surface so
    // the uuid column shape (0095:34) is now content-pinned on all three
    // post-PATCH read-back rows. Same two-part guard: typeof-string +
    // UUID_RE. The approve branch just stamped decision_by: user.id at
    // route.ts:309 (identical assignment line to deny + cancel; the approve
    // fan-out at route.ts:200-293 does not touch the decision_by column
    // separately) so the pending-then-approved row now carries a non-null
    // uuid value here. Unlike decision_at, the 0095:43-45 CHECK constraint
    // does NOT force decision_by to be non-null when status ∈ ('approved',
    // 'denied','cancelled') — only decision_at is required in those states
    // per the second CHECK clause — so this pin catches a route regression
    // that returned status='approved' with a null decision_by (which would
    // pass the DB CHECK but is not the expected happy-path shape) as well
    // as a read-path regression that stripped decision_by from the list
    // route's column projection at route.ts:44.
    expect(typeof readbackRow.decision_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.decision_by as string),
      `read-back row.decision_by '${String(readbackRow.decision_by)}' should match UUID shape (uuid per 0095:34, stamped from user.id at route.ts:309); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 267 — created_at ISO-8601 wire-shape pin mirrored from the tick-
    // 267 deny-block + cancel-block additions onto the approve-block surface
    // so the timestamptz INSERT-time column shape (0095:39) is now content-
    // pinned on all three post-PATCH read-back rows. Same two-part guard:
    // typeof-string + ISO_TIMESTAMP_RE. Unlike decision_at, created_at is
    // NOT touched by any PATCH branch — the approve fan-out at
    // route.ts:200-293 writes credit_balances + credit_transactions +
    // reseller_credit_grants + reseller_promotion_codes but leaves
    // reseller_requests.created_at untouched — so the wire value here
    // mirrors whatever the attachApproveTarget() fixture stamped at INSERT
    // time. The 0095:39 NOT NULL DEFAULT now() constraint further guarantees
    // created_at IS NOT NULL on every row regardless of status, so this pin
    // is backed by a database-level invariant across all three PATCH
    // branches AND the pending-list surface (unlike decision_at, which is
    // only non-null once a decision has been stamped).
    expect(typeof readbackRow.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(readbackRow.created_at as string),
      `read-back row.created_at '${String(readbackRow.created_at)}' should match ISO 8601 shape (timestamptz per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 268 — decision_reason value pin mirrored from the deny-block +
    // cancel-block onto the approve-block surface so the nullable text
    // column (0095:36) is now content-pinned on all three post-PATCH read-
    // back rows. Same three-part guard as the deny + cancel surfaces:
    // typeof-string + length ≤ REASON_MAX + exact-string equality against
    // the approve probe. The approve PATCH wrote decision_reason via
    // validateAdminDecision at requests.ts:293-303 (identical validator call
    // as deny + cancel; the approve fan-out at route.ts:200-293 does not
    // touch the decision_reason column separately). Unlike decision_at,
    // 0095:43-45 CHECK does NOT force decision_reason to be non-null in any
    // status — a route regression that dropped the decision_reason write
    // could pass the DB CHECK and return status='approved' with a null
    // decision_reason, but this pin catches that regression here since the
    // fixture guarantees the probe string is on the wire.
    expect(typeof readbackRow.decision_reason).toBe("string");
    expect(
      (readbackRow.decision_reason as string).length <= REASON_MAX,
      `read-back row.decision_reason length ${(readbackRow.decision_reason as string).length} > REASON_MAX (${REASON_MAX}) per requests.ts:66 — a validator-side cap widening would surface here: ${JSON.stringify(readbackRow.decision_reason).slice(0, 100)}`,
    ).toBe(true);
    expect(readbackRow.decision_reason).toBe(decisionReason);
    // Tick 269 — request_type enum value pin mirrored from the deny-block +
    // cancel-block onto the approve-block surface so the NOT NULL text
    // column with CHECK IN ('code_request','over_budget_approval','collateral
    // _approval') at 0095:29-30 is now content-pinned on all three post-PATCH
    // read-back rows. Same two-part guard: typeof-string +
    // ALLOWED_REQUEST_TYPES.has() set membership. The approve fan-out at
    // route.ts:200-293 does not touch the request_type column (only status
    // + decision_by + decision_at + decision_reason + linked_credit_
    // transaction_id move on approve) so the read-back reflects exactly
    // what attachApproveTarget() INSERT stamped — the fixture contract
    // guarantees over_budget_approval on green-path runs. See the deny-
    // block block-scope comment above and the module-scope tick-269
    // comment for full rationale.
    expect(typeof readbackRow.request_type).toBe("string");
    expect(
      ALLOWED_REQUEST_TYPES.has(readbackRow.request_type as string),
      `read-back row.request_type '${String(readbackRow.request_type)}' not in {code_request, over_budget_approval, collateral_approval} per 0095:29-30 + requests.ts:12-15: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 270 — status enum value pin mirrored from the deny-block +
    // cancel-block onto the approve-block surface so the NOT NULL text
    // column with CHECK IN ('pending','approved','denied','cancelled') at
    // 0095:31-32 is now content-pinned on all three post-PATCH read-back
    // rows. Same three-part guard: typeof-string +
    // ALLOWED_STATUS_VALUES.has() set membership + exact-string equality
    // against "approved" (branch-specific expected value — action='approve'
    // folds to status='approved' at requests.ts:301-303 after the fan-out
    // at route.ts:200-293 completes, and the UPDATE at route.ts:305-320
    // stamps that literal). See the deny-block block-scope comment above
    // and the module-scope tick-270 comment for full rationale.
    expect(typeof readbackRow.status).toBe("string");
    expect(
      ALLOWED_STATUS_VALUES.has(readbackRow.status as string),
      `read-back row.status '${String(readbackRow.status)}' not in {pending, approved, denied, cancelled} per 0095:31-32 + requests.ts:17-21 + route.ts:13: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    expect(readbackRow.status).toBe("approved");
    // Tick 271 — reseller_id UUID wire-shape pin mirrored from the deny-
    // block + cancel-block onto the approve-block surface so the NOT NULL
    // uuid column at 0095:27 is now content-pinned on all three post-PATCH
    // read-back rows. Same two-part guard as the deny + cancel surfaces:
    // typeof-string + UUID_RE. The approve branch does NOT touch reseller_id
    // at route.ts:305-320 (only status + decision_* + linked_* columns are
    // stamped in the approve fan-out at route.ts:200-320) so the wire value
    // mirrors whatever attachApproveTarget() INSERTed. See the module-scope
    // tick-271 comment for full rationale.
    expect(typeof readbackRow.reseller_id).toBe("string");
    expect(
      UUID_RE.test(readbackRow.reseller_id as string),
      `read-back row.reseller_id '${String(readbackRow.reseller_id)}' should match UUID shape (uuid NOT NULL per 0095:27, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 272 — requested_by UUID wire-shape pin mirrored from the deny-
    // block + cancel-block onto the approve-block surface so the NOT NULL
    // uuid column at 0095:28 is now content-pinned on all three post-PATCH
    // read-back rows. Same two-part guard as the deny + cancel surfaces:
    // typeof-string + UUID_RE. The approve branch does NOT touch
    // requested_by at route.ts:305-320 (only status + decision_* + linked_*
    // columns are stamped in the approve fan-out at route.ts:200-320) so the
    // wire value mirrors whatever attachApproveTarget() INSERTed. See the
    // module-scope tick-272 comment for full rationale.
    expect(typeof readbackRow.requested_by).toBe("string");
    expect(
      UUID_RE.test(readbackRow.requested_by as string),
      `read-back row.requested_by '${String(readbackRow.requested_by)}' should match UUID shape (uuid NOT NULL per 0095:28, populated at INSERT time and untouched by any PATCH branch); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 273 — linked_credit_transaction_id UUID wire-shape pin (asymmetric
    // single-surface, approve-block only). The ck_credit_link CHECK at
    // 0095:48-51 permits a non-null value ONLY when request_type=
    // 'over_budget_approval' AND status='approved' — the deny + cancel blocks
    // pin `linked_credit_transaction_id === null` at line 575 + 1038
    // respectively for the same reason. The approve fan-out at route.ts:200-
    // 293 stamps this column with the credit_transactions.id it just inserted
    // (see route.ts:269+303) so the wire value here mirrors that INSERT. The
    // PATCH-response envelope at route.ts:317-319 already pins the same UUID
    // via linkedTxId at line 1494-1496; this read-back closes the same
    // contract against the list route's SELECT column projection at
    // /api/admin/resellers/requests/route.ts:44 — a projection drop of
    // linked_credit_transaction_id there would still let the PATCH echo the
    // value back on the write envelope but would fail the read-back here.
    // Two-part guard mirrors the sibling UUID pins: typeof-string + UUID_RE.
    // See the module-scope tick-273 comment for full rationale including the
    // ON DELETE SET NULL / fixture snapshot-restore fixture-race analysis.
    expect(typeof readbackRow.linked_credit_transaction_id).toBe("string");
    expect(
      UUID_RE.test(readbackRow.linked_credit_transaction_id as string),
      `read-back row.linked_credit_transaction_id '${String(readbackRow.linked_credit_transaction_id)}' should match UUID shape (uuid per 0095:37, populated by the approve fan-out at route.ts:269+303); a drift to a non-UUID string, a number, or null would surface here: ${JSON.stringify(readbackRow).slice(0, 200)}`,
    ).toBe(true);
    // Tick 274 — resellers-join projection pin mirrored from the deny +
    // cancel blocks onto the approve-block surface so the embedded
    // `resellers(code, display_name)` join at route.ts:44 is content-pinned
    // on the third of the three post-PATCH read-back rows. Same four-part
    // guard as the deny + cancel surfaces: plain-object envelope +
    // typeof-string on code + RESELLER_CODE_RE + typeof-string on
    // display_name. The approve branch does NOT touch reseller_id or the
    // parent resellers row at route.ts:200-320 (only status + decision_* +
    // linked_* columns are stamped in the approve fan-out) so the wire value
    // mirrors whatever attachApproveTarget() INSERTed. See the module-scope
    // tick-274 comment for full rationale.
    expect(
      readbackRow.resellers !== null &&
        typeof readbackRow.resellers === "object" &&
        !Array.isArray(readbackRow.resellers),
      `read-back row.resellers should be a plain object (PostgREST to-one FK embed over reseller_requests.reseller_id → resellers.id per 0095:27; a to-many array shape would surface here): ${JSON.stringify(readbackRow.resellers).slice(0, 200)}`,
    ).toBe(true);
    const approveResellerEmbed = readbackRow.resellers as {
      code?: unknown;
      display_name?: unknown;
    };
    expect(typeof approveResellerEmbed.code).toBe("string");
    expect(
      RESELLER_CODE_RE.test(approveResellerEmbed.code as string),
      `read-back row.resellers.code '${String(approveResellerEmbed.code)}' should match UPPERCASE-slug shape /^[A-Z0-9]+$/ (resellers.code text NOT NULL UNIQUE per 0091:24 + normaliseResellerCode() at admin-validator.ts); a drift to a lowercase or mixed-case string would surface here: ${JSON.stringify(approveResellerEmbed).slice(0, 200)}`,
    ).toBe(true);
    expect(typeof approveResellerEmbed.display_name).toBe("string");
    // Two-part guard per nullable key: (a) `x === null` short-circuit +
    // (b) typeof-string + regex/length check. Same shape as the tick
    // 259/260/261/262/263 pins. TYPEOF + VALUE-tighten pins per key so a
    // rename OR a shape drift both surface — matches tick 262/263
    // rationale verbatim.
    const readbackPayload = readbackRow.payload as Record<string, unknown>;
    if (readbackRow.request_type === "code_request") {
      expect(typeof readbackPayload.tier_pct).toBe("number");
      expect(
        ALLOWED_TIER_PCT_VALUES.has(readbackPayload.tier_pct as number),
        `read-back code_request payload.tier_pct '${String(readbackPayload.tier_pct)}' not in {0, 10, 20, 30, 40} per requests.ts:63: ${JSON.stringify(readbackPayload).slice(0, 200)}`,
      ).toBe(true);
      expect(
        readbackPayload.suggested_suffix === null ||
          (typeof readbackPayload.suggested_suffix === "string" &&
            SUFFIX_RE.test(readbackPayload.suggested_suffix as string)),
        `read-back code_request payload.suggested_suffix should be null or match /^[A-Z0-9]{1,16}$/ per requests.ts:64+98-104: ${JSON.stringify(readbackPayload.suggested_suffix)}`,
      ).toBe(true);
      expect(
        readbackPayload.notes === null ||
          (typeof readbackPayload.notes === "string" &&
            (readbackPayload.notes as string).length <= REASON_MAX),
        `read-back code_request payload.notes should be null or string length ≤ ${REASON_MAX} per requests.ts:106-113: ${JSON.stringify(readbackPayload.notes)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "over_budget_approval") {
      expect(typeof readbackPayload.target_user_id).toBe("string");
      expect(readbackPayload.target_user_id as string).toMatch(UUID_RE);
      expect(typeof readbackPayload.requested_amount).toBe("number");
      expect(
        Number.isInteger(readbackPayload.requested_amount) &&
          (readbackPayload.requested_amount as number) > 0,
        `read-back over_budget_approval payload.requested_amount should be a positive integer per requests.ts:139-149: ${JSON.stringify(readbackPayload.requested_amount)}`,
      ).toBe(true);
      expect(
        readbackPayload.reason === null ||
          (typeof readbackPayload.reason === "string" &&
            (readbackPayload.reason as string).length <= REASON_MAX),
        `read-back over_budget_approval payload.reason should be null or string length ≤ ${REASON_MAX} per requests.ts:150-157: ${JSON.stringify(readbackPayload.reason)}`,
      ).toBe(true);
      expect(
        readbackPayload.remaining_budget_snapshot === null ||
          (typeof readbackPayload.remaining_budget_snapshot === "number" &&
            Number.isInteger(readbackPayload.remaining_budget_snapshot) &&
            (readbackPayload.remaining_budget_snapshot as number) >= 0),
        `read-back over_budget_approval payload.remaining_budget_snapshot should be null or non-negative integer per requests.ts:158-162: ${JSON.stringify(readbackPayload.remaining_budget_snapshot)}`,
      ).toBe(true);
    } else if (readbackRow.request_type === "collateral_approval") {
      expect(typeof readbackPayload.collateral_url).toBe("string");
      expect(readbackPayload.collateral_url as string).toMatch(HTTPS_URL_RE);
      expect(typeof readbackPayload.purpose).toBe("string");
      expect(
        (readbackPayload.purpose as string).length <= PURPOSE_MAX,
        `read-back collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(readbackPayload.purpose).slice(0, 100)}`,
      ).toBe(true);
    }

    // Deeper ledger-row assertions (credit_balances.balance ===
    // balanceBefore + amount, credit_transactions.metadata->>reseller_
    // request_id === requestId, reseller_credit_grants.kind === 'grant')
    // are folded into wave-5 row 179 (audit-log-writes.spec.ts) alongside
    // the audit event writes so a single describe block owns the DB-level
    // state check for the approve fan-out. This block owns the wire
    // envelope (200 + populated linked_credit_transaction_id + null
    // linked_promotion_code_id) plus the payload jsonb preservation
    // read-back which is the tightest signal for a route regression in the
    // approve branch's happy path.
  });
});
