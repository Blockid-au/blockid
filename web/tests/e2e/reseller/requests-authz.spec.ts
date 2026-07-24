// POST /api/reseller/requests pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright
// must cover the reseller-admin endpoints so a regression in the
// getCurrentUser → scopedReseller ordering surfaces before the endpoint
// fires the reseller_requests INSERT or the reseller_audit_log(file_request)
// write).
//
// Track A P9.3 shipped tick 31 (see reseller-module-goal.md
// P9.3_requests_inbox). requests-validation.spec.ts already probes the
// post-scope input-validation branches surfaced by
// validateResellerRequestBody (invalid_payload / invalid_request_type /
// invalid_tier_pct / suffix_bad_format / collateral_url_required /
// purpose_required) behind the QA_RESELLER_ADMIN_EMAIL harness, but the
// pre-scope auth-chain rows have no explicit dry-run — every other
// reseller-lens mutation endpoint has one (reveal-email tick 100,
// drawer tick 101, me tick 102, admin-* ticks 103-111,
// reseller-crons tick 112, create-startup tick 113,
// showcase-reviews tick 114, credit-grant tick 115). This spec closes
// that last outlier.
//
// Two branches are harness-free and safe against staging (no rows
// written to reseller_requests, no reseller_audit_log(file_request)
// row, no reseller_admins SELECT beyond the scopedReseller probe):
//
//   1. unauthenticated       — POST with no session          → 401 { ok:false, reason:"unauthorised" }
//                              (getCurrentUser null → returns before
//                              scopedReseller, resellerSupabase,
//                              selfReseller, validateResellerRequestBody,
//                              reseller_requests INSERT, or audit log)
//   2. non_reseller_admin    — POST as a founder QA account  → 403 { ok:false, reason:"no_membership" }
//                              (scopedReseller throws ResellerScopeError
//                              code="no_membership" because reseller_admins
//                              has no active row for a founder; validation
//                              never runs, no INSERT, no audit row)
//
// Route reference: web/src/app/api/reseller/requests/route.ts
//   Line 47-50:  getCurrentUser() null                         → 401 { reason: "unauthorised" }
//   Line 52-60:  scopedReseller(user) throws                   → 403 { reason: err.code }
//   Line 62-65:  getSupabaseAdmin() null                       → 503 { reason: "not_configured" }
//   Line 67-71:  selfReseller() null                           → 404 { reason: "reseller_missing" }
//   Line 73-83:  validateResellerRequestBody                   → 400/403 { reason: <validation.reason> }
//   Line 87-110: reseller_requests INSERT + unique-collision   → 409 duplicate_pending_code_request / 500 insert_failed
//   Line 112-132: db.auditLog(action='file_request')           → 500 { reason: "audit_failed" }
//   Line 134-145: 201 { ok:true, request: { id, created_at, ... } }
//   Line 148-186: GET flow — same auth chain then reseller_requests SELECT
//
// The auth-chain rows probe LINE 47-50 (row 1) and LINE 52-60 (row 2)
// exclusively — rows 3-onwards need either the QA_RESELLER_ADMIN_EMAIL
// harness (rows 3-N, covered by requests-validation.spec.ts) or per-test
// seeding which plan §J.2 forbids.
//
// Body shape sent on both probes: a syntactically-valid code_request POST
// body with tier_pct=20 (inside the default allowed_tiers=[0,10,20,30,40]
// seed) so that IF the auth gate were to leak (regression), the request
// would still be a realistic code_request attempt and the resulting error
// surface (400 duplicate_pending_code_request or downstream) would be a
// legitimate signal — never a false positive from a malformed body bailing
// at the wrong branch.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - all validation branches — covered by requests-validation.spec.ts
//     behind the QA_RESELLER_ADMIN_EMAIL harness.
//   - duplicate_pending_code_request (409) — needs an existing pending
//     code_request row for the same reseller; per-test seeding.
//   - revoked / no_reseller (403 via scopedReseller) — inconsistent states
//     that never occur in production because reseller_admins.status='active'
//     is provisioned alongside the resellers row.
//   - Happy path (201) — ACTIVATED as P10 wave-3 row 155 below via
//     loadTempReseller("active_wholesale") + fixture.adminEmail loginAs +
//     fixture.attributedUserId as the over_budget_approval target. Sits
//     inside the wave-3-active_wholesale subwave (152 / 154 / 155 / 156)
//     that tick 152's preflight flagged as activation-ready without any
//     seed/fixture delta.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const ROUTE = "/api/reseller/requests";

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const VALID_CODE_REQUEST_BODY = {
  request_type: "code_request",
  payload: { tier_pct: 20 },
} as const;

