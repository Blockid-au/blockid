// GET /api/admin/resellers pre-read authorization contract —
// P10 dry-run per plan §C.5 (admin surfaces) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads the resellers table).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103),
// admin-requests-patch-authz.spec.ts (tick 105),
// admin-reseller-delete-authz.spec.ts (tick 106), and
// admin-requests-list-authz.spec.ts (tick 107) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see
// route.ts:15-24), same { ok:false, reason: AdminGateError.code }
// envelope pair at HTTP 401 for BOTH the no_user and not_admin branches
// (route.ts:20-22). Symmetric shape means a refactor that collapses the
// two 401 reasons into a single "unauthorised", swaps requireAdmin() for
// a bespoke inline check, or flips the status code to 403 lights up in
// all five specs on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no resellers
// SELECT fires, no write is issued, no admin state changes):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE getSupabaseAdmin or the resellers SELECT)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE getSupabaseAdmin or the
//                          resellers SELECT)
//
// Route reference: web/src/app/api/admin/resellers/route.ts
//   Line 15-24:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 26-29:  getSupabaseAdmin → 503 not_configured
//   Line 31-37:  resellers SELECT (created_at DESC)
//   Line 38-43:  query result → 500 query_failed / 200 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the four sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//   - Happy path (200) — ACTIVATED wave-5 row 164 (tick 160). Opens wave 5
//     via loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin()
//     gate passes without needing the per-variant reseller cohort. Reads
//     real resellers rows — pins { ok:true, resellers: [] } shape + per-row
//     shape (id UUID, code text, display_name text, billing_model enum,
//     status enum). Does NOT pin array length (fresh CI hosts may hold 0
//     resellers rows; hosts where seed-qa-reseller.mjs has fired hold ≥7
//     cohort rows; P1.5 InfoVision seed adds one more when H.20 clears).
//     Read-only — no writes fire so this row is idempotent under CI replay.
//
// The GET handler takes no query params, so both harness-free rows return
// BEFORE any URL parse fires — no path segment or search string is needed
// on either request.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/resellers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tick 283 — created_at ISO-8601 wire-shape pin mirrored from
// admin-requests-list-authz.spec.ts (tick 280) onto the admin-scoped
// /api/admin/resellers GET. Route at route.ts:41-44 projects the row via
// select("*") + .order("created_at", { ascending: false }), so
// resellers.created_at is on the wire as an ISO string on every green
// response. Column declared at 0091:43 as `created_at timestamptz NOT
// NULL DEFAULT now()` — non-null column, so the pin below asserts BOTH
// typeof-string AND ISO_TIMESTAMP_RE.test() rather than the reseller-
// side null-or-typeof-string / null-or-ISO layering used for nullable
// decision_at / decision_reason columns (matches the reseller-side tick
// 275 posture verbatim: NOT-NULL columns → single typeof+regex assert;
// nullable columns → two-part null-or-string / null-or-string+regex).
//
// Symmetric-across-surfaces posture: the same created_at ISO pin now
// fires on the admin resellers-list surface (via this pin) and the
// admin requests-list surface (via tick 280's pin at
// admin-requests-list-authz.spec.ts) so a PostgREST serialisation
// regression or a projection-side column drop lights up on both admin
// list lenses simultaneously. Ninth cross-surface companion pin in the
// tick 275-283 lineage; first pin to leave the admin-requests /
// reseller-requests pair and land on the admin-resellers surface — the
// natural next-pick option (b) from tick 282's review_history entry
// ("rotate to a different admin spec surface — admin-resellers-list-
// authz.spec.ts").
//
// Tick 284 — updated_at ISO-8601 wire-shape pin, natural next-pick
// option (c) from tick 283. resellers.updated_at is a second timestamptz
// NOT NULL DEFAULT now() column declared at 0091:44 immediately after
// created_at on the same table, echoed on the wire via the same route
// select("*") projection (route.ts:41-44), and today has zero pins on
// any Playwright surface — this tick lands the first pin on the column.
// Same regex source-of-truth (ISO_TIMESTAMP_RE hoisted at tick 283
// above), same NOT-NULL discipline (single typeof-string + regex
// assert), same coverage-per-guard posture (wave-5 row 164 admin
// harness iterates every returned resellers row → seeded hosts holding
// ≥7 cohort rows exercise the pin on every green CI run; fresh CI hosts
// with zero rows still green because the pin lives inside the per-row
// for-loop). Fresh-column rotation rather than another surface mirror —
// closes the last-remaining timestamptz column on the resellers row
// with a wire-shape pin so a PostgREST serialisation drift or a
// projection-side column drop on updated_at (whose value equals
// created_at on fresh INSERTs since there is no touch-updated trigger
// on this table today — PATCH callers at /api/admin/resellers/[code]
// are responsible for stamping updated_at=now() on write) surfaces
// at the read layer too.
//
// Tick 286 — commission_share_pct numeric wire-shape pin, natural
// next-pick option (b) from tick 285. resellers.commission_share_pct
// is the last-remaining column on the resellers row with real business-
// invariant backing that has no Playwright pin. Column declared at
// 0091:38 as `commission_share_pct numeric(5,2) NOT NULL DEFAULT
// 40.00` — no DB CHECK, but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:114-118 enforces the
// [0, 100] invariant on every write path (rejects with
// commission_share_pct_out_of_range when out of band), so the wire
// value is bounded by the write-side gate rather than the schema. The
// pin below asserts typeof number + Number.isFinite + within [0, 100]
// — a value-tighten rather than a shape-only pin because the semantic
// invariant (commission is a percentage share) is stricter than the
// raw numeric(5,2) column type. Fresh-column rotation rather than
// another surface mirror — landed on the list surface first (this pin)
// with a companion cross-surface mirror onto admin-reseller-detail-
// authz.spec.ts in the same tick so both admin resellers-family
// surfaces (list + detail) carry the pin from tick 286 onward. A
// PostgREST serialisation regression that flipped numeric onto the
// wire as a string, a schema-side type flip from numeric(5,2) to
// text, an admin-validator drift that stopped rejecting out-of-band
// values, or a projection-side drop from route.ts:41-44 select("*")
// would surface here on the next CI pass whenever any resellers row
// is returned.
//
// Tick 287 — gst_registered bool wire-shape pin, natural next-pick option
// (b) from tick 286. resellers.gst_registered is a non-null boolean column
// echoed via the same route select("*") projection (route.ts:41-44).
// Column declared at 0091:36 as `gst_registered bool NOT NULL DEFAULT
// false` and gated by the wholesale invariant CHECK ck_wholesale_gst_
// required at 0091:47-50 (`billing_model = 'retail' OR (billing_model =
// 'wholesale' AND gst_registered = true AND abn IS NOT NULL)`). NOT-NULL
// discipline → single typeof-boolean assert per row rather than the
// three-part typeof + finite + range guard used for numeric
// commission_share_pct at tick 286; bool has no finite / range
// dimension. Cross-surface pair with the companion pin landed on
// admin-reseller-detail-authz.spec.ts in the same tick so the two admin
// resellers-family GET lenses carry the boolean pin simultaneously,
// matching the tick 286 discipline of bringing both surfaces up to
// parity in one pass. A schema-side type flip from bool to text/int, a
// PostgREST serialisation regression that returned booleans as
// "true"/"false" strings, or a projection-side drop from route.ts:41-44
// select("*") would surface on both admin resellers-family surfaces
// (list + detail) on the same CI pass.
//
// Tick 288 — allowed_tiers int[] wire-shape + value-set pin, natural
// next-pick option (a) from tick 287. resellers.allowed_tiers is the
// last-remaining non-scalar column on the resellers row with no
// Playwright pin — column declared at 0091:30 as `allowed_tiers int[]
// NOT NULL DEFAULT ARRAY[0,10,20,30,40]`. No DB CHECK on element
// membership; the semantic invariant (each element ∈ {0,10,20,30,40})
// is enforced by RESELLER_TIER_VALUES at
// web/src/lib/reseller/admin-validator.ts (validator rejects out-of-set
// writes) and by the STARTUP_TIER_STEPS = [0,10,20,30,40] enum shared
// with the SVI tier taxonomy. Wire-shape is Array.isArray + every-elem
// typeof-number + every-elem ∈ {0,10,20,30,40} — three-part guard so a
// schema-side flip from int[] to text[], a PostgREST serialisation
// regression that returned the array as a string like "{0,10,20,30,40}",
// a validator drift that let an out-of-set write land, or a
// projection-side drop from route.ts:41-44 select("*") each surface at
// a distinct assertion failure mode. Cross-surface pair with the
// companion pin landed on admin-reseller-detail-authz.spec.ts in the
// same tick so the two admin resellers-family GET lenses carry the
// array-shape pin simultaneously, matching the tick 286+287 discipline
// of bringing both surfaces up to parity in one pass. Fresh CI hosts
// with zero rows still green because the pin lives inside the per-row
// for-loop; seeded hosts exercise the default [0,10,20,30,40] branch
// on every green CI run (seed-qa-reseller.mjs uses the default).
//
// Tick 289 — monthly_credit_budget int wire-shape + non-negative +
// integer pin, natural next-pick option (b) from tick 288.
// resellers.monthly_credit_budget is the next-fresh scalar column with
// real business-invariant backing that has no Playwright pin. Column
// declared at 0091:33 as `monthly_credit_budget int NOT NULL DEFAULT 0`
// — no DB CHECK, but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:100-105 rejects any write
// with !Number.isFinite || value < 0 (reason 'budget_negative') and
// Math.floor()s the accepted value so the wire integer is bounded by
// the write-side gate. NOT-NULL discipline + integer invariant →
// four-part guard: typeof-number + Number.isFinite + Number.isInteger
// + value >= 0. A PostgREST serialisation regression that flipped int
// onto the wire as a string, a schema-side type flip from int to
// numeric/text, an admin-validator drift that stopped rejecting
// negative writes, a Math.floor() drop that let a fractional value
// land, or a projection-side drop from route.ts:41-44 select("*")
// would each surface at a distinct assertion failure mode. Cross-
// surface pair with the companion pin landed on admin-reseller-
// detail-authz.spec.ts in the same tick so the two admin resellers-
// family surfaces (list + detail) carry the pin simultaneously,
// matching the tick 286+287+288 discipline of bringing both surfaces
// up to parity in one pass. Fresh CI hosts with zero rows still green
// because the pin lives inside the per-row for-loop; seeded hosts
// exercise the default 0 branch on every green CI run
// (seed-qa-reseller.mjs uses the default).
//
// Tick 290 — monthly_sandbox_credits int wire-shape + non-negative +
// integer pin, natural next-pick option (a) from tick 289.
// resellers.monthly_sandbox_credits is the sibling scalar int column to
// monthly_credit_budget (pinned at tick 289) — same Math.floor()-backed
// integer invariant, same NOT-NULL discipline. Column declared at
// 0091:34 as `monthly_sandbox_credits int NOT NULL DEFAULT 500` — no DB
// CHECK, but the admin PATCH validator at
// web/src/lib/reseller/admin-validator.ts:107-112 rejects any write with
// !Number.isFinite || value < 0 (reason 'sandbox_negative') and
// Math.floor()s the accepted value so the wire integer is bounded by
// the write-side gate. NOT-NULL + integer invariant → four-part guard:
// typeof-number + Number.isFinite + Number.isInteger + value >= 0.
// A PostgREST serialisation regression that flipped int onto the wire
// as a string, a schema-side type flip from int to numeric/text, an
// admin-validator drift that stopped rejecting negative writes, a
// Math.floor() drop that let a fractional value land, or a
// projection-side drop from route.ts:41-44 select("*") would each
// surface at a distinct assertion failure mode. Cross-surface pair with
// the companion pin landed on admin-reseller-detail-authz.spec.ts in
// the same tick so the two admin resellers-family surfaces (list +
// detail) carry the pin simultaneously, matching the tick 286+287+288+
// 289 discipline of bringing both surfaces up to parity in one pass.
// Fresh CI hosts with zero rows still green because the pin lives
// inside the per-row for-loop; seeded hosts exercise the default 500
// branch on every green CI run (seed-qa-reseller.mjs uses the default).
//
// Tick 291 — can_create_startups bool wire-shape pin, cross-surface
// pair with the sibling pin landed on admin-reseller-detail-authz.spec.
// ts in the same tick. resellers.can_create_startups is the sibling
// bool column to gst_registered (pinned at tick 287) — both bool NOT
// NULL invariants with no finite / range dimension so the same single
// typeof-boolean guard shape applies. Column declared at 0091:31 as
// `can_create_startups bool NOT NULL DEFAULT false` — no DB CHECK; the
// column controls whether the reseller UI exposes the "create startup"
// branch per the reseller U.15 module design (write-side application
// gating, no wire-side echo distinct from the bool value itself).
// Projected via route.ts:41-44 select("*"). NOT-NULL discipline →
// single typeof-boolean assert; bool has no finite / range dimension
// so no second guard is layered — matches the tick 287 gst_registered
// posture verbatim rather than the two-part (tick 283/284 ISO), three-
// part (tick 286 numeric range, tick 288 array element-set), or four-
// part (tick 289/290 int + non-negative + integer) guards used for
// scalar columns with a semantic dimension beyond raw type. Cross-
// surface pair with the companion pin landed on admin-reseller-detail-
// authz.spec.ts in the same tick so the two admin resellers-family
// surfaces (list + detail) carry the pin simultaneously, matching the
// tick 286+287+288+289+290 discipline of bringing both surfaces up to
// parity in one pass. Fresh CI hosts with zero rows still green
// because the pin lives inside the per-row for-loop; seeded hosts
// exercise the DEFAULT false branch on every green CI run (seed-qa-
// reseller.mjs uses the default).
//
// Tick 292 — can_grant_credits bool wire-shape pin, natural next-pick
// option (a) from tick 291. resellers.can_grant_credits is the third
// bool NOT NULL column on the resellers row after gst_registered
// (pinned at tick 287) and can_create_startups (pinned at tick 291) —
// same NOT-NULL invariant with no finite / range dimension so the same
// single typeof-boolean guard shape applies. Column declared at
// 0091:32 as `can_grant_credits bool NOT NULL DEFAULT false` — no DB
// CHECK; the column controls whether the reseller UI exposes the
// "grant credits to attributed startup" branch per the reseller U.15
// module design (paired with monthly_credit_budget at 0091:33 — the
// budget cap only matters when this bool is true; write-side
// application gating, no wire-side echo distinct from the bool value
// itself). Projected via route.ts:41-44 select("*"). NOT-NULL
// discipline → single typeof-boolean assert; bool has no finite /
// range dimension so no second guard is layered — matches the tick
// 287 gst_registered + tick 291 can_create_startups posture verbatim
// rather than the two-part (tick 283/284 ISO), three-part (tick 286
// numeric range, tick 288 array element-set), or four-part (tick 289
// /290 int + non-negative + integer) guards used for scalar columns
// with a semantic dimension beyond raw type. Cross-surface pair with
// the companion pin landed on admin-reseller-detail-authz.spec.ts in
// the same tick so the two admin resellers-family surfaces (list +
// detail) carry the pin simultaneously, matching the tick 286+287+288+
// 289+290+291 discipline of bringing both surfaces up to parity in one
// pass. Fresh CI hosts with zero rows still green because the pin
// lives inside the per-row for-loop; seeded hosts exercise the
// DEFAULT false branch on every green CI run (seed-qa-reseller.mjs
// uses the default).
//
// Tick 293 — collateral_approval_required bool wire-shape pin, natural
// next-pick option (a) from tick 292. resellers.collateral_approval_
// required is the fourth bool NOT NULL column on the resellers row
// after gst_registered (pinned at tick 287), can_create_startups
// (pinned at tick 291), and can_grant_credits (pinned at tick 292) —
// same NOT-NULL invariant with no finite / range dimension so the same
// single typeof-boolean guard shape applies. Column declared at
// 0091:35 as `collateral_approval_required bool NOT NULL DEFAULT true`
// — no DB CHECK; the column governs whether reseller-authored
// marketing collateral must clear the D4-CLO-08 admin approval inbox
// before it goes live (write-side application gating tied to the
// requests inbox landed by P9.3 tick 31, no wire-side echo distinct
// from the bool value itself). This is the first bool NOT NULL column
// in the resellers row to carry a DEFAULT true (the prior three
// default false) so the exercised branch on every seed-qa-reseller.mjs
// row is the true branch rather than the false branch — the same
// typeof-boolean guard covers both branches identically because the
// invariant is on the JS type of the wire value, not the boolean
// value itself. Projected via route.ts:41-44 select("*"). NOT-NULL
// discipline → single typeof-boolean assert; bool has no finite /
// range dimension so no second guard is layered — matches the tick
// 287 gst_registered + tick 291 can_create_startups + tick 292
// can_grant_credits posture verbatim rather than the two-part (tick
// 283/284 ISO), three-part (tick 286 numeric range, tick 288 array
// element-set), or four-part (tick 289/290 int + non-negative +
// integer) guards used for scalar columns with a semantic dimension
// beyond raw type. Cross-surface pair with the companion pin landed
// on admin-reseller-detail-authz.spec.ts in the same tick so the two
// admin resellers-family surfaces (list + detail) carry the pin
// simultaneously, matching the tick 286+287+288+289+290+291+292
// discipline of bringing both surfaces up to parity in one pass.
// Fresh CI hosts with zero rows still green because the pin lives
// inside the per-row for-loop; seeded hosts exercise the DEFAULT true
// branch on every green CI run.
//
// Tick 294 — abn text nullable wire-shape pin, rotating off the bool
// cluster (ticks 287/291/292/293) onto the first nullable text column
// on the resellers row. Column declared at 0091:37 as `abn text` with
// no NOT NULL constraint (nullable) and a DB CHECK ck_abn_format at
// 0091:52-54 (`abn IS NULL OR abn ~ '^\d{2} \d{3} \d{3} \d{3}$'`) —
// the spaced ABN format `NN NNN NNN NNN`, mirrored on the application
// write path by ABN_RE at web/src/lib/reseller/admin-validator.ts:52
// (validator rejects patch.abn writes that fail the same regex with
// reason='abn_bad_format'). The column is additionally tied to the
// wholesale invariant CHECK ck_wholesale_gst_required at 0091:47-50
// (`billing_model = 'retail' OR (billing_model = 'wholesale' AND
// gst_registered = true AND abn IS NOT NULL)`) — retail rows may
// legally carry a NULL abn, wholesale rows must carry a non-NULL abn.
// Nullable discipline → two-part guard: (a) null-or-typeof-string
// preserving the tick 275 posture for nullable text columns, (b)
// null-or-(typeof-string AND ABN_RE.test()) tightening onto the DB
// CHECK + validator regex. The two-part shape matches the reseller-
// side tick 276 (null-or-string + null-or-string+ISO) + tick 277
// (null-or-string + null-or-string+length) two-part pattern for
// nullable columns rather than the single-guard NOT-NULL posture
// used at ticks 287/291/292/293 for the bool cluster. Fires ONLY
// when abn is non-null so the wave-5 retail-cohort rows (default
// billing_model=retail per seed-qa-reseller.mjs, abn=NULL by
// default) still pass cleanly on the null branch; wholesale-cohort
// rows (QAPROBEWHOLESALEACTIVE + variants) exercise the
// null-or-string+ABN_RE branch on every green CI run. A schema-side
// type flip from text to non-string, a PostgREST serialisation
// regression that returned NULL as the literal string "null", a DB
// CHECK constraint drop, an admin-validator drift that stopped
// enforcing ABN_RE, or a projection-side drop from route.ts:41-44
// select("*") would each surface at a distinct assertion failure
// mode. Cross-surface pair with the companion pin landed on admin-
// reseller-detail-authz.spec.ts in the same tick so the two admin
// resellers-family surfaces (list + detail) carry the pin
// simultaneously, matching the tick 286-293 discipline of bringing
// both surfaces up to parity in one pass.
//
// Tick 295 — logo_url text nullable wire-shape pin, natural next-pick
// option (a) from tick 294. resellers.logo_url is declared at 0091:26
// as `logo_url text` with no NOT NULL constraint (nullable) and NO DB
// CHECK constraint — free text storing a reseller-branding logo URL
// consumed by the topbar reseller pill at web/src/components/workspace/
// reseller-pill.tsx and the Stripe invoice memo path at
// web/src/app/api/stripe/checkout/route.ts (P5 co-branding). Unlike abn
// (pinned at tick 294) there is NO application write-path regex or
// format-validator guard on this column at web/src/lib/reseller/
// admin-validator.ts — admin-validator.ts:81-90 only rejects the hex
// primary_color column on format, and logo_url passes through unchecked
// aside from the standard NULL/undefined omission. Nullable discipline
// with no format layer → single-guard null-or-typeof-string assert,
// looser than the tick 294 two-part null-or-string + null-or-string+
// ABN_RE guard because there is no format regex to layer as a second
// guard. Matches the single-guard nullable-text posture rather than the
// two-part (tick 276/277/294) or single-guard NOT-NULL bool posture
// (ticks 287/291/292/293). Projected via route.ts:41-44 select("*").
// Fires ONLY when logo_url is non-null so the wave-5 cohort rows (seed-
// qa-reseller.mjs seeds logo_url=NULL by default across all seven
// probe variants) pass cleanly on the null branch on every green CI
// run; a real production reseller row (INFOVISION when P1.5 clears
// H.20) with a populated logo URL would exercise the null-or-string
// branch instead. A schema-side type flip from text to non-string, a
// PostgREST serialisation regression that returned NULL as the literal
// string "null", or a projection-side drop from route.ts:41-44
// select("*") would each surface at a distinct assertion failure
// mode. Cross-surface pair with the companion pin landed on admin-
// reseller-detail-authz.spec.ts in the same tick so the two admin
// resellers-family surfaces (list + detail) carry the pin
// simultaneously, matching the tick 286-294 discipline of bringing
// both surfaces up to parity in one pass.
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

