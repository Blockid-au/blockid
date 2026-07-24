// GET /api/admin/resellers/requests pre-read authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright
// must cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads reseller_requests).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103),
// admin-requests-patch-authz.spec.ts (tick 105), and
// admin-reseller-delete-authz.spec.ts (tick 106) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see route.ts:20-29),
// same { ok:false, reason: AdminGateError.code } envelope pair at HTTP 401
// for BOTH the no_user and not_admin branches (route.ts:25-27). Symmetric
// shape means a refactor that collapses the two 401 reasons into a single
// "unauthorised", swaps requireAdmin() for a bespoke inline check, or
// flips the status code to 403 lights up in all four specs on the next
// `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no
// reseller_requests SELECT fires, no write is issued, no admin state
// changes):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE getSupabaseAdmin, ?status=/?request_type=
//                          parse, or the reseller_requests SELECT)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE getSupabaseAdmin, query
//                          param parse, or the reseller_requests SELECT)
//
// Route reference: web/src/app/api/admin/resellers/requests/route.ts
//   Line 20-29:  gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 31-34:  getSupabaseAdmin → 503 not_configured
//   Line 36-52:  URL parse + reseller_requests SELECT
//   Line 54-62:  query result → 500 query_failed / 200 ok
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the three sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec in the same worker.
//   - query_failed (500) — needs a broken reseller_requests SELECT which
//     requires per-test tampering plan §J.2 forbids.
//   - Happy path (200) — ACTIVATED wave-5 row 174 (tick 162). Opens via
//     loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin() gate
//     at route.ts:20-29 passes. Read-only GET — no writes fire, so this row
//     is idempotent under CI replay. Consumes the seeded pending
//     over_budget_approval row that wave-3 row 155 inserts against the
//     active_wholesale variant, but does NOT require it — the envelope
//     assertion loops over every returned row and asserts shape only, so
//     fresh CI hosts with zero pending rows still green (empty-array is a
//     valid Array.isArray). Non-Stripe / non-GST — the admin GET reads
//     reseller_requests + joins resellers only; no promotion_code lookup,
//     no credit ledger write, no revenue_events read, no Stripe network
//     call, no InfoVision dependency.
//
// Route uses default status filter "pending" when ?status= is omitted, and
// omits the ?request_type= filter when absent — both harness-free rows
// return BEFORE those params are parsed (row 1 bails in gate() →
// getCurrentUser; row 2 bails in gate() → requireAdmin), so no query
// params are needed on either request. The wave-5 row 174 happy path
// likewise omits both params so the default status="pending" applies and
// the returned envelope covers row 155's seeded over_budget_approval row.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/resellers/requests";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// resellers.code invariant per normaliseResellerCode() at
// web/src/lib/reseller/attribution.ts:29 — trim → toUpperCase() →
// replace(/[^A-Z0-9]/g, "") so every code stored in the resellers table
// is UPPERCASE alphanumeric only. Applied at admin-create time
// (web/src/app/api/admin/resellers/route.ts:86). Twin-symmetrised in the
// same tick onto admin-resellers-list-authz.spec.ts:176 which echoes the
// same column directly.
const RESELLER_CODE_RE = /^[A-Z0-9]+$/;

const REQUEST_TYPES = new Set([
  "code_request",
  "over_budget_approval",
  "collateral_approval",
]);

const REQUEST_STATUSES = new Set([
  "pending",
  "approved",
  "denied",
  "cancelled",
]);

// Tick 259 — per-key payload content invariants mirrored from
// web/src/lib/reseller/requests.ts so the discriminated-union pin below
// echoes the same source-of-truth shapes the validator writes:
//   - ALLOWED_TIER_PCT_VALUES ← ALLOWED_TIER_VALUES at requests.ts:63
//   - SUFFIX_RE               ← SUFFIX_RE at requests.ts:64
//   - HTTPS_URL_RE            ← HTTPS_URL_RE at requests.ts:65
//   - REASON_MAX              ← REASON_MAX at requests.ts:66
//   - PURPOSE_MAX             ← PURPOSE_MAX at requests.ts:67
// Kept as module-scope constants for parity with the RESELLER_CODE_RE
// hoist landed at tick 231 (whenever a validator-side invariant exists,
// the spec echoes it verbatim rather than re-deriving inline).
const ALLOWED_TIER_PCT_VALUES = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;
const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9.-]+(\/.*)?$/;
const REASON_MAX = 200;
const PURPOSE_MAX = 500;

