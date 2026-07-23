// GET /api/admin/resellers/[code] pre-read authorization contract — P10
// dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads resellers, the promotion
// codes list, the admin memberships list, the attributions list, or the
// commissions ledger).
//
// Unlike the /api/reseller/** routes which use scopedReseller() +
// gateRequireFeature(), the admin surface uses the shared requireAdmin()
// middleware from web/src/lib/reseller/require-admin.ts (see route.ts:21-32).
// The gate throws AdminGateError with code="no_user" | "not_admin" and the
// route emits { ok: false, reason: <code> } at HTTP 401 for BOTH branches
// (route.ts:27-29). This matches the existing convention in every other
// /api/admin/* route so refactors that swap requireAdmin() for a bespoke
// check would light up here.
//
// Two branches are harness-free and safe against staging (no resellers
// SELECT fires, no promotion_codes/admins/attributions/commissions SELECT
// fires, no payload leaks):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE code normalisation, resellers SELECT, or
//                          the four related-rows SELECTs)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE code normalisation,
//                          resellers SELECT, or the four related-rows SELECTs)
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 47-56:  code normalisation → 400 code_required
//   Line 58-70:  loadReseller → 404 not_found / 503 not_configured / 500 query_failed
//   Line 74-97:  promotion_codes + admins + attributions + commissions SELECT (Promise.all)
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins, attributions_summary, commissions }
//
// Why this shape mirrors the earlier admin-scope specs
// (admin-reseller-patch-authz tick 103, admin-requests-patch-authz tick 105,
// admin-reseller-delete-authz tick 106, admin-requests-list-authz tick 107,
// admin-resellers-list-authz tick 108, admin-resellers-create-authz tick 109):
// all seven routes use requireAdmin() from web/src/lib/reseller/require-admin.ts
// and all seven emit { ok:false, reason: AdminGateError.code } at HTTP 401 for
// BOTH the no_user and not_admin branches. Symmetric envelope means a
// refactor that swaps requireAdmin() for a bespoke inline check, or that
// collapses the two 401 reasons into a single "unauthorised", or that flips
// the status code to 403, lights up in all seven specs on the next
// `npx playwright test` run. Distinct from ticks 103/105/106/107/108/109 in
// ONE dimension only — this is the DETAIL READ surface (GET on the [code]
// segment) which fans out into resellers + reseller_promotion_codes (incl.
// stripe_coupon_id + stripe_promotion_code_id) + reseller_admins (user_id +
// role) + reseller_attributions + reseller_commissions_current (list_price
// + discount_pct + commission_aud_cents + net_owed_cents), so a regression
// that lets an anonymous or non-admin caller reach these SELECTs would leak
// commercially-sensitive reseller state — plan §C.5 restricts this detail
// view to platform admins only.
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the six earlier admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - code_required (400) — sits BEHIND requireAdmin (route.ts:54 vs :51),
//     so surfacing it needs a real admin session PLUS an ill-formed code
//     segment. Folded into row 168 (admin-reseller-detail-validation).
//   - not_found (404) — sits BEHIND requireAdmin, needs an admin session PLUS
//     a code that does not resolve to a resellers row. Folded into row 168.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (200) — ACTIVATED wave-5 row 167 (tick 168) below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'active_wholesale') (fetches the QAPROBEWHOLESALEACTIVE seed row).
//     Reads real resellers + reseller_promotion_codes + reseller_admins +
//     reseller_attributions + reseller_commissions_current rows for the
//     variant — pins envelope shape without pinning any array lengths so
//     the row is idempotent under CI replay across fresh + seeded hosts.
//
// Placeholder code used in the URL path: "test-placeholder-code". Both
// harness-free rows return BEFORE the code path segment is inspected
// (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// normaliseResellerCode. Any string that satisfies Next.js dynamic-segment
// matching would work — a lowercase-kebab code keeps the URL well-formed
// against router validation and mirrors the shape the real admin UI GETs
// (see web/src/app/admin/resellers/[code]/page.tsx).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_CODE = "test-placeholder-code";
const ROUTE = `/api/admin/resellers/${PLACEHOLDER_CODE}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Tick 285 — cross-surface mirror of admin-resellers-list-authz.spec.ts's
// tick 283 + tick 284 ISO wire-shape pins onto the /api/admin/resellers/
// [code] single-row GET surface. Natural next-pick option (a) from tick
// 284's review_history entry ("mirror tick 283/284 created_at +
// updated_at ISO pins onto admin-reseller-detail-authz.spec.ts (single-
// row GET surface for /api/admin/resellers/[code]) so the third admin
// resellers-family surface joins the pin"). Pre-tick posture pinned
// body.reseller.id (UUID) / .code (=== fixture.code uppercased) /
// .display_name (typeof string) / .billing_model (enum) / .status (enum)
// but left the two timestamptz columns silent even though the route
// projects them via select("*") at route.ts:47-48. Same schema source as
// the list surface (0091:43 created_at + 0091:44 updated_at, both
// timestamptz NOT NULL DEFAULT now()), same regex, same NOT-NULL
// discipline (single typeof-string + regex assert per column, mirrors
// ticks 283 + 284 verbatim). Detail-row asserts run ONCE per test (single
// object, not a per-row for-loop) — matches the list surface's per-row
// asserts semantically: a PostgREST serialisation regression on either
// column, a projection-side column drop from route.ts:48 select("*"),
// or a PATCH-time drift that stopped stamping updated_at=now() would
// surface here on the next CI pass whenever the wave-5 row 167 happy
// GET fires. Third admin resellers-family surface to carry the pin
// (after list ticks 283/284); the reseller-loop-status surface uses an
// on-disk snapshot envelope so it has no timestamptz projection to
// mirror against.
//
// Tick 286 — commission_share_pct numeric wire-shape + [0, 100] value
// pin, cross-surface mirror of the sibling pin landed on
// admin-resellers-list-authz.spec.ts in the same tick. Column source
// 0091:38 `commission_share_pct numeric(5,2) NOT NULL DEFAULT 40.00` —
// no DB CHECK, but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:114-118 enforces the [0, 100]
// invariant on every write path (rejects with
// commission_share_pct_out_of_range when out of band). Fresh-column
// rotation on this surface (mirrors option (b) from tick 285) — the
// detail surface has never carried this pin, so the two admin
// resellers-family surfaces (list + detail) come up to parity in the
// same tick, avoiding an asymmetry window. NOT-NULL discipline → single
// typeof-number + finite + range-in-[0,100] assert per column, matches
// the list-surface posture verbatim. A PostgREST serialisation
// regression, a schema-side type flip, an admin-validator drift that
// stopped rejecting out-of-band values, or a projection-side drop from
// route.ts:47-48 select("*") would surface on both admin
// resellers-family surfaces (list + detail) on the same CI pass.
//
// Tick 287 — gst_registered bool wire-shape pin, cross-surface mirror of
// the sibling pin landed on admin-resellers-list-authz.spec.ts in the
// same tick. Column source 0091:36 `gst_registered bool NOT NULL DEFAULT
// false`, gated by CHECK ck_wholesale_gst_required at 0091:47-50 so any
// wholesale row must carry gst_registered=true + abn IS NOT NULL. The
// active_wholesale fixture (QAPROBEWHOLESALEACTIVE seed row) therefore
// exercises the true branch on this surface — a schema-side type flip
// from bool to text/int, a PostgREST serialisation regression that
// returned booleans as "true"/"false" strings, or a projection-side
// drop from route.ts:47-48 select("*") would surface here on the next
// CI pass. NOT-NULL discipline → single typeof-boolean assert; bool has
// no finite / range dimension so no second guard is layered, matching
// the list-surface posture verbatim.
//
// Tick 288 — allowed_tiers int[] wire-shape + value-set pin, cross-
// surface mirror of the sibling pin landed on admin-resellers-list-
// authz.spec.ts in the same tick. Column source 0091:30 `allowed_tiers
// int[] NOT NULL DEFAULT ARRAY[0,10,20,30,40]`; element-membership
// invariant (each element ∈ {0,10,20,30,40}) enforced by
// RESELLER_TIER_VALUES in web/src/lib/reseller/admin-validator.ts on
// every admin PATCH — no DB CHECK on element membership so the wire
// value is bounded by the write-side gate. Detail-row asserts run ONCE
// per test (single object, not per-row for-loop) — equivalent to a
// list-surface loop iterating exactly one row. Fresh-column rotation
// on this surface — three-part guard (Array.isArray + every-elem
// typeof-number + every-elem ∈ {0,10,20,30,40}) matches the list-
// surface posture verbatim. A PostgREST serialisation regression that
// returned int[] as a text string like "{0,10,20,30,40}", a schema-side
// flip from int[] to text[], an admin-validator drift that stopped
// rejecting out-of-set writes, or a projection-side drop from
// route.ts:47-48 select("*") would surface on both admin resellers-
// family surfaces (list + detail) on the same CI pass.
//
// Tick 289 — monthly_credit_budget int wire-shape + non-negative +
// integer pin, cross-surface mirror of the sibling pin landed on
// admin-resellers-list-authz.spec.ts in the same tick. Column source
// 0091:33 `monthly_credit_budget int NOT NULL DEFAULT 0`; no DB CHECK,
// but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:100-105 rejects any write
// with !Number.isFinite || value < 0 (reason 'budget_negative') and
// Math.floor()s the accepted value so the wire integer is bounded by
// the write-side gate. Projected via route.ts:47-48 select("*").
// NOT-NULL + integer invariant → four-part guard (typeof-number +
// Number.isFinite + Number.isInteger + value >= 0) matches the list-
// surface posture verbatim. Detail-row asserts run ONCE per test
// (single object) — equivalent to a list-surface loop iterating
// exactly one row. Fresh-column rotation on this surface — the two
// admin resellers-family surfaces (list + detail) come up to parity
// in the same tick, avoiding an asymmetry window. A PostgREST
// serialisation regression that flipped int onto the wire as a
// string, a schema-side type flip from int to numeric/text, an
// admin-validator drift that stopped rejecting negative writes, a
// Math.floor() drop that let a fractional value land, or a
// projection-side drop from route.ts:47-48 select("*") would each
// surface on both admin resellers-family surfaces (list + detail) on
// the same CI pass.
//
// Tick 290 — monthly_sandbox_credits int wire-shape + non-negative +
// integer pin, cross-surface mirror of the sibling pin landed on
// admin-resellers-list-authz.spec.ts in the same tick. Column source
// 0091:34 `monthly_sandbox_credits int NOT NULL DEFAULT 500`; no DB
// CHECK, but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:107-112 rejects any write
// with !Number.isFinite || value < 0 (reason 'sandbox_negative') and
// Math.floor()s the accepted value so the wire integer is bounded by
// the write-side gate. Projected via route.ts:47-48 select("*").
// NOT-NULL + integer invariant → four-part guard (typeof-number +
// Number.isFinite + Number.isInteger + value >= 0) matches the list-
// surface posture verbatim. Detail-row asserts run ONCE per test
// (single object) — equivalent to a list-surface loop iterating
// exactly one row. Fresh-column rotation on this surface — the two
// admin resellers-family surfaces (list + detail) come up to parity
// in the same tick, avoiding an asymmetry window. A PostgREST
// serialisation regression that flipped int onto the wire as a
// string, a schema-side type flip from int to numeric/text, an
// admin-validator drift that stopped rejecting negative writes, a
// Math.floor() drop that let a fractional value land, or a
// projection-side drop from route.ts:47-48 select("*") would each
// surface on both admin resellers-family surfaces (list + detail) on
// the same CI pass.
//
// Tick 291 — can_create_startups bool wire-shape pin, cross-surface
// mirror of the sibling pin landed on admin-resellers-list-authz.spec.
// ts in the same tick. Column source 0091:31 `can_create_startups bool
// NOT NULL DEFAULT false` — sibling bool column to gst_registered
// (pinned at tick 287) with the same NOT-NULL discipline; controls
// whether the reseller UI exposes the "create startup" branch per the
// reseller U.15 module design (write-side application gating, no
// wire-side echo distinct from the bool value itself). Projected via
// route.ts:47-48 select("*"). NOT-NULL discipline → single typeof-
// boolean assert; bool has no finite / range dimension so no second
// guard is layered, matching the list-surface posture verbatim.
// Detail-row assert runs ONCE per test (single object) — equivalent
// to a list-surface loop iterating exactly one row. Fresh-column
// rotation on this surface — the two admin resellers-family surfaces
// (list + detail) come up to parity in the same tick, avoiding an
// asymmetry window. A PostgREST serialisation regression that
// returned booleans as "true"/"false" strings, a schema-side type
// flip from bool to text/int, or a projection-side drop from
// route.ts:47-48 select("*") would each surface on both admin
// resellers-family surfaces (list + detail) on the same CI pass.
//
// Tick 292 — can_grant_credits bool wire-shape pin, cross-surface
// mirror of the sibling pin landed on admin-resellers-list-authz.spec.
// ts in the same tick. Column source 0091:32 `can_grant_credits bool
// NOT NULL DEFAULT false` — third bool NOT NULL column on the
// resellers row after gst_registered (pinned at tick 287) and
// can_create_startups (pinned at tick 291) with the same NOT-NULL
// discipline; controls whether the reseller UI exposes the "grant
// credits to attributed startup" branch per the reseller U.15 module
// design (paired with monthly_credit_budget at 0091:33 — the budget
// cap only matters when this bool is true; write-side application
// gating, no wire-side echo distinct from the bool value itself).
// Projected via route.ts:47-48 select("*"). NOT-NULL discipline →
// single typeof-boolean assert; bool has no finite / range dimension
// so no second guard is layered, matching the list-surface posture
// verbatim. Detail-row assert runs ONCE per test (single object) —
// equivalent to a list-surface loop iterating exactly one row. Fresh-
// column rotation on this surface — the two admin resellers-family
// surfaces (list + detail) come up to parity in the same tick,
// avoiding an asymmetry window. A PostgREST serialisation regression
// that returned booleans as "true"/"false" strings, a schema-side
// type flip from bool to text/int, or a projection-side drop from
// route.ts:47-48 select("*") would each surface on both admin
// resellers-family surfaces (list + detail) on the same CI pass.
//
// Tick 293 — collateral_approval_required bool wire-shape pin, cross-
// surface mirror of the sibling pin landed on admin-resellers-list-
// authz.spec.ts in the same tick. Column source 0091:35
// `collateral_approval_required bool NOT NULL DEFAULT true` — fourth
// bool NOT NULL column on the resellers row after gst_registered
// (pinned at tick 287), can_create_startups (pinned at tick 291), and
// can_grant_credits (pinned at tick 292) with the same NOT-NULL
// discipline; governs whether reseller-authored marketing collateral
// must clear the D4-CLO-08 admin approval inbox before it goes live
// (write-side application gating tied to the P9.3 requests inbox
// landed at tick 31, no wire-side echo distinct from the bool value
// itself). This is the first bool NOT NULL column in the resellers
// row to carry a DEFAULT true (the prior three default false) so the
// QAPROBEWHOLESALEACTIVE seed row exercises the true branch by
// default; the same typeof-boolean guard covers both branches
// identically because the invariant is on the JS type of the wire
// value, not the boolean value itself. Projected via route.ts:47-48
// select("*"). NOT-NULL discipline → single typeof-boolean assert;
// bool has no finite / range dimension so no second guard is layered,
// matching the list-surface posture verbatim. Detail-row assert runs
// ONCE per test (single object) — equivalent to a list-surface loop
// iterating exactly one row. Fresh-column rotation on this surface —
// the two admin resellers-family surfaces (list + detail) come up to
// parity in the same tick, avoiding an asymmetry window. A PostgREST
// serialisation regression that returned booleans as "true"/"false"
// strings, a schema-side type flip from bool to text/int, or a
// projection-side drop from route.ts:47-48 select("*") would each
// surface on both admin resellers-family surfaces (list + detail) on
// the same CI pass.
//
// Tick 294 — abn text nullable wire-shape pin, cross-surface mirror of
// the sibling pin landed on admin-resellers-list-authz.spec.ts in the
// same tick. Rotates off the bool cluster (ticks 287/291/292/293) onto
// the first nullable text column on the resellers row. Column declared
// at 0091:37 as `abn text` with no NOT NULL constraint (nullable) and
// a DB CHECK ck_abn_format at 0091:52-54 (`abn IS NULL OR abn ~
// '^\d{2} \d{3} \d{3} \d{3}$'`) — the spaced ABN format `NN NNN NNN
// NNN`, mirrored on the application write path by ABN_RE at
// web/src/lib/reseller/admin-validator.ts:52 (validator rejects
// patch.abn writes that fail the same regex with reason='abn_bad_
// format'). The column is additionally tied to the wholesale
// invariant CHECK ck_wholesale_gst_required at 0091:47-50
// (`billing_model = 'retail' OR (billing_model = 'wholesale' AND
// gst_registered = true AND abn IS NOT NULL)`) — retail rows may
// legally carry a NULL abn, wholesale rows must carry a non-NULL abn.
// The QAPROBEWHOLESALEACTIVE seed row is wholesale so it exercises the
// null-or-string+ABN_RE branch on every green CI run; retail probe
// variants exercise the null branch. Nullable discipline → two-part
// guard: (a) null-or-typeof-string preserving the tick 275 posture for
// nullable text columns, (b) null-or-(typeof-string AND ABN_RE.test())
// tightening onto the DB CHECK + validator regex. Detail-row asserts
// run ONCE per test (single object) — equivalent to a list-surface
// loop iterating exactly one row. A schema-side type flip from text to
// non-string, a PostgREST serialisation regression that returned NULL
// as the literal string "null", a DB CHECK constraint drop, an admin-
// validator drift that stopped enforcing ABN_RE, or a projection-side
// drop from route.ts:47-48 select("*") would each surface at a
// distinct assertion failure mode on both admin resellers-family
// surfaces (list + detail) on the same CI pass.
//
// Tick 295 — logo_url text nullable wire-shape pin, cross-surface mirror
// of the sibling pin landed on admin-resellers-list-authz.spec.ts in the
// same tick. Column declared at 0091:26 as `logo_url text` with no NOT
// NULL constraint (nullable) and NO DB CHECK — free text storing a
// reseller-branding logo URL consumed by the topbar reseller pill at
// web/src/components/workspace/reseller-pill.tsx and the Stripe invoice
// memo path at web/src/app/api/stripe/checkout/route.ts (P5 co-
// branding). Unlike abn (pinned at tick 294) there is NO application
// write-path regex or format-validator guard on this column at
// web/src/lib/reseller/admin-validator.ts — admin-validator.ts:81-90
// only rejects the hex primary_color column on format, and logo_url
// passes through unchecked aside from standard NULL/undefined omission.
// Nullable discipline with no format layer → single-guard null-or-
// typeof-string assert, looser than the tick 294 two-part guard because
// there is no format regex to layer on top. Detail-row assert runs ONCE
// per test (single object). The QAPROBEWHOLESALEACTIVE seed row carries
// logo_url=NULL by default (seed-qa-reseller.mjs never populates the
// column) so the null branch is exercised on every green CI run; a
// populated production reseller row (INFOVISION when P1.5 clears H.20)
// would exercise the null-or-string branch instead. A schema-side type
// flip from text to non-string, a PostgREST serialisation regression
// that returned NULL as the literal string "null", or a projection-side
// drop from route.ts:47-48 select("*") would each surface on both admin
// resellers-family surfaces (list + detail) on the same CI pass.
//
// Tick 296 — primary_color text nullable wire-shape pin, cross-surface
// mirror of the sibling pin landed on admin-resellers-list-authz.spec.ts
// in the same tick. Column source 0091:27 `primary_color text`
// (nullable) with NO DB CHECK but a format regex on the application
// write path — HEX_COLOR_RE at web/src/lib/reseller/admin-validator.ts:
// 53 (/^#[0-9a-fA-F]{6}$/) rejects any patch.primary_color that fails
// the 6-hex-digit +hash pattern with reason='primary_color_bad_format'
// (admin-validator.ts:150-158). Second nullable text column on the
// resellers row after abn (tick 294) that carries a format regex;
// unlike abn there is no matching DB CHECK, so the invariant lives ONLY
// on the application write path. Nullable discipline with a format
// layer → two-part guard: (a) null-or-typeof-string, (b) null-or-
// (typeof-string AND HEX_COLOR_RE.test()). QAPROBEWHOLESALEACTIVE seed
// row carries primary_color=NULL by default so the null branch is
// exercised on every green CI run; a populated production reseller row
// (INFOVISION when P1.5 clears H.20) would exercise the null-or-string
// +HEX_COLOR_RE branch. A schema-side type flip, a PostgREST
// serialisation regression, an admin-validator drift, or a projection-
// side drop from route.ts:47-48 select("*") would each surface on both
// admin resellers-family surfaces (list + detail) on the same CI pass.
//
// Tick 297 — contact_email text nullable wire-shape pin, cross-surface
// mirror of the sibling pin landed on admin-resellers-list-authz.spec.ts
// in the same tick. Column declared at 0091:41 as `contact_email text`
// with no NOT NULL constraint (nullable) and NO DB CHECK — free text
// field storing the reseller org's primary contact address consumed by
// the admin detail surface and the InfoVision seed row. Unlike
// primary_color (tick 296) there is NO application write-path format
// regex or format-validator guard on this column at
// web/src/lib/reseller/admin-validator.ts:141-143 — the validator only
// String()s+trim()s or nulls when empty; it does NOT enforce an RFC
// 5322 or similar email-shape regex. Nullable discipline with no format
// layer → single-guard null-or-typeof-string assert, matching the tick
// 295 logo_url posture verbatim rather than the tick 294/296 two-part
// guard used when a format layer exists. Detail-row assert runs ONCE
// per test (single object). The QAPROBEWHOLESALEACTIVE seed row
// carries contact_email=NULL by default (seed-qa-reseller.mjs never
// populates the column) so the null branch is exercised on every green
// CI run; a populated production reseller row (INFOVISION when P1.5
// clears H.20) would exercise the null-or-string branch instead. A
// schema-side type flip from text to non-string, a PostgREST
// serialisation regression that returned NULL as the literal string
// "null", or a projection-side drop from route.ts:47-48 select("*")
// would each surface on both admin resellers-family surfaces (list +
// detail) on the same CI pass.
//
// Tick 298 — notes text nullable wire-shape pin, cross-surface mirror of
// the sibling pin landed on admin-resellers-list-authz.spec.ts in the
// same tick, closing the resellers-row column-pin project. Column
// declared at 0091:42 as `notes text` with no NOT NULL constraint
// (nullable) and NO DB CHECK — free-form admin ops notes on the
// reseller org, consumed by the admin detail surface only. Same posture
// as tick 295 logo_url + tick 297 contact_email: there is NO
// application write-path format regex or format-validator guard on this
// column at web/src/lib/reseller/admin-validator.ts:144-146 — the
// validator only String()s the input (no trim, since notes may
// legitimately contain leading/trailing whitespace as paragraph
// structure) or nulls when empty. Nullable discipline with no format
// layer → single-guard null-or-typeof-string assert, matching the tick
// 295 logo_url and tick 297 contact_email posture verbatim rather than
// the tick 294/296 two-part guard used when a format layer exists.
// Detail-row assert runs ONCE per test (single object). The
// QAPROBEWHOLESALEACTIVE seed row carries notes=NULL by default
// (seed-qa-reseller.mjs never populates the column) so the null branch
// is exercised on every green CI run; a populated production reseller
// row (INFOVISION when P1.5 clears H.20) would exercise the null-or-
// string branch instead. A schema-side type flip from text to non-
// string, a PostgREST serialisation regression that returned NULL as
// the literal string "null", or a projection-side drop from route.ts:
// 47-48 select("*") would each surface on both admin resellers-family
// surfaces (list + detail) on the same CI pass. Closes the resellers-
// row column-pin project entirely — notes is the final nullable-text
// column with no format regex on the resellers row (0091:22-42
// enumerates every column; all bool/int/uuid/text columns from that
// block now carry a wire-shape pin on both admin-list + admin-detail
// surfaces).
//
// Tick 299 — promotion_codes[].active bool wire-shape pin, opening the
// promotion_codes[] child-row column-pin cluster per tick 298 next-tick
// option (i). Detail-only tick because the admin-resellers-list surface
// does NOT project promotion_codes (the list route selects only the
// resellers-row shape); the Promise.all leg at
// web/src/app/api/admin/resellers/[code]/route.ts:83-88 is unique to
// the detail surface. Column declared at 0091:94 as `active bool NOT
// NULL DEFAULT true` on the reseller_promotion_codes table with no
// CHECK beyond the NOT NULL discipline. Projected via
// select("id, tier_pct, code, stripe_coupon_id,
// stripe_promotion_code_id, active, created_at") on the same leg, so a
// projection-side drop would surface here on the first offending row.
// Application write path never sets active=NULL — the code_request
// approve branch at web/src/lib/reseller/promotion-code-mint.ts leaves
// the column at its DB default (true) and there is no admin flip
// surface yet, so drift from the NOT NULL discipline would indicate a
// schema-side widening or a PostgREST serialisation regression that
// started returning null|undefined for the column. NOT-NULL discipline
// → single typeof-boolean assert inside the existing for-of loop over
// body.promotion_codes, mirroring gst_registered's tick 287 posture on
// the resellers-row column-pin project (no null branch, no format
// layer, no value enum). Seeded reseller rows with N minted codes
// exercise the pin N times per green CI run; on hosts without seeded
// codes the for-loop is a no-op so the pin never fires.
//
// Tick 300 — promotion_codes[].created_at timestamptz wire-shape pin,
// second column pinned in the promotion_codes[] child-row cluster opened
// at tick 299 per that tick's next-tick option (i). Column declared at
// 0091:95 as `created_at timestamptz NOT NULL DEFAULT now()` on the
// reseller_promotion_codes table with no CHECK beyond the NOT NULL
// discipline. Projected via select("id, tier_pct, code,
// stripe_coupon_id, stripe_promotion_code_id, active, created_at") on
// the same Promise.all leg at web/src/app/api/admin/resellers/[code]/
// route.ts:83-88 that pulls reseller_promotion_codes rows, so a
// projection-side drop or a PostgREST serialisation regression on this
// column would surface here on the first offending row. Application
// write path never sets created_at explicitly — the code_request approve
// branch at web/src/app/api/admin/resellers/requests/[id]/route.ts +
// web/src/lib/reseller/promotion-code-mint.ts leaves the column at its
// DB DEFAULT now(), so drift from the NOT NULL discipline would indicate
// a schema-side widening or a PostgREST serialisation regression that
// started returning null|undefined for the column. NOT-NULL discipline
// with an ISO timestamp shape → two-part typeof-string + ISO_TIMESTAMP_RE
// assert inside the existing for-of loop over body.promotion_codes,
// mirroring resellers.created_at's tick 283/285 posture verbatim rather
// than the tick 299 single typeof-boolean guard because this column
// carries an ISO 8601 serialisation dimension beyond raw type. Seeded
// reseller rows with N minted codes exercise the pin N times per green
// CI run; on hosts without seeded codes the for-loop is a no-op so the
// pin never fires. Detail-only tick because the admin-resellers-list
// surface does NOT project promotion_codes (list route selects only the
// resellers-row shape); the Promise.all fan-out that pulls the child
// rows is unique to the detail surface, matching the tick 299 detail-
// only posture.
//
// Tick 301 — promotion_codes[].stripe_coupon_id text nullable wire-shape
// pin, third column pinned in the promotion_codes[] child-row cluster
// opened at tick 299 per that tick's next-tick option (i). Column declared
// at 0091:92 as `stripe_coupon_id text` (nullable) on the
// reseller_promotion_codes table with NO standalone CHECK, but coupled to
// tier_pct via ck_stripe_objects_by_tier at 0091:98-102 which enforces
// `(tier_pct = 0 AND stripe_coupon_id IS NULL AND stripe_promotion_code_id
// IS NULL) OR (tier_pct > 0 AND stripe_coupon_id IS NOT NULL AND
// stripe_promotion_code_id IS NOT NULL)` — tier 0 rows are attribution-
// only, tier > 0 rows require a real Stripe coupon minted via
// stripe.coupons.create at web/src/lib/reseller/promotion-code-mint.ts
// (ensureStripeCoupon, deterministic id res_<uuid8>_t<tier>). Projected
// via select("id, tier_pct, code, stripe_coupon_id,
// stripe_promotion_code_id, active, created_at") on the same Promise.all
// leg at web/src/app/api/admin/resellers/[code]/route.ts:83-88, so a
// projection-side drop or PostgREST serialisation regression on this
// column would surface here on the first offending row. Two-part guard
// mirroring the tick 294 abn / tick 296 primary_color posture rather than
// the tick 295 logo_url / tick 297 contact_email / tick 298 notes single-
// guard posture, because this column carries a semantic dimension (tier-
// coupling) beyond raw type: (a) null-or-typeof-string — preserves the
// nullable-text posture; catches a schema-side type flip or a PostgREST
// regression that returned a non-null/non-string wire value; (b) tier-
// coupled invariant matching ck_stripe_objects_by_tier — tier_pct === 0
// rows must carry stripe_coupon_id===null and tier_pct > 0 rows must
// carry typeof stripe_coupon_id === 'string'; a DB CHECK drop or a
// promotion-code-mint drift that stopped minting the Stripe coupon for
// tier > 0 rows (or a tier 0 branch bypass that stamped a non-null id)
// would surface here on the first offending row. Fires on every green CI
// run because seed-qa-reseller.mjs mints per-cohort code rows covering
// both tier 0 (attribution-only, null branch) and tier > 0 (Stripe-minted,
// string branch); on hosts without seeded codes the for-loop is a no-op
// so the pin never fires. Detail-only tick because the admin-resellers-
// list surface does NOT project promotion_codes (list route selects only
// the resellers-row shape); the Promise.all fan-out that pulls the child
// rows is unique to the detail surface, matching the tick 299/300 detail-
// only posture.
//
// Tick 302 — promotion_codes[].stripe_promotion_code_id text nullable
// wire-shape pin, fourth column pinned in the promotion_codes[] child-row
// cluster opened at tick 299 per that tick's next-tick option (i) and
// tick 301's next-tick note (natural pair to stripe_coupon_id under the
// same ck_stripe_objects_by_tier DB CHECK). Column declared at 0091:93 as
// `stripe_promotion_code_id text` (nullable) on the reseller_promotion_
// codes table with NO standalone CHECK, but coupled to tier_pct via
// ck_stripe_objects_by_tier at 0091:98-102 which enforces `(tier_pct = 0
// AND stripe_coupon_id IS NULL AND stripe_promotion_code_id IS NULL) OR
// (tier_pct > 0 AND stripe_coupon_id IS NOT NULL AND stripe_promotion_
// code_id IS NOT NULL)` — tier 0 rows are attribution-only, tier > 0
// rows require a real Stripe promotion code minted via
// stripe.promotionCodes.create at web/src/lib/reseller/promotion-code-
// mint.ts (ensureStripePromotionCode, layered on top of the Stripe coupon
// created by ensureStripeCoupon). Projected via select("id, tier_pct,
// code, stripe_coupon_id, stripe_promotion_code_id, active, created_at")
// on the same Promise.all leg at web/src/app/api/admin/resellers/[code]/
// route.ts:83-88, so a projection-side drop or PostgREST serialisation
// regression on this column would surface here on the first offending
// row. Two-part guard mirroring the tick 301 stripe_coupon_id posture
// verbatim (rather than the tick 295/297/298 single-guard posture)
// because this column carries the same semantic dimension (tier-coupling)
// beyond raw type: (a) null-or-typeof-string — preserves the nullable-
// text posture; catches a schema-side type flip or a PostgREST regression
// that returned a non-null/non-string wire value; (b) tier-coupled
// invariant matching ck_stripe_objects_by_tier — tier_pct === 0 rows
// must carry stripe_promotion_code_id===null and tier_pct > 0 rows must
// carry typeof stripe_promotion_code_id === 'string'; a DB CHECK drop or
// a promotion-code-mint drift that stopped minting the Stripe promotion
// code for tier > 0 rows (or a tier 0 branch bypass that stamped a non-
// null id) would surface here on the first offending row. Closes the
// stripe-id nullable-text pair opened by tick 301; both halves of the
// ck_stripe_objects_by_tier disjunction (stripe_coupon_id +
// stripe_promotion_code_id) now carry both raw-type and tier-linked
// wire-shape pins on the detail surface. Fires on every green CI run
// because seed-qa-reseller.mjs mints per-cohort code rows covering both
// tier 0 (attribution-only, null branch) and tier > 0 (Stripe-minted,
// string branch); on hosts without seeded codes the for-loop is a no-op
// so the pin never fires. Detail-only tick because the admin-resellers-
// list surface does NOT project promotion_codes (list route selects only
// the resellers-row shape); the Promise.all fan-out that pulls the child
// rows is unique to the detail surface, matching the tick 299/300/301
// detail-only posture. SCOPE ROTATION NOTE: this is a single-surface
// pin, not a cross-surface pair, because promotion_codes[] is projected
// only on the detail route — the resellers-row cross-surface pair
// posture (ticks 283-298) does not apply to child-row clusters.
//
// Tick 303 — promotion_codes[].tier_pct value-set enum tightening, fifth
// column pinned in the promotion_codes[] child-row cluster per tick 302
// next-pick option (a). Closes the child-row column-pin cluster because
// tier_pct was the last un-tightened column in the projection tuple
// select("id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id,
// active, created_at"): id (UUID guard, tick 232), code (PROMO_CODE_RE,
// tick 232), active (tick 299), created_at (tick 300), stripe_coupon_id
// (tick 301), stripe_promotion_code_id (tick 302), tier_pct (this tick).
// Column declared at 0091:90 as `tier_pct int NOT NULL CHECK (tier_pct IN
// (0,10,20,30,40))` on the reseller_promotion_codes table — the CHECK is
// the strongest wire-shape constraint on any column in the promotion_
// codes[] cluster because it fully enumerates the legal value set (five
// discrete integers), which mirrors the STARTUP_TIER_STEPS enum enforced
// at the application write path by admin-validator.ts on
// reseller.allowed_tiers writes. Prior tick 232 landed only a bare
// typeof-number assert `expect(typeof row.tier_pct).toBe("number")`;
// this tick promotes that single guard to a two-part shape (a)
// typeof-number+Number.isFinite preserving the raw-type discipline and
// (b) ALLOWED_TIER_VALUES.has() membership assert against the reused
// module-scope Set already used at row 934 for reseller.allowed_tiers —
// a schema-side CHECK drop, a PostgREST serialisation regression that
// returned a stringified tier ("20"), a legacy pre-P9.4 code_request
// branch that stamped a bad tier value, or an admin-validator drift that
// widened the STARTUP_TIER_STEPS enum would surface here on the first
// offending row. The tier-coupled invariant asserts at rows 1199-1209
// (stripe_coupon_id) and 1222-1232 (stripe_promotion_code_id) already
// gate on `typeof row.tier_pct === "number" && row.tier_pct === 0` /
// `> 0` so they remain unaffected — the new enum guard is layered before
// those and validates the raw value, not the tier-coupled dispatch.
// Fires on every green CI run because seed-qa-reseller.mjs mints per-
// cohort code rows across both tier 0 (attribution-only branch) and
// tier > 0 (Stripe-minted branch); on hosts without seeded codes the
// for-loop is a no-op so the pin never fires. Detail-only tick because
// the admin-resellers-list surface does NOT project promotion_codes
// (list route selects only the resellers-row shape); the Promise.all
// fan-out that pulls the child rows is unique to the detail surface,
// matching the tick 299/300/301/302 detail-only posture. CLOSES the
// promotion_codes[] child-row column-pin project opened at tick 299 —
// every column in the projection tuple now carries a wire-shape pin;
// next-tick frontier rotates to the reseller_admins[] child-row cluster
// (0091:68-76) per tick 302 next-pick option (b).
//
// Tick 304 — admins[].role value-set enum tightening, opening the
// reseller_admins[] child-row column-pin cluster per tick 303 next-pick
// option (a). Column declared at 0091:71-72 as `role text NOT NULL
// DEFAULT 'admin' CHECK (role IN ('owner','admin','viewer'))` on the
// reseller_admins table — the CHECK fully enumerates the legal value
// set (three discrete strings), matching the pattern already used at
// 0091:73-74 for status and at 0091:90 for tier_pct. Prior baseline
// landed only a bare `expect(typeof row.role).toBe("string")`; this
// tick promotes the guard to a two-part shape: (a) typeof-string
// preserving the raw-type discipline the baseline pin already covered;
// (b) ALLOWED_ADMIN_ROLES.has() membership assert against a new module-
// scope Set mirroring the CHECK enumeration. A schema-side CHECK drop,
// a PostgREST serialisation regression that returned a mixed-case or
// aliased role slug ('Owner', 'root', 'member'), or a legacy write path
// that stamped a role value outside the enumeration would surface here
// on the first offending row. Detail-surface only per the same posture
// as ticks 299-303 — the admin-resellers-list route projects the
// resellers-row shape only and does not fan out to reseller_admins; the
// Promise.all leg that pulls admins rows is unique to the detail route
// at web/src/app/api/admin/resellers/[code]/route.ts:89-93
// (select("id, user_id, role, status, linked_at, revoked_at")). Fires
// on every green CI run because seed-qa-reseller.mjs mints per-variant
// admins rows per reseller cohort; on hosts without seeded admins the
// for-loop is a no-op so the pin never fires. First column tightened
// in the admins[] child-row cluster — remaining un-tightened columns
// are status (value-set enum), linked_at (ISO-8601 shape), and
// revoked_at (nullable ISO-8601 shape).
//
// Tick 305 — admins[].status value-set enum tightening, second column
// pinned in the reseller_admins[] child-row cluster opened at tick 304
// per that tick's next-tick option (a). Natural pair to role because
// role + status are the two enum-typed text columns on reseller_admins
// (0091:71-74) and share the same CHECK-only enforcement posture —
// neither column has an application write-path guard beyond the DB
// CHECK. Column declared at 0091:73-74 as `status text NOT NULL DEFAULT
// 'active' CHECK (status IN ('active','revoked'))` on the
// reseller_admins table — the CHECK fully enumerates the legal value
// set (two discrete strings: active for currently-linked admins,
// revoked for tombstoned admins whose revoked_at timestamp is set).
// NOTE: this enum is NARROWER than the resellers.status enum
// {active, paused, terminated} captured by the module-scope STATUSES
// Set at row 682 — reseller_admins.status is a link-lifecycle enum
// (active|revoked), not a business-lifecycle enum (active|paused|
// terminated), so a separate module-scope ALLOWED_ADMIN_STATUSES Set
// is introduced rather than reusing STATUSES. Prior baseline landed
// only a bare `expect(typeof row.status).toBe("string")`; this tick
// promotes the guard to a two-part shape: (a) typeof-string preserving
// the raw-type discipline the baseline pin already covered;
// (b) ALLOWED_ADMIN_STATUSES.has() membership assert against the new
// module-scope Set mirroring the CHECK enumeration. A schema-side
// CHECK drop, a legacy INSERT that stamped a link-state outside the
// enumeration ('disabled', 'pending'), or a PostgREST serialisation
// regression that returned a mixed-case slug ('Active') would surface
// here on the first offending row. Detail-surface only per the same
// posture as ticks 299-304 — the admin-resellers-list route projects
// the resellers-row shape only and does not fan out to reseller_admins;
// the Promise.all leg that pulls admins rows is unique to the detail
// route at web/src/app/api/admin/resellers/[code]/route.ts:89-93
// (select("id, user_id, role, status, linked_at, revoked_at")). Fires
// on every green CI run because seed-qa-reseller.mjs mints per-variant
// admins rows per reseller cohort; on hosts without seeded admins the
// for-loop is a no-op so the pin never fires. Continues the admins[]
// child-row column-pin cluster — remaining un-tightened columns after
// this tick are linked_at (ISO-8601 shape) and revoked_at (nullable
// ISO-8601 shape).
//
// Tick 306 — admins[].linked_at ISO-8601 timestamptz wire-shape pin,
// third column pinned in the reseller_admins[] child-row cluster opened
// at tick 304 per tick 305 next-pick option (a). Rotates from value-set
// enum tightening (ticks 304-305: role, status) to timestamp shape
// tightening, using the same ISO_TIMESTAMP_RE that closed the
// promotion_codes[].created_at column at tick 300. Column declared at
// 0091:75 as `linked_at timestamptz NOT NULL DEFAULT now()` on the
// reseller_admins table — NOT-NULL discipline with ISO 8601 shape →
// two-part typeof-string + ISO_TIMESTAMP_RE assert; mirrors the
// promotion_codes[].created_at tick 300 posture verbatim and the
// resellers.created_at tick 283/285 shape assert. The stamp captures
// when a user was linked to a reseller as owner|admin|viewer; a schema-
// side widening (NOT NULL drop), a PostgREST serialisation regression
// that returned null|undefined, a projection-side drop from the
// route.ts:89-93 select tuple, or a drift to a non-ISO string / Unix
// epoch number rendered as string / truncated date-only value would
// surface here on the first offending row. Detail-surface only per the
// same posture as ticks 299-305 — the admin-resellers-list route
// projects the resellers-row shape only and does not fan out to
// reseller_admins; the Promise.all leg that pulls admins rows is
// unique to the detail route at web/src/app/api/admin/resellers/[code]/
// route.ts:89-93 (select("id, user_id, role, status, linked_at,
// revoked_at")). Fires on every green CI run because seed-qa-reseller.
// mjs mints per-variant admins rows per reseller cohort; on hosts
// without seeded admins the for-loop is a no-op so the pin never
// fires. Continues the admins[] child-row column-pin cluster — only
// remaining un-tightened column after this tick is revoked_at
// (nullable ISO-8601 shape, matches the promotion_codes[].stripe_coupon
// _id nullable posture at tick 301 combined with the tick 300 ISO
// shape helper).
//
// Tick 307 — admins[].revoked_at nullable ISO-8601 timestamptz wire-
// shape pin, fourth (and closing) column pinned in the reseller_admins[]
// child-row cluster opened at tick 304 per tick 306 next-pick option
// (a). Closes the admins[] child-row column-pin cluster because
// revoked_at was the last un-tightened column in the projection tuple
// select("id, user_id, role, status, linked_at, revoked_at") at
// route.ts:89-93. Column declared at 0091:76 as `revoked_at timestamptz`
// (nullable — NO NOT NULL clause) on the reseller_admins table with no
// standalone CHECK; semantically joined to status via the link-
// lifecycle discipline (status === 'revoked' ⇔ revoked_at IS NOT NULL,
// enforced only at the app-layer revoke code-path — no DB CHECK
// constraint yet). Combines the tick 301 stripe_coupon_id nullable-
// text posture (null-or-typeof-string) with the tick 300/306 ISO shape
// assert (ISO_TIMESTAMP_RE.test on the string branch). Two-part guard:
// (a) null-or-typeof-string preserves the nullable-timestamptz posture;
// catches a schema-side NOT NULL addition that broke seeded null rows
// or a PostgREST regression that returned a non-null/non-string wire
// value; (b) conditional ISO_TIMESTAMP_RE.test() shape assert on the
// non-null branch — a drift to a non-ISO string, a Unix epoch number
// rendered as string, or a truncated date-only value would surface
// here on the first offending row. The stamp captures when a
// reseller_admins link was moved into the tombstoned state; the
// column stays NULL for the entire active lifetime of the link and
// only fills once the admin is revoked. Detail-surface only per the
// same posture as ticks 299-306 — the admin-resellers-list route
// projects the resellers-row shape only and does not fan out to
// reseller_admins; the Promise.all leg that pulls admins rows is
// unique to the detail route at web/src/app/api/admin/resellers/
// [code]/route.ts:89-93. Fires on every green CI run because seed-qa-
// reseller.mjs mints per-variant admins rows per reseller cohort; on
// hosts without seeded admins the for-loop is a no-op so the pin
// never fires. Closes the reseller_admins[] child-row column-pin
// cluster — every column in the projection tuple (id, user_id, role,
// status, linked_at, revoked_at) now carries a full wire-shape pin.
// Next-tick frontier rotates OUT of the admins[] cluster to
// reseller_attributions[] / reseller_commissions[] fan-outs which
// have larger per-row column counts still to pin.
//
// Tick 308 — commissions[].commission_id UUID wire-shape pin, first
// column pinned in the reseller_commissions_current[] child-row
// cluster. Opens the commissions[] cluster per tick 307 next-pick —
// picked commissions[] over reseller_attributions[] because commissions
// carries an 8-column projection tuple (commission_id, stripe_invoice_
// id, list_price_aud_cents, discount_pct, commission_aud_cents,
// net_owed_cents, status, created_at) vs. attributions' 5 (id,
// subject_type, status, source, attributed_at), so the commissions
// cluster amortises the module-scope const cost (no new const needed
// for UUID_RE — reused from row 665) across more per-row pins. Column
// source: reseller_commissions_current view at 0094:133-178 exposes
// `rc.id AS commission_id` where the underlying reseller_commissions.
// id is `uuid PRIMARY KEY DEFAULT gen_random_uuid()` at 0094:34 — so
// the wire type is UUID NOT NULL. Projected via select("commission_id,
// stripe_invoice_id, list_price_aud_cents, discount_pct, commission_
// aud_cents, net_owed_cents, status, created_at") on the Promise.all
// fan-out at web/src/app/api/admin/resellers/[code]/route.ts:99-105.
// Two-part guard mirroring the tick 285/292 UUID posture: (a) typeof-
// string preserves the raw-type discipline; (b) UUID_RE.test() shape
// assert catches a projection-side drop from the SELECT tuple that
// replaced commission_id with a stringified integer id, a bigint-
// serialised-as-string sequence id, or a truncated non-UUID slug. A
// schema-side migration that swapped rc.id to bigserial, a view-side
// column drop, or a PostgREST serialisation regression that returned
// null|undefined would surface here on the first offending row.
// Detail-surface only because the admin-resellers-list route projects
// only the resellers-row shape (list route SELECT at web/src/app/api/
// admin/resellers/route.ts does not fan out to
// reseller_commissions_current); the Promise.all leg that pulls the
// commissions rows is unique to the detail route. Fires on every
// green CI run only where the seeded reseller has attributed founders
// with paid Stripe invoices in the last 50 rows; on hosts without
// seeded commission events the for-loop is a no-op so the pin never
// fires. Continues the P10 hardening posture — no fixture change,
// no route change, no new imports, no new module-scope constants
// (UUID_RE reused). Opens the commissions[] child-row column-pin
// cluster; remaining un-tightened columns after this tick are
// stripe_invoice_id (text nullable), list_price_aud_cents (int
// non-negative), discount_pct (numeric [0,100]), commission_aud_cents
// (int non-negative), net_owed_cents (int, may be negative on clawback),
// status (value-set enum {cleared, pending_clearance, clawed_back,
// dispute_open, partially_refunded} per view CASE at 0094:150-172),
// and created_at (ISO-8601 shape).
//
// Tick 309 — commissions[].stripe_invoice_id text NOT NULL wire-shape
// pin, second column pinned in the reseller_commissions_current[] child-
// row cluster opened at tick 308. Tick 308 next-pick option (first
// remaining un-tightened column) taken verbatim. Note tick 308's forward-
// plan noted "(text nullable)" — that was an on-write projection error;
// the underlying reseller_commissions.stripe_invoice_id column is
// actually declared `text NOT NULL` at 0094:34, with a UNIQUE-ish idx
// at 0094:70-71 (reseller_commissions_invoice_idx). Wire type is
// therefore string NOT NULL (never null|undefined). Real values are
// minted by the webhook processor from Stripe invoice.paid events on
// attributed customers' paid invoices; canonical Stripe invoice ID
// shape is `in_<24-32 alphanumerics>` (per Stripe API docs for the
// modern in_ prefix; the legacy in_test_ prefix is a subset match).
// Projected via select("commission_id, stripe_invoice_id,
// list_price_aud_cents, discount_pct, commission_aud_cents,
// net_owed_cents, status, created_at") at web/src/app/api/admin/
// resellers/[code]/route.ts:99-105. Two-part guard mirroring the tick
// 306/307 timestamptz posture (typeof-string + shape regex) but with
// STRIPE_INVOICE_ID_RE as a new module-scope const rather than an
// existing regex — no existing pin covers the Stripe `in_` prefix
// invariant; stripe_coupon_id at ticks 301/302 was pinned as bare null-
// or-typeof-string with no shape assert (nullable text, no DB CHECK).
// The invariant lives ONLY at the write path (Stripe minted the id,
// the webhook processor stores it verbatim); a schema-side type flip
// to bigserial, a projection-side drop, a webhook-processor drift that
// stamped a stringified integer, a truncated slug, or a PostgREST
// serialisation regression that returned null|undefined would surface
// here on the first offending row. Detail-surface only per the same
// posture as ticks 299-308 — the admin-resellers-list route projects
// only the resellers-row shape and does not fan out to
// reseller_commissions_current; the Promise.all leg that pulls the
// commissions rows is unique to the detail route. Fires on every green
// CI run only where the seeded reseller has attributed founders with
// paid Stripe invoices in the last 50 rows; on hosts without seeded
// commission events the for-loop is a no-op so the pin never fires.
// Continues the P10 hardening posture — no fixture change, no route
// change, no new imports; adds ONE new module-scope const
// (STRIPE_INVOICE_ID_RE) matching the discipline of ISO_TIMESTAMP_RE,
// UUID_RE, PROMO_CODE_RE, ABN_RE, HEX_COLOR_RE that already sit in the
// module-scope regex cluster.
//
// Tick 311 — commissions[].list_price_aud_cents int NOT NULL positive
// wire-shape pin, third column pinned in the reseller_commissions_current[]
// child-row cluster opened at tick 308. Tick 309 next-pick option (a)
// taken verbatim. Column source: reseller_commissions.list_price_aud_cents
// `int NOT NULL CHECK (list_price_aud_cents > 0)` at 0094:37, projected
// verbatim through the reseller_commissions_current view at 0094:143 and
// selected on the Promise.all leg at web/src/app/api/admin/resellers/
// [code]/route.ts:99-105. Wire type is therefore number NOT NULL, strictly
// positive integer (cents). Real values are minted by the webhook
// processor's planAccrualForLine helper (web/src/lib/reseller/
// webhook-helpers.ts) from Stripe invoice.paid line-item amounts. Three-
// part guard extending the tick 285/292 UUID posture to a numeric shape:
// (a) typeof-number preserves the NOT-NULL raw-type discipline; (b)
// Number.isInteger() shape assert catches a PostgREST serialisation
// regression that returned the value as a stringified integer (bigint
// bind), a floating-point cents value from a proration edge, or NaN/
// Infinity from a webhook drift; (c) > 0 assert catches a schema-side
// CHECK constraint drop or a webhook processor drift that stamped 0 or
// negative cents. No new module-scope const needed — Number.isInteger is
// the built-in. Detail-surface only per the same posture as ticks
// 299-309 — the admin-resellers-list route projects only the resellers-
// row shape and does not fan out to reseller_commissions_current; the
// Promise.all leg that pulls the commissions rows is unique to the detail
// route. Fires on every green CI run only where the seeded reseller has
// attributed founders with paid Stripe invoices in the last 50 rows; on
// hosts without seeded commission events the for-loop is a no-op so the
// pin never fires. Continues the P10 hardening posture — no fixture
// change, no route change, no new imports, no new module-scope constants.
//
// Tick 312 — commissions[].discount_pct int NOT NULL value-set enum pin,
// fourth column pinned in the reseller_commissions_current[] child-row
// cluster opened at tick 308. Tick 311 next-pick option (a) taken
// verbatim — rotates to the discount_pct column using the ALLOWED_TIER_
// VALUES Set already introduced at tick 288 for allowed_tiers[] element
// membership on the resellers row (natural reuse — same {0,10,20,30,40}
// set enforced by admin-validator.ts on write and by the DB CHECK at
// 0094:38). Column source: reseller_commissions.discount_pct `int NOT
// NULL CHECK (discount_pct IN (0,10,20,30,40))` at 0094:38, projected
// verbatim through the reseller_commissions_current view at 0094:144
// (rc.discount_pct alias) and selected on the Promise.all leg at
// web/src/app/api/admin/resellers/[code]/route.ts:99-105. Wire type is
// therefore number NOT NULL restricted to the STARTUP_TIER_STEPS set.
// Two-part guard mirroring the tick 304/305 ALLOWED_ADMIN_ROLES /
// ALLOWED_ADMIN_STATUSES value-set posture: (a) typeof-number preserves
// the NOT-NULL raw-type discipline; (b) ALLOWED_TIER_VALUES.has()
// membership assert catches a schema-side CHECK constraint drop or a
// webhook-processor drift that stamped a discount_pct outside the
// enumeration (e.g. 5, 15, or a stringified "20"). No new module-scope
// const needed — ALLOWED_TIER_VALUES already lives at row 918 for the
// resellers-row allowed_tiers[] pin at row 1258/1492. Detail-surface
// only per the same posture as ticks 299-311 — the admin-resellers-list
// route projects only the resellers-row shape and does not fan out to
// reseller_commissions_current; the Promise.all leg that pulls the
// commissions rows is unique to the detail route. Fires on every green
// CI run only where the seeded reseller has attributed founders with
// paid Stripe invoices in the last 50 rows; on hosts without seeded
// commission events the for-loop is a no-op so the pin never fires.
// Continues the P10 hardening posture — no fixture change, no route
// change, no new imports, no new module-scope constants.
//
// Tick 313 — attributions_summary.by_source Record<enum, number> value-set
// enum tightening, SCOPE ROTATION out of the reseller_commissions_current[]
// child-row cluster (opened at tick 308, four columns pinned across ticks
// 308/309/311/312) INTO the reseller_attributions aggregate summary
// surfaced on admin-reseller-detail. Chosen over rotating to the raw
// reseller_attributions[] cluster because the detail route deliberately
// projects an AGGREGATE object (attributions_summary at route.ts:113-120)
// rather than the raw attributions rows — the raw list is neither on the
// wire nor available to a Playwright client, so the aggregate shape is
// the only legal pinning surface. Column source: computed by route.ts:
// 116-119 as `attributions.reduce<Record<string, number>>((acc, a) =>
// { acc[a.source] = (acc[a.source] ?? 0) + 1; return acc; }, {})`, where
// `a.source` is `reseller_attributions.source text NOT NULL CHECK
// (source IN ('code','provisioned','admin_manual'))` at 0091:123. The
// DB CHECK is the SOLE enforcement layer — no application-write-path
// enum guard on source writes (attribution.ts stamps the value based on
// the linking flow, not a Zod-validated field), so a schema-side CHECK
// drop or a legacy INSERT that stamped a source outside the enumeration
// would flow straight through PostgREST into the reduce accumulator and
// land as a rogue key on the wire. This tick pins BOTH halves of that
// invariant: (a) every KEY of by_source must be in the
// ALLOWED_ATTRIBUTION_SOURCES value set {'code','provisioned',
// 'admin_manual'} — catches the schema-CHECK-drop / rogue-source-INSERT
// path; (b) every VALUE must be typeof-number + Number.isInteger + >= 0
// — catches a JavaScript regression in the reducer that stamped a
// stringified count, NaN from a divide-by-zero, or a negative value
// from a reducer refactor. Also carries the tick 305/312 value-set
// discipline into a NEW module-scope Set (ALLOWED_ATTRIBUTION_SOURCES)
// mirroring the existing ALLOWED_ADMIN_ROLES / ALLOWED_ADMIN_STATUSES /
// ALLOWED_TIER_VALUES cluster, kept adjacent to the ALLOWED_ADMIN_*
// constants at row 969. Detail-surface only — the admin-resellers-list
// route projects only the resellers-row shape (route.ts) and does not
// compute an attributions_summary; the aggregate is unique to the
// detail route's Promise.all leg. Fires on every green CI run because
// the summary object is ALWAYS present on the wire regardless of
// whether the attributions array is empty (an empty reduce returns
// `{}`, which trivially satisfies the KEY-membership assert as a
// vacuous truth and skips the VALUE assert). Continues the P10
// hardening posture — no fixture change, no route change, no new
// imports; adds ONE new module-scope const (ALLOWED_ATTRIBUTION_SOURCES).
// The tick also opens the door for a future tick 314+ to rotate BACK
// to the commissions[] cluster's remaining columns (commission_aud_cents
// >= 0, net_owed_cents integer, status enum, created_at ISO shape) OR
// forward to a raw reseller_attributions[] cluster if the detail route
// is ever widened to fan out the raw rows (per U.15.1 the raw fan-out
// remains behind attributions_summary today).
//
// Tick 314 — commissions[].commission_aud_cents int NOT NULL non-negative
// wire-shape pin, SCOPE ROTATION BACK into the reseller_commissions_current[]
// child-row cluster after the tick 313 rotation into attributions_summary.
// Tick 313 next-pick option (a) taken verbatim — rotates back to the
// commissions[] cluster's next un-tightened column. Column source:
// reseller_commissions.commission_aud_cents `int NOT NULL CHECK
// (commission_aud_cents >= 0)` at 0094:41, projected via view alias
// rc.commission_aud_cents in reseller_commissions_current at 0094:147
// and selected on the Promise.all leg at web/src/app/api/admin/resellers/
// [code]/route.ts:99-105. Three-part guard mirroring the tick 311
// list_price_aud_cents posture verbatim but with a >= 0 tail assert
// rather than > 0 — retail rows carry positive commission but wholesale
// rows always stamp commission_aud_cents = 0 per the ck_commission_split
// CHECK constraint at 0094:52-60 (wholesale branch requires
// commission_aud_cents = 0), so a strict > 0 tail assert would false-
// positive on every wholesale commission row. Guard parts: (a) typeof-
// number preserves the NOT-NULL raw-type discipline; catches a PostgREST
// regression that returned null|undefined, a schema-side NOT NULL drop,
// or a projection-side drop from the SELECT tuple. (b) Number.isInteger()
// catches a bigint-as-string serialisation regression, a fractional-cents
// value from a proration edge, or NaN/Infinity from a webhook processor
// drift. (c) >= 0 assert catches a schema-side CHECK constraint drop or
// a webhook processor drift that stamped negative cents (a clawback or
// refund event lives in reseller_commission_events with a negative
// delta_aud_cents; the base commission_aud_cents column itself is always
// non-negative per 0094:41). Detail-surface only per the same posture as
// ticks 299-312 — the commissions Promise.all leg is unique to the
// detail route. No new module-scope const needed — Number.isInteger is a
// built-in. Continues the P10 hardening posture — no fixture change, no
// route change, no new imports.
//
// Tick 315 — commissions[].net_owed_cents int wire-shape pin (may be
// negative), continues the reseller_commissions_current[] child-row
// cluster after the tick 314 commission_aud_cents pin. Tick 314 next-pick
// option (a) taken verbatim — rotates to the next un-tightened column,
// net_owed_cents. Column source: the reseller_commissions_current view
// computes `rc.commission_aud_cents + COALESCE(SUM(delta_aud_cents), 0)
// AS net_owed_cents` at 0094:173-177 by folding the base commission over
// every non-accrued/non-cleared/non-dispute_opened/non-dispute_won event
// from reseller_commission_events (i.e. refund_full, refund_partial,
// dispute_lost, void — all of which stamp a NEGATIVE delta_aud_cents to
// unwind the accrual). The wire type is therefore number (int), NOT NULL
// on the view projection (COALESCE guarantees non-null even when the
// commission has zero events), and the value MAY be negative when the
// event sum exceeds the base commission (e.g. a partial refund that
// happened after a small commission accrued, or a schema-side reducer
// drift). Selected on the Promise.all leg at web/src/app/api/admin/
// resellers/[code]/route.ts:99-105.
//
// Design choice — TWO-PART guard rather than three-part: mirrors the
// tick 311 / tick 314 list_price_aud_cents / commission_aud_cents posture
// on parts (a) + (b) but INTENTIONALLY drops the sign tail assert used
// there. Rationale: parts (a) typeof-number and (b) Number.isInteger()
// still preserve the raw-type + integer-shape discipline (catches
// PostgREST null|undefined, bigint-as-string, fractional cents, NaN,
// Infinity), but a `>= 0` or `> 0` tail assert would false-positive on
// EVERY row that has been fully or partially refunded — the whole point
// of net_owed_cents is to expose a signed running balance so the reseller
// console can render clawback exposure. A `>= 0` tail here would surface
// exactly on the rows a P10 hardening reader most needs to see
// undistorted. The write path invariants that guard the value's realism
// (event kind enumeration, delta_aud_cents sign discipline, view SUM
// aggregation) all live in the schema — the spec's job is to catch a
// wire regression, not to duplicate the arithmetic invariant. Detail-
// surface only per the same posture as ticks 299-314 — the commissions
// Promise.all leg is unique to the detail route. No new module-scope
// const needed. Continues the P10 hardening posture — no fixture change,
// no route change, no new imports.
//
// Tick 316 — commissions[].status text NOT NULL value-set enum pin.
// Continues the reseller_commissions_current[] child-row cluster after
// the tick 315 net_owed_cents pin. Tick 315 next-pick option (a) taken
// verbatim — rotates to the status column using a NEW module-scope Set
// const ALLOWED_COMMISSION_STATUSES kept adjacent to the existing
// ALLOWED_ADMIN_ROLES / ALLOWED_ADMIN_STATUSES / ALLOWED_TIER_VALUES /
// ALLOWED_ATTRIBUTION_SOURCES cluster. Column source: the
// reseller_commissions_current view derives the status via the CASE
// expression at 0094:150-172, which returns one of the five values
// {clawed_back, dispute_open, partially_refunded, cleared,
// pending_clearance} based on the presence/absence of specific event_type
// rows in reseller_commission_events (see the ALLOWED_COMMISSION_STATUSES
// doc-block above for the per-branch semantics). The value is view-
// computed rather than a stored column so the CASE expression is the
// sole enforcement layer — there is no DB CHECK on status because the
// value never lives in a base table. Selected on the Promise.all leg at
// web/src/app/api/admin/resellers/[code]/route.ts:99-105 as the 7th
// column in the reseller_commissions_current tuple.
//
// Design choice — two-part guard mirroring the tick 304/305
// ALLOWED_ADMIN_ROLES / ALLOWED_ADMIN_STATUSES value-set posture verbatim:
// (a) typeof-string preserves the NOT-NULL raw-type discipline; catches
// a PostgREST regression that returned null|undefined, a view-definition
// drift that dropped the ELSE branch of the CASE (leaving the column
// nullable when no event_type match), or a projection-side drop from the
// route.ts:99-105 SELECT tuple. (b) ALLOWED_COMMISSION_STATUSES.has()
// membership assert catches a view-definition drift that introduced a
// new status literal outside the enumeration (e.g. adding a
// 'partially_disputed' branch without extending the Set-side allowlist)
// or a schema-side edit that added a new event_type without extending
// the CASE expression (leaving rows falling through to an unexpected
// branch). Detail-surface only per the same posture as ticks 299-315 —
// the commissions Promise.all leg is unique to the detail route.
//
// Coverage-per-guard posture: wave-5 row 167 single-row GET fires the
// two-part pin up to 50 times per test, once per commissions[] row on
// the QAPROBEWHOLESALEACTIVE seed reseller. Hosts without seeded
// commission rows still green because the for-loop degrades gracefully
// to a no-op. Continues the P10 hardening posture — no fixture change,
// no route change, no new imports; adds ONE new module-scope const
// (ALLOWED_COMMISSION_STATUSES).
//
// Tick 317 — commissions[].created_at timestamptz NOT NULL wire-shape pin.
// Continues the reseller_commissions_current[] child-row cluster after the
// tick 316 status pin. Tick 316 next-pick option (a) taken verbatim —
// rotates to the created_at column using the existing module-scope
// ISO_TIMESTAMP_RE const, no new const needed. Column source: the
// reseller_commissions ledger row declares `created_at timestamptz NOT
// NULL DEFAULT now()` at 0094:44; the reseller_commissions_current view
// projects `rc.created_at` verbatim at 0094:149. Selected on the
// Promise.all leg at web/src/app/api/admin/resellers/[code]/route.ts:99-105
// as the 8th column in the reseller_commissions_current tuple (and the
// column the .order("created_at", { ascending: false }) at route.ts:104
// sorts by, so a drift on this column also breaks the deterministic row
// order that the wave-5 row 167 detail payload assumes).
//
// Design choice — two-part guard mirroring the tick 285 reseller.created_at
// / reseller.updated_at posture verbatim: (a) typeof-string preserves the
// NOT-NULL raw-type discipline; catches a PostgREST regression that
// returned null|undefined, a schema-side NOT NULL drop, or a projection-
// side drop from the route.ts:99-105 SELECT tuple. (b) ISO_TIMESTAMP_RE
// .test() shape assert catches a serialisation regression that returned
// a Postgres-native "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a
// Unix epoch number-as-string, a truncated date-only slug, or a legacy
// pre-ISO timestamp. Detail-surface only per the same posture as ticks
// 299-316 — the commissions Promise.all leg is unique to the detail route.
//
// Coverage-per-guard posture: wave-5 row 167 single-row GET fires the
// two-part pin up to 50 times per test, once per commissions[] row on the
// QAPROBEWHOLESALEACTIVE seed reseller. Hosts without seeded commission
// rows still green because the for-loop degrades gracefully to a no-op.
// Continues the P10 hardening posture — no fixture change, no route
// change, no new imports; no new module-scope const needed
// (ISO_TIMESTAMP_RE already lives at row 1063).
//
// Tick 318 — attributions_summary.total int non-negative wire-shape
// tightening. SCOPE ROTATION out of the reseller_commissions_current[]
// child-row cluster (which is now fully pinned column-by-column from
// tick 308 through tick 317: commission_id / stripe_invoice_id /
// list_price_aud_cents / discount_pct / commission_aud_cents /
// net_owed_cents / status / created_at — all eight tuple columns
// selected on the route.ts:99-105 Promise.all leg now carry a wire-
// shape pin) back onto the aggregate attributions_summary shape that
// tick 313 opened for by_source. Column source: route.ts:113-120
// materialises the aggregate as `attributions_summary: { total,
// active, by_source }` where `total: attributions.length` reads the
// length of the reseller_attributions rows array selected on
// route.ts:94-97 with .select("id, subject_type, status, source,
// attributed_at").eq("reseller_id", row.id). By JS Array.length
// invariant the value is a non-negative int32 in [0, 2^32-1]; the
// wave-5 row 167 QAPROBEWHOLESALEACTIVE seed reseller has 0
// attributions by default so the value is trivially 0 on green runs.
//
// Design choice — three-part guard mirroring the tick 313 by_source
// count guard shape verbatim so total + active + by_source counts all
// share the same tail-invariant discipline: (a) typeof-number
// preserves the raw-type discipline the existing bare row 1940 pin
// already covered; (b) Number.isInteger() catches a JS regression
// that stamped a stringified count (`String(attributions.length)`
// under a refactor to `.toString()`), a floating-point value from an
// accidental `attributions.reduce((n) => n + 0.5, 0)` refactor, or
// NaN/Infinity from a divide-by-zero edge; (c) >= 0 assert catches a
// signed-int wraparound or a reducer refactor that stamped a
// negative counter (e.g. `attributions.filter(...).length - 1` under
// an off-by-one refactor). Rotates out of the commissions[] cluster
// intentionally: eight sequential ticks on the same row shape risks
// drift on the aggregate summary object, and the by_source value
// guard (tick 313) already established the tail invariant for
// counts inside the same summary — extending it to total (this tick)
// + active (natural next pick option (a) for tick 319) closes the
// summary object out symmetrically. No new imports, no new module-
// scope const needed (typeof/isInteger/>=0 are all bare-JS). See
// module-scope doc-block above ISO_TIMESTAMP_RE (tick 313 paragraph)
// for the by_source parallel discipline this tick mirrors.
//
// Tick 319 — attributions_summary.active int non-negative wire-shape
// tightening. Natural next pick per the tick 318 doc-block "extending
// it to total (this tick) + active (natural next pick option (a) for
// tick 319) closes the summary object out symmetrically". Column
// source: route.ts:115 stamps `active: attributions.filter((a) =>
// a.status === "active").length` where `attributions` is the array
// selected on route.ts:94-97 with .select("id, subject_type, status,
// source, attributed_at").eq("reseller_id", row.id). By
// Array.prototype.filter → Array.length invariant the value is a
// non-negative int32 in [0, 2^32-1] and is bounded above by
// attributions_summary.total (already pinned by tick 318); the wave-5
// row 167 QAPROBEWHOLESALEACTIVE seed reseller has 0 attributions by
// default so the value is trivially 0 on green runs.
//
// Design choice — three-part guard mirroring tick 318 total guard
// shape verbatim so total + active + by_source counts all share the
// same tail-invariant discipline: (a) typeof-number preserves the
// raw-type discipline the existing bare row 2001 pin already covered;
// (b) Number.isInteger() catches a JS regression that stamped a
// stringified count (`String(attributions.filter(...).length)` under a
// refactor to `.toString()`), a floating-point value from an
// accidental `attributions.reduce((n) => n + 0.5, 0)` refactor, or
// NaN/Infinity from a divide-by-zero edge; (c) >= 0 assert catches a
// signed-int wraparound or a filter refactor that stamped a negative
// counter (e.g. `attributions.filter(...).length - 1` under an
// off-by-one refactor). Closes the attributions_summary object cluster
// out symmetrically — total (tick 318) + active (this tick) + by_source
// (tick 313) are now all three-part-guarded. Next tick 320 rotates
// scope onto the promotion_codes[] cluster (route.ts:83-88 Promise.all
// leg selects id / tier_pct / code / stripe_coupon_id /
// stripe_promotion_code_id / active / created_at — seven tuple columns
// waiting for column-by-column pinning). No new imports, no new
// module-scope const needed (typeof/isInteger/>=0 are all bare-JS). See
// module-scope doc-block above ISO_TIMESTAMP_RE (tick 318 paragraph)
// for the total parallel discipline this tick mirrors.
//
// Tick 320 — promotion_codes[].id UUID two-part wire-shape pin, SCOPE
// ROTATION back onto the promotion_codes[] child-row cluster after the
// tick 313 (by_source) + tick 318 (total) + tick 319 (active) triple pin
// on attributions_summary. Tick 319 next-pick option (a) taken verbatim.
// Column source: `reseller_promotion_codes.id uuid PRIMARY KEY DEFAULT
// gen_random_uuid()` at 0091:89, projected via select("id, tier_pct,
// code, stripe_coupon_id, stripe_promotion_code_id, active, created_at")
// on the Promise.all leg at web/src/app/api/admin/resellers/[code]/
// route.ts:83-88. Wire type is UUID NOT NULL.
//
// Prior baseline landed a single BARE combined pin at row 1825
// `typeof row.id === "string" && UUID_RE.test(row.id as string)` with a
// generic "should be UUID" message — the two failure modes (schema-side
// type flip to bigserial vs. projection-side drop from route.ts:83-88
// SELECT returning null|undefined vs. a truncated non-UUID slug) all
// collapse into the same undifferentiated failure. This tick promotes
// the pin to the two-part shape matching the tick 308 commission_id
// posture verbatim: (a) typeof-string preserves the raw-type discipline;
// catches a PostgREST regression that returned null|undefined, a
// schema-side NOT NULL drop, or a projection-side drop from the SELECT
// tuple. (b) UUID_RE.test() shape assert catches a schema-side type flip
// to bigserial rendering a stringified integer, a bigint-serialised-as-
// string sequence id, or a truncated non-UUID slug. Each half carries a
// bespoke failure message pointing at 0091:89 as the writer-schema
// source.
//
// Detail-surface only per the same posture as ticks 299-319 — the
// admin-resellers-list route projects only the resellers-row shape and
// does not fan out to reseller_promotion_codes; the Promise.all leg
// that pulls the promotion_codes rows is unique to the detail route.
// Fires on every green CI run because the QAPROBEWHOLESALEACTIVE seed
// row has 2 minted promotion codes (tier 20 + tier 40 per seed-qa-
// reseller.mjs); on hosts without seeded codes the for-loop is a no-op
// so the pin never fires. No new module-scope const needed — UUID_RE
// already lives at row 111. Continues the P10 hardening posture — no
// fixture change, no route change, no new imports.
//
// Tick 321 — admins[].id UUID two-part wire-shape pin, SCOPE ROTATION
// out of the promotion_codes[] child-row cluster (tick 320 opened the
// two-part UUID posture at column 0 / id) INTO the reseller_admins[]
// child-row cluster. Tick 320 next-pick option (b) taken verbatim —
// lifts the prior baseline bare combined pin at
// `typeof row.id === "string" && UUID_RE.test(row.id as string)` into
// the two-part shape matching the tick 308 commissions[].commission_id
// + tick 320 promotion_codes[].id posture verbatim.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:68 declares
//     `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on the
//     reseller_admins base table.
//   - Application read path: selected on the Promise.all leg at
//     web/src/app/api/admin/resellers/[code]/route.ts:89-93 as the 1st
//     column in the reseller_admins tuple
//     .select("id, user_id, role, status, linked_at, revoked_at").
//
// Design choice — two-part guard mirroring the tick 308 / tick 320
// posture verbatim: (a) typeof-string preserves the NOT-NULL raw-type
// discipline; catches a PostgREST regression that returned
// null|undefined, a schema-side NOT NULL drop, or a projection-side
// drop from the route.ts:89-93 SELECT tuple. (b) UUID_RE.test() shape
// assert catches a schema-side type flip to bigserial rendering a
// stringified integer, a bigint-serialised-as-string sequence id, or a
// truncated non-UUID slug. Each half carries a bespoke failure message
// pointing at 0091:68 as the writer-schema source.
//
// Detail-surface only per the same posture as ticks 299-320 — the
// admin-resellers-list route projects only the resellers-row shape and
// does not fan out to reseller_admins; the Promise.all leg that pulls
// admins rows is unique to the detail route. Fires on every green CI
// run because seed-qa-reseller.mjs mints per-variant reseller_admins
// rows per reseller cohort; on hosts without seeded admins the for-
// loop is a no-op so the pin never fires. No new module-scope const
// needed — UUID_RE already lives at row 111. Continues the P10
// hardening posture — no fixture change, no route change, no new
// imports. Opens the admins[] child-row column-pin polish sweep;
// natural next-pick tick 322 candidates: (a) admins[].user_id UUID
// two-part lift (identical posture to this tick, sibling column at
// route.ts:89-93 select tuple position 1), (b) promotion_codes[].code
// tick-numbered labelled message shape lift on the already-two-part
// row 1891-1892 pin.
//
// Tick 322 — admins[].user_id UUID two-part wire-shape pin, sibling-
// column continuation of the reseller_admins[] child-row cluster
// opened at tick 321 (id / column 0 of the route.ts:89-93 select
// tuple). Tick 321 next-pick option (a) taken verbatim — lifts the
// prior baseline bare combined pin at
// `typeof row.user_id === "string" && UUID_RE.test(row.user_id as
// string)` (single-line combined guard with a generic message) into
// the two-part shape matching the tick 308 commissions[].commission_id
// + tick 320 promotion_codes[].id + tick 321 admins[].id posture
// verbatim.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:69 declares
//     `user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE
//     CASCADE` on the reseller_admins base table — NOT-NULL FK to
//     app_users.id (which is itself uuid PRIMARY KEY DEFAULT
//     gen_random_uuid() per 0005 app_users schema); therefore
//     user_id shares the same UUID shape invariant as admins[].id.
//   - Application read path: selected on the Promise.all leg at
//     web/src/app/api/admin/resellers/[code]/route.ts:89-93 as the
//     2nd column in the reseller_admins tuple
//     .select("id, user_id, role, status, linked_at, revoked_at").
//
// Design choice — two-part guard mirroring the tick 321 posture
// verbatim: (a) typeof-string preserves the NOT-NULL raw-type
// discipline; catches a PostgREST regression that returned
// null|undefined, a schema-side NOT NULL drop, a projection-side
// drop from the route.ts:89-93 SELECT tuple, or an ON DELETE CASCADE
// race that briefly rendered the row after the FK target was purged.
// (b) UUID_RE.test() shape assert catches a schema-side type flip to
// bigserial rendering a stringified integer, a bigint-serialised-as-
// string sequence id, or a truncated non-UUID slug. Each half carries
// a bespoke failure message pointing at 0091:69 as the writer-schema
// source.
//
// Detail-surface only per the same posture as ticks 299-321 — the
// admin-resellers-list route projects only the resellers-row shape
// and does not fan out to reseller_admins; the Promise.all leg that
// pulls admins rows is unique to the detail route. Fires on every
// green CI run because seed-qa-reseller.mjs mints per-variant
// reseller_admins rows per reseller cohort; on hosts without seeded
// admins the for-loop is a no-op so the pin never fires. No new
// module-scope const needed — UUID_RE already lives at row 111.
// Continues the P10 hardening posture — no fixture change, no route
// change, no new imports. Continues the admins[] child-row column-
// pin polish sweep opened at tick 321; natural next-pick tick 323
// candidates: (a) promotion_codes[].code tick-numbered labelled
// message shape lift on the already-two-part row 1891-1892 pin,
// (b) admins[].role / admins[].status already-two-part labelled
// message ticks (roles + statuses of the enum guards) or a rotation
// back to the promotion_codes[] column-pin cluster on the remaining
// tuple positions.
//
// Tick 324 — promotion_codes[].code PROMO_CODE_RE two-part wire-shape
// pin, sibling-column continuation of the promotion_codes[] child-row
// cluster opened at tick 320 (id / column 0 of the route.ts:83-88
// select tuple). Tick 322 next-pick option (a) taken verbatim — lifts
// the prior tick 232 baseline bare two-part pin at
// `expect(typeof row.code).toBe("string"); expect(row.code as string)
// .toMatch(PROMO_CODE_RE);` (already two-part but lacks the tick-
// numbered labelled message shape used by the tick 320 lift) into the
// two-expect labelled shape matching the tick 320 promotion_codes[].id
// + tick 321 admins[].id + tick 322 admins[].user_id posture verbatim.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:91 declares
//     `code text NOT NULL UNIQUE` on the reseller_promotion_codes base
//     table. UNIQUE + NOT NULL text column with the uppercase-
//     alphanumeric invariant living on the application write path
//     only (buildPromoCodeName at
//     web/src/lib/reseller/promotion-code-mint.ts:41-58 — uppercase +
//     <=40 chars, composed from normaliseResellerCode() output +
//     optional SUFFIX_RE-vetted tier suffix). No DB CHECK, so a raw /
//     lowercase / punctuated INSERT bypassing buildPromoCodeName would
//     land silently at the schema layer and only surface at visual QA.
//   - Application read path: selected on the Promise.all leg at
//     web/src/app/api/admin/resellers/[code]/route.ts:83-88 as the
//     3rd column in the reseller_promotion_codes tuple
//     .select("id, tier_pct, code, stripe_coupon_id,
//     stripe_promotion_code_id, active, created_at").
//
// Design choice — two-part guard mirroring the tick 320
// promotion_codes[].id posture verbatim: (a) typeof-string preserves
// the NOT-NULL raw-type discipline; catches a PostgREST regression
// that returned null|undefined, a schema-side NOT NULL drop, or a
// projection-side drop from the route.ts:83-88 SELECT tuple.
// (b) PROMO_CODE_RE.test() shape assert catches a P9.4 approve-branch
// bypass that INSERTed a raw / lowercase / punctuated code straight
// past buildPromoCodeName, or a write-path drift widening the SUFFIX_RE
// -vetted tier suffix. Each half carries a bespoke failure message
// pointing at 0091:91 as the writer-schema source and promotion-code-
// mint.ts:41-58 as the application invariant.
//
// Detail-surface only per the same posture as ticks 299-322 — the
// admin-resellers-list route projects only the resellers-row shape
// and does not fan out to reseller_promotion_codes; the Promise.all
// leg that pulls promotion_codes rows is unique to the detail route.
// Fires on every green CI run because seed-qa-reseller.mjs mints per-
// variant reseller_promotion_codes rows per reseller cohort; on hosts
// without seeded promotion codes the for-loop is a no-op so the pin
// never fires. No new module-scope const needed — PROMO_CODE_RE
// already lives at row 1328. Continues the P10 hardening posture — no
// fixture change, no route change, no new imports. Two of the seven
// promotion_codes[] tuple positions (id, code) now carry the tick-
// numbered two-part labelled discipline; tier_pct enum pin (tick 303)
// already labelled, active bool (tick 299) / created_at (tick 300) /
// stripe_coupon_id (tick 301) / stripe_promotion_code_id (tick 302)
// already carry bespoke messages so the cluster is nearing symmetric
// close-out on the next rotation. Natural next-pick tick 325
// candidates: (a) rotate to admins[].linked_at / admins[].revoked_at
// ISO-8601 shape refresh (ticks 306-307 already labelled), (b) rotate
// to attributions[].* row-shape pins now that the aggregate
// attributions_summary cluster closed at tick 319, (c) idle — the
// frontier remains tight (P1.5 + P8.5 HUMAN-BLOCKED, P11
// never_completes, Track B closed).
//
// Tick 325 — reseller.id UUID PRIMARY KEY two-part wire-shape pin.
// SCOPE ROTATION out of the child-row clusters (promotion_codes[] +
// admins[] + commissions[] all pinned across ticks 299-324) INTO the
// top-level reseller row shape. Lifts the prior baseline single-line
// combined pin at
//   `typeof body.reseller?.id === "string" && UUID_RE.test(body.reseller!.id as string)`
// (single expect with a generic 'should be UUID' message and no per-
// half diagnostic) into the two-expect labelled shape matching the
// tick 308 commissions[].commission_id + tick 320 promotion_codes[].id
// + tick 321 admins[].id posture verbatim. Closes the UUID PRIMARY
// KEY column-pin cluster on the detail payload symmetrically — the
// four UUID PKs on the wire (top-level reseller + three child rows)
// now share one tick-numbered labelled pinning discipline.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:23 declares
//     `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on the resellers
//     base table.
//   - Application read path: projected via route.ts:47-48 select("*")
//     on the loadReseller() single-row lookup, then surfaced as the
//     top-level `reseller` field on the detail payload body at
//     web/src/app/api/admin/resellers/[code]/route.ts:122-129.
//
// Design choice — two-part guard mirroring the tick 308/320/321
// posture verbatim:
//   - (a) typeof-string preserves the NOT-NULL raw-type discipline;
//     catches a PostgREST regression that returned null|undefined, a
//     schema-side NOT NULL drop, or a projection-side drop from the
//     route.ts:47-48 SELECT tuple.
//   - (b) UUID_RE.test() shape assert catches a schema-side type flip
//     to bigserial rendering a stringified integer, a bigint-
//     serialised-as-string sequence id, or a truncated non-UUID slug.
//
// Coverage-per-guard posture:
//   - Detail surface: wave-5 row 167 single-row GET fires the two-part
//     pin at least once per test on the QAPROBEWHOLESALEACTIVE seed
//     reseller (top-level parent row is always present when
//     loadReseller() returns row-not-null).
//
// Rotation rationale:
//   - Closes the UUID PRIMARY KEY column-pin sweep symmetrically. Four
//     of the four UUID PKs on the detail payload (reseller.id + three
//     child-row .id/.commission_id columns) now carry the two-expect
//     labelled shape.
//   - No new imports, no new module-scope const needed — UUID_RE
//     already lives at row 111.
//
// Natural next-pick tick 326 candidates: (a) rotate to
// reseller.display_name text NOT NULL two-part lift (the tick 1710
// baseline `expect(typeof body.reseller?.display_name).toBe("string")`
// is a single-part typeof-string with no diagnostic message and no
// tick-numbered doc-block); (b) rotate to reseller.billing_model /
// reseller.status single-part BILLING_MODELS.has() / STATUSES.has()
// pins into two-part typeof-string + Set.has() shape matching the
// tick 304/305/312/316 value-set posture verbatim; (c) rotate to
// reseller.code text NOT NULL UNIQUE tick-numbered labelled shape
// lift (currently bare `.toBe(fixture.code)` equality with no per-
// half diagnostic).
//
// Tick 326 — admins[] status ⇔ revoked_at cross-column lifecycle
// invariant pin, closing the reseller_admins[] child-row cluster
// opened at tick 321 (id) and continued through tick 322 (user_id) /
// ticks 304-307 (role / status / linked_at / revoked_at). Extends
// tick 324's option (a) refresh into a LOGICAL close-out because the
// per-column shape pins on the six-column projection tuple
// select("id, user_id, role, status, linked_at, revoked_at") are all
// already labelled — the last remaining defence lens is the cross-
// column invariant that tick 307 documented aspirationally
// ("status === 'revoked' ⇔ revoked_at IS NOT NULL, active for live
// links, revoked for tombstoned admins whose revoked_at timestamp is
// set") but no per-column pin can enforce alone.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:73-76 declares status text
//     NOT NULL CHECK IN ('active','revoked') + revoked_at timestamptz
//     nullable. The DB has NO CHECK constraint tying the two — the
//     lifecycle invariant lives on the application write path only.
//   - Application write path: no revoke code-path currently ships in
//     tree (grep -rn "revoked_at" web/src/lib/reseller/ web/src/app/
//     api/reseller/ web/src/app/api/admin/resellers/ returns only the
//     detail route's SELECT projection). Therefore every green-CI
//     admins[] row today has status='active' + revoked_at=null; the
//     pin is defensive against a future revoke-mutation path that
//     forgets to stamp revoked_at when flipping status → 'revoked',
//     or a resurrect-mutation path that flips status back to 'active'
//     but forgets to null revoked_at.
//   - Application read path: two columns co-projected on the same
//     Promise.all leg at web/src/app/api/admin/resellers/[code]/
//     route.ts:89-93 select("id, user_id, role, status, linked_at,
//     revoked_at").
//
// Design choice — two-branch cross-column guard:
//   - (a) status === 'active' branch: revoked_at should be null;
//     catches a legacy INSERT that stamped a revoked_at value on an
//     active row (violates the "active for live links" half of the
//     tick 307 invariant), or a future resurrect path that flipped
//     status back to 'active' but forgot to null revoked_at.
//   - (b) status === 'revoked' branch: revoked_at should be a string
//     (already pinned as ISO 8601 shape at tick 307 on the non-null
//     branch); catches a future revoke path that flipped status →
//     'revoked' but forgot to stamp revoked_at with now() (violates
//     the "revoked for tombstoned admins whose revoked_at timestamp
//     is set" half of the tick 307 invariant).
//   - Guarded by the tick 305 ALLOWED_ADMIN_STATUSES membership pin
//     already firing above so a rogue enum value ('disabled') would
//     surface at the status pin rather than as a spurious lifecycle
//     failure here.
//
// Detail-surface only per the same posture as ticks 299-325 — the
// admin-resellers-list route projects only the resellers-row shape
// and does not fan out to reseller_admins; the Promise.all leg that
// pulls admins rows is unique to the detail route. Fires on every
// green CI run because seed-qa-reseller.mjs mints per-variant
// reseller_admins rows per reseller cohort (all status='active' +
// revoked_at=null under the current app write-path posture); on
// hosts without seeded admins the for-loop is a no-op so the pin
// never fires. No new module-scope const needed — no regex, no Set,
// no imports. Continues the P10 hardening posture — no fixture
// change, no route change, no new imports. Symmetrically closes the
// reseller_admins[] child-row cluster: every projected column now
// carries a per-column pin PLUS the cross-column lifecycle pin.
// Natural next-pick tick 327 candidates: (a) rotate to
// promotion_codes[] cross-column pin (tier 0 → stripe ids null,
// tier > 0 → stripe ids non-null already lives inline at
// ticks 301-302 — a symmetric close-out summary comment could hoist
// it into module-scope doc-block form), (b) rotate to a new cluster
// on the reseller-row column-level ISO shape refresh on created_at
// / updated_at now that the ticks 283/285/294/296 posture has
// drifted further from the current two-part labelled discipline
// used by ticks 320-325, (c) tick 325 option (a) — the
// reseller.display_name text NOT NULL two-part lift on the tick
// 1710 baseline pin (still open), (d) idle — the frontier remains
// tight (P1.5 + P8.5 HUMAN-BLOCKED, P11 never_completes, Track B
// closed, P10 continues accepting incremental pin-tightening
// ticks).
//
// Tick 327 — reseller.display_name text NOT NULL two-part labelled
// lift on the tick-1710 baseline single-part typeof-string pin.
// Executes tick 325/326 next-pick option (c) verbatim: the top-level
// reseller.display_name column on the detail payload was still
// carrying the bare single-line
// `expect(typeof body.reseller?.display_name).toBe("string")` pin
// with no diagnostic message and no tick-numbered doc-block, while
// its neighbour columns (id UUID at tick 325, created_at/updated_at
// ISO at ticks 283/285, commission_share_pct numeric at tick 286,
// gst_registered bool at tick 287, code at tick 231) have all moved
// on to two-part labelled discipline. Lifting display_name closes
// the top-level reseller-row wire-shape sweep one column tighter and
// stays in the same P10 pin-tightening posture as ticks 320-326.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:25 declares
//     `display_name text NOT NULL`. The DB carries NO CHECK
//     constraint against blank/whitespace-only strings — an
//     unvalidated INSERT could stamp display_name='' and the
//     database would accept it.
//   - Application write path: admin-validator.ts:66-70 REJECTS
//     patch.display_name that trims to empty with
//     reason='display_name_blank' (see validateAdminResellerPatch
//     branch); a P9 create-branch that bypasses the validator (or a
//     future non-admin write path that forgot to route through
//     validateAdminResellerPatch) could still slip an empty-string
//     value into the column since the DB has no CHECK constraint to
//     backstop the validator.
//   - Application read path: projected via route.ts:47-48
//     select("*") on the loadReseller() single-row lookup, then
//     surfaced as the top-level `reseller` field on the detail
//     payload body at web/src/app/api/admin/resellers/[code]/
//     route.ts:122-129 — same read-path leg as the tick 325 UUID PK
//     pin one row above, the tick 285 created_at/updated_at ISO
//     pins one row below, and the tick 286 commission_share_pct
//     numeric pin two rows below.
//
// Design choice — two-part guard mirroring the tick 325 posture but
// with a length-based shape half rather than a regex, matching the
// admin-validator.ts:66-70 write-path invariant (String(x).trim()
// must be non-empty):
//   - (a) typeof-string preserves the NOT-NULL raw-type discipline;
//     catches a PostgREST regression that returned null|undefined, a
//     schema-side NOT NULL drop, or a projection-side drop from the
//     route.ts:47-48 SELECT tuple.
//   - (b) String(...).trim().length > 0 shape assert catches an
//     unvalidated INSERT / bypass write path that stamped
//     display_name='' or display_name='   ' straight past the
//     validator's display_name_blank guard; the DB has no CHECK
//     constraint against blank strings, so the invariant lives ONLY
//     on the application write path (admin-validator.ts:66-70) plus
//     the Playwright wire-shape pin.
//
// Coverage-per-guard posture:
//   - Detail surface: wave-5 row 167 single-row GET fires the two-
//     part pin at least once per test on the QAPROBEWHOLESALEACTIVE
//     seed reseller (top-level parent row is always present when
//     loadReseller() returns row-not-null; seed fixture stamps a
//     non-empty display_name so the shape half passes on every green
//     CI run).
//
// Rotation rationale:
//   - Closes the tick-1710 baseline single-part typeof-string pin
//     that has been the last outstanding column on the top-level
//     reseller-row wire-shape sweep since the tick 325 lift closed
//     the UUID PK cluster; the remaining bare pins on the reseller-
//     row shape are the code equality assert (still bare
//     `.toBe(fixture.code)` — deliberate identity check, not a
//     wire-shape pin) and the billing_model/status Set.has() pins
//     (tick 326 next-pick option (b) — still open for a future tick).
//   - No new imports, no new module-scope const needed — pure typeof
//     + String().trim().length inline check.
//   - Continues the P10 hardening posture per ticks 234-326 — no
//     production code touched, no fixture change, no route change,
//     no new imports, no new module-scope const.
//
// Natural next-pick tick 328 candidates:
//   (a) rotate to reseller.billing_model / reseller.status single-
//   part BILLING_MODELS.has() / STATUSES.has() pins into two-part
//   typeof-string + Set.has() shape matching the tick 304/305/312/
//   316 value-set posture verbatim (tick 326 option (b) refreshed).
//   (b) rotate to reseller.code text NOT NULL UNIQUE tick-numbered
//   labelled shape lift (currently bare `.toBe(fixture.code)`
//   equality with no per-half diagnostic — refreshes the identity
//   check into a two-part typeof-string + toBe(fixture.code) shape).
//   (c) rotate to promotion_codes[] cross-column pin summary
//   comment (tier 0 → stripe ids null / tier > 0 → stripe ids non-
//   null already lives inline at ticks 301-302 — a symmetric close-
//   out summary comment could hoist it into module-scope doc-block
//   form; matches the tick 326 next-pick option (a)).
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks).
//
// Tick 328 — reseller.billing_model / reseller.status two-part
// typeof-string + Set.has() value-set enum tightening on the top-
// level detail payload. Executes tick 327 next-pick option (a)
// verbatim: the two remaining single-part Set.has() pins on the
// resellers-row shape at
// `BILLING_MODELS.has(body.reseller?.billing_model as string)` +
// `STATUSES.has(body.reseller?.status as string)` were still
// carrying single-line combined `should be retail|wholesale` /
// `should be active|paused|terminated` diagnostics with no per-
// half typeof-vs-membership separation and no tick-numbered doc-
// block, while the sibling admins[].role/status pins at ticks
// 304-305 (link-lifecycle enum) already carried the two-expect
// labelled discipline. Lifting billing_model + status onto the
// same two-part shape closes the top-level reseller-row wire-
// shape sweep symmetrically — every projected column on the
// select("*") tuple (id / code / display_name / billing_model /
// status / created_at / updated_at / commission_share_pct /
// gst_registered) now carries the tick-numbered labelled
// discipline (the still-bare `code` .toBe(fixture.code) equality
// is a deliberate identity check, not a wire-shape pin; tick 328
// option (b) can convert it into a per-half typeof-string +
// equality shape on a future tick if desired).
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:26 declares
//     `billing_model text NOT NULL CHECK (billing_model IN
//     ('retail','wholesale'))` on the resellers base table.
//   - 0091_reseller_module_foundations.sql:29 declares
//     `status text NOT NULL DEFAULT 'active'
//     CHECK (status IN ('active','paused','terminated'))` on the
//     resellers base table — WIDER than the reseller_admins.status
//     enum (active|revoked) pinned at tick 305 because this is a
//     business-lifecycle enum, not a link-lifecycle enum.
//   - Application write path: admin-validator.ts enforces both
//     invariants inline on PATCH — billing_model membership at
//     the U.15.1 wholesale/GST/ABN cross-column validator, status
//     membership on the same tuple. Neither is DB-backstopped
//     beyond the CHECK constraint above; a legacy INSERT that
//     bypassed validateAdminResellerPatch could still land a
//     non-CHECK-conformant value on hosts where 0091 was applied
//     without the constraint (e.g. a pre-0091 legacy dump
//     restored without CHECK propagation).
//   - Application read path: projected via route.ts:47-48
//     select("*") on the loadReseller() single-row lookup, then
//     surfaced as the top-level `reseller` field on the detail
//     payload body at web/src/app/api/admin/resellers/[code]/
//     route.ts:122-129 — same read-path leg as the tick 325 UUID
//     PK pin, the tick 327 display_name pin, the tick 285
//     created_at/updated_at ISO pins, and the tick 286
//     commission_share_pct numeric pin.
//
// Design choice — two-part guard mirroring the tick 304/305/312/
// 316 value-set posture verbatim:
//   - (a) typeof-string preserves the NOT-NULL raw-type
//     discipline; catches a PostgREST regression that returned
//     null|undefined, a schema-side NOT NULL drop, or a
//     projection-side drop from the route.ts:47-48 SELECT tuple.
//   - (b) BILLING_MODELS.has() / STATUSES.has() membership assert
//     against the existing module-scope Sets mirrors the DB CHECK
//     enumeration; catches a DB CHECK drop, a legacy INSERT that
//     stamped a value outside the enumeration ('trial',
//     'suspended'), or a PostgREST serialisation regression that
//     returned a mixed-case slug ('Retail', 'Active').
//
// Coverage-per-guard posture:
//   - Detail surface: wave-5 row 167 single-row GET fires the
//     two-part pin at least once per test on the
//     QAPROBEWHOLESALEACTIVE seed reseller (top-level parent row
//     is always present when loadReseller() returns row-not-null;
//     seed fixture stamps billing_model='wholesale' + status=
//     'active' so both shape halves pass on every green CI run).
//
// Rotation rationale:
//   - Closes the last two outstanding single-part Set.has() pins
//     on the top-level reseller-row wire-shape sweep. Symmetric
//     close-out of the top-level resellers-row column-pin cluster:
//     id (325) + display_name (327) + billing_model (328) +
//     status (328) + created_at/updated_at (285) +
//     commission_share_pct (286) + gst_registered (287) all now
//     carry the tick-numbered labelled two-expect discipline.
//   - No new imports, no new module-scope const needed — the
//     BILLING_MODELS + STATUSES Sets already live at rows
//     1636-1637.
//   - Continues the P10 hardening posture per ticks 234-327 — no
//     production code touched, no fixture change, no route
//     change, no new imports, no new module-scope const.
//
// Natural next-pick tick 329 candidates:
//   (a) rotate to reseller.code text NOT NULL UNIQUE tick-
//   numbered labelled shape lift (currently bare
//   `.toBe(fixture.code)` equality with no per-half diagnostic —
//   refresh the identity check into a two-part typeof-string +
//   toBe(fixture.code) shape mirroring the sibling column
//   posture).
//   (b) rotate to promotion_codes[] cross-column pin summary
//   comment (tier 0 → stripe ids null / tier > 0 → stripe ids
//   non-null already lives inline at ticks 301-302 — a symmetric
//   close-out summary comment could hoist it into module-scope
//   doc-block form).
//   (c) rotate to a NEW cluster on the cross-surface twin
//   spec (admin-resellers-list-authz.spec.ts) — the list
//   projection shares the same resellers-row shape but its
//   billing_model/status pins may still be bare Set.has() as
//   well, and a symmetric refresh across both surfaces keeps
//   the twin discipline coherent.
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks).
//
// Tick 329 — reseller.code text NOT NULL UNIQUE two-part labelled
// wire-shape lift on the tick-1710 baseline single-part
// `.toBe(fixture.code)` identity check. Executes tick 328 next-pick
// option (a) verbatim: the top-level reseller.code column on the
// detail payload was the last outstanding bare pin on the
// resellers-row wire-shape sweep — carrying only a bare
// `.toBe(fixture.code)` equality with a single combined
// `should equal fixture.code (uppercase form)` diagnostic and no
// per-half typeof-vs-equality separation. Every neighbour column
// (id UUID at 325, display_name at 327, billing_model + status at
// 328, created_at/updated_at at 285, commission_share_pct at 286,
// gst_registered at 287) has already moved on to the two-part
// labelled discipline. Lifting code onto the same shape closes the
// top-level resellers-row column-pin cluster completely — every
// projected column on the select("*") tuple now carries the tick-
// numbered labelled two-expect discipline.
//
// Writer-schema justification:
//   - 0091_reseller_module_foundations.sql:24 declares `code text
//     NOT NULL UNIQUE`. The DB has no CHECK constraint against
//     mixed-case or non-alphanumeric slugs — uppercase discipline
//     is enforced ONLY on the application write path via
//     normaliseResellerCode() in web/src/lib/reseller/scope.ts and
//     mirrored at the admin-validator.ts create-branch. A legacy
//     INSERT that bypassed the normaliser could still land a
//     lowercase / punctuated code straight through PostgREST onto
//     the wire.
//   - Application read path: projected via route.ts:47-48
//     select("*") on the loadReseller() single-row lookup, then
//     surfaced as the top-level `reseller` field on the detail
//     payload body at web/src/app/api/admin/resellers/[code]/
//     route.ts:122-129 — same read-path leg as the tick 325 UUID
//     PK pin, the tick 327 display_name pin, the tick 328
//     billing_model/status pins, the tick 285 created_at/
//     updated_at ISO pins, and the tick 286 commission_share_pct
//     numeric pin.
//   - Fixture-side guarantee: seed-qa-reseller.mjs mints the
//     QAPROBEWHOLESALEACTIVE reseller with the uppercase code
//     stamped verbatim by the seeder, and fixture.code is loaded
//     from the same seed-authored env constant so the equality
//     half is a stable identity check against the seed-side
//     writer.
//
// Design choice — two-part guard mirroring the tick 325/327
// posture verbatim, keeping the sibling column posture symmetric
// across the top-level resellers-row column-pin cluster:
//   - (a) typeof-string preserves the NOT-NULL raw-type
//     discipline; catches a PostgREST regression that returned
//     null|undefined, a schema-side NOT NULL drop, or a
//     projection-side drop from the route.ts:47-48 SELECT tuple.
//     Without the typeof-string half, a serialisation regression
//     that returned reseller.code=null would fail the equality
//     check with a `null !== 'QAPROBEWHOLESALEACTIVE'` diagnostic
//     that hides the raw-type flip behind the equality mismatch;
//     the per-half split surfaces the shape defect directly.
//   - (b) toBe(fixture.code) preserves the identity check — the
//     detail route resolves the `[code]` path segment via
//     normaliseResellerCode() on read (route.ts:47), so the
//     round-trip guarantee is that the wire-side code is the
//     uppercase form of the seed. A drift on the normaliser
//     (returning the raw path segment without uppercasing) or a
//     PostgREST projection that returned a different reseller's
//     code (i.e. a horizontal-lookup regression) would surface
//     here.
//
// Coverage-per-guard posture:
//   - Detail surface: wave-5 row 167 single-row GET fires the
//     two-part pin at least once per test on the
//     QAPROBEWHOLESALEACTIVE seed reseller (top-level parent row
//     is always present when loadReseller() returns row-not-null;
//     seed fixture stamps the uppercase code so both shape halves
//     pass on every green CI run).
//
// Rotation rationale:
//   - Closes the last outstanding bare pin on the top-level
//     resellers-row wire-shape sweep. Symmetric close-out of the
//     top-level resellers-row column-pin cluster: id (325) + code
//     (329) + display_name (327) + billing_model (328) + status
//     (328) + created_at/updated_at (285) + commission_share_pct
//     (286) + gst_registered (287) all now carry the tick-
//     numbered labelled two-expect discipline.
//   - No new imports, no new module-scope const needed — pure
//     typeof + toBe(fixture.code) inline check.
//   - Continues the P10 hardening posture per ticks 234-328 — no
//     production code touched, no fixture change, no route
//     change, no new imports, no new module-scope const.
//
// Natural next-pick tick 330 candidates:
//   (a) rotate to promotion_codes[] cross-column pin summary
//   comment (tier 0 → stripe ids null / tier > 0 → stripe ids
//   non-null already lives inline at ticks 301-302 — a symmetric
//   close-out summary comment could hoist it into module-scope
//   doc-block form).
//   (b) rotate to the cross-surface twin spec
//   (admin-resellers-list-authz.spec.ts) — the list projection
//   shares the same resellers-row shape but its billing_model/
//   status/code pins may still be bare, and a symmetric refresh
//   across both surfaces keeps the twin discipline coherent
//   (tick 328 option (c) refreshed).
//   (c) rotate to reseller_attributions[] child-row column-pin
//   sweep close-out (subject_type / subject_user_id / project_id
//   / source / attributed_at / opted_out) — several columns are
//   still on the tick-1710 baseline single-part typeof-string
//   discipline while the sibling admins[] cluster (321-326) has
//   moved on to per-column two-expect + cross-column lifecycle
//   pins.
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks).
//
// Tick 332 — promotion_codes[] cross-column tier→stripe-id summary
// close-out. Executes tick 331 next-pick option (a) verbatim: hoist
// the ck_stripe_objects_by_tier disjunction that already lives inline
// at rows 2616-2662 (the per-row if/else that pins
// stripe_coupon_id + stripe_promotion_code_id null/non-null against
// row.tier_pct) into a module-scope doc-block summary. The individual
// per-column doc-blocks at ticks 301 (stripe_coupon_id) + 302
// (stripe_promotion_code_id) each already narrate the tier-coupling
// clause of the disjunction, but the SUMMARY view — one paragraph
// that names both halves of the disjunction, both columns, and the
// single CHECK constraint they both key off — has never lived at
// module-scope in a form a future rotation can lift from without
// re-reading ticks 301 + 302 in full. Hoisting closes the promotion_
// codes[] child-row cluster (opened at tick 299, per-column pins
// landed 299-303, per-column messages refreshed at tick 324) into
// its symmetric summary state, matching the admins[] cluster which
// tick 326 closed with the status ⇔ revoked_at cross-column
// lifecycle invariant summary. No new imports, no new module-scope
// const, no per-row assert added — the inline if/else at rows
// 2616-2662 is already the runtime enforcement; this hoist is a
// documentation-only close-out lift.
//
// Cross-column invariant summary — promotion_codes[].{stripe_coupon
// _id, stripe_promotion_code_id} ⇔ promotion_codes[].tier_pct
//   Writer-side source: reseller_promotion_codes DB CHECK
//   ck_stripe_objects_by_tier at
//   web/supabase/migrations/0091_reseller_module_foundations.sql:98-102
//   enforces the disjunction
//     (tier_pct = 0
//        AND stripe_coupon_id IS NULL
//        AND stripe_promotion_code_id IS NULL)
//     OR
//     (tier_pct > 0
//        AND stripe_coupon_id IS NOT NULL
//        AND stripe_promotion_code_id IS NOT NULL)
//   Application write path: decideCodeMint() at
//   web/src/lib/reseller/promotion-code-mint.ts dispatches on
//   tier_pct at the P9.4 admin-approve branch — tier 0 → attribution-
//   only insert (both stripe ids stamped NULL, ensureStripeCoupon +
//   ensureStripePromotionCode are skipped); tier > 0 → Stripe mint
//   branch (ensureStripeCoupon deterministic id res_<uuid8>_t<tier>
//   layered under stripe.promotionCodes.create; both stripe ids
//   stamped non-null before the reseller_promotion_codes INSERT
//   fires). Neither branch has a per-column CHECK — the disjunction-
//   level CHECK is the sole DB enforcement layer, so a mint-branch
//   drift that stopped writing one of the two ids for a tier > 0
//   row, a tier 0 branch bypass that stamped a non-null id, a DB
//   CHECK drop, or a PostgREST serialisation regression on either
//   column would surface here.
//   Read path: projected via select("id, tier_pct, code,
//   stripe_coupon_id, stripe_promotion_code_id, active, created_at")
//   on the promotion_codes Promise.all leg of loadReseller() at
//   web/src/app/api/admin/resellers/[code]/route.ts:83-88. Detail-
//   route only — the admin-resellers-list route does NOT project
//   promotion_codes.
//   Runtime enforcement in this spec: for-loop at rows 2616-2662
//   iterates promotion_codes[]; per-row the tier-coupled if/else
//   branches on row.tier_pct === 0 vs row.tier_pct > 0 and asserts
//   the matching null / typeof-string shape for BOTH stripe_coupon
//   _id (rows 2629-2638) AND stripe_promotion_code_id (rows 2652-
//   2661). Each branch carries a bespoke failure message pointing
//   at 0091:98-102 as the DB CHECK source and at ensureStripeCoupon
//   / ensureStripePromotionCode as the mint-branch source (message
//   copy landed with ticks 301 + 302).
//   Coverage-per-guard posture: fires on every green CI run because
//   seed-qa-reseller.mjs mints per-cohort promotion_codes rows
//   covering BOTH tier 0 (attribution-only, null branch) AND tier
//   > 0 (Stripe-minted, string branch); on hosts without seeded
//   codes the for-loop is a no-op so the pin never fires.
//   Symmetric-cluster posture: this summary hoist mirrors the tick
//   326 admins[] status ⇔ revoked_at cross-column lifecycle
//   summary — both are per-cluster close-out summaries that name a
//   single CHECK/write-path invariant coupling two projected
//   columns. Together with tick 319's attributions_summary triple-
//   pin summary (total + active + by_source), the three detail-
//   route child-row / aggregate clusters now each carry a hoisted
//   invariant summary at module-scope.
//
// Rotation rationale:
//   - Closes the promotion_codes[] child-row cluster symmetrically
//     into its summary form. The per-column doc-blocks (299-303 +
//     324) already carry per-column rationale; this hoist gives a
//     single module-scope entry a future frontier tick can lift
//     from without re-reading two ticks in full.
//   - No new imports, no new module-scope const, no fixture
//     change, no route change, no per-row assert added — pure
//     documentation-only close-out lift. Continues the P10
//     hardening posture per ticks 234-331 (comment-only tightening
//     ticks are the accepted P10 rotation shape while P8.5 remains
//     HUMAN-BLOCKED on Stripe env vars).
//
// Natural next-pick tick 333 candidates:
//   (a) rotate to reseller_attributions[] child-row column-pin
//   sweep close-out (subject_type / subject_user_id / project_id
//   / source / attributed_at / opted_out) — several columns are
//   still on the tick-1710 baseline single-part typeof-string
//   discipline while the sibling admins[] cluster (321-326) has
//   moved on to per-column two-expect + cross-column lifecycle
//   pins; this is the last child-row cluster on the detail
//   surface that has not yet moved onto the labelled two-expect
//   discipline.
//   (b) rotate to admins[].linked_at / admins[].revoked_at ISO-
//   8601 shape refresh (ticks 306-307 already carry tick-numbered
//   labelled messages so this rotation would be a shape refresh
//   rather than a lift).
//   (c) rotate to the cross-surface twin spec (admin-resellers-
//   list-authz.spec.ts) — the list projection does not fan out
//   to promotion_codes but does project the resellers-row shape,
//   and a cross-surface refresh could keep the twin discipline
//   coherent on any resellers-row column whose message prose has
//   drifted between the two surfaces since tick 331.
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks).
//
// Tick 333 — resellers-row ck_wholesale_gst_required cross-column
// invariant summary hoist. Executes tick 332 next-pick option (c)
// (cross-surface twin refresh) in the sibling spirit but on the
// invariant-summary axis rather than the message-prose axis: hoist
// the ck_wholesale_gst_required CHECK constraint (0091:47-50) that
// couples resellers.billing_model + gst_registered + abn into a
// module-scope doc-block summary. The three per-column pins already
// narrate their halves of the invariant inline — tick 287 (gst_
// registered) at row 2415 mentions "wholesale rows gated true by
// CHECK ck_wholesale_gst_required at 0091:47-50" and tick 294 (abn)
// at row 2561 mentions "NULL on retail rows without an ABN
// populated, string on wholesale rows per ck_wholesale_gst_required
// at 0091:47-50" — but the SUMMARY view naming ALL THREE columns +
// the single CHECK constraint they all key off + the application
// write-path validator has never lived at module-scope in a form
// a future rotation could lift from without re-reading ticks 287 +
// 294 + the resellers-row schema in full. Hoisting closes the
// resellers-row cross-column-invariant cluster into its symmetric
// summary state, matching the promotion_codes[] cluster which tick
// 332 closed with the ck_stripe_objects_by_tier tier→stripe-id
// summary and the admins[] cluster which tick 326 closed with the
// status ⇔ revoked_at cross-column lifecycle invariant summary. No
// new imports, no new module-scope const, no per-column assert
// added — the inline per-column pins at rows 2413-2416 (gst_
// registered) and rows 2558-2568 (abn) are already the runtime
// enforcement; this hoist is a documentation-only close-out lift.
//
// Cross-column invariant summary — resellers.{billing_model,
// gst_registered, abn} ⇔ ck_wholesale_gst_required
//   Writer-side source: resellers table DB CHECK
//   ck_wholesale_gst_required at
//   web/supabase/migrations/0091_reseller_module_foundations.sql:47-50
//   enforces the disjunction
//     (billing_model = 'retail')
//     OR
//     (billing_model = 'wholesale'
//        AND gst_registered = true
//        AND abn IS NOT NULL)
//   i.e. retail rows are free of gst / abn shape constraints, but
//   any row that flips billing_model to 'wholesale' MUST carry
//   gst_registered=true AND abn IS NOT NULL. The sibling CHECK
//   ck_abn_format at 0091:52-54 (`abn IS NULL OR abn ~ '^\d{2} \d{3}
//   \d{3} \d{3}$'`) is a single-column format guard on the abn
//   column and is orthogonal to this cross-column invariant — a
//   wholesale row must satisfy BOTH the non-null clause from
//   ck_wholesale_gst_required AND the spaced-format clause from
//   ck_abn_format for the INSERT/UPDATE to land.
//   Application write path: validateAdminResellerPatch() at
//   web/src/lib/reseller/admin-validator.ts:169-174 builds a merged
//   view of {billing_model, gst_registered, abn} across the incoming
//   patch and the current row, then rejects any wholesale merge that
//   fails gst_registered=true (reason='wholesale_requires_gst') or
//   abn IS NOT NULL / ABN_RE.test (reason='wholesale_requires_abn').
//   This is the ONLY application-layer gate on this invariant — the
//   DB CHECK is the last line of defence, so a validator drift that
//   stopped merging current+patch before the wholesale branch, a
//   PATCH-time refactor that bypassed validateAdminResellerPatch, or
//   a direct-SQL admin action that skipped the validator would each
//   still be caught by the CHECK at 0091:47-50 rejecting the write.
//   Read path: projected via select("*") on the resellers Promise.
//   all leg of loadReseller() at
//   web/src/app/api/admin/resellers/[code]/route.ts:47-48 (the
//   .from("resellers").select("*").eq("code", code).maybeSingle()
//   pattern), so all three columns come out on the wire on every
//   detail-route GET. The admin-resellers-list route also projects
//   select("*") from the same table so the invariant is observable
//   on BOTH admin resellers-family surfaces on every green CI run.
//   Runtime enforcement in this spec: per-column pins at
//     - row 2413-2416 (gst_registered typeof-boolean, tick 287)
//     - row 2558-2568 (abn null-or-string + null-or-ABN_RE, tick 294)
//     - row 2470-2483 (billing_model typeof-string + BILLING_MODELS
//       Set.has, tick 328)
//   fire on every green CI run against the QAPROBEWHOLESALEACTIVE
//   fixture which exercises the wholesale branch (billing_model=
//   'wholesale' + gst_registered=true + abn='79 659 615 111'). A
//   retail probe variant exercises the retail branch (billing_model=
//   'retail' + gst_registered=false + abn=NULL). Neither branch has
//   an inline cross-column if/else assert (unlike the promotion_
//   codes[] cluster which does branch on row.tier_pct) because the
//   per-column pins on the individual columns are sufficient to
//   surface any single-column drift — the ck_wholesale_gst_required
//   invariant is enforced at write-time by the DB CHECK + admin-
//   validator, and a hypothetical wholesale-row-without-abn regression
//   would be caught by the abn nullable-with-ABN_RE pin at row 2564-
//   2568 as long as the fixture stays wholesale.
//   Coverage-per-guard posture: fires on every green CI run because
//   the QAPROBEWHOLESALEACTIVE fixture is wholesale + gst_registered=
//   true + abn populated so all three per-column pins exercise their
//   populated branches on every pass; on hosts without seeded probe
//   the whole spec is skipped so the pins never fire.
//   Symmetric-cluster posture: this summary hoist mirrors the tick
//   332 promotion_codes[] cross-column tier→stripe-id summary and
//   the tick 326 admins[] status ⇔ revoked_at cross-column lifecycle
//   summary — all three are per-cluster close-out summaries naming
//   a single CHECK/write-path invariant that couples multiple
//   projected columns. Distinct from ticks 326 + 332 in ONE
//   dimension: this invariant is on the resellers ROW (single
//   object) rather than a child-row array (per-row iterated), so
//   the runtime enforcement is per-column single asserts rather
//   than a per-row if/else branch.
//
// Rotation rationale:
//   - Closes the resellers-row cross-column-invariant cluster
//     symmetrically into its summary form. The per-column doc-
//     blocks (287 for gst_registered, 294 for abn, 328 for
//     billing_model) already carry per-column rationale; this
//     hoist gives a single module-scope entry a future frontier
//     tick can lift from without re-reading three ticks in full.
//   - Completes the trio of module-scope cross-column-invariant
//     summaries on the detail surface: tick 319 attributions_
//     summary triple-pin (total + active + by_source), tick 326
//     admins[] status ⇔ revoked_at cross-column lifecycle, tick
//     332 promotion_codes[] tier ⇔ stripe-id disjunction, tick 333
//     resellers-row billing_model ⇔ gst_registered ⇔ abn ck_
//     wholesale_gst_required disjunction. The detail-route response
//     shape { ok, reseller, promotion_codes, admins, attributions_
//     summary, commissions } now has four of its five child slots
//     covered by module-scope invariant summaries (only commissions
//     ledger remains without a hoisted summary — that cluster still
//     carries per-column pins ticks 309-317 but no cross-column
//     lifecycle summary yet).
//   - No new imports, no new module-scope const, no fixture
//     change, no route change, no per-row assert added — pure
//     documentation-only close-out lift. Continues the P10
//     hardening posture per ticks 234-332 (comment-only tightening
//     ticks are the accepted P10 rotation shape while P8.5 remains
//     HUMAN-BLOCKED on Stripe env vars).
//
// Natural next-pick tick 334 candidates:
//   (a) rotate to reseller_commissions_current[] cross-column
//   lifecycle summary hoist — the commissions[] cluster has per-
//   column pins (309-317) but no module-scope summary yet on the
//   status ⇔ pending_until / status ⇔ cleared_at lifecycle
//   coupling (0094 commission-events table) that would mirror the
//   admins[] status ⇔ revoked_at pattern from tick 326.
//   (b) rotate to the cross-surface twin spec (admin-resellers-
//   list-authz.spec.ts) — either mirror the tick 333 resellers-row
//   ck_wholesale_gst_required summary onto the list surface (the
//   list route also select("*") from resellers so the invariant
//   is observable there too, and a symmetric twin hoist would
//   match the tick 231-232 twin-symmetrisation discipline), OR
//   refresh any per-column message prose that has drifted since
//   tick 331.
//   (c) rotate to attributions_summary.by_source enum-tightening
//   pass — the current pin at row 2979-2987 accepts arbitrary
//   string keys against ALLOWED_ATTRIBUTION_SOURCES; a stronger
//   pin would assert exhaustiveness (every enum value present)
//   rather than membership (every present value in enum). Tightens
//   the ck_reseller_attributions_source CHECK coverage.
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks).
//
// Tick 334 — reseller_commissions_current[] cross-column lifecycle
// invariant summary hoist. Executes tick 333 next-pick option (a)
// verbatim: hoist the CASE-expression status derivation at
// 0094:150-172 (that couples reseller_commission_events.event_type
// history with the view-computed reseller_commissions_current.status
// column) + the net_owed_cents derivation at 0094:173-177 (that sums
// delta_aud_cents over the same event log) + the pending_until
// timing invariant at 0094:42 (invoice.created + 7 days, gates the
// nightly reseller-clear-commissions cron flipping pending_clearance
// → cleared) into a module-scope doc-block summary. The eight per-
// column shape pins at ticks 308-317 already narrate their halves of
// the projected commissions[] tuple inline — tick 316 (status)
// mentions "reseller_commissions_current view derives the status via
// the CASE expression at 0094:150-172" and tick 315 (net_owed_cents)
// mentions "the view computes net_owed_cents at 0094:173-177 as
// `rc.commission_aud_cents + COALESCE(SUM(delta_aud_cents), 0)` over
// every non-accrued/non-cleared/non-dispute_opened/non-dispute_won
// event" — but the SUMMARY view naming ALL the coupled surfaces + the
// event_type enumeration + the pending_until timing + the append-
// only-log invariant they all key off has never lived at module-
// scope in a form a future rotation could lift from without re-
// reading ticks 315 + 316 + the reseller_commission_events schema in
// full. Hoisting closes the reseller_commissions_current[] cluster —
// the LAST uncovered child slot on the detail-route response shape
// { ok, reseller, promotion_codes, admins, attributions_summary,
// commissions } — into its symmetric summary state, matching the
// promotion_codes[] cluster which tick 332 closed with the ck_stripe_
// objects_by_tier tier→stripe-id summary, the admins[] cluster which
// tick 326 closed with the status ⇔ revoked_at cross-column lifecycle
// summary, the attributions_summary aggregate which tick 319 closed
// with the total + active + by_source triple-pin summary, and the
// resellers-row invariant which tick 333 closed with the ck_wholesale
// _gst_required billing_model ⇔ gst_registered ⇔ abn summary. No
// new imports, no new module-scope const, no per-column assert added —
// the per-column pins at ticks 308-317 (see rows 3157-3316) are
// already the runtime enforcement; this hoist is a documentation-
// only close-out lift completing all FIVE child slots of the detail
// route response shape.
//
// Cross-column invariant summary — commissions[].{status,
// net_owed_cents, created_at, commission_aud_cents} ⇔ reseller_
// commission_events(event_type, delta_aud_cents) + reseller_
// commissions.pending_until
//   Writer-side sources:
//     (a) reseller_commissions ledger at 0094:31-73 — immutable base
//     row minted per invoice.paid; carries commission_aud_cents (the
//     base owed) + pending_until timestamptz NOT NULL (defaulted to
//     invoice.created + 7 days by the webhook processor per the
//     `-- invoice.created + 7 days` doc comment at 0094:42) + billing
//     _model denormalised so the ck_commission_split CHECK at 0094:52-60
//     can enforce the retail-vs-wholesale split legally (Postgres
//     CHECK cannot reference resellers.billing_model directly).
//     (b) reseller_commission_events append-only log at 0094:101-118 —
//     event_type text NOT NULL CHECK IN ('accrued','cleared','refund_
//     full','refund_partial','dispute_opened','dispute_lost',
//     'dispute_won','void') per 0094:104-113. Every commission status
//     change is a new row here; reseller_commissions is never mutated
//     after the initial insert. delta_aud_cents int NOT NULL is the
//     signed adjustment (accrued=+commission_aud_cents, cleared=0,
//     refund_full=-commission_aud_cents, refund_partial=pro-rated
//     negative, dispute_opened=0, dispute_lost=-remaining, dispute_
//     won=0, void=-remaining per the branch-level doc-comments at
//     0094:105-112). stripe_event_id text UNIQUE at 0094:115 anchors
//     idempotency so a Stripe retry cannot double-write.
//   View-derived surfaces (reseller_commissions_current at 0094:133-178):
//     (a) status CASE expression at 0094:150-172 derives one of five
//     values from the presence/absence of specific event_type rows:
//       - 'clawed_back'  ⇔ EXISTS event_type IN (refund_full, dispute
//                          _lost, void) — terminal-loss states short-
//                          circuit all other branches.
//       - 'dispute_open' ⇔ EXISTS event_type = 'dispute_opened' AND NOT
//                          EXISTS event_type IN (dispute_won, dispute_
//                          lost) — freezes clearance until resolved.
//       - 'partially_refunded' ⇔ EXISTS event_type = 'refund_partial'
//                          (evaluated only after clawback + dispute
//                          branches so a partial-refund + full-refund
//                          sequence surfaces as 'clawed_back').
//       - 'cleared'      ⇔ EXISTS event_type = 'cleared' (fired by the
//                          nightly reseller-clear-commissions cron at
//                          web/src/app/api/cron/reseller-clear-
//                          commissions/route.ts + crontab 15 3 * * *
//                          per P3.3 sign-off, but only past pending_
//                          until so the timing invariant lives on
//                          pending_until + the cron's WHERE clause).
//       - 'pending_clearance' ⇔ ELSE (default for freshly-accrued rows
//                          still inside the pending_until window).
//     (b) net_owed_cents = commission_aud_cents + COALESCE(SUM(delta_
//     aud_cents) FILTER event_type NOT IN (accrued, cleared, dispute
//     _opened, dispute_won), 0) at 0094:173-177 — sums adjustments
//     over the event log. The FILTER exclusions matter: accrued is
//     excluded because commission_aud_cents already carries the base
//     (adding accrued.delta_aud_cents would double-count); cleared is
//     excluded because its delta is 0 (informational only); dispute_
//     opened / dispute_won are excluded because they are also 0-delta
//     informational rows. Only refund_full / refund_partial / dispute
//     _lost / void carry non-zero deltas, all negative, so net_owed_
//     cents ≤ commission_aud_cents (may be negative when a clawback
//     delta exceeds the base — pin at tick 315 deliberately omits the
//     `>= 0` tail assert per its rationale).
//   Application write paths:
//     (a) Insert path — webhook helpers at web/src/lib/reseller/
//     webhook-helpers.ts.planAccrualForLine (P3.2 pure lib, wired by
//     P3.2b commit d155547) fires on invoice.paid, mints the immutable
//     reseller_commissions row + writes the initial reseller_commission
//     _events(event_type='accrued', delta=+commission_aud_cents) row
//     inside the same webhook transaction.
//     (b) Refund/clawback paths — same webhook-helpers module exposes
//     refundGstReversal + prorateClawback which append refund_full /
//     refund_partial / dispute_lost / void rows atop the initial
//     accrued row (never mutate the base ledger row per D1-CTO-04 —
//     "reseller_commissions is never mutated" per the table COMMENT
//     at 0094:126-127). Stripe idempotency via reseller_commission_
//     events.stripe_event_id UNIQUE at 0094:115 means a Stripe retry
//     hitting the same charge.refunded event cannot double-write.
//     (c) Clearance path — nightly cron at /api/cron/reseller-clear-
//     commissions inserts reseller_commission_events(event_type=
//     'cleared', delta=0) for every row past its pending_until without
//     a terminal-loss or open-dispute event. Delta is informational
//     only; the actual money-owed change happened at the 'accrued'
//     event. The cron flip from pending_clearance → cleared is
//     observable on the view side but leaves both underlying rows
//     immutable.
//   Read path: projected via
//   web/src/app/api/admin/resellers/[code]/route.ts:99-105 with
//   select("commission_id, stripe_invoice_id, list_price_aud_cents,
//   discount_pct, commission_aud_cents, net_owed_cents, status,
//   created_at") — .eq("reseller_id", row.id) + .order("created_at",
//   descending) + .limit(50). Note the read path deliberately does
//   NOT project pending_until (visible in the view at 0094:148 but
//   suppressed at the wire) — the admin surface consumes the derived
//   status verbatim rather than re-deriving from pending_until +
//   created_at on the client, and net_owed_cents already encodes the
//   money-owed truth so pending_until would be redundant on the
//   detail response. A future admin-facing panel wanting to surface
//   "N days until clearance" would need to extend the SELECT tuple
//   at route.ts:99-105 to add pending_until — the view already
//   projects it so no schema/view change would be required.
//   Runtime enforcement in this spec: per-column pins at
//     - rows 3157-3173 (commission_id typeof-string + UUID_RE, tick 308)
//     - rows 3174-3193 (stripe_invoice_id typeof-string + STRIPE_
//       INVOICE_ID_RE, tick 309)
//     - rows 3194-3215 (list_price_aud_cents typeof-number + integer
//       + > 0, tick 311)
//     - rows 3216-3234 (discount_pct typeof-number + ALLOWED_TIER_
//       VALUES Set.has, tick 312)
//     - rows 3235-3256 (commission_aud_cents typeof-number + integer
//       + >= 0, tick 314)
//     - rows 3257-3277 (net_owed_cents typeof-number + integer, no
//       sign assert, tick 315)
//     - rows 3278-3297 (status typeof-string + ALLOWED_COMMISSION_
//       STATUSES Set.has, tick 316)
//     - rows 3298-3316 (created_at typeof-string + ISO_TIMESTAMP_RE,
//       tick 317)
//   fire on every green CI run against the QAPROBEWHOLESALEACTIVE
//   seed reseller inside the for-loop at row 3156. Hosts without
//   seeded commissions rows still green because the for-loop
//   degrades gracefully to a no-op. No inline cross-column if/else
//   assert added because the status derivation is view-computed (not
//   a stored column) so the CASE expression itself IS the invariant
//   — a hypothetical drift that returned status='cleared' AND net_
//   owed_cents<0 would surface via the per-column pins independently
//   (status membership + net_owed_cents integer), and the view
//   definition is the sole enforcement layer for the coupling itself.
//   Coverage-per-guard posture: wave-5 row 167 single-row GET fires
//   the eight per-column pins up to 50 times per test (once per
//   commissions[] row on the QAPROBEWHOLESALEACTIVE seed reseller).
//   On hosts without seeded commission rows the for-loop is a no-op
//   so none of the pins fire. The pins collectively enforce the
//   projected tuple shape; the CASE + SUM invariants are enforced
//   by the view itself on every PostgREST read.
//   Symmetric-cluster posture: this summary hoist mirrors the tick
//   333 resellers-row ck_wholesale_gst_required summary, the tick
//   332 promotion_codes[] tier ⇔ stripe-id summary, the tick 326
//   admins[] status ⇔ revoked_at summary, and the tick 319
//   attributions_summary total + active + by_source summary. All
//   five detail-route child slots (reseller row, promotion_codes[],
//   admins[], attributions_summary, commissions[]) now carry a
//   module-scope invariant summary at labelled tick-numbered prose.
//   Distinct dimension from ticks 326 + 332: those child-row
//   clusters carry a per-row if/else assert on the coupled columns
//   (promotion_codes branches on tier_pct, admins branches on status)
//   because both have a stored-column coupling; this cluster does
//   NOT carry a per-row if/else because the coupling is VIEW-COMPUTED
//   (status derives from event log via CASE, net_owed_cents derives
//   from event log via SUM) so the view CASE expression + SUM
//   expression ARE the invariant — pinning the same relationship on
//   the wire would just re-derive the CASE logic on the client, adding
//   client-side maintenance burden without catching a new failure
//   mode (a view-definition drift already surfaces at the tick 316
//   ALLOWED_COMMISSION_STATUSES membership pin).
//
// Rotation rationale:
//   - Closes the reseller_commissions_current[] cluster symmetrically
//     into its summary form and completes the FULL matrix of five
//     detail-route child-slot summaries at module-scope: tick 319
//     attributions_summary triple-pin (total + active + by_source),
//     tick 326 admins[] status ⇔ revoked_at cross-column lifecycle,
//     tick 332 promotion_codes[] tier ⇔ stripe-id disjunction, tick
//     333 resellers-row billing_model ⇔ gst_registered ⇔ abn ck_
//     wholesale_gst_required disjunction, tick 334 commissions[]
//     status ⇔ event_type + net_owed_cents ⇔ delta_aud_cents view
//     derivation (this tick). The detail-route response shape
//     { ok, reseller, promotion_codes, admins, attributions_summary,
//     commissions } now has EVERY child slot covered by a module-
//     scope invariant summary — no further child-slot summary
//     hoists remain on this surface.
//   - No new imports, no new module-scope const, no fixture change,
//     no route change, no per-row assert added — pure documentation-
//     only close-out lift. Continues the P10 hardening posture per
//     ticks 234-333 (comment-only tightening ticks are the accepted
//     P10 rotation shape while P8.5 remains HUMAN-BLOCKED on Stripe
//     env vars).
//
// Natural next-pick tick 335 candidates:
//   (a) rotate to the cross-surface twin spec (admin-resellers-list-
//   authz.spec.ts) — mirror any of the five detail-surface child-
//   slot summaries onto the list surface. The list route projects a
//   subset of the detail projection so only summaries applicable to
//   the list-surface projection would fit; the tick 333 resellers-
//   row ck_wholesale_gst_required summary is the most natural twin
//   candidate since the list route also select("*") from resellers.
//   This matches the tick 231-232 twin-symmetrisation discipline.
//   (b) rotate to attributions_summary.by_source enum-tightening
//   pass — the current pin at row 2979-2987 accepts arbitrary
//   string keys against ALLOWED_ATTRIBUTION_SOURCES; a stronger pin
//   would assert exhaustiveness (every enum value present) rather
//   than membership (every present value in enum). Tightens the
//   ck_reseller_attributions_source CHECK coverage.
//   (c) rotate to per-column message-prose refresh on any of the
//   ticks 283-317 pins where the wording predates the tick 320+
//   two-part labelled discipline. Sibling to ticks 324 (promotion_
//   codes messages) and 331 (resellers-row messages).
//   (d) idle — the frontier remains tight (P1.5 + P8.5 HUMAN-
//   BLOCKED, P11 never_completes, Track B closed, P10 continues
//   accepting incremental pin-tightening ticks). All five detail-
//   route child-slot summary hoists are now complete so the next
//   rotation naturally moves to the list-surface twin (option a) or
//   message-prose refresh (option c).
//
// Tick 337 — message-prose refresh on the last three bare
// `expect(typeof body.reseller.<col>).toBe(<t>)` asserts on this
// detail spec (created_at + updated_at at tick 285, commission_share
// _pct at tick 286), executing tick 335 next-pick option (c) verbatim:
// rotate to per-column message-prose refresh on any of the ticks 283-
// 317 pins where the wording predates the tick 320+ two-part labelled
// discipline. Restores prose-symmetry across every per-column pin on
// this spec so a diagnostic-message drift on any raw-type half surfaces
// the same column-labelled failure-mode prose as its sibling shape /
// range half.
//
// Baseline gap: ticks 285 (created_at + updated_at) and 286 (commission
// _share_pct) each landed the SECOND half of a two-part guard with a
// labelled bespoke failure message (ISO_TIMESTAMP_RE mismatch, finite
// number, [0, 100] range), but the FIRST half's `expect(typeof …).toBe
// (<t>)` invocation carried no message argument. A PostgREST regression
// returning row.created_at as an epoch integer or row.commission_share_
// pct as text-serialised "40.00" would fail with the unlabelled Vitest
// default `Expected 'number' to be 'string'` / `Expected 'string' to be
// 'number'` output — the column name, writer-schema source, and
// projection source were all silent. That asymmetry drifted the two
// ticks out of the tick 320+ discipline that ticks 287, 288, 289 (and
// every subsequent per-column pin on this spec) uphold.
//
// Refreshed baseline (this tick): all three typeof half-asserts now
// carry a labelled failure message naming
//   - the column and its serialised value,
//   - the writer-schema source (0091:43 created_at / 0091:44 updated_at
//     / 0091:38 commission_share_pct), including the type (`timestamptz
//     NOT NULL DEFAULT now()` / `numeric(5,2) NOT NULL DEFAULT 40.00`),
//   - the projection source (route.ts:47-48 select("*")),
//   - the concrete failure modes a drift would produce (PostgREST
//     serialising the timestamp as an epoch integer; PostgREST flipping
//     the numeric to text-serialised; a schema-side type flip; a null
//     on NOT-NULL; a projection-side drop from select("*")),
// mirroring the two-part labelled discipline used by every ticks 320+
// pin. No new imports, no new module-scope const, no fixture change,
// no route change, no per-row assert added — pure documentation-only
// refresh. Continues the P10 hardening posture per ticks 234-335
// (comment-only tightening ticks are the accepted P10 rotation shape
// while P8.5 remains HUMAN-BLOCKED on Stripe env vars).
//
// Coverage-per-guard posture: the refresh itself is documentation-only
// on the assert-side (behaviour when green is unchanged); the diagnostic
// improvement fires only on a failed run when the refreshed message
// argument replaces the pre-refresh unlabelled Vitest default. The
// wave-5 row 167 single-row GET fires all three refreshed pins on
// every green CI run against the QAPROBEWHOLESALEACTIVE seed reseller.
//
// Rotation rationale:
//   - Closes the last three raw-type-half message-prose asymmetries on
//     this spec so every per-column pin on the detail lens now reads
//     with symmetric two-part labelled diagnostic prose, matching
//     ticks 287, 288, 289, 290+ (and every subsequent pin) verbatim.
//     A follow-up tick surveying this spec for message-prose drift no
//     longer has any pre-tick 320+ bare typeof asserts to hoist.
//   - Sibling to tick 324 (promotion_codes[] code message refresh) and
//     tick 331 (list-side reseller.code message-symmetry lift) which
//     hit the same refresh target on different columns / surfaces.
//
// Next-pick candidates for tick 338:
//   (a) rotate to the sibling admin-reseller-patch-authz /
//   admin-reseller-detail-validation surfaces which have their own
//   pre-tick 320+ bare typeof asserts (grep confirms 4+ bare
//   typeof-string / typeof-number / typeof-boolean asserts remain
//   on those two surfaces).
//   (b) rotate to a fresh cross-surface twin summary hoist — the
//   remaining detail-route child-slot summaries have no natural
//   list-surface home (list route projects only resellers-row columns,
//   not the promotion_codes[] / admins[] / attributions_summary /
//   commissions[] child slots), so option (a) is a fuller cover.
//   (c) rotate to attributions_summary.by_source enum-tightening
//   exhaustiveness pass on wave-5-seeded hosts.
//   (d) idle — frontier remains tight per ticks 335-336 (P1.5 + P8.5
//   HUMAN-BLOCKED, P11 never_completes, Track B closed).
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
// Tick 309 — Stripe invoice ID shape regex. Matches the modern Stripe
// `in_<alphanumeric>` prefix pattern used by every invoice minted by
// the Stripe API and stored verbatim by the webhook processor into
// reseller_commissions.stripe_invoice_id (text NOT NULL, 0094:34).
// Length lower-bound of 8 chars protects against a truncated slug
// regression; alphanumeric-only body matches Stripe's canonical
// id charset (no punctuation, no dashes). Kept broad enough that
// live-mode (in_1XXXXXXXXX) and test-mode (in_1XXXtestXXX) both pass.
const STRIPE_INVOICE_ID_RE = /^in_[A-Za-z0-9]{8,}$/;
// Uppercase-alphanumeric invariant for promotion_codes[].code — matches the
// buildPromoCodeName write-path guarantee at
// web/src/lib/reseller/promotion-code-mint.ts:41-58 (uppercase + <=40 chars,
// composed from normaliseResellerCode() output + optional SUFFIX_RE-vetted
// tier suffix). The DB column reseller_promotion_codes.code (0091:91) is
// UNIQUE but carries NO CHECK constraint, so the invariant lives ONLY on the
// application write path. Pinning the shape at the Playwright layer catches
// a regression that INSERTed a raw / lowercase / punctuated code straight
// past buildPromoCodeName (e.g. a P9.4 approve-branch bypass). Landed tick
// 232 in the same twin-symmetrisation discipline as tick 231 option (j)
// which pinned resellers.code across the admin-list surfaces.
const PROMO_CODE_RE = /^[A-Z0-9]+$/;
// Tick 294 — AU ABN spaced-format regex. Matches both the DB CHECK
// constraint ck_abn_format at 0091:52-54 (`abn ~ '^\d{2} \d{3} \d{3}
// \d{3}$'`) and the application write-path guard ABN_RE at
// web/src/lib/reseller/admin-validator.ts:52. Only the spaced form
// (NN NNN NNN NNN, e.g. "79 659 615 111") is legal on the wire —
// unspaced (11-digit) or hyphenated forms are rejected on write.
const ABN_RE = /^\d{2} \d{3} \d{3} \d{3}$/;
// Tick 296 — hex colour regex mirroring HEX_COLOR_RE at
// web/src/lib/reseller/admin-validator.ts:53. The application write
// path rejects any patch.primary_color that fails this pattern with
// reason='primary_color_bad_format' (admin-validator.ts:150-158);
// there is no matching DB CHECK on primary_color so the invariant
// lives ONLY on the write path.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);
// Tick 288 — value set for allowed_tiers[] element membership. Matches
// STARTUP_TIER_STEPS = [0,10,20,30,40] enforced by admin-validator.ts on
// write; column source 0091:30 declares the ARRAY[0,10,20,30,40] default
// but has no DB CHECK on element membership so the invariant lives on
// the application write path.
const ALLOWED_TIER_VALUES = new Set([0, 10, 20, 30, 40]);
// Tick 304 — value set for admins[].role element membership. Mirrors the
// DB CHECK at 0091:71-72 `role IN ('owner','admin','viewer')` on the
// reseller_admins table. The application write path has no separate
// enum guard on role writes — the CHECK is the sole enforcement layer —
// so a schema-side CHECK drop or a legacy INSERT that stamped a role
// outside the enumeration would land straight through PostgREST onto
// the wire, which this Set catches on the first offending row.
const ALLOWED_ADMIN_ROLES = new Set(["owner", "admin", "viewer"]);
// Tick 305 — value set for admins[].status element membership. Mirrors
// the DB CHECK at 0091:73-74 `status IN ('active','revoked')` on the
// reseller_admins table. NARROWER than the resellers-row STATUSES Set
// {active, paused, terminated} at row 682 because reseller_admins.status
// is a link-lifecycle enum (link is either currently-active or
// revoked/tombstoned), not the business-lifecycle enum used on the
// resellers table. Application write path has no separate enum guard on
// admin status writes — the CHECK is the sole enforcement layer — so a
// schema-side CHECK drop or a legacy INSERT that stamped a status
// outside the enumeration would land straight through PostgREST onto
// the wire, which this Set catches on the first offending row.
const ALLOWED_ADMIN_STATUSES = new Set(["active", "revoked"]);
// Tick 313 — value set for attributions_summary.by_source keys. Mirrors
// the DB CHECK at 0091:123 `source IN ('code','provisioned','admin_manual')`
// on the reseller_attributions table, which is the sole enforcement layer
// (no application write-path enum guard on source writes — attribution.ts
// stamps the value based on the linking flow rather than a Zod-validated
// field). The route's attributions_summary.by_source reducer at
// route.ts:116-119 keys the accumulator directly on the raw
// reseller_attributions.source column, so a schema-side CHECK drop or a
// legacy INSERT that stamped a source outside the enumeration would
// surface as a rogue key on the wire — which this Set catches on the
// first offending key. NARROWER than the three-value admin-source enum
// because the attribution flow is strictly one of the three enumerated
// origins: user-typed promotion code, reseller-provisioned link, or
// admin-manual override.
const ALLOWED_ATTRIBUTION_SOURCES = new Set([
  "code",
  "provisioned",
  "admin_manual",
]);
// Tick 316 — value set for commissions[].status element membership. Mirrors
// the CASE expression at 0094:150-172 in the reseller_commissions_current
// view, which derives the status from the presence/absence of specific
// event_type rows in reseller_commission_events: (a) 'clawed_back' when any
// refund_full / dispute_lost / void event exists; (b) 'dispute_open' when a
// dispute_opened event exists without a matching dispute_won or dispute_lost;
// (c) 'partially_refunded' when a refund_partial event exists; (d) 'cleared'
// when a cleared event exists; (e) 'pending_clearance' as the ELSE branch
// when none of the above match. The status is view-computed rather than a
// stored column, so the CASE expression is the sole enforcement layer — a
// schema-side edit that added a new event_type WITHOUT extending the CASE
// (leaving a partially-refunded-then-cleared row falling through to the
// pending_clearance ELSE branch, for example), or a view-definition drift
// that introduced a new status literal outside the enumeration, would land
// straight through PostgREST onto the wire — which this Set catches on the
// first offending row. NARROWER than the resellers-row STATUSES Set
// {active, paused, terminated} at row 1059 because reseller_commissions.
// status is a settlement-lifecycle enum (five states tracking the
// commission's clearance journey), not the business-lifecycle enum used on
// the resellers table. Kept adjacent to the existing ALLOWED_ADMIN_ROLES /
// ALLOWED_ADMIN_STATUSES / ALLOWED_TIER_VALUES / ALLOWED_ATTRIBUTION_SOURCES
// cluster so a future value-set tick lands next to its siblings without
// scattering.
const ALLOWED_COMMISSION_STATUSES = new Set([
  "cleared",
  "pending_clearance",
  "clawed_back",
  "dispute_open",
  "partially_refunded",
]);