// resellers.code invariant per normaliseResellerCode() at
// web/src/lib/reseller/attribution.ts:29 — trim → toUpperCase() →
// replace(/[^A-Z0-9]/g, "") so every code stored in the resellers table
// is UPPERCASE alphanumeric only (no punctuation, no whitespace, no
// lowercase). Applied at admin-create time (route.ts:86) so every row
// SELECTed here has already passed through the normaliser.
const RESELLER_CODE_RE = /^[A-Z0-9]+$/;
// Tick 294 — AU ABN spaced-format regex. Matches both the DB CHECK
// constraint ck_abn_format at 0091:52-54 (`abn ~ '^\d{2} \d{3} \d{3}
// \d{3}$'`) and the application write-path guard ABN_RE at
// web/src/lib/reseller/admin-validator.ts:52. Only the spaced form
// (NN NNN NNN NNN, e.g. "79 659 615 111") is legal on the wire —
// unspaced (11-digit) or hyphenated forms are rejected on write.
const ABN_RE = /^\d{2} \d{3} \d{3} \d{3}$/;
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);
// Tick 288 — value set for allowed_tiers[] element membership. Matches
// STARTUP_TIER_STEPS = [0,10,20,30,40] enforced by admin-validator.ts on
// write; column source 0091:30 declares the ARRAY[0,10,20,30,40] default
// but has no DB CHECK on element membership so the invariant lives on
// the application write path.
const ALLOWED_TIER_VALUES = new Set([0, 10, 20, 30, 40]);