// Tick 280 — created_at ISO-8601 wire-shape pin mirrored back from the
// reseller-side tick 275 pin at reseller-requests-list-authz.spec.ts:188-189
// onto the admin-scoped GET at /api/admin/resellers/requests/route.ts:44
// (created_at is the eighth column of the admin SELECT projection).
// reseller_requests.created_at is a `timestamptz NOT NULL DEFAULT now()`
// column per 0095:39, serialised by PostgREST to an ISO-8601 string on the
// wire regardless of row status. Pre-tick-280 posture pinned only
// typeof-string on created_at at line ~303, leaving the ISO shape silent
// on the admin surface — a route regression that projected created_at from
// a different column (say `updated_at bigint` in a downstream migration)
// would still greenlight the typeof-string guard. Post-tick the admin
// surface carries the same ISO regex tightening as the reseller-scoped
// list (see the tick 275 module-scope doc-block at
// reseller-requests-list-authz.spec.ts:164-187 for the invariant
// derivation).
//
// Two-part guard (matches ticks 265-279 layering discipline verbatim):
//   (a) preserved typeof-string pin at line ~303 fires first so a
//       projection drop surfaces before the new regex check;
//   (b) new ISO_TIMESTAMP_RE match fires only after the typeof-string
//       guard passes — a column type flip from timestamptz to bigint
//       created_at_ms or a serialisation drift to a locale-formatted
//       date string would surface here.
//
// Regex sourced from reseller-requests-list-authz.spec.ts:189 verbatim
// (same source-of-truth invariant); accepts fractional seconds and either
// the trailing Z or a ±HH:MM offset, matching Postgres timestamptz
// serialisation shape.
//
// Sibling-surface parity: sixth cross-surface companion pin in the
// ticks 275-280 lineage — a projection-side or serialisation-side
// regression on reseller_requests.created_at now surfaces on both admin
// and reseller list lenses simultaneously.
//
// Tick 281 — decision_at ISO-8601 wire-shape tightening on the admin-scoped
// GET at /api/admin/resellers/requests/route.ts:44 (decision_at is the seventh
// column of the admin SELECT projection: id, reseller_id, request_type,
// status, payload, decision_by, decision_at, ...). Natural next pick option
// (a) from tick 280 — sibling companion to the tick-280 created_at ISO pin
// above, and admin-surface mirror of the reseller-side tick 276 pin at
// reseller-requests-list-authz.spec.ts:629-634. reseller_requests.decision_at
// is a `timestamptz` NULLABLE column per 0095:35 governed by the
// ck_decision_shape CHECK at 0095:41-45 which requires decision_at NON-NULL
// when status ∈ ('approved','denied','cancelled') and permits NULL only when
// status='pending'. Pre-tick-281 posture pinned only null-or-typeof-string at
// line ~362-364 leaving the ISO shape silent whenever decision_at is
// non-null on the admin lens — a route regression that dropped decision_at
// from the SELECT would surface as undefined (fails both the ===null branch
// and the typeof-string branch), but a serialisation drift (PostgREST
// returning an epoch integer stringified as "1735689600", or a column swap
// to a text field storing freeform values) would pass the typeof-string
// guard but fail this ISO regex tightening.
//
// Three-part guard (matches the reseller-side tick 276 layering verbatim):
//   (a) preserved null-or-typeof-string pin at line ~362-364 fires first so
//       a projection drop still surfaces before the new regex check;
//   (b) new null-or-(typeof-string AND ISO_TIMESTAMP_RE match) pin fires
//       only after the null-or-string guard passes so tighter existing pins
//       surface first;
//   (c) reuses the ISO_TIMESTAMP_RE module-scope constant hoisted by tick
//       280 above — no additional module-scope constant needed.
//
// Coverage-per-guard posture: the wave-3 row 155 seeded pending
// over_budget_approval row exercises the NULL branch of the null-or-ISO
// guard on every green CI run (pending rows carry decision_at IS NULL per
// ck_decision_shape); the NON-NULL ISO branch has zero-coverage on the wire
// today because no approve/deny fixture seeds a decided reseller_requests
// row that this default status='pending' GET would return — matches the
// tick 261/276 zero-coverage-per-guard rationale (the pin still closes the
// writer contract so a serialisation regression across the null-or-string
// surface would surface on the next CI pass whenever a decide-fixture seeds
// a row and a future ?status= filter change surfaces the decided rows via
// this spec).
//
// Sibling-surface parity: seventh cross-surface companion pin in the
// ticks 275-281 lineage — a projection-side or serialisation-side regression
// on reseller_requests.decision_at now surfaces on the admin patch read-back
// (tick 265), reseller-scoped list (tick 276), and admin-scoped list (this
// tick) lenses simultaneously.
//
// Tick 282 — decision_reason length ≤ REASON_MAX tightening on the admin-scoped
// GET at /api/admin/resellers/requests/route.ts:44 (decision_reason is the
// eighth column of the admin SELECT projection: id, reseller_id, request_type,
// status, payload, decision_by, decision_at, decision_reason, ...). Natural
// next pick option (a) from tick 281 — sibling companion to the tick-281
// decision_at ISO pin above and admin-surface mirror of the reseller-side
// tick 277 pin at reseller-requests-list-authz.spec.ts:651-656.
// reseller_requests.decision_reason is a plain nullable `text` column at
// 0095:36 with no DB-side CHECK — so the writer contract is enforced only in
// validateAdminDecision at web/src/lib/reseller/requests.ts:293-300 which
// rejects the mutation with reason='reason_too_long' whenever
// String(input.decision_reason).trim().length > REASON_MAX (200) and stores the
// already-trimmed value on approve/deny/cancel. Pre-tick-282 posture pinned
// only null-or-typeof-string at line ~428-430 leaving the length invariant
// silent on the admin lens even though the reseller lens has carried the
// tightening since tick 277 — a route regression that projected
// decision_reason from a different column, or a validator regression that
// widened REASON_MAX, would pass the null-or-string guard but fail this length
// tightening on the next CI pass.
//
// Two-part guard (matches ticks 265-281 layering discipline verbatim):
//   (a) preserved null-or-typeof-string pin at line ~428-430 fires first so a
//       projection drop still surfaces before the new length check;
//   (b) new null-or-(typeof-string AND length ≤ REASON_MAX) pin fires only
//       after the null-or-string guard passes so tighter existing pins
//       surface first. Reuses the REASON_MAX=200 module-scope constant hoisted
//       at tick 259 line 120 — no additional constant needed.
//
// Coverage-per-guard posture: the wave-3 row 155 seeded pending
// over_budget_approval row carries decision_reason=NULL on the wire per
// validator + ck_decision_shape (pending rows never carry a decision), so the
// ===null branch of the null-or-length guard exercises on every green CI run
// where the harness is provisioned; the non-null length branch has
// zero-coverage on the wire today because no approve/deny fixture seeds a
// decided reseller_requests row that this default status='pending' GET would
// return — matches the tick 261/276/277/281 zero-coverage-per-guard rationale
// (the pin still closes the writer contract so a length-regression across the
// null-or-string surface would surface on the next CI pass whenever a
// decide-fixture seeds a row and a future ?status= filter change surfaces
// decided rows via this spec).
//
// Sibling-surface parity: eighth cross-surface companion pin in the
// ticks 275-282 lineage — a validator-side or projection-side regression on
// reseller_requests.decision_reason length now surfaces on the admin patch
// read-back (tick 272), reseller-scoped list (tick 277), and admin-scoped
// list (this tick) lenses simultaneously.
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// Tick 362 — reseller_requests-row ck_decision_shape cross-column
// invariant summary cross-surface twin lift onto admin-requests-list-
// authz.spec.ts. Executes tick 361 next-pick option (a) verbatim:
// cross-surface twin hoist of tick 359's ck_decision_shape module-scope
// summary from admin-requests-patch-authz.spec.ts onto THIS list
// surface so the reseller_requests-row cross-column invariant reaches
// TWO-SURFACE parity on the admin-requests-* spec family, matching the
// two-surface parity ticks 354 + 355 + 357 + 358 reached across both
// admin-reseller-detail-authz + admin-reseller-detail-validation
// surfaces (resellers-row + promotion_codes[] + commissions[] +
// admins[] + attributions_summary). Pre-tick posture: this surface
// carries the per-column pins for the three coupled columns already
// (status === "pending" at line ~431, decision_by null-or-UUID at line
// ~393-398, decision_at ISO tightening at line ~469-474 landed by
// tick 281, decision_reason length ≤ REASON_MAX at line ~493-498
// landed by tick 282), but has never carried the module-scope SUMMARY
// naming the SINGLE CHECK constraint (ck_decision_shape at 0095:41-45)
// that couples all four columns — a future rotation reading this file
// alone would have to re-derive the coupling from the four per-column
// pin doc-blocks + the reseller_requests-row schema. Hoisting closes
// the cross-surface twin-lift axis tick 361 opened on the reseller_
// requests-* summary-lens sweep, and mirrors the tick 359 doc-block
// shape verbatim (writer-side source + application write path + read
// path + runtime enforcement + coverage-per-guard posture + symmetric-
// cluster posture) but adapted for the list-surface lens rather than
// the PATCH-write-echo lens tick 359 landed on:
//   - Writer-side source: IDENTICAL to tick 359 — DB CHECK ck_
//     decision_shape at web/supabase/migrations/0095_reseller_
//     requests.sql:41-45 enforces the disjunction
//       (status = 'pending' AND decision_by IS NULL AND decision_at IS NULL)
//       OR
//       (status IN ('approved','denied','cancelled') AND decision_at IS NOT NULL)
//     i.e. pending rows MUST carry both decision columns as NULL and
//     any row whose status flips to a terminal enum member MUST carry
//     decision_at as non-null (decision_by is permitted to be NULL at
//     the DB level per the CHECK — the FK reference at 0095:34 declares
//     ON DELETE SET NULL so a decided-then-orphaned admin row would
//     legally sit at decision_by IS NULL / decision_at NOT NULL /
//     status IN terminal). The sibling ck_credit_link (0095:48-51) and
//     ck_promo_link (0095:52-55) CHECKs are orthogonal single-column
//     guards on linked_credit_transaction_id + linked_promotion_code_id
//     respectively; per-column pins for those FK columns already live
//     at line ~402-407 (linked_credit_transaction_id null-or-UUID) and
//     line ~411-416 (linked_promotion_code_id null-or-UUID) on this
//     surface via the tick 221 FK-echo pass. The tick 360/361 sibling
//     ck_credit_link + ck_promo_link summary hoists on the patch surface
//     narrate those two CHECKs; this tick focuses on ck_decision_shape
//     alone per the tick 359 header shape.
//   - Application write path: IDENTICAL to tick 359 (this list surface
//     reads back rows written by the same PATCH stamper) —
//     validateAdminDecision() at web/src/lib/reseller/requests.ts:276-
//     304 rejects the mutation with reason='already_decided' whenever
//     current.status !== 'pending' (285) so the ONLY green branch
//     through the validator is a pending → terminal transition. The
//     PATCH route at
//     web/src/app/api/admin/resellers/requests/[id]/route.ts:305-320
//     then stamps decision_by:user.id + decision_at:now + status:
//     decision.status inside a SINGLE UPDATE with an
//     .eq("id", current.id).eq("status", "pending") WHERE guard so a
//     concurrent second PATCH racing the same row returns 0 rows and
//     surfaces as reason='update_failed' at HTTP 500. This is the
//     ONLY application-layer stamper on decision_by + decision_at —
//     the DB CHECK is the last line of defence, so a route refactor
//     that stamped decision_at without decision_by (permitted by the
//     CHECK) OR a direct-SQL admin action that skipped the route
//     entirely and set status='approved' without decision_at (rejected
//     by the CHECK) would each be caught: the CHECK at 0095:41-45
//     rejects the second case; the .eq("status","pending") WHERE guard
//     at route.ts:316 + the always-both-columns stamp at 309-310 give
//     the first case a coverage floor via the pending idempotency test
//     on the patch surface.
//   - Read path: DIFFERENT from tick 359. The admin list route at
//     web/src/app/api/admin/resellers/requests/route.ts:44 projects
//     ALL FOUR coupled columns as columns 4 (status), 6 (decision_
//     by), 7 (decision_at), 8 (decision_reason) of the twelve-column
//     SELECT — full ck_decision_shape observability on the wire on
//     every default status=pending list GET (which returns the seeded
//     row before any PATCH lands) AND on every follow-up ?status=
//     approved / ?status=denied / ?status=cancelled filter GET that a
//     future decide-fixture surfaces. Contrast with the tick 359
//     patch-surface lens which projects a narrower "id, status,
//     decision_at, decision_reason, linked_credit_transaction_id,
//     linked_promotion_code_id" tuple at route.ts:317-319 (omits
//     decision_by from the PATCH envelope on purpose — the write is
//     stamped and the reseller-facing surface doesn't need the admin's
//     user id). Post-tick 362 the ck_decision_shape invariant is now
//     observable at module scope on BOTH admin surfaces: the PATCH-
//     write echo (three of four columns, tick 359) and the list-route
//     GET (all four columns, this tick).
//   - Runtime enforcement in this spec: per-column pins across the
//     SINGLE default status='pending' happy-path row inside the for-
//     loop below:
//       - status === "pending" pin at line ~431 (a route regression
//         that dropped .eq("status", status) at route.ts:46 would
//         surface here as a non-pending row leaking into the default
//         envelope)
//       - decision_by null-or-UUID pin at line ~393-398 (tick 221 FK-
//         echo — pending rows MUST have decision_by IS NULL per ck_
//         decision_shape, and this pin's null branch fires on every
//         green CI run)
//       - decision_at null-or-ISO_TIMESTAMP_RE pin at line ~469-474
//         (tick 281 ISO tightening — pending rows carry decision_at
//         IS NULL per ck_decision_shape and this pin's null branch
//         fires on every green CI run)
//       - decision_reason null-or-(typeof string AND length ≤ REASON_
//         MAX) pin at line ~493-498 (tick 282 length tightening —
//         pending rows carry decision_reason=NULL per validator +
//         ck_decision_shape and this pin's null branch fires on every
//         green CI run)
//     fire on every green CI run where loadAdminHarness resolves + the
//     wave-3 row 155 seed (pending over_budget_approval against the
//     active_wholesale variant) is available. Fresh CI hosts with zero
//     pending rows still green cleanly because the for-loop skips over
//     an empty envelope.
//   - Coverage-per-guard posture: INVERTED relative to tick 359. On
//     the patch surface (tick 359), the deny + cancel + approve
//     branches all fire the NON-NULL branch of ck_decision_shape
//     (decision_at set, decision_by set, decision_reason set, status
//     ∈ terminal enum) on every pass; the NULL branch is exercised
//     via the wave-3 row 155 pending list-route seed pre-PATCH. On
//     this list surface, the coverage is inverted: the wave-3 row 155
//     seeded pending over_budget_approval row exercises the NULL
//     branch (status='pending' AND decision_by IS NULL AND decision_
//     at IS NULL AND decision_reason IS NULL) on every green CI run
//     where the harness is provisioned; the NON-NULL branch has
//     zero-coverage on the wire today because no approve/deny/cancel
//     fixture seeds a decided reseller_requests row that this default
//     status='pending' GET would return. This inversion is a fixture
//     artefact — once a decide-fixture seeds a row AND a future
//     ?status= filter change surfaces the decided rows via this spec,
//     the coverage rebalances so this surface fires BOTH branches on
//     the same CI pass (unlike the patch surface which will always
//     fire only the NON-NULL branch on approve/deny/cancel probes
//     because a pre-PATCH pending row is never in the PATCH response
//     envelope).
//   - Symmetric-cluster posture: this hoist opens the cross-surface
//     twin-lift axis on the admin-requests-*.spec.ts family — first
//     of three possible companion ticks per tick 361 next-pick options
//     (a) + (b) + (c). Post-tick 362, admin-requests-list-authz.spec.
//     ts carries 1/3 possible reseller_requests-cluster module-scope
//     summaries (ck_decision_shape landed here; ck_credit_link + ck_
//     promo_link cross-surface twins pending at follow-on ticks). No
//     new imports, no new module-scope const, no per-column assert
//     added, no fixture change, no route change — the inline per-
//     column pins across the four coupled columns plus the constants
//     block above are already the runtime enforcement; this hoist is
//     a documentation-only cross-surface close-out lift.
//
// Rotation rationale:
//   Executes tick 361 next-pick option (a) verbatim. Pure documentation-
//   only summary hoist — no new imports, no new module-scope const, no
//   fixture change, no route change, no per-column assert added.
//   Extends the summary-lens axis tick 359 + 360 + 361 opened on the
//   admin-requests-*.spec.ts family from ONE surface (patch) to TWO
//   surfaces (patch + list). Follow-on ticks can extend along the same
//   axis: (i) hoist tick 360's ck_credit_link summary onto this same
//   list surface so the second summary reaches two-surface parity;
//   (ii) hoist tick 361's ck_promo_link summary onto this same list
//   surface so the third summary reaches two-surface parity; (iii)
//   rotate to reseller-side surfaces (requests-authz.spec.ts +
//   requests-validation.spec.ts + reseller-requests-list-authz.spec.
//   ts) for cross-scope twin hoists of all three reseller_requests-row
//   cross-column invariant summaries.

