// GET /api/admin/resellers/[code] input-validation contract — P10 dry-run
// per plan §C.5 (admin surfaces) and §J.2 (Playwright must cover the admin
// surfaces so a regression in the pre-load validators surfaces before the
// endpoint reads the resellers row or the four related-rows Promise.all
// fan-out that follows).
//
// admin-reseller-detail-authz.spec.ts (tick 104) already probes the two
// pre-scope requireAdmin branches (unauthenticated → 401 no_user;
// non_admin → 401 not_admin). This spec closes the two pre-read body-and-
// path validators that fire BEFORE the resellers SELECT + the
// promotion_codes/admins/attributions/commissions Promise.all, both safely
// exercisable against staging without seeding a resellers row (plan §J.2):
//
//   1. code_required — GET with a path segment that normalises to null
//                      (all-punctuation "---") after normaliseResellerCode's
//                      trim/uppercase/[^A-Z0-9] strip           → 400 { ok:false, reason:"code_required" }
//                      (bails at route.ts:55-56 before loadReseller, before
//                      the four related-rows Promise.all runs)
//
//   2. not_found      — GET with a well-formed code path that does not
//                       resolve to a resellers row              → 404 { ok:false, reason:"not_found" }
//                       (loadReseller returns error='not_found' at route.ts
//                       :58-62 before the four related-rows Promise.all runs)
//
// Both branches return BEFORE the four related-rows Promise.all fires (row 1
// short-circuits at code check; row 2 at loadReseller not_found), so the
// spec is safe against staging (no resellers row is read, no promotion_codes
// / admins / attributions / commissions payload leaks, no P1.5 InfoVision
// seed is touched even after H.20 clears).
//
// Twin of admin-reseller-delete-validation.spec.ts (tick 125) — same route
// file, same pre-load validators, same normaliseResellerCode source (URL
// path segment via params.code, not request body). Differs in one dimension
// only — GET is a read (loadReseller + Promise.all fan-out) rather than a
// write (resellers UPDATE status=terminated), but the pre-load validator
// surface is IDENTICAL: code_required + not_found return in the same order,
// with the same envelope, before any DB read fires. The full row set stays
// at two (code_required + not_found).
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin  (admin-reseller-detail-authz)
//   Line 47-56:   normaliseResellerCode(params.code)   → 400 code_required          ← this spec (row 1)
//   Line 58-70:   loadReseller                         → 404 not_found / 503 not_configured / 500 query_failed  ← this spec (row 2)
//   Line 74-97:   promotion_codes + admins + attributions + commissions Promise.all (needs a seeded resellers row + reads real DB — deferred to temp-reseller mint fixture)
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins, attributions_summary, commissions }
//
// Deliberately out of scope (needs a seeded resellers row which plan §J.2
// forbids per-test or would poison every other admin-facing spec in the same
// worker):
//   - Happy path (200) — ACTIVATED wave-5 row 168 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) + loadTempReseller(
//     'active_wholesale') (fetches the QAPROBEWHOLESALEACTIVE seed row).
//     Reads real resellers + reseller_promotion_codes + reseller_admins +
//     reseller_attributions + reseller_commissions_current rows for the
//     variant — pins envelope shape without pinning any array lengths so
//     the row is idempotent under CI replay across fresh + seeded hosts.
//     Twin of row 167 (admin-reseller-detail-authz happy 200) — same
//     endpoint, same fixture wiring, same coverage-vs-duplication call.
//     Kept in this spec so a refactor of the pre-read validators does not
//     accidentally reject well-formed happy calls.
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken resellers SELECT which requires
//     per-test tampering plan §J.2 forbids.
//
// Path-segment probes:
//   Row 1 uses "---" so normaliseResellerCode('---'.trim().toUpperCase()
//   .replace(/[^A-Z0-9]/g, '')) returns "" → null, tripping the code_required
//   guard before any downstream side effect.
//   Row 2 uses PROBE_CODE = "qa-probe-should-not-persist" — a stable
//   lowercase-kebab prefix that will not collide with any real reseller_code
//   (INFOVISION, ACCEL_*, etc.). normaliseResellerCode strips the hyphens
//   and uppercases, yielding "QAPROBESHOULDNOTPERSIST" — a 22-char code that
//   safely does not match any seeded row (P1.5 InfoVision seed remains
//   HUMAN-BLOCKED on H.20 anyway).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  loadAdminHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const PROBE_CODE = "qa-probe-should-not-persist";
const ALL_PUNCT_CODE = "---";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Tick 344 — Stripe invoice ID shape regex. Cross-surface twin of the
// STRIPE_INVOICE_ID_RE const at
// web/tests/e2e/reseller/admin-reseller-detail-authz.spec.ts:2411
// (introduced there on tick 309). Matches the modern Stripe
// `in_<alphanumeric>` prefix pattern used by every invoice minted by the
// Stripe API and stored verbatim by the webhook processor into
// reseller_commissions.stripe_invoice_id (text NOT NULL, 0094:34), projected
// through the reseller_commissions_current view alias rc.stripe_invoice_id
// at 0094:139. Length lower-bound of 8 chars protects against a truncated
// slug regression; alphanumeric-only body matches Stripe's canonical id
// charset (no punctuation, no dashes). Kept broad enough that live-mode
// (in_1XXXXXXXXX) and test-mode (in_1XXXtestXXX) both pass. Introduced on
// this file to power the tick 344 commissions[].stripe_invoice_id two-part
// typeof-string + STRIPE_INVOICE_ID_RE.test() cross-surface twin lift below —
// second column pinned in the reseller_commissions_current[] child-row
// cluster opened at tick 342 (commission_id UUID) + tightened at tick 343
// (list_price_aud_cents strictly-positive int). Executes tick 343 next-pick
// option (a) verbatim: propagate the tick 309 stripe_invoice_id text NOT
// NULL + STRIPE_INVOICE_ID_RE shape pin from the sibling detail-authz spec.
// This is the FIRST new module-scope const added to this file in the
// commissions[] sweep (tick 342 reused UUID_RE, tick 343 needed none).
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
const BILLING_MODELS = new Set(["retail", "wholesale"]);
const STATUSES = new Set(["active", "paused", "terminated"]);
// Tick 339 — allowed tier_pct set for the promotion_codes[] row.tier_pct
// two-part typeof-number + set-membership lift below (executes tick 338
// next-pick option (a) verbatim). Mirrors the module-scope BILLING_MODELS +
// STATUSES precedent above so the set-membership half of a two-part guard
// reads off a single-source-of-truth constant rather than an inline literal.
// Writer-side source: reseller_promotion_codes.tier_pct declared at
// web/supabase/migrations/0091_reseller_module_foundations.sql:90 as
// `tier_pct int NOT NULL CHECK (tier_pct IN (0,10,20,30,40))`. The DB CHECK
// is the sole schema backstop for the tier enum — the P9.4 approve-branch
// normalisation at web/src/lib/reseller/promotion-code-mint.ts uses the
// tier as part of the deterministic coupon id (res_<uuid8>_t<tier>) so a
// slip past the CHECK would also poison the Stripe coupon namespace.
const ALLOWED_TIER_PCTS = new Set<number>([0, 10, 20, 30, 40]);
// Tick 340 — allowed admins[].role + admins[].status Sets for the admins[]
// two-part typeof-string + set-membership lift below (executes tick 339
// next-pick option (a) verbatim: rows 378/379 admins[].role + admins[].status
// bare typeof-string pair). Mirrors the ALLOWED_TIER_PCTS + BILLING_MODELS +
// STATUSES module-scope precedent above so the set-membership half of a two-
// part guard reads off a single-source-of-truth constant rather than an inline
// literal. Distinct constant names (ADMIN_ROLES + ADMIN_STATUSES) from the
// top-level STATUSES const above — reseller_admins.status enum {active,
// revoked} is a DIFFERENT set from resellers.status enum {active, paused,
// terminated} despite both columns being named "status" (a shared name would
// silently pass the wrong set on a copy-paste refactor). Writer-side sources:
//   - reseller_admins.role declared at web/supabase/migrations/0091_reseller_
//     module_foundations.sql:71-72 as `role text NOT NULL DEFAULT 'admin'
//     CHECK (role IN ('owner','admin','viewer'))`. The DB CHECK is the sole
//     schema backstop for the reseller-admin role enum — there is no writer-
//     side validator today (reseller_admins rows are minted server-side by the
//     P9 admin-console + reseller onboarding flows, none of which surface a
//     freeform role field), so a schema-side CHECK DROP or a superuser bypass
//     would surface here on the first offending row.
//   - reseller_admins.status declared at 0091:73-74 as `status text NOT NULL
//     DEFAULT 'active' CHECK (status IN ('active','revoked'))`. Same posture
//     as .role — DB CHECK is the sole schema backstop. The value drives the
//     reseller_admins_user_idx partial-index membership (0091:80-81) which
//     scopedReseller() consumes to authorise reseller-side console reads, so
//     an out-of-band status ('paused', 'terminated', anything else) would
//     also silently drop the row out of that hot index.
const ADMIN_ROLES = new Set<string>(["owner", "admin", "viewer"]);
const ADMIN_STATUSES = new Set<string>(["active", "revoked"]);
// Tick 348 — value set for commissions[].status element membership,
// cross-surface twin of ALLOWED_COMMISSION_STATUSES at
// web/tests/e2e/reseller/admin-reseller-detail-authz.spec.ts:2508
// (introduced there on tick 316). Mirrors the CASE expression at
// web/supabase/migrations/0094_reseller_commissions_and_events.sql:150-172
// in the reseller_commissions_current view, which derives the status from
// the presence/absence of specific event_type rows in
// reseller_commission_events: (a) 'clawed_back' when any refund_full /
// dispute_lost / void event exists; (b) 'dispute_open' when a
// dispute_opened event exists without a matching dispute_won or
// dispute_lost; (c) 'partially_refunded' when a refund_partial event
// exists; (d) 'cleared' when a cleared event exists; (e)
// 'pending_clearance' as the ELSE branch when none of the above match.
// The status is view-computed rather than a stored column, so the CASE
// expression is the sole enforcement layer — a schema-side edit that
// added a new event_type WITHOUT extending the CASE (leaving a
// partially-refunded-then-cleared row falling through to the
// pending_clearance ELSE branch, for example), or a view-definition
// drift that introduced a new status literal outside the enumeration,
// would land straight through PostgREST onto the wire — which this Set
// catches on the first offending row. NARROWER than the resellers-row
// STATUSES Set {active, paused, terminated} at row 127 because
// reseller_commissions.status is a settlement-lifecycle enum (five
// states tracking the commission's clearance journey), not the
// business-lifecycle enum used on the resellers table. Kept adjacent to
// the existing ADMIN_ROLES / ADMIN_STATUSES / ALLOWED_TIER_PCTS /
// BILLING_MODELS / STATUSES cluster so a future value-set tick lands
// next to its siblings without scattering. Introduced on this file to
// power the tick 348 commissions[].status two-part typeof-string +
// ALLOWED_COMMISSION_STATUSES.has() cross-surface twin lift below —
// seventh column pinned in the reseller_commissions_current[] child-row
// cluster on this detail-validation spec (opened tick 342 with
// commission_id UUID; tightened tick 343 with list_price_aud_cents
// strictly-positive int; extended tick 344 with stripe_invoice_id
// STRIPE_INVOICE_ID_RE; extended tick 345 with discount_pct
// ALLOWED_TIER_PCTS set-membership; extended tick 346 with
// commission_aud_cents three-part non-negative int; extended tick 347
// with net_owed_cents two-part typeof-number + Number.isInteger).
// SECOND new module-scope const added to this file in the commissions[]
// sweep (tick 344 introduced STRIPE_INVOICE_ID_RE; ticks 342/343/345/
// 346/347 reused existing consts or needed no const at all).
const ALLOWED_COMMISSION_STATUSES = new Set<string>([
  "cleared",
  "pending_clearance",
  "clawed_back",
  "dispute_open",
  "partially_refunded",
]);
// Tick 349 — ISO 8601 timestamptz wire-shape regex for the
// reseller_commissions_current[].created_at column pin below (eighth and
// final column in the child-row cluster on this detail-validation spec).
// Cross-surface twin of the ISO_TIMESTAMP_RE const at
// web/tests/e2e/reseller/admin-reseller-detail-authz.spec.ts:2401
// (introduced there on tick 285 for resellers.created_at, reused tick 300
// for promotion_codes[].created_at, and reused tick 317 for commissions[].
// created_at). Mirrors that regex verbatim: four-digit year, two-digit
// month + day, `T` delimiter (not a space — PostgREST always emits the
// canonical ISO form with `T`), two-digit hour + minute + second, optional
// fractional-second suffix, and a mandatory timezone tail — either `Z`
// or a `+HH:MM` / `-HH:MM` / `+HHMM` offset (Postgres emits `+00`
// bare-hour for UTC on some hosts and `Z` on others depending on
// SET TIME ZONE, so the colon-and-minutes half is optional to keep the
// regex portable across dev / staging / production PostgREST configs).
// Kept adjacent to the ALLOWED_COMMISSION_STATUSES cluster since both
// consts were introduced to close the commissions[] child-row column
// sweep on this spec, and the regex will also serve any future
// created_at / updated_at / attributed_at ISO-shape pins on sibling
// child-row clusters (attributions_summary detail rows, admins[].
// linked_at when hoisted, etc.) without needing a second declaration.
// THIRD new module-scope const added to this file in the commissions[]
// sweep (tick 344 introduced STRIPE_INVOICE_ID_RE; tick 348 introduced
// ALLOWED_COMMISSION_STATUSES; this tick introduces ISO_TIMESTAMP_RE —
// closing the cluster with all 8 tuple columns pinned).
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
// Tick 342 — opens the reseller_commissions_current[] child-row cluster on
// this detail-validation spec by pinning the commission_id UUID column,
// cross-surface twin of tick 308 on admin-reseller-detail-authz.spec.ts.
// Executes caller-brief option (d) verbatim: at tick 341 the commissions[]
// array on this file was pinned only at the Array.isArray() top level with
// zero per-row shape asserts, while the sibling admin-reseller-detail-authz
// spec has carried a full commissions[] column cluster since tick 308
// (commission_id UUID + stripe_invoice_id + list_price_aud_cents + discount_
// pct + commission_aud_cents + ...). This tick opens the mirror cluster on
// admin-reseller-detail-validation by pinning the FIRST column of the
// projection tuple — commission_id UUID — reusing the existing UUID_RE
// regex above (no new module-scope const needed). Column source:
// reseller_commissions_current view at web/supabase/migrations/0094_reseller_
// commissions_and_events.sql:130-178 exposes `rc.id AS commission_id` where
// the underlying reseller_commissions.id is declared at 0094:34 as `id uuid
// PRIMARY KEY DEFAULT gen_random_uuid()` — so the wire type is UUID NOT NULL.
// Projected via select("commission_id, stripe_invoice_id, list_price_aud_
// cents, discount_pct, commission_aud_cents, net_owed_cents, status, created_
// at") on the Promise.all fan-out at web/src/app/api/admin/resellers/[code]/
// route.ts:98-105. Two-part guard mirroring the tick 308 UUID posture on the
// sibling detail-authz spec + the promotion_codes[].id + admins[].id +
// admins[].user_id UUID pins above on this file:
//   (a) typeof-string half labelled with diagnostic prose preserves the
//       NOT-NULL raw-type discipline — catches a schema-side type flip
//       (uuid → bigserial), a view-side column drop, or a PostgREST
//       serialisation regression that returned null|undefined. Separated
//       from the UUID_RE assert below so a raw-type flip does not hide
//       behind a shape-based diagnostic.
//   (b) UUID_RE.test() shape assert catches a projection-side drop from the
//       SELECT tuple at route.ts:98-105 that replaced commission_id with a
//       stringified integer id, a bigint-serialised-as-string sequence id,
//       or a truncated non-UUID slug. Reuses UUID_RE at row 90-91 (no new
//       module-scope const).
// Detail-surface only per the same posture as tick 308 on the sibling spec —
// the admin-resellers-list route projects only the resellers-row shape (list
// route SELECT at web/src/app/api/admin/resellers/route.ts does not fan out
// to reseller_commissions_current); the Promise.all leg that pulls the
// commissions rows is unique to the detail route. Fires on every green CI
// run only where the seeded reseller has attributed founders with paid
// Stripe invoices in the last 50 rows; on hosts without seeded commission
// events the for-loop is a no-op so the pin never fires. Continues the P10
// hardening posture — no fixture change, no route change, no new imports,
// no new module-scope constants (UUID_RE reused). Opens the commissions[]
// child-row column-pin cluster on this surface; remaining un-tightened
// columns for future ticks are stripe_invoice_id (text NOT NULL — needs
// STRIPE_INVOICE_ID_RE const per tick 309 on sibling), list_price_aud_cents
// (int NOT NULL positive per tick 311), discount_pct (int NOT NULL {0,10,
// 20,30,40} per tick 312 — needs ALLOWED_TIER_VALUES const), commission_aud_
// cents (int NOT NULL >= 0 per tick 314), net_owed_cents (int, may be
// negative on clawback), status (value-set enum {cleared, pending_clearance,
// clawed_back, dispute_open, partially_refunded} per view CASE at 0094:150-
// 172), and created_at (ISO-8601 shape — needs ISO_TIMESTAMP_RE const).