test.describe("Reseller requests pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401 unauthorised", async ({
    request,
  }) => {
    const resp = await request.post(ROUTE, {
      data: VALID_CODE_REQUEST_BODY,
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scopedReseller, validateResellerRequestBody, reseller_requests INSERT, or audit log. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("unauthorised");
  });

  test("non_reseller_admin — POST as a founder QA account returns 403 no_membership", async ({
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
    const resp = await page.request.post(ROUTE, {
      data: VALID_CODE_REQUEST_BODY,
    });
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 403 no_membership before validateResellerRequestBody, reseller_requests INSERT, or audit log. Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_membership");
  });
});

// P10 wave-3 row 155 — active_wholesale variant probes the /api/reseller/
// requests happy POST path (reseller-admin session → 201 with body.request.id
// UUID + request_type=over_budget_approval + status=pending, followed by a
// reseller_audit_log(action='file_request') row). Per docs/plans/p10-deferred-
// spec-activation-order.md wave 3:
//   155 | requests-authz.spec.ts | active_wholesale |
//         happy POST 200 (over_budget code_request) | 200
//
// Note the schedule doc's "200" is a slip — the route returns 201 on the
// happy path (see web/src/app/api/reseller/requests/route.ts:144). The
// dry-run assertion pins 201 verbatim; a regression to 200 would surface
// here immediately.
//
// Payload choice — over_budget_approval (not code_request): the
// reseller_requests_pending_code_uniq partial unique index (0095:71-73)
// forbids more than one pending code_request per (reseller, tier). A rerun
// of this spec on the same host would 409 duplicate_pending_code_request
// until an admin approved / denied the prior row. over_budget_approval
// has no such constraint (see 0095_reseller_requests.sql — only the
// code_request row carries the partial index) so this row stays idempotent
// under CI replay without wave-5 row 175 having to fire first. Row 156
// (requests-validation.spec.ts happy GET) will enumerate the pending row
// this spec inserts; row 175 (admin-requests-patch-authz.spec.ts) will
// exercise the approve/deny/cancel transitions on the same row.
//
// Route reference (web/src/app/api/reseller/requests/route.ts):
//   Line 46-50:  getCurrentUser null                          → 401 unauthorised
//   Line 52-60:  scopedReseller throws                         → 403 { reason: err.code }
//   Line 62-65:  getSupabaseAdmin null                         → 503 not_configured
//   Line 67-71:  selfReseller null                             → 404 reseller_missing
//   Line 73-83:  validateResellerRequestBody fails             → 400/403 { reason: <validation.reason> }
//   Line 87-110: reseller_requests INSERT / unique-collision   → 409 duplicate_pending_code_request / 500 insert_failed
//   Line 112-132: db.auditLog(action='file_request')           → 500 audit_failed
//   Line 134-145: 201 { ok:true, request: { id, created_at,
//                                            request_type, status } } ← THIS
//
// Fixture wiring (mirrors row 152 posture verbatim — no seed or fixture
// delta needed per wave-3 preflight tick 152):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves adminEmail via the P10 Option A per-variant slot
//     (qa-reseller-wholesale-active@blockid.au) + mirrors reseller_admins so
//     scopedReseller() returns a live scope with can_grant_credits=true
//     (seed default) so validateOverBudgetApproval's capability_disabled
//     gate does NOT fire.
//   - fixture.attributedUserId supplies the target_user_id UUID for the
//     over_budget_approval payload. The route audit-writes subject_user_id
//     from payload.target_user_id (route.ts:117-119) but does NOT check
//     scope — validateOverBudgetApproval only enforces isUuid(target_user_id)
//     so attributionExists is NOT required for this row (unlike wave-2 rows
//     146-149 which hit scopedReseller().allowedCustomerIds()).
//   - loginAs(page, fixture.adminEmail) opens the reseller-admin session
//     against the DISTINCT per-variant app_users row so scopedReseller()
//     .maybeSingle() does not PGRST116-collide with other variants.
//
// Skip conditions:
//   - loadTempReseller returns null (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     unset or QAPROBEWHOLESALEACTIVE seed row missing).
//   - fixture.adminUserId null (variant admin row missing or reseller_admins
//     mirror not seeded — scopedReseller would 403 no_membership).
//   - fixture.attributedUserId null (attributed founder not seeded in
//     app_users — validateOverBudgetApproval would 400 target_user_id_required
//     which is the exact failure mode row 155 is designed to catch, so a
//     partial-seed host cannot distinguish "seeder not run" from "code
//     regression" and must skip rather than false-fail).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved admin email.
//
// State-pollution posture per tick 154's next-tick recommendation
// (reseller_requests rows are cheap metadata — no trackProjectForCleanup
// wiring needed):
//   - requested_amount=1 keeps the payload minimal — no credit_balances
//     write fires from THIS endpoint (over_budget_approval only writes the
//     queue row; the actual credit grant happens when an admin approves it
//     via /api/admin/resellers/requests/[id] which is wave-5 row 175's
//     surface).
//   - Each CI run inserts ONE reseller_requests row + ONE reseller_audit_log
//     row per pass. Rows accumulate as pending until wave-5 row 175 exercises
//     the approve/deny/cancel transitions and drains the queue. Runaway
//     accumulation surfaces via the pending-hot index scan (0095:59-65)
//     slowing down — sentinel for "sweep the QA reseller_requests table
//     on staging."
//   - No projects.id created → no fixture.trackProjectForCleanup / cleanup()
//     wiring needed; this matches row 152's posture as the shortest
//     remaining wave-3 rows in the active_wholesale subwave.
//
// Coverage-vs-duplication call: pin 201 + body.ok=true + body.request.id
// non-empty string matching UUID shape + body.request.request_type ===
// "over_budget_approval" + body.request.status === "pending". Do NOT pin
// body.request.created_at (a timestamp string that drifts every run). The
// request_type + status pins catch (a) a route regression that mis-echoes
// the request_type or drops the pending default status before the 201
// return (route.ts:134-145), and (b) a route regression that inserts the
// row but returns a stale envelope shape.
//
// Non-Stripe / non-GST discipline: the requests route reads resellers
// (via selfReseller for allowed_tiers + can_grant_credits) and writes
// reseller_requests + reseller_audit_log. No promotion_code lookup, no
// credit_balances / credit_transactions write, no revenue_events read,
// no Stripe network call, no InfoVision dependency. P8.5 + P1.5 remain
// neither a dependency nor a consequence. The audit-log write side-effect
// is captured by wave-5 row 179 (audit-log-writes.spec.ts) so this row
// focuses on the wire envelope — a broken audit-log write would surface
// here as body.ok=false via the 500 audit_failed branch (route.ts:127-131)
// rather than as a missing audit row that only row 179 could detect.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tick 365 — reseller_requests-row ck_decision_shape cross-column
// invariant summary hoist onto requests-authz.spec.ts. Executes tick
// 364 next-pick option (i) verbatim: rotate to a reseller-scope
// surface (requests-authz.spec.ts) for the FIRST cross-scope hoist of
// any of the three reseller_requests-row cross-column invariant
// summaries — none of the three reseller_requests-cluster ck_* CHECK
// constraints (ck_decision_shape / ck_credit_link / ck_promo_link)
// have been narrated at module-scope on ANY reseller-scope surface
// today (a grep of the three reseller-scope surface files —
// requests-authz.spec.ts / requests-validation.spec.ts /
// reseller-requests-list-authz.spec.ts — shows only inline per-column
// mentions of ck_decision_shape from ticks 275-278; no aggregated
// cross-column module-scope summary block exists). Opens the
// reseller-scope summary-lens axis the same way tick 359 opened the
// admin-scope summary-lens axis on the admin-requests-*.spec.ts
// family. Post-tick 365, the reseller_requests-row cluster carries
// 4 module-scope cross-column invariant summaries across the
// admin-requests-* + reseller-scope surfaces combined: 3 on the
// admin-requests-*.spec.ts pair (ck_decision_shape + ck_credit_link
// + ck_promo_link at 3/3 × 2-surface = 6 module-scope observations
// per tick 364 close-out) + 1 on the reseller-scope surface (this
// tick — ck_decision_shape on requests-authz.spec.ts). Follow-on
// ticks can hoist ck_credit_link + ck_promo_link companions on the
// same file to reach 3/3 reseller-scope parity, then twin-lift the
// three onto requests-validation.spec.ts + reseller-requests-list-
// authz.spec.ts for full-reseller-scope × 3-surface parity mirroring
// the admin-scope × 2-surface parity landed ticks 359-364. Pure
// documentation-only doc-block hoist — no new imports, no new
// module-scope const, no per-column assert added, no fixture change,
// no route change; the existing UUID_RE constant declared adjacent
// at line 250-251 remains the sole module-scope const on this file.
//
// Cross-column invariant summary — reseller_requests.{status,
// decision_by, decision_at, decision_reason} ⇔ ck_decision_shape
//   Writer-side source: IDENTICAL to tick 359 / 362 on the admin-
//   requests-*.spec.ts pair — DB CHECK ck_decision_shape at
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
//   legally sit at decision_by IS NULL / decision_at NOT NULL /
//   status IN terminal). The sibling ck_credit_link (0095:48-51)
//   and ck_promo_link (0095:52-55) CHECKs are orthogonal — each is
//   its own single-column-nullness-vs-request_type-and-status
//   disjunction governing linked_credit_transaction_id +
//   linked_promotion_code_id respectively, and are covered by
//   companion module-scope summaries on the admin-requests-*.spec.ts
//   pair (ticks 360/363 + 361/364) — this reseller-scope surface
//   carries only the ck_decision_shape summary today, matching the
//   opening-hoist posture tick 359 landed on the admin-scope side
//   before ticks 360 + 361 filled the two companion summaries.
//   Application write path: DIFFERENT from tick 359 / 362 (which
//   narrate the admin PATCH stamper). The reseller-scope POST at
//   web/src/app/api/reseller/requests/route.ts:87-110 INSERTs a
//   fresh reseller_requests row via
//     .insert({
//       reseller_id: scope.reseller_id,
//       request_type: validation.request_type,
//       payload: validation.payload,
//       created_by: user.id,
//     })
//   and NEVER stamps decision_by, decision_at, decision_reason, or
//   status. Those four columns take their DB defaults: status defaults
//   to 'pending' via 0095:32 (`status text NOT NULL DEFAULT 'pending'
//   CHECK (status IN ('pending','approved','denied','cancelled'))`);
//   decision_by / decision_at / decision_reason default to NULL per
//   0095:34-36 (all three nullable, no DEFAULT clause). So EVERY row
//   produced by this INSERT path is born on the NULL branch of
//   ck_decision_shape (status='pending' AND decision_by IS NULL AND
//   decision_at IS NULL) — the NON-NULL branch (status IN terminal
//   AND decision_at IS NOT NULL) is UNREACHABLE from this route
//   because the reseller-scope POST has no update mode and no
//   decision_by/decision_at columns in its INSERT payload. The
//   NON-NULL branch is exclusively produced by the admin PATCH
//   stamper narrated in the tick 359 doc-block on the sibling
//   admin-requests-patch-authz.spec.ts surface (route.ts:305-320 on
//   /api/admin/resellers/requests/[id] stamps decision_by:user.id +
//   decision_at:now + status:decision.status atomically inside a
//   single UPDATE with an .eq("status","pending") WHERE guard). This
//   INSERT-vs-UPDATE asymmetry between the reseller-scope and
//   admin-scope surfaces is the reason the ck_decision_shape
//   invariant needs TWO cross-surface twins to reach full coverage
//   observability at module scope: the reseller-scope surface (this
//   tick) narrates the NULL/pending birth branch on the INSERT
//   side + the admin-scope surface pair (ticks 359 + 362) narrates
//   the NON-NULL/terminal transition branch on the UPDATE side —
//   together the two surfaces cover both halves of the disjunction
//   at module scope rather than one surface reconstructing both
//   halves inline.
//   Read path: DIFFERENT from tick 359 / 362. The reseller-scope
//   POST response envelope at web/src/app/api/reseller/requests/
//   route.ts:134-145 projects a narrower four-column tuple
//     { ok: true, request: { id, created_at, request_type, status } }
//   — omits decision_by, decision_at, decision_reason,
//   linked_credit_transaction_id, and linked_promotion_code_id on
//   purpose (the reseller-facing POST envelope only echoes the four
//   columns the client needs to render a "your request has been
//   filed" confirmation). So of the four columns coupled by
//   ck_decision_shape, ONLY status is projected on this envelope
//   (decision_by + decision_at + decision_reason are stripped by
//   the route BEFORE the envelope reaches the wire). Contrast with
//   the admin-scope PATCH envelope at
//   /api/admin/resellers/requests/[id]/route.ts:317-319 which
//   projects three of the four ("id, status, decision_at,
//   decision_reason, linked_credit_transaction_id, linked_promotion
//   _code_id" — decision_by is omitted from the PATCH envelope per
//   tick 359's narration) AND the admin-scope list route at
//   /api/admin/resellers/requests/route.ts:44 which projects all
//   four (per tick 362's narration). This means the ck_decision_
//   shape invariant is observable at three different projection
//   granularities across the admin + reseller surfaces: (a) full
//   four-column tuple on the admin list route (tick 362 lens);
//   (b) three-column tuple on the admin PATCH echo (tick 359 lens
//   — omits decision_by); (c) single-column tuple on the reseller
//   POST envelope (this tick — projects only status). The reseller
//   POST envelope is the narrowest of the three, matching the
//   INSERT-side coverage (only the NULL/pending branch to observe,
//   for which projecting status alone is sufficient).
//   Runtime enforcement in this spec: the wave-3 row 155 happy POST
//   at lines 253-317 pins body.request.status === "pending" at line
//   315 (single-column NULL-branch of ck_decision_shape — asserts
//   the birth-state status enum value), body.request.id typeof-
//   string + UUID_RE match at lines 312-313 (FK-echo shape guard on
//   the INSERT-returned uuid), body.request.request_type ===
//   "over_budget_approval" at line 314 (enum-value pin on the
//   sibling request_type CHECK at 0095:30). The wave-5 row 155-b
//   seeder at lines 342-403 pins the same four columns on the
//   second INSERT so the NULL/pending birth branch fires TWICE per
//   green CI run (once per pending row seeded for wave-5 row 175's
//   deny + cancel drains). Neither wave-3 row 155 nor wave-5 row
//   155-b asserts decision_by / decision_at / decision_reason on
//   the wire — because those three columns are stripped from the
//   POST envelope (see Read path above) and therefore NOT observable
//   on this surface. A route regression that leaked the three
//   omitted columns onto the envelope would surface via a
//   `body.request.decision_by` undefined → non-undefined delta on
//   downstream consumers, but this spec deliberately does not
//   assert their absence (a "should not exist" assertion is
//   symmetric to a "should exist" pin — either direction couples
//   the spec to route-envelope refactoring in a way that adds cost
//   without adding correctness). The pending row's DB-side
//   decision_by=NULL / decision_at=NULL / decision_reason=NULL
//   invariant is captured by the sibling wave-3 row 156 in
//   requests-validation.spec.ts (which enumerates the seeded
//   pending row via the reseller-scope GET and pins the three
//   NULL columns inline at lines 352-462 per tick 275/276/278) —
//   this spec focuses on the write-side envelope contract instead.
//   Coverage-per-guard posture: INVERTED relative to tick 359 / 362
//   on the admin-scope surfaces. Those two ticks narrate the NON-
//   NULL/terminal branch of ck_decision_shape via the admin PATCH
//   deny + cancel + approve read-back rows (each firing status IN
//   terminal + decision_by IS NOT NULL + decision_at IS NOT NULL
//   on every green CI run against qa-admin-1's harness — three
//   probes per branch × three branches = nine NON-NULL/terminal
//   observations per pass on the admin-requests-patch-authz surface;
//   the admin-requests-list surface adds a fourth NULL/pending
//   observation via the default-status GET). This reseller-scope
//   surface hits the OPPOSITE half: TWO NULL/pending observations
//   per pass (wave-3 row 155 + wave-5 row 155-b, both INSERT paths
//   producing the birth-state pending row), and ZERO NON-NULL/
//   terminal observations (the reseller-scope POST route has no
//   update mode). Together the reseller-scope surface + the admin-
//   scope surface pair cover both branches of the ck_decision_shape
//   disjunction at module scope on distinct surfaces — the
//   reseller-scope surface owns the NULL/pending write-side + the
//   admin-scope surface pair owns the NON-NULL/terminal update-side.
//   A future decide-fixture landing tick that seeded an approved-
//   code_request row would let the reseller-scope GET surfaces
//   (requests-validation + reseller-requests-list-authz) observe
//   the NON-NULL/terminal branch from the read side too, but the
//   write-side asymmetry between INSERT (reseller) + UPDATE (admin)
//   is a structural property of the route pair, not a fixture
//   artefact — the reseller POST envelope will never observe the
//   NON-NULL branch regardless of fixture depth because the write
//   path itself cannot produce it.
//   Symmetric-cluster posture: this hoist OPENS the reseller-scope
//   summary-lens axis on the reseller_requests-row cluster, mirroring
//   the opening posture tick 359 landed on the admin-scope side
//   BEFORE ticks 360 + 361 filled the two companion summaries and
//   ticks 362-364 cross-surface twin-lifted all three onto the
//   admin list route. Distinct from ticks 359-364 in TWO dimensions:
//   (a) this is the FIRST summary on the reseller-scope surface
//   family (all three reseller-scope specs sat at 0/3 summaries
//   entering this tick per the grep above — no ck_* CHECK constraint
//   has been narrated at module scope on any reseller-scope spec);
//   (b) this narrates the NULL/pending write-side of the invariant
//   (INSERT-only route) whereas ticks 359 + 362 narrate the NON-
//   NULL/terminal update-side (PATCH-only routes) — the two halves
//   are mutually exclusive at the route level, so the two-surface-
//   family axis captures a real coverage bifurcation rather than
//   a redundant twin. Follow-on ticks can rotate along five
//   dimensions per tick 364's rotation menu adapted for the
//   reseller-scope opening: (i) hoist ck_credit_link summary
//   companion onto THIS file so the reseller-scope surface reaches
//   2/3 summary parity (matches the tick 360 companion-hoist
//   posture on the admin-scope side); (ii) hoist ck_promo_link
//   summary companion onto THIS file so the reseller-scope surface
//   reaches 3/3 summary parity (matches tick 361); (iii) cross-
//   surface twin-lift ck_decision_shape onto requests-validation.
//   spec.ts (the reseller-scope GET surface) so the invariant
//   reaches 2-surface parity within the reseller-scope pair
//   (matches tick 362); (iv) cross-surface twin-lift ck_decision_
//   shape onto reseller-requests-list-authz.spec.ts (the third
//   reseller-scope surface) so the invariant reaches 3-surface
//   parity across all three reseller-scope specs; (v) idle —
//   frontier remains tight (P1.5 + P8.5 HUMAN-BLOCKED, P11
//   never_completes, Track B closed, P10 continues accepting
//   incremental pin-tightening + summary-hoist ticks).

// Tick 366 — reseller_requests-row ck_credit_link cross-column
// invariant summary hoist onto requests-authz.spec.ts. Executes tick
// 365 next-pick option (i) verbatim: hoist the companion summary for
// the sibling ck_credit_link CHECK on the SAME reseller-scope surface
// tick 365 opened the ck_decision_shape summary on. Second of three
// reseller_requests-cluster invariant summaries this surface can
// carry (ck_decision_shape landed at tick 365; ck_promo_link pending
// at follow-on tick). Extends the tick 365 axis rather than opening
// a new one — same surface, same row-cluster, different CHECK
// constraint — so the doc-block cross-references the tick 365 header
// on this file + the tick 360 header on the sibling admin-requests-
// patch-authz.spec.ts surface (which narrates the admin-scope PATCH-
// side of the same CHECK) rather than re-deriving the reseller_
// requests column-set discovery from scratch. Post-tick 366, the
// reseller_requests-row cluster carries 5 module-scope cross-column
// invariant summaries across the admin-requests-* + reseller-scope
// surfaces combined: 3 on the admin-requests-*.spec.ts pair
// (ck_decision_shape + ck_credit_link + ck_promo_link at 3/3 ×
// 2-surface = 6 admin-scope observations per tick 364 close-out) +
// 2 on the reseller-scope surface (ck_decision_shape at tick 365 +
// ck_credit_link at this tick). Pure documentation-only doc-block
// hoist — no new imports, no new module-scope const, no per-column
// assert added, no fixture change, no route change; the existing
// UUID_RE constant declared adjacent at line 250-251 remains the
// sole module-scope const on this file.
//
// Cross-column invariant summary — reseller_requests.{request_type,
// status, linked_credit_transaction_id} ⇔ ck_credit_link
//   Writer-side source: IDENTICAL to tick 360 on the admin-requests-
//   patch-authz.spec.ts surface — DB CHECK ck_credit_link at
//   web/supabase/migrations/0095_reseller_requests.sql:48-51 enforces
//   the disjunction
//     linked_credit_transaction_id IS NULL
//     OR (request_type = 'over_budget_approval'
//         AND status = 'approved')
//   i.e. only over_budget_approval requests that reached the approved
//   terminal state may carry a non-null linked_credit_transaction_id
//   (uuid REFERENCES credit_transactions(id) ON DELETE SET NULL at
//   0095:37). The other two request_type enum values (code_request +
//   collateral_approval per the CHECK at 0095:30) and the other three
//   status enum values (pending + denied + cancelled per the CHECK at
//   0095:32) MUST leave linked_credit_transaction_id null on the
//   wire. The sibling ck_promo_link (0095:52-55) is the mirror
//   constraint on linked_promotion_code_id: permits non-null ONLY on
//   request_type='code_request' AND status='approved'. Together the
//   two link-column CHECKs form an XOR partition across the
//   request_type dimension per the tick 360 summary block on the
//   admin-requests-patch-authz.spec.ts surface — an over_budget_
//   approval approval can only stamp linked_credit_transaction_id
//   (never linked_promotion_code_id), and a code_request approval
//   can only stamp linked_promotion_code_id (never linked_credit_
//   transaction_id). The XOR is an emergent property of the two
//   orthogonal CHECKs; there is no single CHECK enforcing it
//   directly.
//   Application write path: DIFFERENT from tick 360 (which narrates
//   the admin PATCH stamper at /api/admin/resellers/requests/[id]/
//   route.ts:99-320 setting linkedCreditTransactionId inside the
//   over_budget_approval approve branch before the UPDATE). The
//   reseller-scope POST at web/src/app/api/reseller/requests/
//   route.ts:87-97 INSERTs a fresh reseller_requests row via
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
//   INSERT. So EVERY row produced by this INSERT path is born on the
//   NULL branch of ck_credit_link (linked_credit_transaction_id IS
//   NULL) — the NON-NULL branch (request_type='over_budget_approval'
//   AND status='approved' AND linked_credit_transaction_id IS NOT
//   NULL) is UNREACHABLE from this route because the reseller-scope
//   POST has no update mode, no side-effect block that mints a
//   credit_transactions row, and no linked_credit_transaction_id
//   column in its INSERT payload. The NON-NULL branch is exclusively
//   produced by the admin PATCH over_budget_approval approve branch
//   narrated in the tick 360 doc-block on the sibling admin-requests-
//   patch-authz.spec.ts surface (route.ts:209-303 reads
//   credit_balances, upserts the balance + lifetime_earned, INSERTs a
//   credit_transactions row with reason='reseller_grant_over_budget',
//   writes txRow.id into linkedCreditTransactionId, then stamps it
//   onto reseller_requests via the single UPDATE at route.ts:305-320
//   alongside status + decision_by + decision_at + decision_reason so
//   ck_decision_shape and ck_credit_link move atomically). This
//   INSERT-vs-UPDATE asymmetry — the same asymmetry tick 365 already
//   narrates for ck_decision_shape — is the reason the ck_credit_link
//   invariant needs TWO cross-surface twins to reach full coverage
//   observability at module scope: the reseller-scope surface (this
//   tick) narrates the NULL/pending-birth branch on the INSERT side +
//   the admin-scope surface (tick 360) narrates the NON-NULL/
//   approved-terminal branch on the UPDATE side — together the two
//   surfaces cover both branches of the disjunction at module scope.
//   Read path: DIFFERENT from tick 360. The reseller-scope POST
//   response envelope at web/src/app/api/reseller/requests/route.ts:
//   134-145 projects a narrower four-column tuple
//     { ok: true, request: { id, created_at, request_type, status } }
//   — omits linked_credit_transaction_id, linked_promotion_code_id,
//   decision_by, decision_at, decision_reason on purpose (the
//   reseller-facing POST envelope only echoes the four columns the
//   client needs to render a "your request has been filed"
//   confirmation). So of the three columns coupled by ck_credit_link
//   (request_type + status + linked_credit_transaction_id), the third
//   coupled column (linked_credit_transaction_id) is stripped from
//   the envelope BEFORE the wire — only request_type + status are
//   observable on this surface. Contrast with the admin-scope PATCH
//   envelope + list route which BOTH project linked_credit_
//   transaction_id explicitly (per tick 360's narration at admin-
//   requests-patch-authz.spec.ts + tick 363's narration at admin-
//   requests-list-authz.spec.ts). This means the ck_credit_link
//   invariant is observable at three different projection
//   granularities across the admin + reseller surfaces: (a) full
//   three-column tuple on the admin list route (tick 363 lens);
//   (b) three-column tuple on the admin PATCH echo (tick 360 lens);
//   (c) two-column tuple on the reseller POST envelope (this tick —
//   projects only request_type + status, strips the link column).
//   The reseller POST envelope is the narrowest of the three,
//   matching the INSERT-side coverage (only the NULL branch to
//   observe, for which projecting request_type + status is
//   sufficient — the DB-side default guarantees the link column is
//   NULL without needing an on-envelope pin).
//   Runtime enforcement in this spec: the wave-3 row 155 happy POST
//   at lines 253-317 (tick 365 narrated this same fixture set for
//   ck_decision_shape) pins body.request.request_type ===
//   "over_budget_approval" at line 314 (enum-value pin on
//   request_type — asserts one of the two coupled non-link columns
//   in the NULL/pending branch of ck_credit_link) and
//   body.request.status === "pending" at line 315 (enum-value pin
//   on status — asserts the second coupled non-link column in the
//   NULL/pending branch of ck_credit_link). The wave-5 row 155-b
//   seeder at lines 342-403 pins the same two coupled non-link
//   columns on the second INSERT so the NULL/pending birth branch
//   of ck_credit_link fires TWICE per green CI run (once per pending
//   row seeded for wave-5 row 175's deny + cancel drains). Neither
//   wave-3 row 155 nor wave-5 row 155-b asserts linked_credit_
//   transaction_id on the wire — because the third coupled column
//   is stripped from the POST envelope (see Read path above) and
//   therefore NOT observable on this surface. The pending row's DB-
//   side linked_credit_transaction_id=NULL invariant is captured by
//   the sibling read-back rows in requests-validation.spec.ts +
//   reseller-requests-list-authz.spec.ts (which enumerate the seeded
//   pending row via reseller-scope GETs; per-column pins on
//   linked_credit_transaction_id NULL land inline there — this spec
//   focuses on the write-side envelope contract instead).
//   Coverage-per-guard posture: INVERTED relative to tick 360 on the
//   admin-scope surface. That tick narrates the deny + cancel + approve
//   PATCH-branch read-back rows firing all three permutations of ck_
//   credit_link on the same over_budget_approval fixture (deny +
//   cancel fire the NULL branch via request_type='over_budget_
//   approval' AND status IN ('denied','cancelled') → link column
//   MUST be NULL; approve fires the NON-NULL branch via request_
//   type='over_budget_approval' AND status='approved' → link column
//   MUST be a UUID string — three probes on the ASYMMETRIC fixture
//   where only 1 of 3 terminal branches fires the non-null side).
//   This reseller-scope surface hits the OPPOSITE half: TWO NULL/
//   pending observations per pass (wave-3 row 155 + wave-5 row 155-b,
//   both INSERT paths producing the birth-state pending row with
//   linked_credit_transaction_id defaulting to NULL), and ZERO NON-
//   NULL/approved observations (the reseller-scope POST route has no
//   update mode + no side-effect block minting a credit_transactions
//   row). Together the reseller-scope surface + the admin-scope
//   surface pair cover both branches of the ck_credit_link
//   disjunction at module scope on distinct surfaces — the reseller-
//   scope surface owns the NULL/pending write-side + the admin-scope
//   surface owns the NON-NULL/approved update-side. Distinct from
//   tick 365's ck_decision_shape posture in ONE dimension: ck_
//   decision_shape is SYMMETRIC across the three terminal status
//   enum values on the admin-scope side (each of deny/cancel/approve
//   fires the NON-NULL branch), while ck_credit_link is ASYMMETRIC
//   on the admin-scope side (only approve fires NON-NULL; deny +
//   cancel fire NULL). So this summary inherits the tick 360
//   asymmetric-fixture posture on the admin-scope side while the
//   reseller-scope side is degenerate-symmetric (every INSERT fires
//   the same NULL branch because there is no request_type-vs-status
//   permutation reachable from the INSERT payload — the reseller-
//   scope POST cannot even ATTEMPT to write linked_credit_
//   transaction_id, let alone attempt an illegal permutation).
//   Symmetric-cluster posture: this summary hoist extends the tick
//   365 reseller_requests-row cross-column-invariant sweep on THIS
//   file — the row-cluster now carries 2/3 possible summaries (ck_
//   decision_shape landed at tick 365; ck_credit_link landing at
//   this tick 366; ck_promo_link pending at follow-on tick). Matches
//   the tick 360 axis-extension posture on the admin-scope side
//   (which extended tick 359 by landing ck_credit_link on the same
//   admin-requests-patch-authz.spec.ts surface as the second of
//   three summaries). Follow-on ticks can rotate along the same
//   dimensions tick 365's next-pick menu enumerated, now adapted for
//   the 2/3 reseller-scope parity state: (i) hoist ck_promo_link
//   summary companion onto THIS file so the reseller-scope surface
//   reaches 3/3 summary parity (matches the tick 361 close-out
//   posture on the admin-scope side); (ii) cross-surface twin-lift
//   ck_decision_shape onto requests-validation.spec.ts (the
//   reseller-scope GET surface) so ck_decision_shape reaches 2-
//   surface parity within the reseller-scope pair (matches tick
//   362); (iii) cross-surface twin-lift ck_credit_link onto
//   requests-validation.spec.ts so ck_credit_link reaches 2-surface
//   parity within the reseller-scope pair (matches tick 363);
//   (iv) cross-surface twin-lift either summary onto reseller-
//   requests-list-authz.spec.ts (the third reseller-scope surface)
//   for 3-surface parity; (v) rotate to the /admin/resellers/
//   requests/[id] detail surface for a THIRD-surface companion of
//   any of the three admin summaries; (vi) idle — frontier remains
//   tight (P1.5 + P8.5 HUMAN-BLOCKED, P11 never_completes, Track B
//   closed, P10 continues accepting incremental pin-tightening +
//   summary-hoist ticks).

test.describe("Reseller requests — P10 wave-3 happy path", () => {
  test("active_wholesale — POST as reseller-admin with over_budget_approval payload returns 201 with request.id", async ({
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
    if (!fixture || !fixture.adminUserId || !fixture.attributedUserId) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
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
    const resp = await page.request.post(ROUTE, {
      data: {
        request_type: "over_budget_approval",
        payload: {
          target_user_id: targetUserId,
          requested_amount: 1,
          reason: "p10_wave3_row_155_happy_probe",
        },
      },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `active_wholesale + happy returned ${resp.status()} — expected 201 with request.id. A 403 capability_disabled here means the QAPROBEWHOLESALEACTIVE reseller row has can_grant_credits=false (seed drift — reseller-fixture defaults to true). A 400 target_user_id_required means fixture.attributedUserId slipped past the null guard (seed drift). A 5xx means the reseller_requests INSERT or reseller_audit_log chain leaked through. Body: ${await resp.text()}`,
    ).toBe(201);
    const body = (await resp.json()) as {
      ok: boolean;
      request?: {
        id?: string;
        request_type?: string;
        status?: string;
        created_at?: string;
      };
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale + happy body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(typeof body.request?.id).toBe("string");
    expect(body.request?.id ?? "").toMatch(UUID_RE);
    expect(body.request?.request_type).toBe("over_budget_approval");
    expect(body.request?.status).toBe("pending");
  });
});

// P10 wave-5 row 155-b — seed a SECOND pending over_budget_approval row so
// wave-5 row 175's cancel branch has a pending row available even after the
// deny branch has consumed row 155's original seed. Tick 163's next-tick
// option (v) documented this: "extend row 175 to cover the cancel branch by
// adding a row-155-b seeder (or extending row 155's seed loop) that inserts
// a second over_budget_approval pending row per CI pass." over_budget_approval
// carries no partial unique index (see 0095:71-73 — only code_request does)
// so a second pending row inserts cleanly without a 409 duplicate collision.
//
// This block is a distinct test.describe rather than an extra POST inside
// row 155's happy test so the row 155 assertion set stays a single-request
// contract per the wave-3 preflight finding (tick 152): each row asserts
// one route response so a regression pinpoints one HTTP transaction. The
// second row seeds a second reseller_requests row + second
// reseller_audit_log row per CI pass — steady-state net-of-row-175 the
// pending queue nets to zero (row 155 seed → row 175 deny consumes it;
// row 155-b seed → row 175 cancel consumes it).
//
// The reason string is intentionally distinct from row 155
// ("p10_wave5_row_175_b_cancel_seed" vs "p10_wave3_row_155_happy_probe") so
// the audit-log write is disambiguated when wave-5 row 179 lands and reads
// reseller_audit_log rows by decision_reason.
test.describe("Reseller requests — P10 wave-5 row 155-b cancel-branch seeder", () => {
  test("active_wholesale — POST a second pending over_budget_approval row so row 175 cancel has a target", async ({
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
    if (!fixture || !fixture.adminUserId || !fixture.attributedUserId) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
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
    const resp = await page.request.post(ROUTE, {
      data: {
        request_type: "over_budget_approval",
        payload: {
          target_user_id: targetUserId,
          requested_amount: 1,
          reason: "p10_wave5_row_175_b_cancel_seed",
        },
      },
      headers: { "content-type": "application/json" },
    });
    expect(
      resp.status(),
      `active_wholesale + 155-b returned ${resp.status()} — expected 201 with request.id. Same route as row 155 so the same 400/403/409/5xx failure modes surface here first before row 175 cancel runs. Body: ${await resp.text()}`,
    ).toBe(201);
    const body = (await resp.json()) as {
      ok: boolean;
      request?: {
        id?: string;
        request_type?: string;
        status?: string;
      };
      reason?: string;
    };
    expect(
      body.ok,
      `active_wholesale + 155-b body.ok should be true: ${JSON.stringify(body)}`,
    ).toBe(true);
    expect(typeof body.request?.id).toBe("string");
    expect(body.request?.id ?? "").toMatch(UUID_RE);
    expect(body.request?.request_type).toBe("over_budget_approval");
    expect(body.request?.status).toBe("pending");
  });
});