test.describe("Admin reseller GET pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before code normalisation, resellers SELECT, or the four related-rows SELECTs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — GET as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before code normalisation, resellers SELECT, or the four related-rows SELECTs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

// P10 wave-5 row 167 — active_wholesale variant + admin harness → happy 200
// with detail payload. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   167 | admin-reseller-detail-authz.spec.ts | active_wholesale |
//         happy 200 with detail payload | 200
//
// Loads loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin()
// gate at route.ts:21-32 passes without needing the per-variant reseller
// cohort auth, PLUS loadTempReseller('active_wholesale') so we know which
// real resellers.code to fetch (QAPROBEWHOLESALEACTIVE). URL is
// lowercased so it mirrors the /admin/resellers/[code]/page.tsx browser
// convention; the server re-uppercases via normaliseResellerCode
// (attribution.ts:25-29) before the resellers SELECT so the DB row
// resolves cleanly regardless of case.
//
// Twin of row 164 (admin-resellers-list-authz happy — pins the LIST
// envelope from behind the same admin gate) and row 173
// (admin-reseller-loop-status-authz happy — pins the on-disk snapshot
// envelope). This row pins the DETAIL envelope so the three admin GETs
// are jointly regression-guarded on the same requireAdmin() gate.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 47-56:  code normalisation → 400 code_required (row 168)
//   Line 58-70:  loadReseller → 404 not_found / 503 / 500
//   Line 74-97:  Promise.all — reseller_promotion_codes + reseller_admins +
//                reseller_attributions + reseller_commissions_current
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins,
//                       attributions_summary: {total, active, by_source},
//                       commissions }
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au (tick 130 admin
//     harness delta) — a real admin session so requireAdmin() returns
//     without throwing.
//   - loadTempReseller('active_wholesale') reads the QAPROBEWHOLESALEACTIVE
//     seed row so fixture.code is the real DB code. adminUserId is NOT
//     needed here because we log in as the ADMIN, not the reseller-admin
//     for the variant — the admin gate is independent of the reseller-
//     admins scope.
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded).
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE
// fires from this endpoint. Idempotent under CI replay.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + reseller shape
// (id UUID, code === fixture.code uppercased, display_name string,
// billing_model ∈ {retail, wholesale}, status ∈ {active, paused,
// terminated}) + Array.isArray on the four related-rows arrays +
// attributions_summary { total: number, active: number, by_source:
// object }. Do NOT pin ANY array length — promotion_codes may hold 0-3
// rows (tiers 20 + 40 seeded for active_wholesale + optional admin
// mints); admins holds ≥1 (per-variant reseller_admins row); commissions
// may be empty on fresh CI or ≥1 on hosts where P3 webhook accrual has
// fired; attributions_summary.total varies with whether the attributed-
// founder seed has been planted. Per-row shape pins on promotion_codes +
// admins catch a route regression that dropped a column from the SELECT
// list (route.ts:75-77 lists exact column set) without depending on
// seed volume.
//
// Non-Stripe / non-GST discipline: reads resellers +
// reseller_promotion_codes + reseller_admins + reseller_attributions +
// reseller_commissions_current only. No Stripe network call, no InfoVision
// dependency. P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Admin reseller GET — P10 wave-5 row 167 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("active_wholesale — GET as qa-admin-1 returns 200 with detail payload", async ({
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
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
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

    const detailRoute = `/api/admin/resellers/${fixture.code.toLowerCase()}`;
    const resp = await page.request.get(detailRoute);
    expect(
      resp.status(),
      `active_wholesale + happy GET returned ${resp.status()} — expected 200 after requireAdmin() passes and loadReseller resolves the QAPROBEWHOLESALEACTIVE row. A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs). A 5xx means one of the four Promise.all SELECTs failed (route.ts:74-97). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      reseller?: {
        id?: unknown;
        code?: unknown;
        display_name?: unknown;
        billing_model?: unknown;
        status?: unknown;
        created_at?: unknown;
        updated_at?: unknown;
        commission_share_pct?: unknown;
        gst_registered?: unknown;
        allowed_tiers?: unknown;
        monthly_credit_budget?: unknown;
        monthly_sandbox_credits?: unknown;
        can_create_startups?: unknown;
        can_grant_credits?: unknown;
        collateral_approval_required?: unknown;
        abn?: unknown;
        logo_url?: unknown;
        primary_color?: unknown;
        contact_email?: unknown;
        notes?: unknown;
      };
      promotion_codes?: Array<{
        id?: unknown;
        tier_pct?: unknown;
        code?: unknown;
        stripe_coupon_id?: unknown;
        stripe_promotion_code_id?: unknown;
        active?: unknown;
        created_at?: unknown;
      }>;
      admins?: Array<{
        id?: unknown;
        user_id?: unknown;
        role?: unknown;
        status?: unknown;
      }>;
      attributions_summary?: {
        total?: unknown;
        active?: unknown;
        by_source?: Record<string, unknown>;
      };
      commissions?: Array<{
        commission_id?: unknown;
        stripe_invoice_id?: unknown;
        list_price_aud_cents?: unknown;
        discount_pct?: unknown;
        commission_aud_cents?: unknown;
        net_owed_cents?: unknown;
        status?: unknown;
        created_at?: unknown;
      }>;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Reseller row shape — reads resellers.* (route.ts:37-41).
    expect(body.reseller, "body.reseller should be present").toBeTruthy();
    // Tick 325 — reseller.id UUID PRIMARY KEY two-part wire-shape pin.
    // Lifts the prior baseline single-line combined pin into two
    // labelled asserts matching the tick 308 commissions[].commission_id
    // + tick 320 promotion_codes[].id + tick 321 admins[].id posture
    // verbatim. Column source `resellers.id uuid PRIMARY KEY DEFAULT
    // gen_random_uuid()` at 0091:23, projected via route.ts:47-48
    // select("*") and surfaced at route.ts:122-129. See module-scope
    // doc-block above ISO_TIMESTAMP_RE (tick 325 paragraph) for the
    // rationale.
    expect(
      typeof body.reseller?.id === "string",
      `reseller.id '${String(body.reseller?.id)}' should be a string (uuid PRIMARY KEY DEFAULT gen_random_uuid() per 0091:23; a schema-side type flip to bigserial, a projection-side drop from route.ts:47-48 select("*"), or a PostgREST serialisation regression that returned null|undefined would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      UUID_RE.test(body.reseller?.id as string),
      `reseller.id '${String(body.reseller?.id)}' should match UUID shape (uuid PRIMARY KEY per 0091:23); a schema-side type flip that replaced id with a stringified integer, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here. Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    // Tick 329 — reseller.code text NOT NULL UNIQUE two-part labelled
    // wire-shape lift on the tick-1710 baseline single-part
    // `.toBe(fixture.code)` identity check. Column source
    // `resellers.code text NOT NULL UNIQUE` at 0091:24, projected via
    // route.ts:47-48 select("*") and surfaced at route.ts:122-129.
    // Uppercase discipline is enforced ONLY on the application write
    // path via normaliseResellerCode(); the DB carries no CHECK
    // constraint against mixed-case or non-alphanumeric slugs. See
    // module-scope doc-block above ISO_TIMESTAMP_RE (tick 329
    // paragraph) for the full rationale.
    expect(
      typeof body.reseller?.code === "string",
      `reseller.code '${String(body.reseller?.code)}' should be a string (text NOT NULL per 0091:24; a schema-side NOT NULL drop, a projection-side drop from route.ts:47-48 select("*"), or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the equality check below so a raw-type flip does not hide behind a mismatch diagnostic). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.code,
      `reseller.code '${String(body.reseller?.code)}' should equal fixture.code '${fixture.code}' (uppercase form stamped by seed-qa-reseller.mjs); a normaliseResellerCode() drift that returned the raw path segment without uppercasing, a PostgREST projection regression that returned a different reseller's code (horizontal-lookup leak), or a mixed-case legacy INSERT that bypassed the write-path normaliser would surface here. Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(fixture.code);
    // Tick 327 — reseller.display_name text NOT NULL two-part labelled
    // lift on the tick-1710 baseline single-part typeof-string pin.
    // Column source `resellers.display_name text NOT NULL` at 0091:25,
    // projected via route.ts:47-48 select("*") and surfaced at
    // route.ts:122-129. Application write-path guarantee: admin-
    // validator.ts:66-70 rejects trimmed-empty patches with
    // reason='display_name_blank', but the DB carries no CHECK
    // constraint so a bypass write path could still slip an empty
    // string past. See module-scope doc-block above ISO_TIMESTAMP_RE
    // (tick 327 paragraph) for the rationale.
    expect(
      typeof body.reseller?.display_name === "string",
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a string (text NOT NULL per 0091:25; a schema-side NOT NULL drop, a projection-side drop from route.ts:47-48 select("*"), or a PostgREST serialisation regression that returned null|undefined would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      String(body.reseller?.display_name ?? "").trim().length > 0,
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a non-blank string (admin-validator.ts:66-70 rejects trimmed-empty writes with reason='display_name_blank' but the DB has no CHECK constraint against blank/whitespace-only values — a bypass write path that INSERTed display_name='' or display_name='   ' straight past validateAdminResellerPatch would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    // Tick 328 — reseller.billing_model / reseller.status two-part
    // typeof-string + Set.has() value-set enum tightening on the
    // top-level detail payload. Column sources:
    //   - 0091:26 `billing_model text NOT NULL CHECK IN
    //     ('retail','wholesale')`
    //   - 0091:29 `status text NOT NULL DEFAULT 'active' CHECK IN
    //     ('active','paused','terminated')` — WIDER than the
    //     reseller_admins.status enum (active|revoked) pinned at
    //     tick 305 because this is a business-lifecycle enum, not
    //     a link-lifecycle enum.
    // Both projected via route.ts:47-48 select("*"). Two-part
    // shape mirroring the tick 304/305/312/316 value-set posture
    // verbatim: (a) typeof-string preserves the NOT-NULL raw-type
    // discipline; (b) Set.has() membership assert against the
    // module-scope BILLING_MODELS / STATUSES Sets mirrors the DB
    // CHECK enumeration. See the tick 328 doc paragraph above
    // ISO_TIMESTAMP_RE for the full rationale.
    expect(
      typeof body.reseller?.billing_model === "string",
      `reseller.billing_model '${String(body.reseller?.billing_model)}' should be a string (text NOT NULL per 0091:26; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:47-48 select("*") would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      BILLING_MODELS.has(body.reseller?.billing_model as string),
      `reseller.billing_model '${String(body.reseller?.billing_model)}' should be in the enum {retail,wholesale} per ck_reseller_billing_model CHECK at 0091:26; a DB CHECK drop, a legacy INSERT that stamped a billing_model outside the enumeration ('trial', 'partner'), or a PostgREST serialisation regression that returned a mixed-case slug ('Retail', 'WHOLESALE') would surface here. Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      typeof body.reseller?.status === "string",
      `reseller.status '${String(body.reseller?.status)}' should be a string (text NOT NULL per 0091:29; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:47-48 select("*") would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      STATUSES.has(body.reseller?.status as string),
      `reseller.status '${String(body.reseller?.status)}' should be in the enum {active,paused,terminated} per ck_reseller_status CHECK at 0091:29; a DB CHECK drop, a legacy INSERT that stamped a status outside the enumeration ('trial', 'suspended'), or a PostgREST serialisation regression that returned a mixed-case slug ('Active', 'Paused') would surface here. NOTE: this enum is WIDER than the reseller_admins.status Set pinned at tick 305 — resellers.status is a business-lifecycle enum, not a link-lifecycle enum. Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 285 — cross-surface mirror of tick 283 + tick 284 ISO wire-
    // shape pins from admin-resellers-list-authz.spec.ts (see module-scope
    // doc-block above ISO_TIMESTAMP_RE for the rationale). Column sources:
    //   - 0091:43 `created_at timestamptz NOT NULL DEFAULT now()`
    //   - 0091:44 `updated_at timestamptz NOT NULL DEFAULT now()`
    // Both projected via route.ts:47-48 select("*"). NOT-NULL discipline →
    // single typeof-string + regex assert per column, mirrors tick 283
    // (created_at) + tick 284 (updated_at) posture verbatim rather than
    // the null-or-string / null-or-string+regex layering used for
    // nullable decision_at / decision_reason columns on the admin-
    // requests-list surface. Single-row GET so the asserts run once per
    // test — equivalent to a per-row for-loop that iterates exactly one
    // row on the list surface. A PostgREST serialisation regression on
    // either column, a projection-side drop from route.ts:48 select("*"),
    // or a PATCH-time drift that stopped stamping updated_at=now()
    // surfaces here on the next CI pass.
    // Tick 337 — message-prose refresh on the tick 285 typeof-string
    // asserts (created_at + updated_at) to carry labelled failure-mode
    // diagnostics matching the tick 320+ two-part labelled discipline.
    // Pre-refresh baseline was bare `expect(typeof …).toBe("string")` so a
    // PostgREST regression returning a number / null / undefined would
    // surface as an unlabelled `Expected 'number' to be 'string'` without
    // naming the column, the writer schema source (0091:43 / 0091:44), or
    // the projection source (route.ts:47-48 select("*")). The refreshed
    // typeof half now labels the raw-type failure with the same NOT-NULL
    // discipline prose already carried by the regex half so the two-part
    // guard reads symmetrically per column, matching ticks 320+ practice.
    expect(
      typeof body.reseller?.created_at,
      `reseller.created_at '${String(body.reseller?.created_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per 0091:43 serialised via PostgREST as ISO 8601 text); a PostgREST regression that returned an epoch integer, a null on NOT-NULL, or a projection-side drop from route.ts:47-48 select("*") would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(body.reseller?.created_at as string),
      `reseller.created_at '${String(body.reseller?.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:43 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      typeof body.reseller?.updated_at,
      `reseller.updated_at '${String(body.reseller?.updated_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per 0091:44 serialised via PostgREST as ISO 8601 text; PATCH-time stamp is a trigger-free assignment in admin-validator write path so updated_at always advances on write); a PostgREST regression that returned an epoch integer, a null on NOT-NULL, or a projection-side drop from route.ts:47-48 select("*") would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(body.reseller?.updated_at as string),
      `reseller.updated_at '${String(body.reseller?.updated_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:44 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 286 — commission_share_pct numeric wire-shape + [0, 100]
    // value pin, cross-surface mirror of the sibling pin landed on
    // admin-resellers-list-authz.spec.ts in the same tick. Column source
    //   - 0091:38 `commission_share_pct numeric(5,2) NOT NULL DEFAULT 40.00`
    // Projected via route.ts:47-48 select("*"). NOT-NULL discipline →
    // single typeof-number + finite + range-in-[0,100] assert, matches
    // the list-surface posture verbatim. See module-scope doc-block
    // above ISO_TIMESTAMP_RE (tick 286 paragraph) for the rationale.
    // A PostgREST serialisation regression, a schema-side type flip, an
    // admin-validator drift that stopped rejecting out-of-band values,
    // or a projection-side drop from route.ts:47-48 select("*") would
    // surface here on the next CI pass.
    // Tick 337 — message-prose refresh on the tick 286 typeof-number
    // assert (commission_share_pct) to carry labelled failure-mode
    // diagnostics matching the tick 320+ two-part labelled discipline.
    // Pre-refresh baseline was bare `expect(typeof …).toBe("number")` so
    // a PostgREST regression returning the numeric as a text-serialised
    // "40.00" (Stripe SDK style) or a projection-side drop from
    // route.ts:47-48 select("*") would surface as an unlabelled
    // `Expected 'string' to be 'number'` without naming the column, the
    // writer schema source (0091:38 numeric(5,2) NOT NULL DEFAULT 40.00),
    // or the application write-path validator that clamps the value into
    // [0, 100] (admin-validator.ts:114-118). The refreshed typeof half
    // now labels the raw-type failure with the same NOT-NULL discipline
    // prose already carried by the finite + range halves below so the
    // three-part guard reads symmetrically, matching ticks 320+ practice.
    expect(
      typeof body.reseller?.commission_share_pct,
      `reseller.commission_share_pct '${String(body.reseller?.commission_share_pct)}' should be a number (numeric(5,2) NOT NULL DEFAULT 40.00 per 0091:38 serialised via PostgREST as a JS number, NOT a text-serialised "40.00" — PostgREST's default numeric serialisation returns raw numbers for values that fit into IEEE 754 without precision loss, which every value in [0, 100] with 2 decimal places satisfies); a PostgREST regression that flipped numeric to text, a schema-side type flip from numeric to text/varchar, a null on NOT-NULL, or a projection-side drop from route.ts:47-48 select("*") would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("number");
    expect(
      Number.isFinite(body.reseller?.commission_share_pct as number),
      `reseller.commission_share_pct '${String(body.reseller?.commission_share_pct)}' should be a finite number (numeric(5,2) NOT NULL DEFAULT 40.00 per 0091:38 serialised via PostgREST); a drift to NaN, Infinity, string, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      (body.reseller?.commission_share_pct as number) >= 0 &&
        (body.reseller?.commission_share_pct as number) <= 100,
      `reseller.commission_share_pct '${String(body.reseller?.commission_share_pct)}' should be within [0, 100] (admin-validator.ts:114-118 rejects out-of-band writes with commission_share_pct_out_of_range); a schema-side drift or a validator-side drop of the [0, 100] guard would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 287 — gst_registered bool wire-shape pin, cross-surface mirror
    // of the sibling pin landed on admin-resellers-list-authz.spec.ts in
    // the same tick. See module-scope doc-block (tick 287 paragraph) for
    // the rationale. Column source 0091:36 `gst_registered bool NOT NULL
    // DEFAULT false`; wholesale rows are further gated by CHECK
    // ck_wholesale_gst_required at 0091:47-50 so the active_wholesale
    // fixture (QAPROBEWHOLESALEACTIVE seed row) exercises the true
    // branch on this GET. Projected via route.ts:47-48 select("*").
    // NOT-NULL discipline → single typeof-boolean assert; bool has no
    // finite / range dimension so no second guard is layered, matching
    // the list-surface posture verbatim.
    expect(
      typeof body.reseller?.gst_registered,
      `reseller.gst_registered '${String(body.reseller?.gst_registered)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:36 serialised via PostgREST; wholesale rows gated true by CHECK ck_wholesale_gst_required at 0091:47-50); a drift to a string, number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("boolean");

    // Tick 288 — allowed_tiers int[] wire-shape + value-set pin, cross-
    // surface mirror of the sibling pin landed on admin-resellers-list-
    // authz.spec.ts in the same tick. See module-scope doc-block (tick
    // 288 paragraph) for the rationale. Column source 0091:30
    // `allowed_tiers int[] NOT NULL DEFAULT ARRAY[0,10,20,30,40]`;
    // element-membership invariant enforced by RESELLER_TIER_VALUES in
    // admin-validator.ts on write (no DB CHECK on element membership).
    // Projected via route.ts:47-48 select("*"). NOT-NULL array →
    // three-part guard (Array.isArray + every-elem typeof-number +
    // every-elem ∈ {0,10,20,30,40}) matches the list-surface posture
    // verbatim. Detail-row assert runs ONCE per test (single object).
    expect(
      Array.isArray(body.reseller?.allowed_tiers),
      `reseller.allowed_tiers '${String(body.reseller?.allowed_tiers)}' should be an array (int[] NOT NULL DEFAULT ARRAY[0,10,20,30,40] per 0091:30 serialised via PostgREST); a drift to a string like "{0,10,20,30,40}", a number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    const allowedTiers = body.reseller?.allowed_tiers as unknown[];
    expect(
      allowedTiers.every((t) => typeof t === "number" && Number.isFinite(t)),
      `reseller.allowed_tiers every element should be a finite number (int[] per 0091:30); a schema-side flip from int[] to text[] would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      allowedTiers.every((t) => ALLOWED_TIER_VALUES.has(t as number)),
      `reseller.allowed_tiers every element should be ∈ {0,10,20,30,40} (STARTUP_TIER_STEPS enforced by admin-validator.ts on write; no DB CHECK on element membership); an admin-validator drift or a schema-side widening would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 289 — monthly_credit_budget int wire-shape + non-negative +
    // integer pin, cross-surface mirror of the sibling pin landed on
    // admin-resellers-list-authz.spec.ts in the same tick. See module-
    // scope doc-block (tick 289 paragraph) for the rationale. Column
    // source 0091:33 `monthly_credit_budget int NOT NULL DEFAULT 0`;
    // admin PATCH validator at admin-validator.ts:100-105 rejects
    // !Number.isFinite || value < 0 with reason 'budget_negative' and
    // Math.floor()s the accepted value. Projected via route.ts:47-48
    // select("*"). NOT-NULL + integer invariant → four-part guard
    // (typeof-number + Number.isFinite + Number.isInteger + value >= 0)
    // matches the list-surface posture verbatim.
    expect(
      typeof body.reseller?.monthly_credit_budget,
      `reseller.monthly_credit_budget '${String(body.reseller?.monthly_credit_budget)}' should be a number (int NOT NULL DEFAULT 0 per 0091:33 serialised via PostgREST); a drift to a string, boolean, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("number");
    expect(
      Number.isFinite(body.reseller?.monthly_credit_budget as number),
      `reseller.monthly_credit_budget '${String(body.reseller?.monthly_credit_budget)}' should be a finite number (int NOT NULL DEFAULT 0 per 0091:33); a drift to NaN or Infinity would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Number.isInteger(body.reseller?.monthly_credit_budget as number),
      `reseller.monthly_credit_budget '${String(body.reseller?.monthly_credit_budget)}' should be an integer (int per 0091:33; admin-validator.ts:104 Math.floor()s writes); a schema widening from int to numeric or a Math.floor() drop would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      (body.reseller?.monthly_credit_budget as number) >= 0,
      `reseller.monthly_credit_budget '${String(body.reseller?.monthly_credit_budget)}' should be >= 0 (admin-validator.ts:100-105 rejects value < 0 with reason 'budget_negative'); a validator drift or a schema-side drop of the non-negative invariant would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 290 — monthly_sandbox_credits int wire-shape + non-negative +
    // integer pin, cross-surface mirror of the sibling pin landed on
    // admin-resellers-list-authz.spec.ts in the same tick. See module-
    // scope doc-block (tick 290 paragraph) for the rationale. Column
    // source 0091:34 `monthly_sandbox_credits int NOT NULL DEFAULT 500`;
    // admin PATCH validator at admin-validator.ts:107-112 rejects
    // !Number.isFinite || value < 0 with reason 'sandbox_negative' and
    // Math.floor()s the accepted value. Projected via route.ts:47-48
    // select("*"). NOT-NULL + integer invariant → four-part guard
    // (typeof-number + Number.isFinite + Number.isInteger + value >= 0)
    // matches the list-surface posture verbatim.
    expect(
      typeof body.reseller?.monthly_sandbox_credits,
      `reseller.monthly_sandbox_credits '${String(body.reseller?.monthly_sandbox_credits)}' should be a number (int NOT NULL DEFAULT 500 per 0091:34 serialised via PostgREST); a drift to a string, boolean, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("number");
    expect(
      Number.isFinite(body.reseller?.monthly_sandbox_credits as number),
      `reseller.monthly_sandbox_credits '${String(body.reseller?.monthly_sandbox_credits)}' should be a finite number (int NOT NULL DEFAULT 500 per 0091:34); a drift to NaN or Infinity would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Number.isInteger(body.reseller?.monthly_sandbox_credits as number),
      `reseller.monthly_sandbox_credits '${String(body.reseller?.monthly_sandbox_credits)}' should be an integer (int per 0091:34; admin-validator.ts:111 Math.floor()s writes); a schema widening from int to numeric or a Math.floor() drop would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      (body.reseller?.monthly_sandbox_credits as number) >= 0,
      `reseller.monthly_sandbox_credits '${String(body.reseller?.monthly_sandbox_credits)}' should be >= 0 (admin-validator.ts:107-112 rejects value < 0 with reason 'sandbox_negative'); a validator drift or a schema-side drop of the non-negative invariant would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 291 — can_create_startups bool wire-shape pin, cross-surface
    // mirror of the sibling pin landed on admin-resellers-list-authz.spec.
    // ts in the same tick. See module-scope doc-block (tick 291 paragraph)
    // for the rationale. Column source 0091:31 `can_create_startups bool
    // NOT NULL DEFAULT false` — sibling bool column to gst_registered
    // (pinned at tick 287). Projected via route.ts:47-48 select("*").
    // NOT-NULL discipline → single typeof-boolean assert; bool has no
    // finite / range dimension so no second guard is layered, matching
    // the list-surface posture verbatim.
    expect(
      typeof body.reseller?.can_create_startups,
      `reseller.can_create_startups '${String(body.reseller?.can_create_startups)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:31 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("boolean");

    // Tick 292 — can_grant_credits bool wire-shape pin, cross-surface
    // mirror of the sibling pin landed on admin-resellers-list-authz.spec.
    // ts in the same tick. See module-scope doc-block (tick 292 paragraph)
    // for the rationale. Column source 0091:32 `can_grant_credits bool
    // NOT NULL DEFAULT false` — third bool NOT NULL column on the
    // resellers row after gst_registered (pinned at tick 287) and
    // can_create_startups (pinned at tick 291). Projected via route.ts:
    // 47-48 select("*"). NOT-NULL discipline → single typeof-boolean
    // assert; bool has no finite / range dimension so no second guard
    // is layered, matching the list-surface posture verbatim.
    expect(
      typeof body.reseller?.can_grant_credits,
      `reseller.can_grant_credits '${String(body.reseller?.can_grant_credits)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:32 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("boolean");

    // Tick 293 — collateral_approval_required bool wire-shape pin, cross-
    // surface mirror of the sibling pin landed on admin-resellers-list-
    // authz.spec.ts in the same tick. See module-scope doc-block (tick
    // 293 paragraph) for the rationale. Column source 0091:35
    // `collateral_approval_required bool NOT NULL DEFAULT true` — fourth
    // bool NOT NULL column on the resellers row after gst_registered
    // (pinned at tick 287), can_create_startups (pinned at tick 291), and
    // can_grant_credits (pinned at tick 292); first bool NOT NULL column
    // to carry a DEFAULT true so the QAPROBEWHOLESALEACTIVE seed row
    // exercises the true branch. Projected via route.ts:47-48 select("*").
    // NOT-NULL discipline → single typeof-boolean assert; bool has no
    // finite / range dimension so no second guard is layered, matching
    // the list-surface posture verbatim.
    expect(
      typeof body.reseller?.collateral_approval_required,
      `reseller.collateral_approval_required '${String(body.reseller?.collateral_approval_required)}' should be a boolean (bool NOT NULL DEFAULT true per 0091:35 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("boolean");

    // Tick 294 — abn text nullable wire-shape pin, cross-surface mirror
    // of the sibling pin landed on admin-resellers-list-authz.spec.ts
    // in the same tick. See module-scope doc-block (tick 294 paragraph)
    // for the rationale. Column source 0091:37 `abn text` (nullable)
    // with DB CHECK ck_abn_format at 0091:52-54 (`abn IS NULL OR abn ~
    // '^\d{2} \d{3} \d{3} \d{3}$'`) and application write-path guard
    // ABN_RE at admin-validator.ts:52. Two-part guard: (a) null-or-
    // typeof-string preserving the tick 275 posture for nullable text,
    // (b) null-or-(typeof-string AND ABN_RE.test()) tightening onto the
    // DB CHECK + validator regex. QAPROBEWHOLESALEACTIVE seed row is
    // wholesale so it exercises the null-or-string+ABN_RE branch on
    // every green CI run; retail probe variants exercise the null
    // branch.
    expect(
      body.reseller?.abn === null || typeof body.reseller?.abn === "string",
      `reseller.abn '${String(body.reseller?.abn)}' should be null or a string (nullable text per 0091:37; NULL on retail rows without an ABN populated, string on wholesale rows per ck_wholesale_gst_required at 0091:47-50). Row: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.abn === null ||
        (typeof body.reseller?.abn === "string" &&
          ABN_RE.test(body.reseller!.abn as string)),
      `reseller.abn '${String(body.reseller?.abn)}' should be null or an AU ABN string in the spaced format 'NN NNN NNN NNN' (DB CHECK ck_abn_format at 0091:52-54 + admin-validator.ts:52 ABN_RE); a drift to an unspaced 11-digit string, a hyphenated form, or any other shape would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 295 — logo_url text nullable wire-shape pin, cross-surface
    // mirror of the sibling pin landed on admin-resellers-list-authz.
    // spec.ts in the same tick. See module-scope doc-block (tick 295
    // paragraph) for the rationale. Column source 0091:26 `logo_url
    // text` (nullable) with NO DB CHECK and NO application write-path
    // format guard. Nullable discipline with no format layer → single-
    // guard null-or-typeof-string assert, looser than the tick 294 two-
    // part guard because there is no format regex to layer on top. The
    // QAPROBEWHOLESALEACTIVE seed row carries logo_url=NULL by default
    // so the null branch is exercised on every green CI run.
    expect(
      body.reseller?.logo_url === null ||
        typeof body.reseller?.logo_url === "string",
      `reseller.logo_url '${String(body.reseller?.logo_url)}' should be null or a string (nullable text per 0091:26; NULL when no logo URL is populated, string when a reseller has uploaded/registered a branded logo URL — no DB CHECK, no admin-validator format guard). Row: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 296 — primary_color text nullable wire-shape pin, cross-
    // surface mirror of the sibling pin landed on admin-resellers-list-
    // authz.spec.ts in the same tick. See module-scope doc-block (tick
    // 296 paragraph) for the rationale. Column source 0091:27
    // `primary_color text` (nullable) with NO DB CHECK and application
    // write-path guard HEX_COLOR_RE at admin-validator.ts:53. Two-part
    // guard: (a) null-or-typeof-string, (b) null-or-(typeof-string AND
    // HEX_COLOR_RE.test()). QAPROBEWHOLESALEACTIVE seed row carries
    // primary_color=NULL by default so the null branch is exercised on
    // every green CI run.
    expect(
      body.reseller?.primary_color === null ||
        typeof body.reseller?.primary_color === "string",
      `reseller.primary_color '${String(body.reseller?.primary_color)}' should be null or a string (nullable text per 0091:27; NULL when no brand colour is populated, string when an admin has configured a hex colour via the admin PATCH surface). Row: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.primary_color === null ||
        (typeof body.reseller?.primary_color === "string" &&
          HEX_COLOR_RE.test(body.reseller!.primary_color as string)),
      `reseller.primary_color '${String(body.reseller?.primary_color)}' should be null or a hex colour string matching /^#[0-9a-fA-F]{6}$/ (admin-validator.ts:53 HEX_COLOR_RE rejects other shapes with reason 'primary_color_bad_format'); a drift to a 3-digit hex, unhashed hex, rgba() string, or any other shape would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 297 — contact_email text nullable wire-shape pin, cross-
    // surface mirror of the sibling pin landed on admin-resellers-list-
    // authz.spec.ts in the same tick. See module-scope doc-block (tick
    // 297 paragraph) for the rationale. Column source 0091:41
    // `contact_email text` (nullable) with NO DB CHECK and NO
    // application write-path format guard (admin-validator.ts:141-143
    // only String()s+trim()s or nulls when empty; no email-shape regex
    // is enforced). Nullable discipline with no format layer → single-
    // guard null-or-typeof-string assert, matching the tick 295
    // logo_url posture verbatim rather than the tick 294/296 two-part
    // guard because there is no format regex to layer on top. The
    // QAPROBEWHOLESALEACTIVE seed row carries contact_email=NULL by
    // default so the null branch is exercised on every green CI run.
    expect(
      body.reseller?.contact_email === null ||
        typeof body.reseller?.contact_email === "string",
      `reseller.contact_email '${String(body.reseller?.contact_email)}' should be null or a string (nullable text per 0091:41; NULL when no contact address is populated, string when a reseller has registered a contact address — no DB CHECK, no admin-validator format guard). Row: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Tick 298 — notes text nullable wire-shape pin, cross-surface mirror
    // of the sibling pin landed on admin-resellers-list-authz.spec.ts in
    // the same tick, closing the resellers-row column-pin project. See
    // module-scope doc-block (tick 298 paragraph) for the rationale.
    // Column source 0091:42 `notes text` (nullable) with NO DB CHECK and
    // NO application write-path format guard (admin-validator.ts:144-146
    // only String()s or nulls when empty; no length or shape rule).
    // Nullable discipline with no format layer → single-guard null-or-
    // typeof-string assert, matching the tick 295 logo_url and tick 297
    // contact_email posture verbatim rather than the tick 294/296 two-
    // part guard because there is no format regex to layer on top. The
    // QAPROBEWHOLESALEACTIVE seed row carries notes=NULL by default so
    // the null branch is exercised on every green CI run.
    expect(
      body.reseller?.notes === null ||
        typeof body.reseller?.notes === "string",
      `reseller.notes '${String(body.reseller?.notes)}' should be null or a string (nullable text per 0091:42; NULL when no admin ops notes have been captured, string when an admin has populated the free-form notes field via the PATCH surface — no DB CHECK, no admin-validator format guard). Row: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);

    // Related-rows arrays — do NOT pin length; each row-shape pin catches
    // a SELECT-column drift on the route-side Promise.all (route.ts:74-97).
    expect(
      Array.isArray(body.promotion_codes),
      `promotion_codes should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.promotion_codes ?? []) {
      // Tick 320 — promotion_codes[].id UUID two-part wire-shape pin.
      // Lifts the prior baseline bare combined pin into two labelled
      // asserts matching the tick 308 commission_id posture verbatim.
      // Column source `reseller_promotion_codes.id uuid PRIMARY KEY
      // DEFAULT gen_random_uuid()` at 0091:89, projected via route.ts:
      // 83-88 select("id, tier_pct, code, stripe_coupon_id,
      // stripe_promotion_code_id, active, created_at"). See module-scope
      // doc-block above ISO_TIMESTAMP_RE (tick 320 paragraph) for the
      // rationale.
      expect(
        typeof row.id === "string",
        `promotion_codes[].id '${String(row.id)}' should be a string (uuid PRIMARY KEY DEFAULT gen_random_uuid() per 0091:89; a schema-side type flip to bigserial, a projection-side drop from route.ts:83-88 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        UUID_RE.test(row.id as string),
        `promotion_codes[].id '${String(row.id)}' should match UUID shape (uuid PRIMARY KEY per 0091:89); a projection-side drop from route.ts:83-88 select that replaced id with a stringified integer id, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 303 — tighten from bare typeof-number to full value-set enum
      // guard against ck_reseller_promotion_codes tier_pct CHECK at
      // 0091:90 (tier_pct IN (0,10,20,30,40)). Layered as two asserts:
      // (a) typeof-number + Number.isFinite preserves the raw-type
      // discipline the tick 232 pin already covered; (b) reuses the
      // module-scope ALLOWED_TIER_VALUES Set already used at row 934 for
      // reseller.allowed_tiers element membership so a schema-side CHECK
      // drop, a PostgREST regression that returned a stringified tier, or
      // an admin-validator drift widening STARTUP_TIER_STEPS would surface
      // here on the first offending row. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 303 paragraph) for the rationale.
      expect(
        typeof row.tier_pct === "number" && Number.isFinite(row.tier_pct),
        `promotion_codes[].tier_pct '${String(row.tier_pct)}' should be a finite number (int NOT NULL per 0091:90 serialised via PostgREST as a JSON number; a schema-side widening, a PostgREST serialisation regression that returned null|undefined or a stringified value, or a projection-side drop from route.ts:83-88 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ALLOWED_TIER_VALUES.has(row.tier_pct as number),
        `promotion_codes[].tier_pct '${String(row.tier_pct)}' should be in the enum {0,10,20,30,40} per ck_reseller_promotion_codes tier_pct CHECK at 0091:90; a DB CHECK drop, a legacy code_request approve branch that stamped an out-of-enum tier, or an admin-validator drift that widened STARTUP_TIER_STEPS would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 324 — promotion_codes[].code PROMO_CODE_RE two-part wire-
      // shape pin. Lifts the prior tick 232 baseline bare two-part pin
      // into two labelled asserts matching the tick 320 promotion_codes[]
      // .id posture verbatim. Column source
      // `reseller_promotion_codes.code text NOT NULL UNIQUE` at 0091:91
      // with the uppercase-alphanumeric invariant living on the
      // application write path only (buildPromoCodeName at
      // web/src/lib/reseller/promotion-code-mint.ts:41-58) — no DB CHECK.
      // See module-scope doc-block above ISO_TIMESTAMP_RE (tick 324
      // paragraph) for the rationale.
      expect(
        typeof row.code === "string",
        `promotion_codes[].code '${String(row.code)}' should be a string (text NOT NULL UNIQUE per 0091:91; a schema-side NOT NULL drop, a projection-side drop from route.ts:83-88 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        PROMO_CODE_RE.test(row.code as string),
        `promotion_codes[].code '${String(row.code)}' should match uppercase-alphanumeric shape /^[A-Z0-9]+$/ (buildPromoCodeName write-path invariant at web/src/lib/reseller/promotion-code-mint.ts:41-58 — uppercase + <=40 chars, composed from normaliseResellerCode() output + optional SUFFIX_RE-vetted tier suffix); a P9.4 approve-branch bypass that INSERTed a raw / lowercase / punctuated code straight past buildPromoCodeName would surface here rather than only at visual QA of /admin/resellers/[code]. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 299 — promotion_codes[].active bool wire-shape pin. Column
      // 0091:94 `active bool NOT NULL DEFAULT true`. NOT-NULL discipline
      // → single typeof-boolean assert; no null branch, no format layer.
      // See module-scope doc-block above ISO_TIMESTAMP_RE (tick 299
      // paragraph) for the rationale.
      expect(
        typeof row.active === "boolean",
        `promotion_codes[].active '${String(row.active)}' should be a boolean (bool NOT NULL DEFAULT true per 0091:94; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:83-88 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 300 — promotion_codes[].created_at timestamptz wire-shape
      // pin. Column 0091:95 `created_at timestamptz NOT NULL DEFAULT
      // now()`. NOT-NULL discipline with ISO 8601 shape → two-part
      // typeof-string + ISO_TIMESTAMP_RE assert; mirrors the resellers.
      // created_at tick 283/285 posture verbatim. See module-scope doc-
      // block above ISO_TIMESTAMP_RE (tick 300 paragraph) for the
      // rationale.
      expect(
        typeof row.created_at === "string",
        `promotion_codes[].created_at '${String(row.created_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per 0091:95 serialised via PostgREST as an ISO 8601 string; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:83-88 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ISO_TIMESTAMP_RE.test(row.created_at as string),
        `promotion_codes[].created_at '${String(row.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:95); a drift to a non-ISO string, a Unix epoch number rendered as string, or a truncated date-only value would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 301 — promotion_codes[].stripe_coupon_id text nullable wire-
      // shape pin. Column 0091:92 `stripe_coupon_id text` (nullable) with
      // no standalone CHECK, coupled to tier_pct via ck_stripe_objects_by_
      // tier at 0091:98-102 (tier 0 → NULL, tier > 0 → NOT NULL). Two-part
      // guard: (a) null-or-typeof-string preserves the nullable-text
      // posture; (b) tier-coupled invariant mirrors the DB CHECK — tier 0
      // rows require stripe_coupon_id===null, tier > 0 rows require
      // typeof===string. See module-scope doc-block above ISO_TIMESTAMP_RE
      // (tick 301 paragraph) for the rationale.
      expect(
        row.stripe_coupon_id === null || typeof row.stripe_coupon_id === "string",
        `promotion_codes[].stripe_coupon_id '${String(row.stripe_coupon_id)}' should be null or a string (nullable text per 0091:92; NULL for tier 0 attribution-only rows, string for tier > 0 rows carrying the Stripe coupon id minted via ensureStripeCoupon at web/src/lib/reseller/promotion-code-mint.ts). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      if (typeof row.tier_pct === "number" && row.tier_pct === 0) {
        expect(
          row.stripe_coupon_id === null,
          `promotion_codes[].stripe_coupon_id should be null when tier_pct === 0 per ck_stripe_objects_by_tier at 0091:98-102 (tier 0 rows are attribution-only; ensureStripeCoupon is skipped at the promotion-code-mint decideCodeMint branch). Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      } else if (typeof row.tier_pct === "number" && row.tier_pct > 0) {
        expect(
          typeof row.stripe_coupon_id === "string",
          `promotion_codes[].stripe_coupon_id should be a string when tier_pct > 0 per ck_stripe_objects_by_tier at 0091:98-102 (tier > 0 rows require a real Stripe coupon minted via ensureStripeCoupon at web/src/lib/reseller/promotion-code-mint.ts; a DB CHECK drop or a mint-branch bypass would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      }
      // Tick 302 — promotion_codes[].stripe_promotion_code_id text
      // nullable wire-shape pin. Column 0091:93 `stripe_promotion_code_id
      // text` (nullable) — natural pair of stripe_coupon_id (tick 301)
      // under the same ck_stripe_objects_by_tier at 0091:98-102. Two-part
      // guard mirroring tick 301 verbatim: (a) null-or-typeof-string
      // preserves the nullable-text posture; (b) tier-coupled invariant
      // matches the DB CHECK. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 302 paragraph) for the rationale.
      expect(
        row.stripe_promotion_code_id === null || typeof row.stripe_promotion_code_id === "string",
        `promotion_codes[].stripe_promotion_code_id '${String(row.stripe_promotion_code_id)}' should be null or a string (nullable text per 0091:93; NULL for tier 0 attribution-only rows, string for tier > 0 rows carrying the Stripe promotion-code id minted via ensureStripePromotionCode at web/src/lib/reseller/promotion-code-mint.ts). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      if (typeof row.tier_pct === "number" && row.tier_pct === 0) {
        expect(
          row.stripe_promotion_code_id === null,
          `promotion_codes[].stripe_promotion_code_id should be null when tier_pct === 0 per ck_stripe_objects_by_tier at 0091:98-102 (tier 0 rows are attribution-only; ensureStripePromotionCode is skipped at the promotion-code-mint decideCodeMint branch). Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      } else if (typeof row.tier_pct === "number" && row.tier_pct > 0) {
        expect(
          typeof row.stripe_promotion_code_id === "string",
          `promotion_codes[].stripe_promotion_code_id should be a string when tier_pct > 0 per ck_stripe_objects_by_tier at 0091:98-102 (tier > 0 rows require a real Stripe promotion code minted via ensureStripePromotionCode at web/src/lib/reseller/promotion-code-mint.ts; a DB CHECK drop or a mint-branch bypass would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      }
    }

    expect(
      Array.isArray(body.admins),
      `admins should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.admins ?? []) {
      // Tick 321 — admins[].id UUID two-part wire-shape pin. Lifts the
      // prior baseline bare combined pin into two labelled asserts
      // matching the tick 308 commissions[].commission_id + tick 320
      // promotion_codes[].id posture verbatim. Column source
      // `reseller_admins.id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
      // at 0091:68, projected via route.ts:89-93 select("id, user_id,
      // role, status, linked_at, revoked_at"). See module-scope doc-
      // block above ISO_TIMESTAMP_RE (tick 321 paragraph) for the
      // rationale.
      expect(
        typeof row.id === "string",
        `admins[].id '${String(row.id)}' should be a string (uuid PRIMARY KEY DEFAULT gen_random_uuid() per 0091:68; a schema-side type flip to bigserial, a projection-side drop from route.ts:89-93 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        UUID_RE.test(row.id as string),
        `admins[].id '${String(row.id)}' should match UUID shape (uuid PRIMARY KEY per 0091:68); a projection-side drop from route.ts:89-93 select that replaced id with a stringified integer id, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 322 — admins[].user_id UUID two-part wire-shape pin.
      // Lifts the prior baseline bare combined pin into two labelled
      // asserts matching the tick 308 commissions[].commission_id +
      // tick 320 promotion_codes[].id + tick 321 admins[].id posture
      // verbatim. Column source `reseller_admins.user_id uuid NOT
      // NULL REFERENCES app_users(id) ON DELETE CASCADE` at 0091:69,
      // projected via route.ts:89-93 select("id, user_id, role,
      // status, linked_at, revoked_at"). See module-scope doc-block
      // above ISO_TIMESTAMP_RE (tick 322 paragraph) for the
      // rationale.
      expect(
        typeof row.user_id === "string",
        `admins[].user_id '${String(row.user_id)}' should be a string (uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE per 0091:69; a schema-side NOT NULL drop, a projection-side drop from route.ts:89-93 select, an ON DELETE CASCADE race that briefly rendered the row after the FK target was purged, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        UUID_RE.test(row.user_id as string),
        `admins[].user_id '${String(row.user_id)}' should match UUID shape (uuid NOT NULL REFERENCES app_users(id) per 0091:69; a projection-side drop from route.ts:89-93 select that replaced user_id with a stringified integer id, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 304 — admins[].role value-set enum tightening. Column
      // source 0091:71-72 declares `role text NOT NULL DEFAULT 'admin'
      // CHECK (role IN ('owner','admin','viewer'))`. Two-part shape:
      // (a) typeof-string preserves the raw-type discipline the
      // baseline pin already covered; (b) ALLOWED_ADMIN_ROLES.has()
      // membership assert against the module-scope Set mirrors the DB
      // CHECK enumeration. See the tick 304 doc paragraph above
      // ISO_TIMESTAMP_RE for the full rationale.
      expect(
        typeof row.role === "string",
        `admins[].role '${String(row.role)}' should be a string (text NOT NULL per 0091:71; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:89-93 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ALLOWED_ADMIN_ROLES.has(row.role as string),
        `admins[].role '${String(row.role)}' should be in the enum {owner,admin,viewer} per ck_reseller_admins role CHECK at 0091:71-72; a DB CHECK drop, a legacy INSERT that stamped a role outside the enumeration, or a PostgREST serialisation regression that returned a mixed-case slug ('Owner') would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 305 — admins[].status value-set enum tightening. Column
      // source 0091:73-74 declares `status text NOT NULL DEFAULT
      // 'active' CHECK (status IN ('active','revoked'))`. Two-part
      // shape mirroring tick 304's role guard verbatim: (a) typeof-
      // string preserves the raw-type discipline the baseline pin
      // already covered; (b) ALLOWED_ADMIN_STATUSES.has() membership
      // assert against the module-scope Set mirrors the DB CHECK
      // enumeration (narrower than the resellers-row STATUSES enum
      // — link-lifecycle vs business-lifecycle). See the tick 305 doc
      // paragraph above ISO_TIMESTAMP_RE for the full rationale.
      expect(
        typeof row.status === "string",
        `admins[].status '${String(row.status)}' should be a string (text NOT NULL per 0091:73; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:89-93 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ALLOWED_ADMIN_STATUSES.has(row.status as string),
        `admins[].status '${String(row.status)}' should be in the enum {active,revoked} per ck_reseller_admins status CHECK at 0091:73-74; a DB CHECK drop, a legacy INSERT that stamped a status outside the enumeration ('disabled', 'pending'), or a PostgREST serialisation regression that returned a mixed-case slug ('Active') would surface here. NOTE: this enum is narrower than the resellers-row STATUSES set — reseller_admins.status is a link-lifecycle enum (active|revoked), not a business-lifecycle enum. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 306 — admins[].linked_at timestamptz wire-shape pin. Column
      // 0091:75 `linked_at timestamptz NOT NULL DEFAULT now()`. NOT-NULL
      // discipline with ISO 8601 shape → two-part typeof-string +
      // ISO_TIMESTAMP_RE assert; mirrors the promotion_codes[].created_at
      // tick 300 posture verbatim and the resellers.created_at tick
      // 283/285 shape assert. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 306 paragraph) for the rationale.
      expect(
        typeof row.linked_at === "string",
        `admins[].linked_at '${String(row.linked_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per 0091:75 serialised via PostgREST as an ISO 8601 string; a schema-side widening, a PostgREST serialisation regression that returned null|undefined, or a projection-side drop from route.ts:89-93 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ISO_TIMESTAMP_RE.test(row.linked_at as string),
        `admins[].linked_at '${String(row.linked_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:75); a drift to a non-ISO string, a Unix epoch number rendered as string, or a truncated date-only value would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 307 — admins[].revoked_at nullable timestamptz wire-shape
      // pin. Column 0091:76 `revoked_at timestamptz` (nullable, no NOT
      // NULL clause). Combines the tick 301 nullable-text posture
      // (null-or-typeof-string) with the tick 300/306 ISO shape assert
      // on the non-null branch. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 307 paragraph) for the rationale.
      expect(
        row.revoked_at === null || typeof row.revoked_at === "string",
        `admins[].revoked_at '${String(row.revoked_at)}' should be null or a string (nullable timestamptz per 0091:76; NULL for active links, ISO 8601 string for tombstoned links stamped by the app-layer revoke code-path; a schema-side NOT NULL addition, a PostgREST serialisation regression that returned undefined, or a projection-side drop from route.ts:89-93 select would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      if (typeof row.revoked_at === "string") {
        expect(
          ISO_TIMESTAMP_RE.test(row.revoked_at as string),
          `admins[].revoked_at '${String(row.revoked_at)}' should match ISO 8601 shape when non-null (nullable timestamptz per 0091:76 serialised via PostgREST as an ISO 8601 string on the tombstoned branch); a drift to a non-ISO string, a Unix epoch number rendered as string, or a truncated date-only value would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      }
      // Tick 326 — admins[] status ⇔ revoked_at cross-column lifecycle
      // invariant pin. Closes the reseller_admins[] child-row cluster
      // opened at tick 321. No DB CHECK ties status to revoked_at
      // (0091:73-76 declares each column independently) — the invariant
      // lives on the application write path only, so a wire-shape pin
      // is the sole guard against a future revoke path that flips
      // status → 'revoked' but forgets to stamp revoked_at, or a
      // resurrect path that flips status back to 'active' but forgets
      // to null revoked_at. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 326 paragraph) for the rationale.
      if (row.status === "active") {
        expect(
          row.revoked_at === null,
          `admins[].revoked_at '${String(row.revoked_at)}' should be null when status === 'active' per the lifecycle invariant documented at tick 307 ('status === "revoked" ⇔ revoked_at IS NOT NULL, active for live links, revoked for tombstoned admins'); a legacy INSERT that stamped a revoked_at value on an active row, or a future resurrect path that flipped status back to 'active' but forgot to null revoked_at, would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      } else if (row.status === "revoked") {
        expect(
          typeof row.revoked_at === "string",
          `admins[].revoked_at '${String(row.revoked_at)}' should be a non-null ISO 8601 string when status === 'revoked' per the lifecycle invariant documented at tick 307 ('status === "revoked" ⇔ revoked_at IS NOT NULL'); a future revoke path that flipped status → 'revoked' but forgot to stamp revoked_at with now() would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      }
    }

    // Attributions summary — pins the {total, active, by_source} shape
    // computed by route.ts:104-111. Sub-map by_source is an object with
    // numeric counts; not pinning its keys because sources vary.
    expect(
      body.attributions_summary,
      `attributions_summary should be present: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBeTruthy();
    // Tick 318 — attributions_summary.total int non-negative wire-shape
    // tightening. Three-part guard mirroring the tick 313 by_source count
    // guard shape verbatim: (a) typeof-number preserves the raw-type
    // discipline; (b) Number.isInteger() catches a JS regression that
    // stamped a stringified count, floating-point value, or NaN/Infinity;
    // (c) >= 0 assert catches a signed-int wraparound or a reducer
    // refactor that stamped a negative counter. See module-scope doc-
    // block above ISO_TIMESTAMP_RE (tick 318 paragraph) for the full
    // rationale.
    expect(
      typeof body.attributions_summary?.total === "number",
      `attributions_summary.total '${String(body.attributions_summary?.total)}' should be a number (route.ts:114 stamps 'total: attributions.length' which is a non-negative JS array length; a JS regression that stringified the count via .toString() or an undefined-branch reducer refactor would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Number.isInteger(body.attributions_summary?.total),
      `attributions_summary.total '${String(body.attributions_summary?.total)}' should be an integer (route.ts:114 reads Array.length which is a non-negative int32 in [0, 2^32-1]; a floating-point value from an accidental reducer refactor, NaN from divide-by-zero, or Infinity would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      (body.attributions_summary?.total as number) >= 0,
      `attributions_summary.total '${String(body.attributions_summary?.total)}' should be non-negative (route.ts:114 stamps Array.length; a signed-int wraparound or a reducer refactor that stamped a negative counter via off-by-one would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    // Tick 319 — attributions_summary.active int non-negative wire-shape
    // tightening. Three-part guard mirroring the tick 318 total guard
    // shape verbatim: (a) typeof-number preserves the raw-type
    // discipline; (b) Number.isInteger() catches a JS regression that
    // stamped a stringified count, floating-point value, or NaN/Infinity;
    // (c) >= 0 assert catches a signed-int wraparound or a filter
    // refactor that stamped a negative counter. Closes the
    // attributions_summary object cluster out symmetrically — total
    // (tick 318) + active (this tick) + by_source (tick 313) are now
    // all three-part-guarded. See module-scope doc-block above
    // ISO_TIMESTAMP_RE (tick 319 paragraph) for the full rationale.
    expect(
      typeof body.attributions_summary?.active === "number",
      `attributions_summary.active '${String(body.attributions_summary?.active)}' should be a number (route.ts:115 stamps 'active: attributions.filter((a) => a.status === "active").length' which is a non-negative JS array length; a JS regression that stringified the count via .toString() or an undefined-branch reducer refactor would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Number.isInteger(body.attributions_summary?.active),
      `attributions_summary.active '${String(body.attributions_summary?.active)}' should be an integer (route.ts:115 reads Array.filter → Array.length which is a non-negative int32 in [0, 2^32-1]; a floating-point value from an accidental reducer refactor, NaN from divide-by-zero, or Infinity would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      (body.attributions_summary?.active as number) >= 0,
      `attributions_summary.active '${String(body.attributions_summary?.active)}' should be non-negative (route.ts:115 stamps Array.filter → Array.length; a signed-int wraparound or a filter refactor that stamped a negative counter via off-by-one would surface here). attributions_summary: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.attributions_summary?.by_source !== null &&
        typeof body.attributions_summary?.by_source === "object" &&
        !Array.isArray(body.attributions_summary?.by_source),
      `attributions_summary.by_source should be a plain object: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    // Tick 313 — attributions_summary.by_source Record<enum, number>
    // value-set enum tightening. SCOPE ROTATION out of the
    // reseller_commissions_current[] cluster into the aggregate
    // attributions_summary shape. Two-part guard: (a) every KEY must be
    // in ALLOWED_ATTRIBUTION_SOURCES {'code','provisioned','admin_manual'}
    // — catches a schema-side CHECK drop at 0091:123 or a legacy INSERT
    // that stamped a rogue source; (b) every VALUE must be typeof-number
    // + Number.isInteger + >= 0 — catches a JS regression in the
    // route.ts:116-119 reducer that stamped a stringified count, NaN,
    // or a negative counter. Empty by_source `{}` (when the reseller has
    // no attributions rows) trivially satisfies both asserts as a vacuous
    // truth via Object.entries → no iterations. See module-scope doc-block
    // above ISO_TIMESTAMP_RE (tick 313 paragraph) for the rationale.
    for (const [source, count] of Object.entries(
      body.attributions_summary?.by_source ?? {},
    )) {
      expect(
        ALLOWED_ATTRIBUTION_SOURCES.has(source),
        `attributions_summary.by_source key '${source}' should be in the enum {code,provisioned,admin_manual} per ck_reseller_attributions_source CHECK at 0091:123; a DB CHECK drop, a legacy INSERT that stamped a source outside the enumeration ('referral', 'partner'), or a route.ts:116-119 reducer refactor that keyed on a non-source column would surface here. by_source: ${JSON.stringify(body.attributions_summary?.by_source).slice(0, 200)}`,
      ).toBe(true);
      expect(
        typeof count === "number",
        `attributions_summary.by_source['${source}'] value '${String(count)}' should be a number (route.ts:116-119 reducer accumulates integer counts; a JS regression that stamped a stringified count or an undefined branch would surface here). by_source: ${JSON.stringify(body.attributions_summary?.by_source).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(count),
        `attributions_summary.by_source['${source}'] value '${String(count)}' should be an integer (route.ts:116-119 reducer counts by +1 per row; a NaN from divide-by-zero, a floating-point count from a reducer refactor, or Infinity would surface here). by_source: ${JSON.stringify(body.attributions_summary?.by_source).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (count as number) >= 0,
        `attributions_summary.by_source['${source}'] value '${String(count)}' should be non-negative (route.ts:116-119 reducer only accumulates +1 per row; a reducer refactor that stamped a negative counter or a signed-int wraparound would surface here). by_source: ${JSON.stringify(body.attributions_summary?.by_source).slice(0, 200)}`,
      ).toBe(true);
    }

    expect(
      Array.isArray(body.commissions),
      `commissions should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.commissions ?? []) {
      // Tick 308 — commissions[].commission_id UUID wire-shape pin.
      // Column source: view `rc.id AS commission_id` at 0094:135,
      // underlying reseller_commissions.id `uuid PRIMARY KEY DEFAULT
      // gen_random_uuid()` at 0094:34. Two-part guard: (a) typeof-
      // string preserves the raw-type discipline; (b) UUID_RE.test()
      // shape assert catches a projection-side drop, schema-side type
      // flip (bigserial), or PostgREST serialisation regression that
      // returned null|undefined. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 308 paragraph) for the rationale.
      expect(
        typeof row.commission_id === "string",
        `commissions[].commission_id '${String(row.commission_id)}' should be a string (view alias for reseller_commissions.id uuid PRIMARY KEY DEFAULT gen_random_uuid() per 0094:34/135; a schema-side type flip to bigserial, a view-side column drop, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        UUID_RE.test(row.commission_id as string),
        `commissions[].commission_id '${String(row.commission_id)}' should match UUID shape (uuid PRIMARY KEY per 0094:34); a projection-side drop from route.ts:99-105 select that replaced commission_id with a stringified integer id, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 309 — commissions[].stripe_invoice_id text NOT NULL wire-
      // shape pin. Column source: reseller_commissions.stripe_invoice_id
      // `text NOT NULL` at 0094:34, projected verbatim through the
      // reseller_commissions_current view at 0094:139 and selected on
      // the Promise.all leg at web/src/app/api/admin/resellers/[code]/
      // route.ts:99-105. Two-part guard: (a) typeof-string preserves the
      // NOT-NULL raw-type discipline; (b) STRIPE_INVOICE_ID_RE shape
      // assert catches a webhook-processor drift stamping a non-Stripe
      // id, a projection-side drop that swapped columns, a truncated
      // slug, or a PostgREST serialisation regression that returned
      // null|undefined. See module-scope doc-block above
      // STRIPE_INVOICE_ID_RE (tick 309 paragraph) for the rationale.
      expect(
        typeof row.stripe_invoice_id === "string",
        `commissions[].stripe_invoice_id '${String(row.stripe_invoice_id)}' should be a string (text NOT NULL per 0094:34; view alias rc.stripe_invoice_id at 0094:139; a schema-side NOT NULL drop, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        STRIPE_INVOICE_ID_RE.test(row.stripe_invoice_id as string),
        `commissions[].stripe_invoice_id '${String(row.stripe_invoice_id)}' should match Stripe invoice id shape /^in_[A-Za-z0-9]{8,}$/ (write-path invariant: minted by Stripe API and stored verbatim by the webhook processor from invoice.paid events); a webhook-processor drift that stamped a stringified integer, a truncated slug, or a legacy non-in_ prefix would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 311 — commissions[].list_price_aud_cents int NOT NULL positive
      // wire-shape pin. Column source: reseller_commissions.list_price_aud_cents
      // `int NOT NULL CHECK (list_price_aud_cents > 0)` at 0094:37, projected
      // via view alias rc.list_price_aud_cents at 0094:143. Three-part guard:
      // (a) typeof-number preserves the NOT-NULL raw-type discipline; (b)
      // Number.isInteger() catches PostgREST bigint-as-string serialisation,
      // fractional cents from a proration edge, or NaN/Infinity from webhook
      // drift; (c) > 0 assert enforces the DB CHECK invariant. See module-
      // scope doc-block above ISO_TIMESTAMP_RE (tick 311 paragraph) for the
      // full rationale.
      expect(
        typeof row.list_price_aud_cents === "number",
        `commissions[].list_price_aud_cents '${String(row.list_price_aud_cents)}' should be a number (int NOT NULL per 0094:37; view alias rc.list_price_aud_cents at 0094:143; a schema-side NOT NULL drop, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(row.list_price_aud_cents),
        `commissions[].list_price_aud_cents '${String(row.list_price_aud_cents)}' should be an integer (int NOT NULL per 0094:37; a PostgREST serialisation regression that returned a bigint-as-string, a floating-point cents value from a proration edge, or NaN/Infinity from a webhook processor drift would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.list_price_aud_cents as number) > 0,
        `commissions[].list_price_aud_cents '${String(row.list_price_aud_cents)}' should be strictly positive (CHECK (list_price_aud_cents > 0) per 0094:37; a schema-side CHECK constraint drop or a webhook processor drift that stamped 0 or negative cents would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 312 — commissions[].discount_pct int NOT NULL value-set enum
      // pin. Column source: reseller_commissions.discount_pct `int NOT
      // NULL CHECK (discount_pct IN (0,10,20,30,40))` at 0094:38, projected
      // via view alias rc.discount_pct at 0094:144. Two-part guard mirroring
      // the tick 304/305 ALLOWED_ADMIN_ROLES / ALLOWED_ADMIN_STATUSES value-
      // set posture: (a) typeof-number preserves the NOT-NULL raw-type
      // discipline; (b) ALLOWED_TIER_VALUES.has() membership assert reuses
      // the module-scope Set already introduced at row 918 for the
      // resellers-row allowed_tiers[] pin and enforces the {0,10,20,30,40}
      // enumeration. See module-scope doc-block above ISO_TIMESTAMP_RE
      // (tick 312 paragraph) for the full rationale.
      expect(
        typeof row.discount_pct === "number",
        `commissions[].discount_pct '${String(row.discount_pct)}' should be a number (int NOT NULL per 0094:38; view alias rc.discount_pct at 0094:144; a schema-side NOT NULL drop, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ALLOWED_TIER_VALUES.has(row.discount_pct as number),
        `commissions[].discount_pct '${String(row.discount_pct)}' should be one of {0,10,20,30,40} (CHECK (discount_pct IN (0,10,20,30,40)) per 0094:38; a schema-side CHECK constraint drop or a webhook processor drift that stamped a discount_pct outside the STARTUP_TIER_STEPS enumeration would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 314 — commissions[].commission_aud_cents int NOT NULL non-
      // negative wire-shape pin. Column source: reseller_commissions.
      // commission_aud_cents `int NOT NULL CHECK (commission_aud_cents >= 0)`
      // at 0094:41, projected via view alias rc.commission_aud_cents at
      // 0094:147. Three-part guard mirroring the tick 311 list_price_aud_cents
      // posture verbatim but with a >= 0 tail assert rather than > 0 —
      // wholesale rows always stamp commission_aud_cents = 0 per
      // ck_commission_split at 0094:52-60, so > 0 would false-positive.
      // See module-scope doc-block above ISO_TIMESTAMP_RE (tick 314
      // paragraph) for the full rationale.
      expect(
        typeof row.commission_aud_cents === "number",
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be a number (int NOT NULL per 0094:41; view alias rc.commission_aud_cents at 0094:147; a schema-side NOT NULL drop, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(row.commission_aud_cents),
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be an integer (int NOT NULL per 0094:41; a PostgREST serialisation regression that returned a bigint-as-string, a floating-point cents value from a proration edge, or NaN/Infinity from a webhook processor drift would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.commission_aud_cents as number) >= 0,
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be non-negative (CHECK (commission_aud_cents >= 0) per 0094:41; a schema-side CHECK constraint drop or a webhook processor drift that stamped negative cents would surface here — clawback/refund deltas live in reseller_commission_events, the base column is always non-negative). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 315 — commissions[].net_owed_cents int (may be negative)
      // wire-shape pin. Column source: the reseller_commissions_current
      // view computes net_owed_cents at 0094:173-177 as `rc.commission_
      // aud_cents + COALESCE(SUM(delta_aud_cents), 0)` over every non-
      // accrued/non-cleared/non-dispute_opened/non-dispute_won event; the
      // sum MAY be negative when a refund/clawback delta exceeds the base
      // commission. Two-part guard (no sign tail assert): (a) typeof-
      // number preserves the raw-type discipline; (b) Number.isInteger()
      // catches bigint-as-string / fractional cents / NaN / Infinity.
      // See module-scope doc-block above ISO_TIMESTAMP_RE (tick 315
      // paragraph) for the full rationale — the omitted sign assert is
      // intentional because a `>= 0` tail would false-positive on every
      // fully or partially refunded row.
      expect(
        typeof row.net_owed_cents === "number",
        `commissions[].net_owed_cents '${String(row.net_owed_cents)}' should be a number (view-computed int at 0094:173-177; a projection-side drop from route.ts:99-105 select or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here — COALESCE guarantees non-null on the view side). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(row.net_owed_cents),
        `commissions[].net_owed_cents '${String(row.net_owed_cents)}' should be an integer (view-computed int at 0094:173-177 summing int commission_aud_cents + int delta_aud_cents; a PostgREST bigint-as-string serialisation regression, a fractional-cents value from a proration edge, or NaN/Infinity from a reducer refactor would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 316 — commissions[].status text NOT NULL value-set enum pin.
      // Column source: reseller_commissions_current view derives status
      // via CASE at 0094:150-172, returning one of {clawed_back,
      // dispute_open, partially_refunded, cleared, pending_clearance}
      // based on the presence/absence of specific event_type rows in
      // reseller_commission_events. Two-part guard mirroring the tick
      // 304/305 ALLOWED_ADMIN_ROLES / ALLOWED_ADMIN_STATUSES value-set
      // posture: (a) typeof-string preserves the NOT-NULL raw-type
      // discipline; (b) ALLOWED_COMMISSION_STATUSES.has() membership
      // assert against the new module-scope Set const kept adjacent to
      // the ALLOWED_* cluster. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 316 paragraph) for the full rationale.
      expect(
        typeof row.status === "string",
        `commissions[].status '${String(row.status)}' should be a string (view-computed text NOT NULL via CASE at 0094:150-172; a view-definition drift that dropped the ELSE branch leaving the column nullable, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ALLOWED_COMMISSION_STATUSES.has(row.status as string),
        `commissions[].status '${String(row.status)}' should be one of {cleared, pending_clearance, clawed_back, dispute_open, partially_refunded} (CASE at 0094:150-172 in the reseller_commissions_current view; a view-definition drift that introduced a new status literal outside the enumeration or a schema-side edit that added a new event_type without extending the CASE would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 317 — commissions[].created_at timestamptz NOT NULL wire-shape
      // pin. Column source: reseller_commissions.created_at `timestamptz NOT
      // NULL DEFAULT now()` at 0094:44, projected via view alias rc.created_at
      // at 0094:149. Two-part guard mirroring the tick 285 reseller.created_at
      // posture verbatim: (a) typeof-string preserves the NOT-NULL raw-type
      // discipline; (b) ISO_TIMESTAMP_RE.test() shape assert catches a
      // serialisation regression. Also the ORDER BY column for the
      // route.ts:104 .order("created_at", { ascending: false }) sort, so a
      // shape drift here breaks the deterministic row ordering the wave-5
      // row 167 detail payload assumes. See module-scope doc-block above
      // ISO_TIMESTAMP_RE (tick 317 paragraph) for the full rationale.
      expect(
        typeof row.created_at === "string",
        `commissions[].created_at '${String(row.created_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per 0094:44; view alias rc.created_at at 0094:149; a schema-side NOT NULL drop, a projection-side drop from route.ts:99-105 select, or a PostgREST serialisation regression that returned null|undefined would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        ISO_TIMESTAMP_RE.test(row.created_at as string),
        `commissions[].created_at '${String(row.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0094:44 serialised via PostgREST); a drift to a Postgres-native "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a Unix epoch number-as-string, a truncated date-only slug, or a legacy pre-ISO timestamp would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
  });
});