interface ValidationCase {
  label: string;
  code: string;
  expectedStatus: 400 | 404;
  expectedReason: "code_required" | "not_found";
}

const CASES: ValidationCase[] = [
  {
    label:
      "code_required — GET with all-punctuation code segment returns 400 code_required",
    code: ALL_PUNCT_CODE,
    expectedStatus: 400,
    expectedReason: "code_required",
  },
  {
    label:
      "not_found — GET with well-formed code that does not resolve returns 404 not_found",
    code: PROBE_CODE,
    expectedStatus: 404,
    expectedReason: "not_found",
  },
];

test.describe("Admin reseller GET input validation — P10 dry-run", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      await loginAs(page, harness!.admin.email);
      const route = `/api/admin/resellers/${c.code}`;
      const resp = await page.request.get(route);
      expect(
        resp.status(),
        `${c.label} returned ${resp.status()} — expected ${c.expectedStatus} (pre-read validator rejects before loadReseller + related-rows Promise.all). Body: ${await resp.text()}`,
      ).toBe(c.expectedStatus);
      const body = (await resp.json()) as { ok: boolean; reason?: string };
      expect(
        body.ok,
        `${c.label} body.ok should be false: ${JSON.stringify(body)}`,
      ).toBe(false);
      expect(
        body.reason,
        `${c.label} expected reason='${c.expectedReason}' but got '${body.reason}'`,
      ).toBe(c.expectedReason);
    });
  }
});