test.describe("Admin reseller-requests list pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before getSupabaseAdmin, query param parse, or the reseller_requests SELECT. Body: ${await resp.text()}`,
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
      `non_admin returned ${resp.status()} — expected 401 not_admin before getSupabaseAdmin, query param parse, or the reseller_requests SELECT. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin reseller-requests list — P10 wave-5 row 174 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("happy — GET as qa-admin-1 returns 200 with body.requests array", async ({
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
      `happy returned ${resp.status()} — expected 200 after requireAdmin() passes and default status='pending' filter applies. A 503 not_configured here means SUPABASE_URL / SERVICE_ROLE is unset in this worker. A 500 query_failed means the reseller_requests SELECT (route.ts:41-52) leaked through. Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.requests),
      `happy body.requests should be an array (SELECT ... LIMIT 200 → data ?? []): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);

    // Do NOT pin body.requests.length — the on-disk cohort mutates: fresh
    // CI hosts hold zero pending rows; hosts where wave-3 row 155 has run
    // in prior CI passes hold ≥1 pending over_budget_approval row (seeded
    // against the active_wholesale variant). The envelope loop below
    // asserts per-row shape only so both empty-array and populated-array
    // states green identically.
    for (const row of (body.requests as unknown[]) ?? []) {
      expect(
        row !== null && typeof row === "object" && !Array.isArray(row),
        `requests row should be a plain object (not null / not array / not scalar): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      const r = row as {
        id?: unknown;
        request_type?: unknown;
        status?: unknown;
        created_at?: unknown;
        reseller_id?: unknown;
        requested_by?: unknown;
        decision_by?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
        payload?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        resellers?: unknown;
      };
      expect(typeof r.id).toBe("string");
      expect(r.id as string).toMatch(UUID_RE);
      expect(typeof r.reseller_id).toBe("string");
      expect(r.reseller_id as string).toMatch(UUID_RE);
      // Tick 221 — FK-echo shape pins per tick 220 next-pick option (a).
      // Route SELECT at route.ts:44 echoes four additional UUID FK fields
      // beyond id + reseller_id: requested_by (NOT NULL per migration
      // 0095:28), decision_by (nullable per 0095:35, NULL for pending),
      // linked_credit_transaction_id (nullable per 0095:38, NULL for
      // pending — ck_credit_link at 0095:47-49 forbids non-null except on
      // approved over_budget_approval), linked_promotion_code_id (nullable
      // per 0095:39, NULL for pending — ck_promo_link at 0095:50-52
      // forbids non-null except on approved code_request). Pre-tick posture
      // left all four silent, so a route regression that dropped any of
      // them from the SELECT list would surface only at the admin inbox
      // visual QA lens or the P9.3 approve-flow PATCH lens (which reads
      // the row back via a separate GET). Post-tick each FK carries a
      // shape assertion identical to the credit-grant-authz row 152
      // discipline: typeof=string + UUID_RE for NOT NULL fields, and
      // (null OR (typeof=string AND UUID_RE)) for nullable fields.
      //
      // requested_by is NOT NULL — POST route at route.ts:91 stamps it
      // from user.id, and the CHECK at 0095:28 forbids NULL. A regression
      // that dropped the field from the SELECT would surface as
      // typeof=undefined (fails "string" check).
      expect(typeof r.requested_by).toBe("string");
      expect(r.requested_by as string).toMatch(UUID_RE);
      // decision_by is nullable in the schema but under the default
      // status='pending' filter applied here (route.ts:39 + 46), the
      // ck_decision_shape CHECK at 0095:41-45 enforces decision_by IS NULL
      // for pending rows. Pin as null-or-UUID rather than strict null so
      // the shape assertion is robust to a future ?status= filter change
      // that surfaces non-pending rows via this spec.
      expect(
        r.decision_by === null ||
          (typeof r.decision_by === "string" &&
            UUID_RE.test(r.decision_by as string)),
        `decision_by should be null or a UUID string: ${JSON.stringify(r.decision_by)}`,
      ).toBe(true);
      // linked_credit_transaction_id is nullable — ck_credit_link enforces
      // NULL except on approved over_budget_approval rows, so pending rows
      // always echo null. Same null-or-UUID posture as decision_by.
      expect(
        r.linked_credit_transaction_id === null ||
          (typeof r.linked_credit_transaction_id === "string" &&
            UUID_RE.test(r.linked_credit_transaction_id as string)),
        `linked_credit_transaction_id should be null or a UUID string: ${JSON.stringify(r.linked_credit_transaction_id)}`,
      ).toBe(true);
      // linked_promotion_code_id is nullable — ck_promo_link enforces NULL
      // except on approved code_request rows, so pending rows always echo
      // null. Same null-or-UUID posture as decision_by.
      expect(
        r.linked_promotion_code_id === null ||
          (typeof r.linked_promotion_code_id === "string" &&
            UUID_RE.test(r.linked_promotion_code_id as string)),
        `linked_promotion_code_id should be null or a UUID string: ${JSON.stringify(r.linked_promotion_code_id)}`,
      ).toBe(true);
      expect(typeof r.request_type).toBe("string");
      expect(
        REQUEST_TYPES.has(r.request_type as string),
        `request_type '${String(r.request_type)}' not in {code_request, over_budget_approval, collateral_approval}: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(typeof r.status).toBe("string");
      expect(
        REQUEST_STATUSES.has(r.status as string),
        `status '${String(r.status)}' not in {pending, approved, denied, cancelled}: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Default status filter is 'pending' when ?status= omitted; a route
      // regression that dropped the .eq("status", status) at route.ts:46
      // would surface here as a non-pending row leaking into the default
      // envelope.
      expect(r.status).toBe("pending");
      expect(typeof r.created_at).toBe("string");
      // Tick 280 — ISO_TIMESTAMP_RE tightening on created_at mirrored back
      // from the reseller-side tick 275 pin at
      // reseller-requests-list-authz.spec.ts:485-489. See module-scope
      // doc-block above ISO_TIMESTAMP_RE for the derivation. Two-part guard
      // preserves the typeof-string pin above so a projection drop still
      // surfaces before the regex check; the ISO match here catches a
      // column type flip from timestamptz or a serialisation drift on the
      // PostgREST side that emits a locale-formatted date instead of the
      // wire shape. Green-path fixture wave-3 row 155 seeds a pending
      // over_budget_approval row so this pin fires on every green CI run
      // where the harness is provisioned; fresh hosts with zero pending
      // rows still green cleanly because the for-loop skips over an empty
      // envelope. Sixth cross-surface companion pin in the 275-280 lineage.
      expect(
        ISO_TIMESTAMP_RE.test(r.created_at as string),
        `admin happy GET row.created_at '${String(r.created_at)}' should match ISO 8601 shape (timestamptz NOT NULL DEFAULT now() per 0095:39 serialised via PostgREST); a drift to a non-ISO string, a number, or null would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // decision_at / decision_reason are both nullable for pending rows
      // (only populated by the PATCH branch at route.ts, which flips the
      // status to approved / denied / cancelled). Do NOT pin their values;
      // only their presence-or-null-ness so a schema regression that
      // dropped them from the SELECT list surfaces as undefined.
      expect(r.decision_at === null || typeof r.decision_at === "string").toBe(
        true,
      );
      // Tick 281 — ISO_TIMESTAMP_RE tightening on decision_at, sibling
      // companion to the tick-280 created_at ISO pin above and admin-surface
      // mirror of the reseller-side tick 276 pin at
      // reseller-requests-list-authz.spec.ts:629-634. See the tick-281
      // module-scope doc-block above ISO_TIMESTAMP_RE for the
      // ck_decision_shape + PostgREST serialisation rationale. Fires ONLY
      // when decision_at is non-null so the wave-3 row 155 pending fixture's
      // decision_at=NULL still passes cleanly through the null branch; a
      // decided-row fixture (future approve/deny seed) would exercise the
      // ISO regex branch. Seventh cross-surface companion pin in the
      // 275-281 lineage.
      expect(
        r.decision_at === null ||
          (typeof r.decision_at === "string" &&
            ISO_TIMESTAMP_RE.test(r.decision_at as string)),
        `admin happy GET row.decision_at '${String(r.decision_at)}' should be null or an ISO 8601 timestamp string (timestamptz per 0095:35 serialised via PostgREST; NULL on pending rows per ck_decision_shape at 0095:41-45); a drift to a non-ISO string, an epoch number stringified, or a locale-formatted date would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      expect(
        r.decision_reason === null || typeof r.decision_reason === "string",
      ).toBe(true);
      // Tick 282 — length ≤ REASON_MAX tightening on decision_reason, sibling
      // companion to the tick-281 decision_at ISO pin above and admin-surface
      // mirror of the reseller-side tick 277 pin at
      // reseller-requests-list-authz.spec.ts:651-656. See the tick-282
      // module-scope doc-block above ISO_TIMESTAMP_RE for the validator
      // source-of-truth rationale (requests.ts:293-300 —
      // validateAdminDecision rejects with reason='reason_too_long' whenever
      // trim().length > REASON_MAX=200 and stores the trimmed value, so the
      // wire never carries a longer string on a green path). Fires ONLY when
      // decision_reason is non-null so the wave-3 row 155 pending fixture's
      // decision_reason=NULL still passes cleanly through the null branch; a
      // decided-row fixture (future approve/deny seed) would exercise the
      // length branch. Eighth cross-surface companion pin in the 275-282
      // lineage. Reuses the REASON_MAX=200 module-scope constant hoisted at
      // tick 259 line 120 — no additional constant needed.
      expect(
        r.decision_reason === null ||
          (typeof r.decision_reason === "string" &&
            (r.decision_reason as string).length <= REASON_MAX),
        `admin happy GET row.decision_reason should be null or a string of length ≤ ${REASON_MAX} per validator invariant at requests.ts:293-300 (validateAdminDecision rejects with reason='reason_too_long' when trim().length > REASON_MAX=200 and stores the trimmed value); a widening of the validator or a projection swap to a different text column would surface here: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 234 — payload plain-object shape pin per tick 233 next-pick
      // option (p) sibling-audit outcome. Route SELECT at route.ts:44 echoes
      // the payload jsonb column straight through with no normalisation. The
      // DB column is `payload jsonb NOT NULL DEFAULT '{}'` per 0095:33 so
      // every row carries a plain object (never null, never array). Pre-tick
      // this file left `payload?: unknown` on the row type (line 209) with
      // ZERO shape assertion, while two twin surfaces already pin the same
      // column to the three-part plain-object guard:
      //   - requests-validation.spec.ts:340-343 (reseller-side happy GET)
      //   - reseller-requests-list-authz.spec.ts:279-282 (reseller-side list)
      // Both twins call out the jsonb NOT NULL DEFAULT '{}' invariant and
      // both use the same `!== null && typeof === "object" && !Array.isArray`
      // three-part shape guard chosen over expect.objectContaining(...) for
      // spec-local consistency. This admin surface reads the same underlying
      // reseller_requests rows via the admin GET (default status='pending'),
      // so a PostgREST view that mistyped the column or a route regression
      // that swapped payload for a raw string / array would surface across
      // the three list surfaces simultaneously — landing this pin here keeps
      // the admin lens carrying the same shape coverage as its two reseller-
      // side twins.
      expect(
        r.payload !== null &&
          typeof r.payload === "object" &&
          !Array.isArray(r.payload),
        `admin happy GET row.payload should be a plain object (jsonb NOT NULL DEFAULT '{}' per 0095:33; a PostgREST view that mistyped the column would surface here). Row: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Tick 259 — per-key payload content pins per tick 258 next-pick
      // option (r). The tick 234 plain-object guard above closes the
      // "is this a jsonb object" invariant, but leaves the per-request-
      // type key shapes silent. This tick extends coverage into the
      // discriminated union documented at
      // web/src/lib/reseller/requests.ts:41-44:
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
      // path admin GET, while the code_request + collateral_approval
      // branches depend on future QA seeding to fire. Coverage-per-
      // guard on the two unseeded branches is zero today, but the pin
      // still closes the writer contract so a route regression that
      // dropped a key from the SELECT (route.ts:44 echoes payload jsonb
      // straight through) or a validator regression that swapped a key
      // shape at requests.ts would surface across both surfaces on the
      // next CI pass, matching the tick 258 zero-coverage-per-guard
      // rationale for the goal_completed row.
      //
      // TYPEOF + VALUE-tighten pins per key so a rename OR a shape
      // drift (e.g. tier_pct swapped for tier, or reason no longer
      // trimmed) both surface. Symmetric with the tick 231 embed.code
      // value pin — spec-local convention is that whenever a validator-
      // side invariant exists, the pin echoes it verbatim.
      const payload = r.payload as Record<string, unknown>;
      if (r.request_type === "code_request") {
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
      } else if (r.request_type === "over_budget_approval") {
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
      } else if (r.request_type === "collateral_approval") {
        expect(typeof payload.collateral_url).toBe("string");
        expect(payload.collateral_url as string).toMatch(HTTPS_URL_RE);
        expect(typeof payload.purpose).toBe("string");
        expect(
          (payload.purpose as string).length <= PURPOSE_MAX,
          `collateral_approval payload.purpose should be length ≤ ${PURPOSE_MAX} per requests.ts:193-195: ${JSON.stringify(payload.purpose).slice(0, 100)}`,
        ).toBe(true);
      }
      // Tick 222 — resellers(code, display_name) nested-join shape pin per
      // tick 221 next-pick option (b). Route SELECT at route.ts:44 embeds a
      // Supabase nested select on the parent resellers row via the
      // reseller_requests.reseller_id → resellers.id FK (0095:27). PostgREST
      // returns this as a single embedded object (not an array) because the
      // FK targets a unique column (resellers.id PRIMARY KEY per 0091:23).
      // reseller_id is NOT NULL + ON DELETE RESTRICT so r.resellers is never
      // null — a NULL would only appear if the FK were nullable AND
      // unlinked. Both columns in the embed are NOT NULL text per 0091:24-25
      // (code UNIQUE UPPERCASE slug, display_name plain text). Pre-tick 222
      // posture left the entire nested join silent — a route regression that
      // dropped `resellers(code, display_name)` from the SELECT list would
      // surface only at the /admin/resellers/requests visual QA lens which
      // renders the parent reseller badge next to each row. Post-tick this
      // is the last un-pinned field in the admin request envelope; shape
      // parity with the FK-echo discipline landed at tick 221.
      expect(
        r.resellers !== null &&
          typeof r.resellers === "object" &&
          !Array.isArray(r.resellers),
        `resellers embed should be a plain object (PostgREST returns a single row for a to-one FK, not an array): ${JSON.stringify(r.resellers)}`,
      ).toBe(true);
      const embed = r.resellers as { code?: unknown; display_name?: unknown };
      // Tick 231 option (j) — VALUE-tighten embed.code from typeof string
      // to the normaliseResellerCode() invariant /^[A-Z0-9]+$/ (see hoisted
      // RESELLER_CODE_RE above). Twin-symmetrised in the same tick onto
      // admin-resellers-list-authz.spec.ts:176 which echoes the same
      // column directly (this file echoes it via the nested
      // resellers(code, display_name) embed at route.ts:44). A route
      // regression that dropped the normaliser at admin-create time
      // (route.ts:86) or a schema-side change that removed the UPPERCASE
      // convention would surface across both admin surfaces
      // simultaneously. display_name has no such invariant (free text per
      // 0091:25) so it stays as typeof string only.
      expect(typeof embed.code).toBe("string");
      expect(embed.code as string).toMatch(RESELLER_CODE_RE);
      expect(typeof embed.display_name).toBe("string");
    }
  });
});
