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
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
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
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);
// Tick 288 — value set for allowed_tiers[] element membership. Matches
// STARTUP_TIER_STEPS = [0,10,20,30,40] enforced by admin-validator.ts on
// write; column source 0091:30 declares the ARRAY[0,10,20,30,40] default
// but has no DB CHECK on element membership so the invariant lives on
// the application write path.
const ALLOWED_TIER_VALUES = new Set([0, 10, 20, 30, 40]);

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
      };
      promotion_codes?: Array<{
        id?: unknown;
        tier_pct?: unknown;
        code?: unknown;
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
        by_source?: unknown;
      };
      commissions?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Reseller row shape — reads resellers.* (route.ts:37-41).
    expect(body.reseller, "body.reseller should be present").toBeTruthy();
    expect(
      typeof body.reseller?.id === "string" &&
        UUID_RE.test(body.reseller!.id as string),
      `reseller.id should be UUID: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.code,
      `reseller.code should equal fixture.code (uppercase form): ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(fixture.code);
    expect(typeof body.reseller?.display_name).toBe("string");
    expect(
      BILLING_MODELS.has(body.reseller?.billing_model as string),
      `reseller.billing_model should be retail|wholesale: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      STATUSES.has(body.reseller?.status as string),
      `reseller.status should be active|paused|terminated: ${JSON.stringify(body.reseller).slice(0, 200)}`,
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
    expect(typeof body.reseller?.created_at).toBe("string");
    expect(
      ISO_TIMESTAMP_RE.test(body.reseller?.created_at as string),
      `reseller.created_at '${String(body.reseller?.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:43 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(typeof body.reseller?.updated_at).toBe("string");
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
    expect(typeof body.reseller?.commission_share_pct).toBe("number");
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

    // Related-rows arrays — do NOT pin length; each row-shape pin catches
    // a SELECT-column drift on the route-side Promise.all (route.ts:74-97).
    expect(
      Array.isArray(body.promotion_codes),
      `promotion_codes should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.promotion_codes ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `promotion_codes[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.tier_pct).toBe("number");
      // Tick 232 twin-symmetrisation with admin-reseller-detail-validation.
      // spec.ts row 320: shape-pin promotion_codes[].code against
      // PROMO_CODE_RE (uppercase alphanumeric per buildPromoCodeName). A
      // route regression that echoed a raw / lowercase / punctuated code
      // (bypassing the P9.4 approve-branch normalisation) surfaces here on
      // the first offending row rather than only at visual QA of
      // /admin/resellers/[code].
      expect(typeof row.code).toBe("string");
      expect(row.code as string).toMatch(PROMO_CODE_RE);
    }

    expect(
      Array.isArray(body.admins),
      `admins should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    for (const row of body.admins ?? []) {
      expect(
        typeof row.id === "string" && UUID_RE.test(row.id as string),
        `admins[].id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        typeof row.user_id === "string" && UUID_RE.test(row.user_id as string),
        `admins[].user_id should be UUID: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof row.role).toBe("string");
      expect(typeof row.status).toBe("string");
    }

    // Attributions summary — pins the {total, active, by_source} shape
    // computed by route.ts:104-111. Sub-map by_source is an object with
    // numeric counts; not pinning its keys because sources vary.
    expect(
      body.attributions_summary,
      `attributions_summary should be present: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBeTruthy();
    expect(typeof body.attributions_summary?.total).toBe("number");
    expect(typeof body.attributions_summary?.active).toBe("number");
    expect(
      body.attributions_summary?.by_source !== null &&
        typeof body.attributions_summary?.by_source === "object" &&
        !Array.isArray(body.attributions_summary?.by_source),
      `attributions_summary.by_source should be a plain object: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);

    expect(
      Array.isArray(body.commissions),
      `commissions should be an array: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