// P10 wave-5 row 168 happy path — active_wholesale variant + admin harness →
// 200 with detail payload. Per docs/plans/p10-deferred-spec-activation-order.md
// wave 5:
//   168 | admin-reseller-detail-validation.spec.ts | active_wholesale |
//         code_required / not_found / happy | 400 / 404 / 200
//
// The code_required (400) + not_found (404) branches above are harness-free
// (they short-circuit before loadReseller fires). This block closes the
// third row in the same file's contract table — the control 200 that
// proves the two reject branches above genuinely reject on their specific
// validator logic and not on a stale auth or a broken URL contract.
//
// Twin of row 167 (admin-reseller-detail-authz happy 200 tick 168). The
// two happy-path activations pin the same endpoint from two spec files so
// a route refactor that changes the DETAIL envelope surfaces in both on
// the next `npx playwright test` run. Kept in this spec so a future
// tightening of the pre-read validators cannot silently reject well-formed
// admin GETs — the happy row runs in the same file as the reject rows.
//
// Route reference: web/src/app/api/admin/resellers/[code]/route.ts
//   Line 21-32:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin (row 167 authz)
//   Line 47-56:  code normalisation → 400 code_required (row 168 above)
//   Line 58-70:  loadReseller → 404 not_found / 503 / 500 (row 168 above)
//   Line 74-97:  Promise.all — reseller_promotion_codes + reseller_admins +
//                reseller_attributions + reseller_commissions_current
//   Line 113-120: 200 { ok, reseller, promotion_codes, admins,
//                       attributions_summary: {total, active, by_source},
//                       commissions }
//
// Fixture wiring:
//   - loadAdminHarness() resolves qa-admin-1@blockid.au — a real admin
//     session so requireAdmin() returns without throwing.
//   - loadTempReseller('active_wholesale') reads the QAPROBEWHOLESALEACTIVE
//     seed row so fixture.code is the real DB code. adminUserId is NOT
//     needed here because we log in as the ADMIN, not the reseller-admin
//     for the variant — the admin gate is independent of scopedReseller().
//
// Skip conditions:
//   - loadAdminHarness returns null (QA_ADMIN_EMAIL unset or not seeded).
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_
//     KEY unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture: read-only GET — no INSERT / UPDATE / DELETE
// fires from this endpoint. Idempotent under CI replay. No fixture
// cleanup wiring because the fixture only reads existing seed rows.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + reseller shape
// (id UUID, code === fixture.code uppercased, display_name string,
// billing_model ∈ {retail, wholesale}, status ∈ {active, paused,
// terminated}) + Array.isArray on the four related-rows arrays +
// attributions_summary { total: number, active: number, by_source:
// object }. Do NOT pin ANY array length — promotion_codes may hold 0-3
// rows (tiers 20 + 40 seeded for active_wholesale + optional admin
// mints); admins holds ≥1 (per-variant reseller_admins row when the
// multi-admin cohort seeder ran) or 0 otherwise; commissions may be
// empty on fresh CI or ≥1 on hosts where P3 webhook accrual has fired;
// attributions_summary.total varies with whether the attributed-founder
// seed has been planted. Per-row shape pins on promotion_codes + admins
// catch a route regression that dropped a column from the SELECT list
// (route.ts:75-77 lists the exact column set) without depending on
// seed volume.
//
// Non-Stripe / non-GST discipline: reads resellers +
// reseller_promotion_codes + reseller_admins + reseller_attributions +
// reseller_commissions_current only. No Stripe network call, no
// InfoVision dependency, no revenue_events read. P8.5 + P1.5 remain
// neither a dependency nor a consequence.
test.describe("Admin reseller GET input validation — P10 wave-5 row 168 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("active_wholesale — GET with well-formed code as qa-admin-1 returns 200 with detail payload", async ({
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
      `active_wholesale + happy GET returned ${resp.status()} — expected 200 after requireAdmin() passes, normaliseResellerCode accepts the fixture code, and loadReseller resolves the QAPROBEWHOLESALEACTIVE row. A 400 code_required means the fixture code was rejected by normalisation (attribution.ts:25-29). A 404 not_found means the seed row is missing (run seed-qa-reseller.mjs). A 5xx means one of the four Promise.all SELECTs failed (route.ts:74-97). Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      reseller?: {
        id?: unknown;
        code?: unknown;
        display_name?: unknown;
        billing_model?: unknown;
        status?: unknown;
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
        linked_at?: unknown;
        revoked_at?: unknown;
      }>;
      attributions_summary?: {
        total?: unknown;
        active?: unknown;
        by_source?: unknown;
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
    expect(
      typeof body.reseller?.id === "string" &&
        UUID_RE.test(body.reseller!.id as string),
      `reseller.id should be UUID: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      body.reseller?.code,
      `reseller.code should equal fixture.code (uppercase form): ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(fixture.code);
    // Tick 338 — reseller.display_name message-symmetry lift on this
    // detail-validation spec, cross-surface twin of the tick 327 lift on
    // admin-reseller-detail-authz.spec.ts and the tick 336 lift on
    // admin-resellers-list-authz.spec.ts. Executes tick 337 next-pick
    // option (a) verbatim: the last outstanding tick-1710 baseline bare
    // `expect(typeof body.reseller?.display_name).toBe("string")` on this
    // spec was the only projected column on the body.reseller single-row
    // lens still carrying the bare typeof half. Two-part guard: (a)
    // typeof-string labelled with diagnostic prose preserves the NOT-NULL
    // raw-type discipline; (b) String(...).trim().length > 0 shape assert
    // catches an unvalidated INSERT / bypass write path that stamped
    // display_name='' or display_name='   ' straight past the admin-
    // validator.ts:66-70 display_name_blank guard. Writer-side source:
    // resellers.display_name declared at 0091:25 as `display_name text
    // NOT NULL` — DB carries NO CHECK against blank/whitespace-only
    // values so the trim non-blank half is the sole shape backstop.
    expect(
      typeof body.reseller?.display_name,
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a string (text NOT NULL per 0091:25; a schema-side NOT NULL drop, a projection-side drop from route.ts:37-41 select("*"), or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the trim-non-blank check below so a raw-type flip does not hide behind a length-based diagnostic). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe("string");
    expect(
      String(body.reseller?.display_name ?? "").trim().length > 0,
      `reseller.display_name '${String(body.reseller?.display_name)}' should be a non-blank string (admin-validator.ts:66-70 rejects trimmed-empty writes with reason='display_name_blank' but the DB has no CHECK constraint against blank/whitespace-only values — a bypass write path that INSERTed display_name='' or display_name='   ' straight past validateAdminResellerPatch would surface here). Reseller: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      BILLING_MODELS.has(body.reseller?.billing_model as string),
      `reseller.billing_model should be retail|wholesale: ${JSON.stringify(body.reseller).slice(0, 200)}`,
    ).toBe(true);
    expect(
      STATUSES.has(body.reseller?.status as string),
      `reseller.status should be active|paused|terminated: ${JSON.stringify(body.reseller).slice(0, 200)}`,
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
      // Tick 339 — promotion_codes[].tier_pct two-part typeof-number +
      // ALLOWED_TIER_PCTS set-membership lift on this detail-validation
      // spec, mirroring the tick 330 row.billing_model + row.status two-
      // part discipline on the top-level reseller row above. Executes
      // tick 338 next-pick option (a) verbatim: the bare
      // `expect(typeof row.tier_pct).toBe("number")` at the prior row
      // 354 was the first outstanding tick-1710 baseline bare typeof
      // pin on the promotion_codes[] row cluster (the row.code line
      // below already carries the tick 232 twin PROMO_CODE_RE second
      // half). Two-part guard:
      //   (a) typeof-number half labelled with diagnostic prose
      //       preserves the NOT-NULL raw-type discipline — catches a
      //       schema-side type flip (int → text), a projection-side
      //       drop from the reseller_promotion_codes SELECT tuple at
      //       route.ts:86, or a PostgREST serialisation regression
      //       that returned null|undefined. Separated from the set-
      //       membership check below so a raw-type flip does not hide
      //       behind an out-of-band diagnostic.
      //   (b) ALLOWED_TIER_PCTS.has(row.tier_pct as number) shape
      //       assert catches an unvalidated INSERT / bypass write path
      //       that stamped tier_pct outside the {0,10,20,30,40} set —
      //       the DB CHECK at 0091:90 is the sole schema backstop but
      //       a future ALTER CHECK DROP or a superuser bypass would
      //       slip an out-of-band tier straight past both admin-
      //       validator.ts and the P9.4 approve-branch normalisation
      //       (which additionally uses the tier in the deterministic
      //       Stripe coupon id res_<uuid8>_t<tier> per web/src/lib/
      //       reseller/promotion-code-mint.ts — an out-of-band tier
      //       would also poison the Stripe coupon namespace).
      expect(
        typeof row.tier_pct,
        `promotion_codes[].tier_pct '${String(row.tier_pct)}' should be a number (int NOT NULL CHECK (tier_pct IN (0,10,20,30,40)) per 0091:90; a schema-side type flip, a projection-side drop from the SELECT tuple at route.ts:86, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the set-membership check below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        ALLOWED_TIER_PCTS.has(row.tier_pct as number),
        `promotion_codes[].tier_pct '${String(row.tier_pct)}' should be one of {0,10,20,30,40} (0091:90 tier_pct int NOT NULL CHECK (tier_pct IN (0,10,20,30,40)) — DB CHECK is the sole schema backstop; an ALTER CHECK DROP or a superuser INSERT bypassing the constraint would slip an out-of-band tier straight past both admin-validator.ts and the P9.4 approve-branch normalisation, and would additionally poison the deterministic Stripe coupon id res_<uuid8>_t<tier> namespace at web/src/lib/reseller/promotion-code-mint.ts). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 232 twin-symmetrisation with admin-reseller-detail-authz.spec.ts
      // row 335: shape-pin promotion_codes[].code against PROMO_CODE_RE
      // (uppercase alphanumeric per buildPromoCodeName). A route regression
      // that echoed a raw / lowercase / punctuated code (bypassing the P9.4
      // approve-branch normalisation) surfaces here on the first offending
      // row rather than only at visual QA of /admin/resellers/[code].
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
      // Tick 340 — admins[].role two-part typeof-string + ADMIN_ROLES set-
      // membership lift on this detail-validation spec, mirroring the tick 339
      // promotion_codes[].tier_pct two-part discipline on the sibling child-row
      // cluster above. Executes tick 339 next-pick option (a) verbatim: the
      // bare `expect(typeof row.role).toBe("string")` at the prior row 378 was
      // the first outstanding tick-1710 baseline bare typeof pin on the
      // admins[] row cluster (the row.status line below is symmetrised in the
      // same tick since both columns share the reseller_admins schema-CHECK
      // backstop posture). Two-part guard:
      //   (a) typeof-string half labelled with diagnostic prose preserves the
      //       NOT-NULL raw-type discipline — catches a schema-side type flip
      //       (text → int), a projection-side drop from the reseller_admins
      //       SELECT tuple at route.ts:91, or a PostgREST serialisation
      //       regression that returned null|undefined. Separated from the
      //       set-membership check below so a raw-type flip does not hide
      //       behind an out-of-band diagnostic.
      //   (b) ADMIN_ROLES.has(row.role as string) shape assert catches an
      //       unvalidated INSERT / bypass write path that stamped role outside
      //       the {owner, admin, viewer} set — the DB CHECK at 0091:71-72 is
      //       the sole schema backstop (no writer-side validator today).
      expect(
        typeof row.role,
        `admins[].role '${String(row.role)}' should be a string (text NOT NULL per 0091:71-72; a schema-side type flip, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:91, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the set-membership check below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        ADMIN_ROLES.has(row.role as string),
        `admins[].role '${String(row.role)}' should be one of {owner, admin, viewer} (0091:71-72 role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','viewer')) — DB CHECK is the sole schema backstop; an ALTER CHECK DROP or a superuser INSERT bypassing the constraint would slip an out-of-band role straight past the schema and surface on any reseller-side console read that consumes reseller_admins as authorisation input). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 340 — admins[].status twin-symmetrised alongside admins[].role
      // above. Distinct constant (ADMIN_STATUSES = {active, revoked}) from the
      // top-level module-scope STATUSES const (= {active, paused, terminated})
      // because reseller_admins.status is a DIFFERENT enum from
      // resellers.status despite the shared column name — see the
      // ADMIN_STATUSES doc-comment at module scope above for the naming
      // rationale. The reseller_admins_user_idx partial-index (0091:80-81)
      // uses status='active' to drive scopedReseller() authorisation lookups,
      // so an out-of-band status also silently drops the row from that hot
      // index.
      expect(
        typeof row.status,
        `admins[].status '${String(row.status)}' should be a string (text NOT NULL per 0091:73-74; a schema-side type flip, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:91, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the set-membership check below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        ADMIN_STATUSES.has(row.status as string),
        `admins[].status '${String(row.status)}' should be one of {active, revoked} (0091:73-74 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')) — DB CHECK is the sole schema backstop; an ALTER CHECK DROP or a superuser INSERT bypassing the constraint would slip an out-of-band status straight past the schema AND drop the row out of the reseller_admins_user_idx partial index at 0091:80-81 which scopedReseller() consumes for reseller-side console authorisation). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 350 — admins[].linked_at two-part typeof-string +
      // ISO_TIMESTAMP_RE wire-shape pin, FIFTH column pinned in the
      // reseller_admins[] child-row cluster on this detail-validation
      // spec (opened tick 340 with role + status set-membership pair;
      // ticks 321/322-style id + user_id UUID pins already carried at
      // rows 606-612 from earlier row-1710 baseline). Executes tick 349
      // next-pick option "admins[].linked_at when hoisted" verbatim:
      // propagates the tick 306 pin already carried on the sibling
      // admin-reseller-detail-authz.spec.ts (rows 3363-3370) as a
      // cross-surface twin, first ISO-shape pin on the admins[] cluster
      // for this spec. Column source: reseller_admins.linked_at declared
      // at web/supabase/migrations/0091_reseller_module_foundations.sql:75
      // as `linked_at timestamptz NOT NULL DEFAULT now()`, projected via
      // select("id, user_id, role, status, linked_at, revoked_at") on the
      // Promise.all fan-out at web/src/app/api/admin/resellers/[code]/
      // route.ts:89-93. ALSO the ORDER BY column for the route.ts:93
      // `.order("linked_at", { ascending: false })` sort, so a shape
      // drift here would break the deterministic row ordering the
      // fixture implicitly depends on for the admins projection. Two-
      // part guard mirroring the tick 349 commissions[].created_at
      // posture on this spec verbatim + the tick 306 admins[].linked_at
      // posture on the sibling detail-authz spec:
      //   (a) typeof-string half labelled with diagnostic prose
      //       preserves the NOT-NULL raw-type discipline — catches a
      //       schema-side NOT NULL drop, a projection-side drop from
      //       route.ts:89-93, or a PostgREST serialisation regression
      //       that returned null|undefined. Separated from the
      //       ISO_TIMESTAMP_RE.test() assert below so a raw-type flip
      //       does not hide behind a shape-based diagnostic.
      //   (b) ISO_TIMESTAMP_RE.test() shape assert catches a
      //       serialisation regression to a Postgres-native
      //       "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a Unix
      //       epoch number-as-string, a truncated date-only slug, or a
      //       legacy pre-ISO timestamp. Reuses the module-scope
      //       ISO_TIMESTAMP_RE const introduced this file at tick 349
      //       (row 242) — no new const needed. The stamp captures when
      //       a user was linked to a reseller as owner|admin|viewer; a
      //       drift here also silently breaks the reseller_admins_user
      //       _idx (0091:80-81) sort ordering that scopedReseller()
      //       consumes for reseller-side console authorisation, so this
      //       pin doubles as a canary for that hot index. Detail-surface
      //       only — the admin-resellers-list route projects only the
      //       resellers-row shape and does not fan out to
      //       reseller_admins; the Promise.all leg that pulls admins
      //       rows is unique to the detail route. Fires on every green
      //       CI run when the seeded reseller has admin rows; on hosts
      //       without seeded admins the for-loop is a no-op so the pin
      //       never fires — matches the tick 340 posture on this spec
      //       for role + status. Zero new imports; zero new module-
      //       scope constants (ISO_TIMESTAMP_RE reused from tick 349).
      //       Remaining un-tightened column in the admins[] projection
      //       after this tick: revoked_at (nullable ISO-8601 shape —
      //       combines the tick 301 nullable-text posture with the ISO
      //       shape assert; natural next-pick to CLOSE the admins[]
      //       child-row cluster on this spec).
      expect(
        typeof row.linked_at,
        `admins[].linked_at '${String(row.linked_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per web/supabase/migrations/0091_reseller_module_foundations.sql:75 serialised via PostgREST as an ISO 8601 string; a schema-side NOT NULL drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:89-93, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the ISO_TIMESTAMP_RE.test() assert below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        ISO_TIMESTAMP_RE.test(row.linked_at as string),
        `admins[].linked_at '${String(row.linked_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0091:75 serialised via PostgREST); a drift to a Postgres-native "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a Unix epoch number-as-string, a truncated date-only slug, or a legacy pre-ISO timestamp would surface here. Also the ORDER BY column for the route.ts:93 .order("linked_at", { ascending: false }) sort, so a shape drift here breaks the deterministic row ordering the fixture implicitly depends on for the admins projection. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 351 — admins[].revoked_at nullable ISO-8601 timestamptz
      // wire-shape pin, SIXTH and CLOSING column pinned in the
      // reseller_admins[] child-row cluster on this detail-validation
      // spec (opened tick 340 with role + status set-membership pair;
      // ticks 321/322-style id + user_id UUID pins already carried at
      // rows 606-612 from earlier row-1710 baseline; tick 350 lifted
      // linked_at as the fifth column). Executes tick 350 next-pick
      // option (i) verbatim: propagates the tick 307 pin already
      // carried on the sibling admin-reseller-detail-authz.spec.ts
      // (rows 3371-3386) as a cross-surface twin — combines the tick
      // 301 nullable-text posture (null-or-typeof-string) with the
      // tick 300/306/350 ISO shape assert on the non-null branch, so
      // the two-part shape guard fires on both the NULL-for-active-
      // links branch and the ISO-8601-string-for-tombstoned-links
      // branch of the natural resurrection lifecycle. Column source:
      // reseller_admins.revoked_at declared at web/supabase/migrations/
      // 0091_reseller_module_foundations.sql:76 as `revoked_at
      // timestamptz` (nullable, NO NOT NULL clause) projected via
      // select("id, user_id, role, status, linked_at, revoked_at") on
      // the Promise.all fan-out at web/src/app/api/admin/resellers/
      // [code]/route.ts:89-93. Application semantics: NULL for live
      // admin links (status === 'active'), stamped with now() on
      // revoke path (status === 'revoked'). Guard shape:
      //   (a) null-or-typeof-string half labelled with diagnostic
      //       prose preserves the nullable-timestamptz raw-type
      //       discipline — catches a schema-side NOT NULL addition
      //       (which would trip on the still-live active links that
      //       carry NULL), a PostgREST serialisation regression that
      //       returned undefined instead of null, or a projection-
      //       side drop from route.ts:89-93. Separated from the ISO
      //       shape assert below so a raw-type flip does not hide
      //       behind a shape-based diagnostic.
      //   (b) When typeof row.revoked_at === "string" (tombstoned
      //       branch), ISO_TIMESTAMP_RE.test() shape assert catches
      //       a serialisation regression to a Postgres-native
      //       "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a
      //       Unix epoch number-as-string, a truncated date-only
      //       slug, or a legacy pre-ISO timestamp. Reuses the
      //       module-scope ISO_TIMESTAMP_RE const introduced this
      //       file at tick 349 (row 242) — zero new imports, zero
      //       new module-scope constants.
      // Detail-surface only — the admin-resellers-list route projects
      // only the resellers-row shape and does not fan out to
      // reseller_admins; the Promise.all leg that pulls admins rows
      // is unique to the detail route. Seed cohort rows carry
      // revoked_at=NULL by default (status='active'), so the null
      // branch is exercised on every green CI run when the seeded
      // reseller has admin rows; on hosts without seeded admins the
      // for-loop is a no-op so the pin never fires — matches the
      // tick 350 posture for linked_at. CLOSES the admins[] child-
      // row cluster on this spec — every column enumerated in the
      // route.ts:89-93 select tuple (id, user_id, role, status,
      // linked_at, revoked_at) now carries a full wire-shape pin on
      // this detail-validation surface. Note: the tick 326 status ⇔
      // revoked_at cross-column lifecycle invariant on the sibling
      // detail-authz spec is intentionally NOT lifted in this tick —
      // this tick is scoped to the shape twin per tick 350's stated
      // next-pick option (i); the lifecycle-invariant twin is a
      // natural follow-up next-pick option once the shape-pin cluster
      // is fully symmetrised across both detail surfaces.
      expect(
        row.revoked_at === null || typeof row.revoked_at === "string",
        `admins[].revoked_at '${String(row.revoked_at)}' should be null or a string (nullable timestamptz per web/supabase/migrations/0091_reseller_module_foundations.sql:76; NULL for active links, ISO 8601 string for tombstoned links stamped by the app-layer revoke code-path; a schema-side NOT NULL addition, a PostgREST serialisation regression that returned undefined, or a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:89-93 would surface here — separated from the ISO_TIMESTAMP_RE.test() assert below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      if (typeof row.revoked_at === "string") {
        expect(
          ISO_TIMESTAMP_RE.test(row.revoked_at as string),
          `admins[].revoked_at '${String(row.revoked_at)}' should match ISO 8601 shape when non-null (nullable timestamptz per 0091:76 serialised via PostgREST as an ISO 8601 string on the tombstoned branch); a drift to a Postgres-native "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a Unix epoch number-as-string, a truncated date-only slug, or a legacy pre-ISO timestamp would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
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
    // Tick 341 — attributions_summary.total + attributions_summary.active
    // twin-symmetrised two-part typeof-number + Number.isFinite + >= 0 range
    // lift on this detail-validation spec. Executes tick 340 next-pick
    // option (a) verbatim: rows 510/511 were the last two outstanding
    // pre-tick 320+ bare typeof asserts on this file. Both columns share
    // the same computation posture (route.ts:113-115 computes .total =
    // attributions.length and .active = attributions.filter(...).length —
    // both length reads which are always finite non-negative integers) so
    // symmetrising them in one tick avoids a stale asymmetry between
    // adjacent lines of the same summary block. Two-part guard per column:
    //   (a) typeof-number half labelled with diagnostic prose preserves
    //       the raw-type discipline — catches a route-side regression
    //       that stopped calling .length (e.g. returned the raw array or
    //       a null|undefined placeholder), a schema-side type flip that
    //       broke Array.prototype.length semantics via monkey-patch, or a
    //       JSON serialisation regression that stringified the count.
    //       Separated from the range check below so a raw-type flip does
    //       not hide behind an out-of-band range diagnostic.
    //   (b) Number.isFinite + >= 0 range half catches a NaN / Infinity
    //       / negative regression: attributions is `attributionsRes.data
    //       ?? []` at route.ts:110 so .length is always a non-negative
    //       integer, but a future refactor that swapped .length for a
    //       manual counter, a subtraction, or a Number(...) coercion of
    //       a text column could produce NaN / Infinity / negative values
    //       that would silently pass a bare typeof-number pin. Genuine
    //       fault-model rather than a tautological pin — the two-part
    //       guard mirrors the tick 320+ discipline applied verbatim on
    //       ticks 327/330/337/338/339/340 to raw-type columns; here the
    //       second half is a range assert rather than a set-membership
    //       because .total + .active are unbounded non-negative counters
    //       (no small enum of legal values), matching the natural
    //       fault-model for computed numeric aggregates.
    expect(
      typeof body.attributions_summary?.total,
      `attributions_summary.total '${String(body.attributions_summary?.total)}' should be a number (computed as attributions.length at web/src/app/api/admin/resellers/[code]/route.ts:114 where attributions = attributionsRes.data ?? []; a route-side regression that returned the raw array, a null|undefined placeholder, a stringified count, or a Number(...) coercion of a text column would surface here — separated from the range check below so a raw-type flip does not hide behind an out-of-band range diagnostic). Body: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe("number");
    expect(
      Number.isFinite(body.attributions_summary?.total) &&
        (body.attributions_summary?.total as number) >= 0,
      `attributions_summary.total '${String(body.attributions_summary?.total)}' should be a finite non-negative integer (route.ts:114 computes .total = attributions.length which is always a non-negative integer per Array.prototype.length semantics; a future refactor that swapped .length for a manual counter, a subtraction over two length reads, or a Number(...) coercion of a numeric-text column could produce NaN / Infinity / negative values that would silently pass a bare typeof-number pin — the range half catches those regressions on the first offending host). Body: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
    expect(
      typeof body.attributions_summary?.active,
      `attributions_summary.active '${String(body.attributions_summary?.active)}' should be a number (computed as attributions.filter((a) => a.status === "active").length at web/src/app/api/admin/resellers/[code]/route.ts:115 where attributions = attributionsRes.data ?? []; a route-side regression that returned the raw filtered array, a null|undefined placeholder, a stringified count, or a Number(...) coercion of a text column would surface here — separated from the range check below so a raw-type flip does not hide behind an out-of-band range diagnostic). Body: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe("number");
    expect(
      Number.isFinite(body.attributions_summary?.active) &&
        (body.attributions_summary?.active as number) >= 0 &&
        (body.attributions_summary?.active as number) <=
          (body.attributions_summary?.total as number),
      `attributions_summary.active '${String(body.attributions_summary?.active)}' should be a finite non-negative integer bounded above by .total='${String(body.attributions_summary?.total)}' (route.ts:115 computes .active = attributions.filter((a) => a.status === "active").length which is always a non-negative integer AND is definitionally <= attributions.length = .total per Array.prototype.filter semantics; a future refactor that decoupled .active from the same source array — e.g. reading a cached counter row or a separate .from() query — could break the total>=active invariant. The upper-bound half catches that regression on the first offending host in addition to the NaN / Infinity / negative fault-model that the isFinite + >= 0 half covers for .total above). Body: ${JSON.stringify(body.attributions_summary).slice(0, 200)}`,
    ).toBe(true);
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
    for (const row of body.commissions ?? []) {
      // Tick 342 — commissions[].commission_id UUID two-part typeof-string
      // + UUID_RE.test wire-shape pin, first column pinned in the
      // reseller_commissions_current[] child-row cluster on this detail-
      // validation spec (cross-surface twin of tick 308 on admin-reseller-
      // detail-authz.spec.ts). Executes caller-brief option (d) verbatim.
      // See module-scope doc-block above ADMIN_STATUSES (tick 342
      // paragraph) for the full rationale and the writer-side source
      // reference. Two-part guard: (a) typeof-string preserves the raw-
      // type discipline; (b) UUID_RE.test() shape assert catches a
      // projection-side drop from route.ts:98-105 select that replaced
      // commission_id with a stringified integer id, a bigint-serialised-
      // as-string sequence id, or a truncated non-UUID slug.
      expect(
        typeof row.commission_id,
        `commissions[].commission_id '${String(row.commission_id)}' should be a string (view alias for reseller_commissions.id uuid PRIMARY KEY DEFAULT gen_random_uuid() per web/supabase/migrations/0094_reseller_commissions_and_events.sql:34; view alias rc.id AS commission_id at 0094:135; a schema-side type flip to bigserial, a view-side column drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the UUID_RE assert below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        UUID_RE.test(row.commission_id as string),
        `commissions[].commission_id '${String(row.commission_id)}' should match UUID shape (uuid PRIMARY KEY per 0094:34); a projection-side drop from route.ts:98-105 select that replaced commission_id with a stringified integer id, a bigint-serialised-as-string sequence id, or a truncated non-UUID slug would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 344 — commissions[].stripe_invoice_id two-part typeof-string +
      // STRIPE_INVOICE_ID_RE.test() cross-surface twin wire-shape pin, third
      // column pinned in the reseller_commissions_current[] child-row cluster
      // on this detail-validation spec (opened tick 342 with commission_id
      // UUID; tightened tick 343 with list_price_aud_cents strictly-positive
      // int). Executes tick 343 next-pick option (a) verbatim: propagates the
      // tick 309 pin already carried on the sibling admin-reseller-detail-
      // authz.spec.ts:3535-3542. Column source: reseller_commissions.stripe_
      // invoice_id `text NOT NULL` at web/supabase/migrations/0094_reseller_
      // commissions_and_events.sql:34, projected verbatim through the
      // reseller_commissions_current view alias rc.stripe_invoice_id at
      // 0094:139 and selected on the Promise.all leg at
      // web/src/app/api/admin/resellers/[code]/route.ts:98-105. Two-part
      // guard mirroring the tick 309 posture on the sibling spec:
      //   (a) typeof-string half labelled with diagnostic prose preserves
      //       the NOT-NULL raw-type discipline — catches a schema-side NOT
      //       NULL drop, a view-side column drop from 0094:139, a projection-
      //       side drop from the SELECT tuple at route.ts:98-105, or a
      //       PostgREST serialisation regression that returned null|
      //       undefined. Separated from the STRIPE_INVOICE_ID_RE assert
      //       below so a raw-type flip does not hide behind a shape-based
      //       diagnostic.
      //   (b) STRIPE_INVOICE_ID_RE.test() shape assert catches a webhook-
      //       processor drift that stamped a non-Stripe id (e.g. a
      //       stringified integer id from a legacy migration, a truncated
      //       slug from a bad substring capture, or a legacy non-`in_`
      //       prefix from a pre-Stripe billing surface). No DB CHECK on
      //       stripe_invoice_id (0094:34 is text NOT NULL with no format
      //       CHECK) so the write-path invariant lives ONLY on the webhook
      //       processor honouring the canonical Stripe id shape — this
      //       Playwright pin is the first schema-side backstop.
      // Uses the module-scope STRIPE_INVOICE_ID_RE const introduced at row
      // 92-113 above (first new module-scope const on this file in the
      // commissions[] sweep — tick 342 reused UUID_RE, tick 343 needed none).
      expect(
        typeof row.stripe_invoice_id,
        `commissions[].stripe_invoice_id '${String(row.stripe_invoice_id)}' should be a string (text NOT NULL per web/supabase/migrations/0094_reseller_commissions_and_events.sql:34; view alias rc.stripe_invoice_id at 0094:139; a schema-side NOT NULL drop, a view-side column drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the STRIPE_INVOICE_ID_RE assert below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        STRIPE_INVOICE_ID_RE.test(row.stripe_invoice_id as string),
        `commissions[].stripe_invoice_id '${String(row.stripe_invoice_id)}' should match Stripe invoice id shape /^in_[A-Za-z0-9]{8,}$/ (write-path invariant: minted by the Stripe API and stored verbatim by the webhook processor from invoice.paid events; NO DB CHECK on stripe_invoice_id so the invariant lives ONLY on the webhook processor honouring the canonical Stripe id shape). A webhook-processor drift that stamped a stringified integer, a truncated slug, or a legacy non-in_ prefix would surface here. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 343 — commissions[].list_price_aud_cents two-part typeof-number
      // + Number.isFinite + strictly-positive integer wire-shape pin, second
      // column pinned in the reseller_commissions_current[] child-row
      // cluster on this detail-validation spec (opened at tick 342 with
      // commission_id UUID). Executes caller-brief option (a) verbatim.
      // Two-part guard:
      //   (a) typeof-number half labelled with diagnostic prose preserves
      //       the NOT-NULL raw-type discipline — catches a schema-side type
      //       flip (int → text), a view-side column drop from
      //       reseller_commissions_current at 0094:138, a projection-side
      //       drop from route.ts:98-105 select tuple, or a PostgREST
      //       serialisation regression that returned null|undefined /
      //       stringified the cents. Separated from the range check below
      //       so a raw-type flip does not hide behind an out-of-band range
      //       diagnostic.
      //   (b) Number.isFinite + Number.isInteger + strictly-positive
      //       (> 0) range half catches an out-of-band write path that
      //       bypassed the DB CHECK (list_price_aud_cents > 0) — writer-
      //       side source at 0094:37 declares
      //       `list_price_aud_cents int NOT NULL CHECK (list_price_aud_cents > 0)`
      //       so a zero, negative, non-integer float, NaN, or Infinity
      //       would only reach the wire via an ALTER CHECK DROP, a
      //       superuser INSERT bypass, or a route-side Number(...)
      //       coercion that widened an int → float. Note strictly '> 0'
      //       (not '>= 0') per the schema CHECK — the ck_commission_split
      //       invariant at 0094:48-58 divides by list_price so a zero here
      //       would silently break the retail 60/40 split arithmetic on
      //       every downstream consumer of net_owed_cents.
      expect(
        typeof row.list_price_aud_cents,
        `commissions[].list_price_aud_cents '${String(row.list_price_aud_cents)}' should be a number (int NOT NULL CHECK (list_price_aud_cents > 0) per web/supabase/migrations/0094_reseller_commissions_and_events.sql:37; view alias rc.list_price_aud_cents at 0094:138; a schema-side type flip, a view-side column drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined / stringified the cents would surface here — separated from the range check below so a raw-type flip does not hide behind an out-of-band range diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        Number.isFinite(row.list_price_aud_cents) &&
          Number.isInteger(row.list_price_aud_cents) &&
          (row.list_price_aud_cents as number) > 0,
        `commissions[].list_price_aud_cents '${String(row.list_price_aud_cents)}' should be a finite strictly-positive integer (0094:37 CHECK (list_price_aud_cents > 0) — DB CHECK is the sole schema backstop; an ALTER CHECK DROP, a superuser INSERT bypass, or a route-side Number(...) coercion that widened int → float / NaN / Infinity would slip an out-of-band price straight past the schema. Strictly '> 0' not '>= 0' per the schema — the ck_commission_split invariant at 0094:48-58 divides by list_price_aud_cents so a zero here would silently break the retail 60/40 split arithmetic on every downstream consumer of net_owed_cents). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 345 — commissions[].discount_pct two-part typeof-number +
      // ALLOWED_TIER_PCTS set-membership wire-shape pin, fourth column pinned
      // in the reseller_commissions_current[] child-row cluster on this
      // detail-validation spec (opened tick 342 with commission_id UUID;
      // tightened tick 343 with list_price_aud_cents strictly-positive int;
      // extended tick 344 with stripe_invoice_id STRIPE_INVOICE_ID_RE).
      // Executes tick 344 next-pick option (a) verbatim: propagates the
      // commissions[].discount_pct value-set pin from the sibling admin-
      // reseller-detail-authz.spec.ts tick 312 posture. Column source:
      // reseller_commissions.discount_pct declared at web/supabase/migrations/
      // 0094_reseller_commissions_and_events.sql:38 as
      // `discount_pct int NOT NULL CHECK (discount_pct IN (0,10,20,30,40))`,
      // projected verbatim through the reseller_commissions_current view
      // alias rc.discount_pct at 0094:144 and selected on the Promise.all leg
      // at web/src/app/api/admin/resellers/[code]/route.ts:98-105. Two-part
      // guard mirroring the tick 339 ALLOWED_TIER_PCTS posture on
      // promotion_codes[].tier_pct above:
      //   (a) typeof-number half labelled with diagnostic prose preserves
      //       the NOT-NULL raw-type discipline — catches a schema-side type
      //       flip (int → text), a view-side column drop from 0094:144, a
      //       projection-side drop from the SELECT tuple at route.ts:98-105,
      //       or a PostgREST serialisation regression that returned null|
      //       undefined / stringified the pct. Separated from the set-
      //       membership check below so a raw-type flip does not hide behind
      //       an out-of-band diagnostic.
      //   (b) ALLOWED_TIER_PCTS.has(row.discount_pct as number) shape assert
      //       catches an out-of-band write path that bypassed the DB CHECK
      //       (discount_pct IN (0,10,20,30,40)) — an ALTER CHECK DROP, a
      //       superuser INSERT bypass, or a webhook-processor drift that
      //       stamped a non-tier discount_pct (e.g. 15, 25, 50, 100) would
      //       slip an out-of-band pct straight past the schema. Reuses the
      //       module-scope ALLOWED_TIER_PCTS const introduced at tick 339
      //       (row 140) — the {0,10,20,30,40} set is IDENTICAL between
      //       reseller_promotion_codes.tier_pct (0091:90) and
      //       reseller_commissions.discount_pct (0094:38) by design (the
      //       accrual write path copies the resolved tier percentage from
      //       the promo code into the commission row verbatim), so no new
      //       module-scope const is needed (tick 342 precedent: reused
      //       UUID_RE across cluster columns rather than minting per-column
      //       aliases).
      expect(
        typeof row.discount_pct,
        `commissions[].discount_pct '${String(row.discount_pct)}' should be a number (int NOT NULL CHECK (discount_pct IN (0,10,20,30,40)) per web/supabase/migrations/0094_reseller_commissions_and_events.sql:38; view alias rc.discount_pct at 0094:144; a schema-side type flip, a view-side column drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined / stringified the pct would surface here — separated from the set-membership check below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        ALLOWED_TIER_PCTS.has(row.discount_pct as number),
        `commissions[].discount_pct '${String(row.discount_pct)}' should be one of {0,10,20,30,40} (0094:38 discount_pct int NOT NULL CHECK (discount_pct IN (0,10,20,30,40)) — DB CHECK is the sole schema backstop; an ALTER CHECK DROP, a superuser INSERT bypass, or a webhook-processor drift that stamped a non-tier pct (e.g. 15, 25, 50, 100) would slip an out-of-band pct straight past the schema. Reuses ALLOWED_TIER_PCTS at row 140 — the {0,10,20,30,40} set is identical between reseller_promotion_codes.tier_pct at 0091:90 and reseller_commissions.discount_pct at 0094:38 by design because the accrual write path copies the resolved tier percentage from the promo code into the commission row verbatim). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 346 — commissions[].commission_aud_cents three-part typeof-number
      // + Number.isInteger + >= 0 non-negative wire-shape pin, fifth column
      // pinned in the reseller_commissions_current[] child-row cluster on this
      // detail-validation spec (opened tick 342 with commission_id UUID;
      // tightened tick 343 with list_price_aud_cents strictly-positive int;
      // extended tick 344 with stripe_invoice_id STRIPE_INVOICE_ID_RE;
      // extended tick 345 with discount_pct ALLOWED_TIER_PCTS set-membership).
      // Executes tick 345 next-pick option (a) verbatim: propagates the tick 314
      // pin already carried on the sibling admin-reseller-detail-authz.spec.ts
      // (rows 3594-3605). Column source: reseller_commissions.commission_aud_cents
      // declared at web/supabase/migrations/0094_reseller_commissions_and_events.sql:41
      // as `commission_aud_cents int NOT NULL CHECK (commission_aud_cents >= 0)`,
      // projected verbatim through the reseller_commissions_current view alias
      // rc.commission_aud_cents at 0094:147 and selected on the Promise.all leg
      // at web/src/app/api/admin/resellers/[code]/route.ts:98-105.
      //
      // Design choice — THREE-part guard rather than two-part (mirrors the tick
      // 343 list_price_aud_cents posture verbatim but with a `>= 0` tail assert
      // rather than `> 0`): wholesale rows always stamp commission_aud_cents = 0
      // per the ck_commission_split CHECK at 0094:52-60 (wholesale branch
      // requires commission_aud_cents = 0), so a strict `> 0` tail here would
      // false-positive on every wholesale commission row on the seed reseller
      // (QAPROBEWHOLESALEACTIVE is billing_model='wholesale', so all its
      // commissions rows carry commission_aud_cents = 0 by design). Guard parts:
      //   (a) typeof-number half labelled with diagnostic prose preserves the
      //       NOT-NULL raw-type discipline — catches a schema-side NOT NULL
      //       drop, a view-side column drop from 0094:147, a projection-side
      //       drop from the SELECT tuple at route.ts:98-105, or a PostgREST
      //       serialisation regression that returned null|undefined|stringified-
      //       int. Separated from the isInteger + range checks below so a raw-
      //       type flip does not hide behind an out-of-band diagnostic.
      //   (b) Number.isInteger() half catches a bigint-as-string serialisation
      //       regression from PostgREST, a fractional-cents value from a
      //       proration edge, or NaN / Infinity from a webhook processor drift
      //       that widened int → float via Number(...) coercion.
      //   (c) >= 0 range half catches a schema-side CHECK DROP or a webhook
      //       processor drift that stamped negative cents — clawback / refund
      //       events live in reseller_commission_events with negative
      //       delta_aud_cents, but the BASE reseller_commissions.commission_
      //       aud_cents column itself is always non-negative per the 0094:41
      //       CHECK constraint. Note '>= 0' NOT '> 0' per the intentional
      //       wholesale-carveout rationale above — a strict positive tail would
      //       fire on every wholesale commission row.
      // No new module-scope const needed — Number.isInteger is a built-in.
      // Continues the P10 hardening posture on this spec: no fixture change,
      // no route change, no new imports, no new module-scope const (tick 342/345
      // precedent). Bypass-write model: a legacy admin_manual INSERT that
      // stamped commission_aud_cents = -1 to represent an unresolved chargeback,
      // or a webhook accrual that mistakenly wrote a proration-flavoured
      // -0.5 cent value, would slip past both PostgREST NOT NULL serialisation
      // AND the projection guard above but surface here on the first offending
      // row of the QAPROBEWHOLESALEACTIVE seed reseller.
      expect(
        typeof row.commission_aud_cents,
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be a number (int NOT NULL CHECK (commission_aud_cents >= 0) per web/supabase/migrations/0094_reseller_commissions_and_events.sql:41; view alias rc.commission_aud_cents at 0094:147; a schema-side NOT NULL drop, a view-side column drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here — separated from the isInteger + range checks below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        Number.isInteger(row.commission_aud_cents),
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be an integer (int NOT NULL per 0094:41; a PostgREST bigint-as-string serialisation regression, a fractional-cents value from a proration edge, or NaN/Infinity from a webhook processor drift that widened int → float via Number(...) coercion would surface here — separated from the range check below so a shape flip does not hide behind an out-of-band range diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        (row.commission_aud_cents as number) >= 0,
        `commissions[].commission_aud_cents '${String(row.commission_aud_cents)}' should be non-negative (CHECK (commission_aud_cents >= 0) per 0094:41 — DB CHECK is the sole schema backstop; an ALTER CHECK DROP, a superuser INSERT bypass, or a webhook-processor drift that stamped negative cents would slip out-of-band cents straight past the schema. Clawback / refund deltas live in reseller_commission_events with negative delta_aud_cents, but the base reseller_commissions.commission_aud_cents column itself is always non-negative per the 0094:41 CHECK. Note '>= 0' not '> 0' because wholesale rows always stamp commission_aud_cents = 0 per the ck_commission_split CHECK at 0094:52-60 — a strict positive tail would false-positive on every wholesale commission row of the QAPROBEWHOLESALEACTIVE seed reseller). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 347 — commissions[].net_owed_cents two-part typeof-number +
      // Number.isInteger wire-shape pin, sixth column pinned in the
      // reseller_commissions_current[] child-row cluster on this
      // detail-validation spec (opened tick 342 with commission_id UUID;
      // tightened tick 343 with list_price_aud_cents strictly-positive int;
      // extended tick 344 with stripe_invoice_id STRIPE_INVOICE_ID_RE;
      // extended tick 345 with discount_pct ALLOWED_TIER_PCTS set-membership;
      // extended tick 346 with commission_aud_cents three-part non-negative int).
      // Executes tick 346 next-pick option (a) verbatim: propagates the tick 315
      // pin already carried on the sibling admin-reseller-detail-authz.spec.ts
      // (rows 3606-3626). Column source: the reseller_commissions_current view
      // computes net_owed_cents at web/supabase/migrations/0094_reseller_
      // commissions_and_events.sql:173-177 as `rc.commission_aud_cents +
      // COALESCE(SUM(delta_aud_cents), 0)` over every non-accrued/non-cleared/
      // non-dispute_opened/non-dispute_won event, projected verbatim through
      // the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-
      // 105.
      //
      // Design choice — TWO-part guard rather than three-part (mirrors the tick
      // 315 posture on the sibling spec verbatim): NO sign tail assert because
      // net_owed_cents MAY be negative on clawback rows when a refund/clawback
      // delta exceeds the base commission (the whole point of net_owed_cents is
      // to expose a signed running balance so the reseller knows what is owed
      // AFTER refunds have been netted out). A `>= 0` tail here would false-
      // positive on every fully or partially refunded row. Guard parts:
      //   (a) typeof-number half labelled with diagnostic prose preserves the
      //       raw-type discipline — the COALESCE guarantees non-null on the
      //       view side, but a projection-side drop from route.ts:98-105 or a
      //       PostgREST serialisation regression that returned null|undefined|
      //       stringified-int would surface here. Separated from the
      //       isInteger check below so a raw-type flip does not hide behind a
      //       shape-based diagnostic.
      //   (b) Number.isInteger() half catches a bigint-as-string serialisation
      //       regression from PostgREST, a fractional-cents value from a
      //       proration edge, or NaN / Infinity from a reducer refactor that
      //       widened int → float via Number(...) coercion. The view sums
      //       int commission_aud_cents + int delta_aud_cents so the wire type
      //       is a clean integer — any non-integer here indicates upstream
      //       drift.
      // No new module-scope const needed — Number.isInteger is a built-in.
      // Continues the P10 hardening posture on this spec: no fixture change,
      // no route change, no new imports, no new module-scope const (tick 342/
      // 345/346 precedent). Bypass-write model: a webhook-processor drift that
      // widened int → float on the delta_aud_cents INSERT, a reducer refactor
      // that used Number(...) parsing instead of parseInt(...), or a
      // PostgREST bigint overflow when cents > 2^53 would slip past both the
      // view COALESCE and the typeof-number guard above but surface here on
      // the first offending row of the QAPROBEWHOLESALEACTIVE seed reseller.
      expect(
        typeof row.net_owed_cents,
        `commissions[].net_owed_cents '${String(row.net_owed_cents)}' should be a number (view-computed int at web/supabase/migrations/0094_reseller_commissions_and_events.sql:173-177 as rc.commission_aud_cents + COALESCE(SUM(delta_aud_cents), 0); a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105 or a PostgREST serialisation regression that returned null|undefined|stringified-int would surface here — COALESCE guarantees non-null on the view side, separated from the isInteger check below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        Number.isInteger(row.net_owed_cents),
        `commissions[].net_owed_cents '${String(row.net_owed_cents)}' should be an integer (view-computed int at 0094:173-177 summing int commission_aud_cents + int delta_aud_cents; a PostgREST bigint-as-string serialisation regression, a fractional-cents value from a proration edge, or NaN/Infinity from a reducer refactor that widened int → float via Number(...) coercion would surface here. NO sign tail assert per tick 315 rationale on the sibling detail-authz spec — net_owed_cents MAY be negative on clawback rows when a refund/clawback delta exceeds the base commission; a '>= 0' tail would false-positive on every fully or partially refunded row). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 348 — commissions[].status two-part typeof-string +
      // ALLOWED_COMMISSION_STATUSES set-membership wire-shape pin, seventh
      // column pinned in the reseller_commissions_current[] child-row cluster
      // on this detail-validation spec (opened tick 342 with commission_id
      // UUID; tightened tick 343 with list_price_aud_cents strictly-positive
      // int; extended tick 344 with stripe_invoice_id STRIPE_INVOICE_ID_RE;
      // extended tick 345 with discount_pct ALLOWED_TIER_PCTS set-membership;
      // extended tick 346 with commission_aud_cents three-part non-negative
      // int; extended tick 347 with net_owed_cents two-part typeof-number +
      // Number.isInteger). Executes tick 347 next-pick option (a) verbatim:
      // propagates the tick 316 pin already carried on the sibling admin-
      // reseller-detail-authz.spec.ts (rows 3627-3646). Column source: the
      // reseller_commissions_current view derives the status via a CASE
      // expression at web/supabase/migrations/0094_reseller_commissions_and_
      // events.sql:150-172, returning one of {clawed_back, dispute_open,
      // partially_refunded, cleared, pending_clearance} based on the presence
      // / absence of specific event_type rows in reseller_commission_events.
      // The status is VIEW-computed rather than a stored column, so the CASE
      // expression is the sole enforcement layer — a schema-side edit that
      // added a new event_type WITHOUT extending the CASE (leaving a
      // partially-refunded-then-cleared row falling through to the
      // pending_clearance ELSE branch), or a view-definition drift that
      // introduced a new status literal outside the enumeration, would land
      // straight through PostgREST onto the wire. Projected via the SELECT
      // tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105.
      // Two-part guard mirroring the tick 316 posture on the sibling spec
      // verbatim + the ticks 339/340/345 set-membership discipline on the
      // sibling child-row clusters above:
      //   (a) typeof-string half labelled with diagnostic prose preserves the
      //       NOT-NULL raw-type discipline — the CASE expression always
      //       returns a text literal so the wire type is text NOT NULL; a
      //       view-definition drift that dropped the ELSE branch leaving the
      //       column nullable, a projection-side drop from the SELECT tuple
      //       at route.ts:98-105, or a PostgREST serialisation regression
      //       that returned null|undefined would surface here. Separated
      //       from the set-membership check below so a raw-type flip does
      //       not hide behind an out-of-band diagnostic.
      //   (b) ALLOWED_COMMISSION_STATUSES.has(row.status as string) shape
      //       assert catches a view-definition drift that introduced a new
      //       status literal outside the enumeration or a schema-side edit
      //       that added a new event_type without extending the CASE — the
      //       CASE is the sole enforcement layer (no DB CHECK, no writer-
      //       side validator today). Uses the new module-scope
      //       ALLOWED_COMMISSION_STATUSES const introduced above (row 168+),
      //       cross-surface twin of the const at
      //       admin-reseller-detail-authz.spec.ts:2508. NARROWER than the
      //       top-level STATUSES const at row 127 — reseller_commissions.
      //       status is a settlement-lifecycle enum (five states tracking
      //       the commission's clearance journey), not the business-
      //       lifecycle enum used on the resellers table (three states
      //       tracking the counterparty relationship).
      // No fixture change, no route change, no new imports beyond the module-
      // scope const introduced above. Continues the P10 hardening posture on
      // this spec: the two-part pin fires once per commissions[] row when
      // the seeded reseller has attributed founders with paid Stripe
      // invoices in the last 50 rows (route.ts:105 limits the projection to
      // 50). On hosts without seeded commission events the for-loop is a
      // no-op so the pin never fires — matches the tick 342/343/344/345/346/
      // 347 posture on this spec.
      expect(
        typeof row.status,
        `commissions[].status '${String(row.status)}' should be a string (view-computed text NOT NULL via CASE expression at web/supabase/migrations/0094_reseller_commissions_and_events.sql:150-172; the CASE ELSE branch guarantees a non-null text literal on the view side; a view-definition drift that dropped the ELSE branch leaving the column nullable, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the set-membership check below so a raw-type flip does not hide behind an out-of-band diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        ALLOWED_COMMISSION_STATUSES.has(row.status as string),
        `commissions[].status '${String(row.status)}' should be one of {cleared, pending_clearance, clawed_back, dispute_open, partially_refunded} (CASE at 0094:150-172 in the reseller_commissions_current view — the CASE expression is the sole enforcement layer since status is view-computed rather than stored, with no DB CHECK and no writer-side validator; a view-definition drift that introduced a new status literal outside the enumeration or a schema-side edit that added a new event_type without extending the CASE would slip an out-of-band status straight past the schema and surface here on the first offending row). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 349 — commissions[].created_at two-part typeof-string +
      // ISO_TIMESTAMP_RE wire-shape pin, EIGHTH and FINAL column pinned in
      // the reseller_commissions_current[] child-row cluster on this
      // detail-validation spec (opened tick 342 with commission_id UUID;
      // tightened tick 343 with list_price_aud_cents strictly-positive int;
      // extended tick 344 with stripe_invoice_id STRIPE_INVOICE_ID_RE;
      // extended tick 345 with discount_pct ALLOWED_TIER_PCTS set-
      // membership; extended tick 346 with commission_aud_cents three-part
      // non-negative int; extended tick 347 with net_owed_cents two-part
      // typeof-number + Number.isInteger; extended tick 348 with status
      // two-part typeof-string + ALLOWED_COMMISSION_STATUSES set-
      // membership). Executes tick 348 next-pick option (a) verbatim:
      // propagates the tick 317 pin already carried on the sibling admin-
      // reseller-detail-authz.spec.ts (rows 3647-3665). Column source: the
      // underlying reseller_commissions.created_at is declared at
      // web/supabase/migrations/0094_reseller_commissions_and_events.sql:44
      // as `created_at timestamptz NOT NULL DEFAULT now()`, and the
      // reseller_commissions_current view projects it via alias
      // rc.created_at at 0094:149. Wire type is text NOT NULL (timestamptz
      // is serialised as an ISO 8601 string by PostgREST). ALSO the ORDER
      // BY column for the route.ts:104
      // `.order("created_at", { ascending: false })` sort, so a shape drift
      // here would break the deterministic row ordering the fixture
      // implicitly depends on for the 50-row projection cap. Two-part
      // guard mirroring the tick 317 posture on the sibling spec verbatim
      // + the tick 285 resellers.created_at + tick 300 promotion_codes[].
      // created_at ISO shape posture:
      //   (a) typeof-string half labelled with diagnostic prose preserves
      //       the NOT-NULL raw-type discipline — the DEFAULT now() clause
      //       plus the NOT NULL constraint guarantee a non-null text
      //       serialisation on the wire; a schema-side NOT NULL drop, a
      //       projection-side drop from the SELECT tuple at route.ts:98-
      //       105, or a PostgREST serialisation regression that returned
      //       null|undefined would surface here. Separated from the
      //       ISO_TIMESTAMP_RE.test() assert below so a raw-type flip does
      //       not hide behind a shape-based diagnostic.
      //   (b) ISO_TIMESTAMP_RE.test() shape assert catches a serialisation
      //       regression to a Postgres-native "YYYY-MM-DD HH:MM:SS" form
      //       with a space delimiter, a Unix epoch number-as-string, a
      //       truncated date-only slug, or a legacy pre-ISO timestamp.
      //       Uses the new module-scope ISO_TIMESTAMP_RE const introduced
      //       above (row 217+), cross-surface twin of the const at
      //       admin-reseller-detail-authz.spec.ts:2401. Reused on this
      //       spec by any future created_at / updated_at / attributed_at
      //       ISO-shape pins on sibling child-row clusters without
      //       needing a second declaration.
      // No fixture change, no route change, no new imports beyond the
      // module-scope const introduced above. Continues the P10 hardening
      // posture on this spec: the two-part pin fires once per commissions
      // [] row when the seeded reseller has attributed founders with paid
      // Stripe invoices in the last 50 rows (route.ts:105 limits the
      // projection to 50). On hosts without seeded commission events the
      // for-loop is a no-op so the pin never fires — matches the tick
      // 342-348 posture on this spec. CLOSES the commissions[] child-row
      // cluster on this detail-validation surface (all 8 tuple columns
      // pinned: commission_id UUID → stripe_invoice_id → list_price_aud_
      // cents → discount_pct → commission_aud_cents → net_owed_cents →
      // status → created_at) and completes cross-surface twin
      // symmetrisation with the sibling detail-authz spec for the full
      // reseller_commissions_current[] projection.
      expect(
        typeof row.created_at,
        `commissions[].created_at '${String(row.created_at)}' should be a string (timestamptz NOT NULL DEFAULT now() per web/supabase/migrations/0094_reseller_commissions_and_events.sql:44; view alias rc.created_at at 0094:149; PostgREST serialises timestamptz as ISO 8601 text; a schema-side NOT NULL drop, a projection-side drop from the SELECT tuple at web/src/app/api/admin/resellers/[code]/route.ts:98-105, or a PostgREST serialisation regression that returned null|undefined would surface here — separated from the ISO_TIMESTAMP_RE.test() assert below so a raw-type flip does not hide behind a shape-based diagnostic). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        ISO_TIMESTAMP_RE.test(row.created_at as string),
        `commissions[].created_at '${String(row.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0094:44 serialised via PostgREST); a drift to a Postgres-native "YYYY-MM-DD HH:MM:SS" form with a space delimiter, a Unix epoch number-as-string, a truncated date-only slug, or a legacy pre-ISO timestamp would surface here. Also the ORDER BY column for the route.ts:104 .order("created_at", { ascending: false }) sort, so a shape drift here breaks the deterministic row ordering the wave-5 row 167 detail payload assumes. Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
    }
  });
});