test.describe("Admin resellers list pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before getSupabaseAdmin or the resellers SELECT. Body: ${await resp.text()}`,
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
      `non_admin returned ${resp.status()} — expected 401 not_admin before getSupabaseAdmin or the resellers SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin resellers list — P10 wave-5 row 164 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("happy — GET as qa-admin-1 returns 200 with resellers array", async ({
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

    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `happy returned ${resp.status()} — expected 200 after requireAdmin() passes. Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok: boolean;
      resellers?: Array<{
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
      }>;
    };
    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.resellers),
      `happy body.resellers should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Do NOT pin body.resellers.length — fresh CI hosts may have zero
    // rows; seeded hosts hold ≥7 cohort rows from seed-qa-reseller.mjs;
    // production hosts hold ≥1 (INFOVISION when P1.5 clears H.20). Per-row
    // shape pins catch a route regression that dropped a column from the
    // SELECT list (route.ts:32-35 currently uses select("*")) or returned
    // a stale envelope shape.
    for (const row of body.resellers ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `reseller.id should be UUID string: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 231 option (j) — VALUE-tighten row.code from typeof string to
      // the normaliseResellerCode() invariant /^[A-Z0-9]+$/ (see hoisted
      // RESELLER_CODE_RE above). Twin-symmetrised in the same tick onto
      // admin-requests-list-authz.spec.ts:312 which echoes the same column
      // via the nested resellers(code, display_name) embed. A route
      // regression that dropped the normaliser at admin-create time
      // (route.ts:86) or a schema-side change that removed the UPPERCASE
      // convention would surface across both admin surfaces simultaneously.
      // display_name has no such invariant (free text per 0091:25) so it
      // stays as typeof string only.
      expect(typeof row.code).toBe("string");
      expect(row.code as string).toMatch(RESELLER_CODE_RE);
      expect(typeof row.display_name).toBe("string");
      expect(
        BILLING_MODELS.has(row.billing_model as string),
        `reseller.billing_model should be retail|wholesale: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        STATUSES.has(row.status as string),
        `reseller.status should be active|paused|terminated: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 283 — created_at ISO wire-shape tightening. See module-scope
      // doc-block above ISO_TIMESTAMP_RE for the rationale. Column source
      // 0091:43 `created_at timestamptz NOT NULL DEFAULT now()` (non-null
      // → single typeof+regex assert rather than the null-or-string /
      // null-or-string+regex two-part guard used for nullable decision_at
      // / decision_reason on the admin-requests-list surface). Mirrors
      // admin-requests-list-authz.spec.ts (tick 280) which pins the same
      // ISO wire-shape on reseller_requests.created_at. A PostgREST
      // serialisation regression, a resellers.created_at type flip from
      // timestamptz to a bigint clock, or a projection-side drop of
      // created_at from route.ts:43 select("*") would surface here.
      expect(typeof row.created_at).toBe("string");
      expect(
        ISO_TIMESTAMP_RE.test(row.created_at as string),
        `reseller.created_at '${String(row.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:43 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 284 — updated_at ISO wire-shape tightening. See module-scope
      // doc-block above ISO_TIMESTAMP_RE (tick 284 paragraph) for the
      // rationale. Column source 0091:44 `updated_at timestamptz NOT
      // NULL DEFAULT now()` — second timestamptz column on the resellers
      // row echoed via the same route select("*") projection (route.ts:
      // 41-44). NOT-NULL discipline → single typeof-string + regex
      // assert, matching the tick 283 created_at posture verbatim
      // rather than the null-or-string / null-or-string+regex layering
      // used for nullable decision_at / decision_reason columns on the
      // admin-requests-list surface. Zero-coverage-per-guard extension
      // beyond created_at: a PostgREST serialisation regression on
      // resellers.updated_at, a projection-side drop of the column
      // from route.ts:43 select("*"), or a PATCH-time drift that
      // stopped stamping updated_at=now() would surface here on the
      // next CI pass whenever any resellers row is returned.
      expect(typeof row.updated_at).toBe("string");
      expect(
        ISO_TIMESTAMP_RE.test(row.updated_at as string),
        `reseller.updated_at '${String(row.updated_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:44 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 286 — commission_share_pct numeric wire-shape + [0, 100]
      // value-tightening. See module-scope doc-block (tick 286 paragraph)
      // for the rationale. Column source 0091:38
      // `commission_share_pct numeric(5,2) NOT NULL DEFAULT 40.00` — no
      // DB CHECK, but the admin PATCH validator at
      // web/src/lib/reseller/admin-validator.ts:114-118 rejects any write
      // outside [0, 100] so the wire value is bounded by the write-side
      // gate. NOT NULL discipline → single typeof-number + finite +
      // range-in-[0,100] assert; nullable columns would layer a
      // null-or-number two-part guard which is not needed here. A
      // PostgREST serialisation regression that returned numeric as a
      // string, a schema-side type flip, an admin-validator drift that
      // stopped rejecting out-of-band writes, or a projection-side drop
      // from route.ts:41-44 select("*") would surface here on the next
      // CI pass whenever any resellers row is returned.
      expect(typeof row.commission_share_pct).toBe("number");
      expect(
        Number.isFinite(row.commission_share_pct as number),
        `reseller.commission_share_pct '${String(row.commission_share_pct)}' should be a finite number (numeric(5,2) NOT NULL DEFAULT 40.00 per 0091:38 serialised via PostgREST); a drift to NaN, Infinity, string, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.commission_share_pct as number) >= 0 &&
          (row.commission_share_pct as number) <= 100,
        `reseller.commission_share_pct '${String(row.commission_share_pct)}' should be within [0, 100] (admin-validator.ts:114-118 rejects out-of-band writes with commission_share_pct_out_of_range); a schema-side drift or a validator-side drop of the [0, 100] guard would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 287 — gst_registered bool wire-shape pin. See module-scope
      // doc-block (tick 287 paragraph) for the rationale. Column source
      // 0091:36 `gst_registered bool NOT NULL DEFAULT false`; wholesale
      // rows are further gated by CHECK ck_wholesale_gst_required at
      // 0091:47-50 so any wholesale row must carry gst_registered=true
      // + abn IS NOT NULL. NOT-NULL discipline → single typeof-boolean
      // assert; bool has no finite / range dimension so no second guard
      // is layered. A schema-side type flip from bool to text/int, a
      // PostgREST serialisation regression that returned booleans as
      // "true"/"false" strings, or a projection-side drop from
      // route.ts:41-44 select("*") would surface here on the next CI
      // pass whenever any resellers row is returned.
      expect(
        typeof row.gst_registered,
        `reseller.gst_registered '${String(row.gst_registered)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:36 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("boolean");
      // Tick 288 — allowed_tiers int[] wire-shape + value-set pin. See
      // module-scope doc-block (tick 288 paragraph) for the rationale.
      // Column source 0091:30 `allowed_tiers int[] NOT NULL DEFAULT
      // ARRAY[0,10,20,30,40]`; element-membership invariant enforced by
      // RESELLER_TIER_VALUES in admin-validator.ts on write (no DB CHECK
      // on element membership). NOT-NULL array → three-part guard:
      // Array.isArray (a PostgREST regression that returned "{0,10,20,
      // 30,40}" text would fail here) + every-elem typeof-number (a
      // schema-side flip from int[] to text[] would surface here) +
      // every-elem ∈ {0,10,20,30,40} (a validator drift that let an
      // out-of-set write land, or a schema-side widening to arbitrary
      // int values, would surface here).
      expect(
        Array.isArray(row.allowed_tiers),
        `reseller.allowed_tiers '${String(row.allowed_tiers)}' should be an array (int[] NOT NULL DEFAULT ARRAY[0,10,20,30,40] per 0091:30 serialised via PostgREST); a drift to a string like "{0,10,20,30,40}", a number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      const tiers = row.allowed_tiers as unknown[];
      expect(
        tiers.every((t) => typeof t === "number" && Number.isFinite(t)),
        `reseller.allowed_tiers every element should be a finite number (int[] per 0091:30); a schema-side flip from int[] to text[] would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        tiers.every((t) => ALLOWED_TIER_VALUES.has(t as number)),
        `reseller.allowed_tiers every element should be ∈ {0,10,20,30,40} (STARTUP_TIER_STEPS enforced by admin-validator.ts on write; no DB CHECK on element membership); an admin-validator drift or a schema-side widening would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 289 — monthly_credit_budget int wire-shape + non-negative +
      // integer pin. See module-scope doc-block (tick 289 paragraph) for
      // the rationale. Column source 0091:33 `monthly_credit_budget int
      // NOT NULL DEFAULT 0`; admin PATCH validator at
      // admin-validator.ts:100-105 rejects !Number.isFinite || value < 0
      // with reason 'budget_negative' and Math.floor()s the accepted
      // value so the wire integer is bounded by the write-side gate.
      // NOT-NULL + integer invariant → four-part guard: typeof-number
      // (a PostgREST regression flipping int onto the wire as a string
      // would fail here) + Number.isFinite (a NaN/Infinity drift would
      // fail here) + Number.isInteger (a Math.floor() drop or a schema
      // widening from int to numeric would fail here) + value >= 0 (a
      // validator drift that stopped rejecting negative writes would
      // fail here).
      expect(
        typeof row.monthly_credit_budget,
        `reseller.monthly_credit_budget '${String(row.monthly_credit_budget)}' should be a number (int NOT NULL DEFAULT 0 per 0091:33 serialised via PostgREST); a drift to a string, boolean, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        Number.isFinite(row.monthly_credit_budget as number),
        `reseller.monthly_credit_budget '${String(row.monthly_credit_budget)}' should be a finite number (int NOT NULL DEFAULT 0 per 0091:33); a drift to NaN or Infinity would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(row.monthly_credit_budget as number),
        `reseller.monthly_credit_budget '${String(row.monthly_credit_budget)}' should be an integer (int per 0091:33; admin-validator.ts:104 Math.floor()s writes); a schema widening from int to numeric or a Math.floor() drop would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.monthly_credit_budget as number) >= 0,
        `reseller.monthly_credit_budget '${String(row.monthly_credit_budget)}' should be >= 0 (admin-validator.ts:100-105 rejects value < 0 with reason 'budget_negative'); a validator drift or a schema-side drop of the non-negative invariant would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 290 — monthly_sandbox_credits int wire-shape + non-negative +
      // integer pin. See module-scope doc-block (tick 290 paragraph) for
      // the rationale. Column source 0091:34 `monthly_sandbox_credits int
      // NOT NULL DEFAULT 500`; admin PATCH validator at
      // admin-validator.ts:107-112 rejects !Number.isFinite || value < 0
      // with reason 'sandbox_negative' and Math.floor()s the accepted
      // value so the wire integer is bounded by the write-side gate.
      // NOT-NULL + integer invariant → four-part guard: typeof-number
      // (a PostgREST regression flipping int onto the wire as a string
      // would fail here) + Number.isFinite (a NaN/Infinity drift would
      // fail here) + Number.isInteger (a Math.floor() drop or a schema
      // widening from int to numeric would fail here) + value >= 0 (a
      // validator drift that stopped rejecting negative writes would
      // fail here).
      expect(
        typeof row.monthly_sandbox_credits,
        `reseller.monthly_sandbox_credits '${String(row.monthly_sandbox_credits)}' should be a number (int NOT NULL DEFAULT 500 per 0091:34 serialised via PostgREST); a drift to a string, boolean, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        Number.isFinite(row.monthly_sandbox_credits as number),
        `reseller.monthly_sandbox_credits '${String(row.monthly_sandbox_credits)}' should be a finite number (int NOT NULL DEFAULT 500 per 0091:34); a drift to NaN or Infinity would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        Number.isInteger(row.monthly_sandbox_credits as number),
        `reseller.monthly_sandbox_credits '${String(row.monthly_sandbox_credits)}' should be an integer (int per 0091:34; admin-validator.ts:111 Math.floor()s writes); a schema widening from int to numeric or a Math.floor() drop would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.monthly_sandbox_credits as number) >= 0,
        `reseller.monthly_sandbox_credits '${String(row.monthly_sandbox_credits)}' should be >= 0 (admin-validator.ts:107-112 rejects value < 0 with reason 'sandbox_negative'); a validator drift or a schema-side drop of the non-negative invariant would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 291 — can_create_startups bool wire-shape pin, cross-
      // surface pair with the sibling pin landed on admin-reseller-
      // detail-authz.spec.ts in the same tick. See module-scope doc-
      // block (tick 291 paragraph) for the rationale. Column source
      // 0091:31 `can_create_startups bool NOT NULL DEFAULT false` — no
      // DB CHECK; sibling bool column to gst_registered (pinned at tick
      // 287) with the same NOT-NULL discipline → single typeof-boolean
      // assert. A schema-side type flip from bool to text/int, a
      // PostgREST serialisation regression that returned booleans as
      // "true"/"false" strings, or a projection-side drop from route.
      // ts:41-44 select("*") would surface here on the next CI pass
      // whenever any resellers row is returned.
      expect(
        typeof row.can_create_startups,
        `reseller.can_create_startups '${String(row.can_create_startups)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:31 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("boolean");
      // Tick 292 — can_grant_credits bool wire-shape pin, cross-
      // surface pair with the sibling pin landed on admin-reseller-
      // detail-authz.spec.ts in the same tick. See module-scope doc-
      // block (tick 292 paragraph) for the rationale. Column source
      // 0091:32 `can_grant_credits bool NOT NULL DEFAULT false` — no
      // DB CHECK; sibling bool column to gst_registered (pinned at
      // tick 287) and can_create_startups (pinned at tick 291) with
      // the same NOT-NULL discipline → single typeof-boolean assert.
      // A schema-side type flip from bool to text/int, a PostgREST
      // serialisation regression that returned booleans as
      // "true"/"false" strings, or a projection-side drop from route.
      // ts:41-44 select("*") would surface here on the next CI pass
      // whenever any resellers row is returned.
      expect(
        typeof row.can_grant_credits,
        `reseller.can_grant_credits '${String(row.can_grant_credits)}' should be a boolean (bool NOT NULL DEFAULT false per 0091:32 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("boolean");
      // Tick 293 — collateral_approval_required bool wire-shape pin,
      // cross-surface pair with the sibling pin landed on admin-
      // reseller-detail-authz.spec.ts in the same tick. See module-
      // scope doc-block (tick 293 paragraph) for the rationale. Column
      // source 0091:35 `collateral_approval_required bool NOT NULL
      // DEFAULT true` — first bool NOT NULL column in the resellers
      // row to carry a DEFAULT true (the prior three default false),
      // so seeded hosts exercise the true branch by default; the same
      // typeof-boolean guard covers both branches identically because
      // the invariant is on the JS type of the wire value, not the
      // boolean value itself. A schema-side type flip from bool to
      // text/int, a PostgREST serialisation regression that returned
      // booleans as "true"/"false" strings, or a projection-side drop
      // from route.ts:41-44 select("*") would surface here on the next
      // CI pass whenever any resellers row is returned.
      expect(
        typeof row.collateral_approval_required,
        `reseller.collateral_approval_required '${String(row.collateral_approval_required)}' should be a boolean (bool NOT NULL DEFAULT true per 0091:35 serialised via PostgREST); a drift to a string, number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("boolean");
      // Tick 294 — abn text nullable wire-shape pin, cross-surface
      // pair with the sibling pin landed on admin-reseller-detail-
      // authz.spec.ts in the same tick. See module-scope doc-block
      // (tick 294 paragraph) for the rationale. Column source 0091:37
      // `abn text` (nullable) with DB CHECK ck_abn_format at
      // 0091:52-54 (`abn IS NULL OR abn ~ '^\d{2} \d{3} \d{3} \d{3}$'`)
      // and application write-path guard ABN_RE at admin-validator.ts:
      // 52. Two-part guard: (a) null-or-typeof-string preserving the
      // tick 275 posture for nullable text, (b) null-or-(typeof-string
      // AND ABN_RE.test()) tightening onto the DB CHECK + validator
      // regex. Retail cohort rows (default seed) exercise the null
      // branch; wholesale cohort rows exercise the null-or-string+ABN_RE
      // branch on every green CI run.
      expect(
        row.abn === null || typeof row.abn === "string",
        `reseller.abn '${String(row.abn)}' should be null or a string (nullable text per 0091:37; NULL on retail rows without an ABN populated, string on wholesale rows per ck_wholesale_gst_required at 0091:47-50). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        row.abn === null ||
          (typeof row.abn === "string" && ABN_RE.test(row.abn as string)),
        `reseller.abn '${String(row.abn)}' should be null or an AU ABN string in the spaced format 'NN NNN NNN NNN' (DB CHECK ck_abn_format at 0091:52-54 + admin-validator.ts:52 ABN_RE); a drift to an unspaced 11-digit string, a hyphenated form, or any other shape would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 295 — logo_url text nullable wire-shape pin, cross-surface
      // pair with the sibling pin landed on admin-reseller-detail-authz.
      // spec.ts in the same tick. See module-scope doc-block (tick 295
      // paragraph) for the rationale. Column source 0091:26 `logo_url
      // text` (nullable) with NO DB CHECK and NO application write-path
      // format guard (admin-validator.ts:81-90 only regexes primary_color,
      // not logo_url). Nullable discipline with no format layer →
      // single-guard null-or-typeof-string assert, looser than the tick
      // 294 two-part guard because there is no format regex to layer on
      // top. Seed cohort rows carry logo_url=NULL by default so the null
      // branch is exercised on every green CI run; a populated production
      // reseller row (INFOVISION when P1.5 clears H.20) would exercise
      // the null-or-string branch.
      expect(
        row.logo_url === null || typeof row.logo_url === "string",
        `reseller.logo_url '${String(row.logo_url)}' should be null or a string (nullable text per 0091:26; NULL when no logo URL is populated, string when a reseller has uploaded/registered a branded logo URL — no DB CHECK, no admin-validator format guard). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
  });
});
