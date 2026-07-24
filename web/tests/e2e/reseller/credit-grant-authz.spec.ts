// POST /api/reseller/credits/grant pre-write authorization contract —
// P10 dry-run per plan §U.4 (reseller capabilities) and §J.2 (Playwright
// must cover the reseller-admin endpoints so a regression in the auth →
// feature-gate → scope → decideReveal → decideGrant ordering surfaces before
// the endpoint fires the credit_balances upsert / credit_transactions insert /
// reseller_credit_grants mirror / reseller_audit_log(grant_credits) row).
//
// Track A P6.3 shipped tick 26 (see reseller-module-goal.md P6.3_grant_api).
// credit-grant-validation.spec.ts already covers the input-validation
// branches surfaced after the auth gate (invalid_body / missing_id /
// invalid_id / not_in_scope / invalid_amount) but skips the pre-scope
// auth-chain rows because they need harness-free session shapes rather
// than the QA_RESELLER_ADMIN_EMAIL / QA_RESELLER_ATTRIBUTED_CUSTOMER_ID
// pair. This spec closes that gap alongside the other reseller-lens
// auth-chain specs (reveal-email tick 100, drawer tick 101, me tick 102,
// admin-* ticks 103-111, reseller-crons tick 112, create-startup tick 113,
// showcase-reviews tick 114).
//
// Two branches are harness-free and safe against staging (no rows written
// to credit_balances / credit_transactions / reseller_credit_grants /
// reseller_audit_log):
//
//   1. unauthenticated       — POST with no session          → 401 error="Authentication required"
//                              (gateRequireFeature bails at getCurrentUser()
//                              null before scope, allowedCustomerIds,
//                              decideReveal, decideGrant, or any DB read)
//   2. non_reseller_admin    — POST as a founder QA account  → 402 error="feature_locked", feature="reseller.grant_credits"
//                              (gateRequireFeature bails because founder plans
//                              do not grant reseller.grant_credits;
//                              scopedReseller never runs and reseller_admins
//                              is never queried)
//
// Route reference: web/src/app/api/reseller/credits/grant/route.ts
//   Line 53-54: gateRequireFeature("reseller.grant_credits") → 401/402
//   Line 57-65: scopedReseller(user) throws                  → 403 { reason: err.code }
//   Line 67-70: req.json() null / bad JSON                   → 400 { reason: "invalid_body" }
//   Line 82-87: decideReveal(target_user_id, allowed)        → 400 missing/invalid_id | 403 not_in_scope
//   Line 89-92: getSupabaseAdmin() null                      → 503 { reason: "not_configured" }
//   Line 96-99: !self (reseller_admins → no resellers)       → 404 { reason: "reseller_missing" }
//   Line 103-113: reseller_credit_grants rollup SELECT       → 500 { reason: "rollup_failed" }
//   Line 120-148: decideGrant                                 → 400 invalid_amount | 403 capability_disabled | 402 over_budget_requires_approval
//   Line 152-224: credit_balances upsert + credit_transactions
//                 insert + reseller_credit_grants mirror     → 500 each on failure
//   Line 227-248: db.auditLog(action='grant_credits')        → 500 { reason: "audit_failed" }
//   Line 250-260: 200 { ok:true, balance, credit_transaction_id, ... }
//
// The auth-chain rows probe LINE 53-54 exclusively — rows 3-onwards need
// either QA_RESELLER_ADMIN_EMAIL session (rows 3-N) or per-test seeding
// which plan §J.2 forbids.
//
// Body shape sent on both probes: a syntactically-valid POST body with a
// well-formed uuid target_user_id + positive integer amount so that IF the
// auth gate were to leak (regression), the request would still be a
// realistic grant attempt and the resulting error surface (403 not_in_scope
// or downstream) would be a legitimate signal — never a false positive
// from a malformed body bailing at the wrong branch.
//
// Deliberately out of scope (needs the reseller QA harness or per-test
// seeding which plan §J.2 forbids):
//   - insufficient_role / no_membership (403) — needs a reseller admin
//     with a specific role or a mismatched reseller_admins state.
//   - reseller_missing (404) — needs a reseller_admins row without a
//     matching resellers row (edge case; per-test seeding).
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which
//     would break every other Playwright spec running in the same worker.
//   - capability_disabled (403) — needs a reseller row with
//     can_grant_credits=false; per-test seeding.
//   - over_budget_requires_approval (402) — needs a reseller row with
//     monthly_credit_budget set + prior reseller_credit_grants rows
//     summing to > budget; per-test seeding.
//   - Happy path (200) — fires the full 4-write chain (credit_balances +
//     credit_transactions + reseller_credit_grants + reseller_audit_log)
//     against the harness reseller + attributed customer; belongs to the
//     temp-reseller mint fixture follow-up alongside ticks 94..114.
//
// Placeholder UUIDs: all-zeros values that will never match a real
// app_users.id or reseller_attributions.subject_user_id row because the
// signup flow uses crypto.randomUUID(); the auth gate should reject the
// request BEFORE decideReveal walks these values.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

const ROUTE = "/api/reseller/credits/grant";
const PLACEHOLDER_TARGET_USER_ID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_AMOUNT = 10;

// Shared UUID_RE hoisted at tick 216 so every chained-POST body in rows
// 156 / 156b / 156c can pin the per-response credit_transaction_id shape
// (the FK-echo lens the DB companion in audit-log-writes.spec.ts landed
// via ticks 211-213). Row 152's single-POST assertion also switches to
// this constant for consistency; the regex is identical to the sibling
// UUID_RE in credit-grant-validation.spec.ts:250 + reseller-requests-
// list-authz.spec.ts:73 + admin-requests-list-authz.spec.ts:81 so the
// shape check reads the same across the reseller spec cluster.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NON_RESELLER_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

// Tick 374 — reseller_credit_grants row-cluster cross-column invariant summary
// (option (ii) from tick 373 next-picks). Rotates off the reseller_requests-
// row cluster (which reached 15-summary saturation at tick 373) onto the
// reseller_credit_grants row cluster, whose four CHECK constraints (defined
// at web/supabase/migrations/0096_reseller_credit_grants.sql:41-56) partition
// the kind ∈ {grant, sandbox_spend} discriminator across amount sign, target
// shape, and credit_transactions FK link:
//   - ck_amount_sign     (0096:41-44) — grant⇒amount>0; sandbox_spend⇒amount<0
//   - ck_month_key_format (0096:46)   — month_key matches /^[0-9]{4}-(0[1-9]|
//                                       1[0-2])$/ (UTC currentMonthKey())
//   - ck_target_shape    (0096:48-51) — grant⇒target_user_id set + sandbox_
//                                       project_id null; sandbox_spend⇒inverse
//   - ck_ct_link         (0096:53-56) — grant⇒credit_transaction_id set;
//                                       sandbox_spend⇒credit_transaction_id null
// Write-path anchor: the happy-path grant mirror at web/src/app/api/reseller/
// credits/grant/route.ts:206-218 populates kind='grant', amount=body.amount
// (positive integer per decideGrant gate 1), month_key=currentMonthKey(),
// target_user_id=body.target_user_id, credit_transaction_id=<row from ct
// insert>, sandbox_project_id=null — one row per happy POST always sits on
// the grant branch of all four CHECKs. sandbox_spend rows are exclusively
// produced by web/src/app/api/reseller/sandbox/spend/route.ts and never
// surface on this spec — the sandbox-spend branch of every CHECK is
// UNREACHABLE from the credit-grant surface by construction.
// Runtime enforcement on this spec: rows 150 (capability_disabled 403) +
// 151 (over_budget 402) + 152 (happy 200) all send positive integer amount
// + non-null uuid target_user_id + null sandbox_project_id, so every
// candidate insert-payload that would have reached line 206-218 lands on
// the grant branch of ck_amount_sign / ck_target_shape / ck_ct_link;
// month_key is server-computed via currentMonthKey() so ck_month_key_format
// is closed on the server, not per-request. Coverage-per-guard posture on
// this surface: grant branch fires on every happy row (row 152 + chained
// 156/156b/156c); sandbox_spend branch ZERO-COVERAGE-PER-GUARD (belongs to
// the sandbox-spend spec cluster).

// Tick 385 — reseller_attributions row-cluster cross-column invariant summary
// (option (i) from tick 384 next-picks). Cross-surface twin-lift of the tick
// 376/377/378/379/380/381/382/383/384 module-scope summary onto credit-grant-
// authz.spec.ts — the TENTH reseller_attributions-touching surface and the
// FIRST HYBRID-ANCHOR coverage on the cluster (this spec exercises TWO
// distinct read-anchor subsets on a single file: the auth-chain rows
// (unauthenticated 401 + non_reseller_admin 402) open a FOURTH DISTINCT
// anchor subset PRE-SCOPE-AUTH/ENTITLEMENT-GATE, while the wave-3 rows
// 150/151/152 sit on the pre-existing scopedReseller allowedCustomerIds()
// subset via decideReveal at credits/grant/route.ts:82-87). Raises 10/16
// surface parity on the reseller_attributions row cluster; 6 sibling
// touching surfaces still pending (credit-grant-validation, audit-log-
// writes, audit-anomaly-scan, sandbox-setup-authz, admin-reseller-detail-
// authz, admin-reseller-detail-validation).
//
// The reseller_attributions row cluster carries FIVE invariants at
// web/supabase/migrations/0091_reseller_module_foundations.sql:112-142
// (IDENTICAL enumeration to tick 376/377/378/379/380/381/382/383/384):
//   - ck_subject_fk_matches_type (0091:128-132) — CROSS-COLUMN: subject_type=
//                                                  'user'⇒subject_user_id set
//                                                  + subject_project_id null;
//                                                  subject_type='project'⇒
//                                                  inverse
//   - subject_type CHECK          (0091:115)     — subject_type ∈ {user,
//                                                  project}
//   - status CHECK                (0091:118-119) — status ∈ {active, revoked}
//   - source CHECK                (0091:123)     — source ∈ {code,
//                                                  provisioned, admin_manual}
//   - reseller_attributions_active_project_uniq (0091:137-139) — PARTIAL-
//                                                  UNIQUE INDEX on
//                                                  subject_project_id WHERE
//                                                  subject_type='project'
//                                                  AND status='active' AND
//                                                  opted_out=false
//
// Writer-side source: IDENTICAL to tick 376-384 — DB CHECK + partial-unique
// guards at 0091:112-142 wrap every reseller_attributions insert; the 'user'
// branch of ck_subject_fk_matches_type is UNREACHABLE-BY-CONSTRUCTION from
// every current write path (grep audit: retail-attribution.ts:165-172 +
// create-startup/route.ts:301-313 both hard-code subject_type='project' +
// subject_project_id=<uuid> + subject_user_id=null).
//
// Application read-path anchor for THIS surface: KEY DELTA vs tick 376-384
// — this spec is HYBRID and opens the FOURTH DISTINCT read-anchor subset:
//   - Rows 1+2 (auth-chain: unauthenticated 401 + non_reseller_admin 402)
//     bail at gateRequireFeature("reseller.grant_credits") at credits/
//     grant/route.ts:53-54 BEFORE scopedReseller(user) runs, BEFORE
//     allowedCustomerIds() is called, BEFORE decideReveal reads
//     reseller_attributions. The cluster is COMPLETELY BYPASSED at the
//     auth/entitlement gate — a fourth annotation dimension, CROSS-
//     BOUNDARY-INVISIBLE-BY-AUTH-GATE (unauth) + CROSS-BOUNDARY-INVISIBLE-
//     BY-ENTITLEMENT-GATE (non_reseller_admin), that only applies to pre-
//     scope refusal probes. Distinct from tick 384's workspace-owner
//     anchor because those routes NEVER read the cluster in ANY branch of
//     ANY session (structural non-read); here the same route READS the
//     cluster on later rows but the auth/entitlement gate short-circuits
//     the read on this specific session-shape.
//   - Rows 150/151/152 (wave-3 harness-required rows) sit on the pre-
//     existing scopedReseller allowedCustomerIds() subset (tick 376-382
//     anchor) via decideReveal(target_user_id, allowed) at credits/grant/
//     route.ts:82-87 which resolves allowed = scopedReseller(user)
//     .allowedCustomerIds() from scope.ts:63-84. Positively consumes the
//     (reseller_id, status='active', opted_out=false) set to authorize
//     the target_user_id against the reseller's attributed customer list
//     BEFORE decideGrant fires.
//
// Runtime enforcement on THIS spec: HYBRID from every prior twin-lift.
// The two auth-chain rows fire session-less / founder-QA session against
// the reseller-scoped endpoint AND the refusal at 401/402 must fire
// REGARDLESS of any reseller_attributions row that may or may not exist
// for the placeholder target_user_id (which is all-zeros and won't match
// any real row anyway). The three wave-3 rows fire a reseller-admin
// session against the fixture-seeded reseller_attributions(reseller_id,
// subject_user_id=fixture.attributedUserId, status='active', opted_out=
// false) row via decideReveal so that decideGrant reaches its gate 2/5
// discriminator without bailing at 'not_in_scope' first — the
// fixture.attributionExists guard skips the wave-3 rows cleanly when the
// seed script has not run on this host.
//
// Coverage-per-guard posture on this surface: HYBRID.
//   - Auth-chain rows: ZERO-COVERAGE-PER-GUARD on all five CHECK/index
//     invariants (route never touches the cluster on this session-shape);
//     'user' branch of ck_subject_fk_matches_type carries UNREACHABLE-BY-
//     CONSTRUCTION + DEAD-CODE-AT-READ + CROSS-COLUMN-INVISIBLE-BY-
//     PROJECTION (tick 383) + CROSS-BOUNDARY-INVISIBLE-BY-ROUTE-CHOICE
//     (tick 384) + now also CROSS-BOUNDARY-INVISIBLE-BY-AUTH-GATE (this
//     tick) posture on the new pre-scope-auth-gate subset.
//   - Wave-3 rows: positively consumes the 'project' branch of
//     ck_subject_fk_matches_type via decideReveal's allowed set (subject_
//     type='project' filter in allowedCustomerIds); status='active' AND
//     opted_out=false filters both fire; source enum branches ZERO-
//     COVERAGE-PER-GUARD (source is not projected here, only reseller_id
//     + subject_user_id + status + opted_out).
//
// Symmetric-cluster posture: THIS surface OPENS the PRE-SCOPE-AUTH/
// ENTITLEMENT-GATE negative-space read-anchor subset on the cluster
// (previously empty — 0/1 within its own subset, now 1/1). Combined post-
// tick 385 posture: 10/16 total surfaces summarised on the cluster
// (create-startup-authz tick 376 + create-startup-validation tick 377 +
// attribution-timing tick 378 + drawer-authz tick 379 + drawer-validation
// tick 380 + reveal-email-authz tick 381 + reveal-email-validation tick
// 382 + me-attribution tick 383 + scope-boundary tick 384 + credit-grant-
// authz this tick — opens the pre-scope-auth/entitlement-gate hybrid
// anchor subset). Four distinct read-anchor subsets now co-exist under
// a single cluster's cross-column invariant summary: (a) scopedReseller
// .allowedCustomerIds() [8 surfaces incl. this tick's wave-3 rows], (b)
// app_users.attribution_reseller_id cache projection [1 surface], (c)
// workspace-owner non-cluster refusal [1 surface], (d) pre-scope-auth/
// entitlement-gate short-circuit [1 surface — this tick's auth-chain
// rows].
//
// Diagnostic delta of the pass: pure documentation-only doc-block hoist —
// no new imports, no new module-scope constants, no per-column assert
// added, no fixture change, no route change, no migration change. Doc-
// block placed after the tick 374 reseller_credit_grants cluster summary
// (line ~139 pre-edit) and before the first test.describe (line ~141
// pre-edit), matching the tick 376-384 placement discipline (last
// module-scope const or prior cluster summary immediately preceding the
// first test.describe). Twin-lift now spans a heterogeneous read-anchor
// set — eight surfaces anchor at scope.ts:63-84 allowedCustomerIds()
// (incl. this tick's wave-3 rows), one at the app_users.attribution_
// reseller_id cache column, one at the workspace-owner non-cluster
// refusal, and one at the pre-scope-auth/entitlement-gate short-circuit
// (this tick's auth-chain rows) — four distinct anchor subsets now
// documented under a single cluster's cross-column invariant summary.

test.describe("Reseller credit-grant pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — POST with no session returns 401", async ({ request }) => {
    const resp = await request.post(ROUTE, {
      data: { target_user_id: PLACEHOLDER_TARGET_USER_ID, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before scope, decideReveal, decideGrant, or any DB read. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; error?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  test("non_reseller_admin — POST as a founder QA account returns 402 feature_locked", async ({
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
      data: { target_user_id: PLACEHOLDER_TARGET_USER_ID, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `non_reseller_admin returned ${resp.status()} — expected 402 (feature_locked) before scope, decideReveal, decideGrant, or any DB read. Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      error?: string;
      feature?: string;
      reason?: string;
    };
    expect(
      body.ok,
      `non_reseller_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.error).toBe("feature_locked");
    expect(body.feature).toBe("reseller.grant_credits");
  });
});

// P10 wave-3 row 150 — no_capability variant probes decideGrant() gate 2
// (`!can_grant_credits` → capability_disabled) via the credit-grant-authz.spec
// surface. Order per web/src/lib/reseller/credit-grants.ts:117-121 (decideGrant):
//   1. !isFinite || amount<=0 || !isInteger → invalid_amount   (400)
//   2. !can_grant_credits                   → capability_disabled ← THIS
//   3. projected <= monthly_credit_budget   → ok / over_budget=false
//   4. admin_over_budget_approved           → ok / over_budget=true
//   5. otherwise                            → over_budget_requires_approval (402)
//
// no_capability seed shape (web/scripts/seed-qa-reseller.mjs:119-131):
//   status="active", billing_model="wholesale", can_grant_credits=false,
//   monthly_credit_budget=20000 → gate 1 passes on positive integer amount,
//   gate 2 fires before any budget arithmetic can short-circuit the assertion.
//
// Route mapping (credits/grant/route.ts:128-134):
//   invalid_amount           → 400
//   capability_disabled      → 403                                       ← THIS
//   over_budget_requires_..  → 402
//
// Body shape mirrors the unauthenticated + non_reseller_admin probes above
// (positive integer amount + fixture.attributedUserId as target_user_id) so
// the only variance is the session identity and the expected status.
//
// Prerequisite: finding-2's coupled seed + fixture delta (tick 198) — the
// seed script now plants a reseller_attributions row against the no_capability
// variant so decideReveal() clears `not_in_scope` (403) BEFORE decideGrant
// fires. If the seed re-run against staging has not landed on this host,
// `fixture.attributionExists` stays false and the spec skips cleanly.
test.describe("Credit-grant × no_capability × capability_disabled — P10 wave-3 row 150", () => {
  test("no_capability — POST as reseller-admin returns 403 with reason=capability_disabled", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("no_capability");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('no_capability') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("no_capability"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_capability"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: { target_user_id: targetUserId, amount: PLACEHOLDER_AMOUNT },
    });
    expect(
      resp.status(),
      `no_capability returned ${resp.status()} — expected 403 (decideGrant gate 2). Body: ${await resp.text()}`,
    ).toBe(403);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      monthly_credit_budget?: number;
      already_granted_this_month?: number;
      remaining_budget?: number;
    };
    expect(
      body.ok,
      `no_capability body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("capability_disabled");
  });
});

// P10 wave-3 row 151 — no_budget variant probes decideGrant() gate 5
// (`projected > monthly_credit_budget && !admin_over_budget_approved` →
// over_budget_requires_approval) via the credit-grant-authz.spec surface.
// Same decideGrant order as row 150; here can_grant_credits=true so gate 2
// clears and monthly_credit_budget=100 forces gate 5 for any amount > 100
// (with already_granted_this_month=0 on a fresh reseller).
//
// no_budget seed shape (web/scripts/seed-qa-reseller.mjs:145-157):
//   status="active", billing_model="wholesale", can_grant_credits=true,
//   monthly_credit_budget=100 → gate 1 passes on positive integer amount,
//   gate 2 clears (can_grant_credits=true), gate 5 fires when amount > 100.
//
// Route mapping (credits/grant/route.ts:128-134):
//   invalid_amount           → 400
//   capability_disabled      → 403
//   over_budget_requires_..  → 402                                       ← THIS
//
// amount=200 chosen so the over-budget condition holds even if a prior spec
// run (or an admin-approve fan-out from row 175 when it lands) inserted a
// small grant into reseller_credit_grants for the current month_key —
// the endpoint returns 402 BEFORE the mirror insert so no side effect
// accumulates from failed calls, but a healthy safety margin over the 100
// budget avoids a false negative under any accumulated state.
//
// Prerequisite: same finding-2 coupled seed + fixture delta as row 150 —
// the seed script plants a reseller_attributions row against the no_budget
// variant so decideReveal() clears `not_in_scope` BEFORE decideGrant fires.
test.describe("Credit-grant × no_budget × over_budget_requires_approval — P10 wave-3 row 151", () => {
  test("no_budget — POST as reseller-admin returns 402 with reason=over_budget_requires_approval", async ({
    page,
  }) => {
    let fixture: TempResellerFixture | null;
    try {
      fixture = await loadTempReseller("no_budget");
    } catch (err) {
      test.skip(
        true,
        `loadTempReseller('no_budget') threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_budget"),
      );
      return;
    }
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("no_budget"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${fixture.adminEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("no_budget"),
      );
      return;
    }
    const resp = await page.request.post(ROUTE, {
      data: { target_user_id: targetUserId, amount: 200 },
    });
    expect(
      resp.status(),
      `no_budget returned ${resp.status()} — expected 402 (decideGrant gate 5). Body: ${await resp.text()}`,
    ).toBe(402);
    const body = (await resp.json()) as {
      ok: boolean;
      reason?: string;
      monthly_credit_budget?: number;
      already_granted_this_month?: number;
      remaining_budget?: number;
    };
    expect(
      body.ok,
      `no_budget body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("over_budget_requires_approval");
    expect(
      body.monthly_credit_budget,
      `no_budget body.monthly_credit_budget should surface the reseller's seeded 100 cap: ${JSON.stringify(body)}`,
    ).toBe(100);
  });
});

// P10 wave-3 row 152 — active_wholesale variant probes decideGrant() gate 3
// (`projected <= monthly_credit_budget && can_grant_credits` → within-budget
// self-approve → ok, over_budget=false) via the credit-grant-authz.spec
// surface. Same decideGrant order as rows 150 + 151; here can_grant_credits=
// true clears gate 2, and monthly_credit_budget=20000 (per seed-qa-reseller
// active_wholesale defaults) plus already_granted_this_month=0 on a fresh
// reseller keeps `amount=5` well under budget so gate 3 fires the full
// 4-write chain:
//   credit_balances UPSERT           (route.ts:169-179)
//   credit_transactions INSERT       (route.ts:187-198, stamps
//                                     granted_by_reseller_id + metadata)
//   reseller_credit_grants mirror    (route.ts:206-218, kind='grant',
//                                     over_budget=false, month_key=UTC now,
//                                     granted_by_user_id=adminUserId)
//   reseller_audit_log grant_credits (route.ts:227-242, append-only per 0093)
//
// Route mapping (credits/grant/route.ts:250-260):
//   ok:true, balance, credit_transaction_id, over_budget:false, month_key,
//   remaining_budget — this is the only 200 branch, so shape assertions
//   here also pin the response envelope contract.
//
// amount=5 chosen deliberately: small enough that a prior spec run's
// leftover reseller_credit_grants row for the current month (from a failed
// cleanup on an older tick) still leaves ~19995 headroom before gate 5
// fires, so the row remains stable under CI replay against the same
// (reseller, month) pair. The 4-write chain is scoped by
// `attachGrantSelfApprove()`'s since cursor so cross-run accumulation on
// credit_transactions + reseller_credit_grants is cleaned by
// `fixture.cleanup()` — only the append-only reseller_audit_log rows
// accumulate (matches the audit-log-writes.spec.ts posture where append-
// only accumulation is expected).
//
// Prerequisite: same finding-2 coupled seed + fixture delta as rows 150 +
// 151 — the seed script plants a reseller_attributions row against the
// active_wholesale variant so `allowedCustomerIds()` (scope.ts:61-89)
// returns the attributed founder and decideReveal() clears `not_in_scope`
// (403) BEFORE decideGrant fires. The active_wholesale variant is the ONE
// variant the seed script mints promotion codes for (per
// ck_stripe_objects_by_tier), but this test only probes the grant path so
// promotion codes are irrelevant here.
test.describe("Credit-grant × active_wholesale × happy 200 — P10 wave-3 row 152", () => {
  test("active_wholesale — POST as reseller-admin returns 200 with ok=true + credit_transaction_id", async ({
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
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    const AMOUNT = 5;
    try {
      // Stamp the attribution_reseller_id cache column so downstream reads
      // (co-branding pill, /api/reseller/me, etc.) see the attributed
      // reseller — matches the wave-2 row 145 attach recipe used by
      // drawer-authz.spec.ts and reveal-email-authz.spec.ts. Not strictly
      // required for /api/reseller/credits/grant (scope.ts:61 reads from
      // reseller_attributions, not the cache column) but keeps the fixture
      // state consistent with the wave-2 posture.
      const attributed = await fixture.attachAttributedCustomer();
      if (!attributed) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      // Snapshot credit_balances + register the restore closure BEFORE the
      // POST so a mid-request failure still gets swept by fixture.cleanup()
      // in the finally block. attachGrantSelfApprove captures a since
      // cursor + snapshots (balance, lifetime_earned) so cleanup() can
      // reverse the 4-write fan-out — see the helper's doc-comment for
      // the reseller_audit_log append-only carve-out.
      const grant = await fixture.attachGrantSelfApprove({ amount: AMOUNT });
      if (!grant) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore = grant.balanceBefore ?? 0;
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
        data: { target_user_id: targetUserId, amount: AMOUNT },
      });
      expect(
        resp.status(),
        `active_wholesale returned ${resp.status()} — expected 200 with the full self-approve envelope. Body: ${await resp.text()}`,
      ).toBe(200);
      const body = (await resp.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
        reason?: string;
      };
      expect(
        body.ok,
        `active_wholesale body.ok should be true: ${JSON.stringify(body)}`,
      ).toBe(true);
      // credit_transaction_id is the newly-inserted credit_transactions.id
      // stamped at route.ts:197-198; a string UUID is the only valid shape
      // here — a null would flag a mirror-insert regression that returned
      // 200 without cleaning up the transaction row.
      expect(typeof body.credit_transaction_id).toBe("string");
      expect(body.credit_transaction_id ?? "").toMatch(UUID_RE);
      // over_budget=false pins gate 3 (within-budget path) vs gate 4
      // (admin_over_budget_approved=true → over_budget=true) so a route
      // regression that accidentally set over_budget=true on the happy
      // path would surface here even though both branches return 200.
      expect(body.over_budget).toBe(false);
      // balance echoes the post-UPSERT credit_balances.balance value; must
      // equal (snapshot ?? 0) + AMOUNT so an off-by-one at route.ts:166
      // (`newBalance = currentBalance + amount`) surfaces. Note: parallel
      // grants from another spec sharing this founder could inflate the
      // snapshot mid-run; the fixture is single-instance-per-worker so
      // this stays deterministic under Playwright's default parallelism.
      expect(body.balance).toBe(balanceBefore + AMOUNT);
      // month_key must be a YYYY-MM slug (route.ts:214 stamps monthKey(new
      // Date()) from credit-grants.ts). A shape drift here would flag a
      // month_key helper regression that the credit-reset cron also
      // depends on.
      expect(typeof body.month_key).toBe("string");
      expect(body.month_key ?? "").toMatch(/^\d{4}-\d{2}$/);
      // remaining_budget must be a non-negative integer (route.ts:256-259
      // clamps at 0 via Math.max) — a negative would signal an overflow
      // in the budget arithmetic under a large seeded already_granted_
      // this_month value.
      expect(typeof body.remaining_budget).toBe("number");
      expect(body.remaining_budget ?? -1).toBeGreaterThanOrEqual(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

// P10 wave-3 row 156 — balance-readback chain probes the
// credit_balances UPSERT → route.ts response-envelope path across TWO
// sequential grants against the same fixture user. Where row 152 pins the
// single-grant response envelope + the balance-arithmetic identity
// (body.balance === balanceBefore + amount), row 156 pins the CHAINED
// identity: a second grant issued against the freshly-mutated balance
// must read back `balanceBefore + amount_first + amount_second`. A route
// regression that (a) stopped reading from credit_balances before the
// UPSERT and instead re-echoed a stale in-memory snapshot, or (b) split
// the UPSERT into an INSERT-only branch that ignored the existing row on
// the second call, or (c) short-circuited the `newBalance = currentBalance
// + amount` line at route.ts:166 into `newBalance = amount`, would let
// row 152's single-grant envelope stay green while this row surfaces the
// arithmetic drift on the second POST.
//
// amounts = 5 then 3 chosen deliberately: distinct prime-ish values so
// a `balance = amount` regression on POST 2 (returning 3 instead of 8)
// would flag not just as "wrong" but as "matches the second POST amount,
// dropped the accumulation" — the assertion pins body2.balance ===
// grant2.balanceBefore + 3 which is exactly grant1.balanceBefore + 8 on
// a fresh (or restore-swept) reseller. Both amounts small enough that
// the running-total (8) stays well under monthly_credit_budget=20000
// per seed-qa-reseller active_wholesale defaults so gate 3 fires on
// both POSTs without ever tripping over_budget_requires_approval (402);
// budget headroom identical to row 152's single-grant CI-replay posture.
//
// Cleanup topology under LIFO restore-closure order: attachGrantSelfApprove
// pushes closure A (snapshot balance=B0, since=T1) before POST 1, then
// pushes closure B (snapshot balance=B0+5, since=T2) before POST 2. On
// cleanup, closure B pops first — deletes reseller_credit_grants +
// credit_transactions rows created >= T2 (just the POST 2 row) and
// upserts credit_balances back to B0+5. Then closure A pops — deletes
// rows created >= T1 (POST 1's row) and either restores balance to B0
// (row existed pre-POST-1) or deletes the balance row (fresh insert
// path). Net effect: the pre-attach reseller-side state is atomically
// restored, matching the wave-3 self-approve cleanup guarantee row 152
// depends on for CI replay stability.
//
// This block sits in credit-grant-authz.spec.ts (not audit-log-writes)
// per the same topology row 152 established: authz specs own the HTTP
// wire contract (status codes + envelope shape + response arithmetic);
// audit-log-writes.spec.ts owns the append-only ledger + mirror-row
// side effects (rows 154 + 155). A future row 156b that walks the
// third-grant identity (e.g. amount=2 → body3.balance = balance_after_2
// + 2) would sit alongside this block; the fixture helper already
// supports arbitrary attachGrantSelfApprove chains via the restore
// stack.
test.describe("Credit-grant × active_wholesale × balance-readback chain — P10 wave-3 row 156", () => {
  test("active_wholesale — two chained POSTs return balances 5 then 8 against a fresh reseller", async ({
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
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    const AMOUNT_ONE = 5;
    const AMOUNT_TWO = 3;
    try {
      const attributed = await fixture.attachAttributedCustomer();
      if (!attributed) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      // Snapshot #1 — captures balance BEFORE the first POST + registers
      // the outermost restore closure. attachGrantSelfApprove returns a
      // per-call `balanceBefore` number|null echoed from credit_balances
      // read; null iff the row does not exist yet (fresh reseller/founder
      // pair), which the arithmetic assertions coerce to 0.
      const grant1 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_ONE });
      if (!grant1) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore1 = grant1.balanceBefore ?? 0;
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
      const resp1 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200 with the full self-approve envelope. Body: ${await resp1.text()}`,
      ).toBe(200);
      const body1 = (await resp1.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(body1.over_budget).toBe(false);
      // Pin the first-grant arithmetic identity — same shape as row 152's
      // assertion but scoped to grant1's snapshot so a leftover
      // credit_balances row from a prior failed run does not false-fail
      // this row on absolute values.
      expect(body1.balance).toBe(balanceBefore1 + AMOUNT_ONE);
      // Pin body1.credit_transaction_id shape (tick 216 FK-echo lens) —
      // every chain-body must echo a well-formed UUID matching the
      // credit_transactions.id inserted at route.ts:174-198. Rows 152's
      // single-POST already carries this pin; extending it onto EVERY
      // chain body gives the HTTP surface parity with the DB companion's
      // FK-echo lens landed via ticks 211-213 on audit-log-writes.spec.ts
      // mirrorCount+FK-shape checks. A route regression that stripped the
      // credit_transaction_id off the intermediate 200 payload while the
      // final POST's payload still carried it would leave row 156's
      // distinctness pin at line 660 green (both null → !== fails, but
      // the earlier per-body shape pin catches null first).
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #2 — reads credit_balances AFTER POST 1's UPSERT, so
      // balanceBefore2 must equal balanceBefore1 + AMOUNT_ONE. If a route
      // regression left credit_balances unchanged post-UPSERT, this pin
      // would surface it before the chained arithmetic pin does.
      const grant2 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_TWO });
      if (!grant2) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore2 = grant2.balanceBefore ?? 0;
      expect(
        balanceBefore2,
        `credit_balances readback after POST 1 should equal balanceBefore1 + ${AMOUNT_ONE}: ` +
          `got ${balanceBefore2}, expected ${balanceBefore1 + AMOUNT_ONE}. ` +
          `A drift here signals credit_balances was not written on POST 1 despite the 200 envelope.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE);

      const resp2 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_TWO },
      });
      expect(
        resp2.status(),
        `POST 2 returned ${resp2.status()} — expected 200 with the full self-approve envelope. Body: ${await resp2.text()}`,
      ).toBe(200);
      const body2 = (await resp2.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(body2.over_budget).toBe(false);
      // Pin the chained arithmetic identity — the second POST must
      // accumulate on top of the first, not overwrite. Two shapes checked:
      // (a) body2.balance === grant2.balanceBefore + AMOUNT_TWO (the
      // single-POST identity that route.ts:166 enforces per grant), and
      // (b) body2.balance === balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO
      // (the chained identity — combines the fresh-reseller precondition
      // + the two accumulating writes). Both must hold; the second
      // surfaces regressions the first cannot (e.g. a race where POST 2's
      // pre-read caught a stale snapshot). Also pin the delta form
      // (body2.balance - body1.balance === AMOUNT_TWO) so a reviewer
      // sees the accumulation invariant stated three ways.
      expect(body2.balance).toBe(balanceBefore2 + AMOUNT_TWO);
      expect(body2.balance).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO);
      expect((body2.balance ?? 0) - (body1.balance ?? 0)).toBe(AMOUNT_TWO);

      // credit_transaction_id must be a fresh UUID on each POST — a
      // regression that re-used the first UUID on the second POST would
      // let the chained balance assertions pass (route ignores this
      // field for arithmetic) while breaking the credit_transactions
      // ledger's append-only invariant. Cheap pin; catches shape drift.
      // Tick 216: extended from typeof-only to UUID_RE so a null / non-
      // UUID payload flags at shape (matches row 152 + body1) BEFORE the
      // distinctness pin below false-passes on two identical nulls.
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(UUID_RE);
      expect(body2.credit_transaction_id).not.toBe(body1.credit_transaction_id);

      // Both POSTs must stamp the same month_key (both fired within the
      // same test's monotonic clock). A month_key drift here would
      // signal a helper regression that recomputed monthKey off a stale
      // Date reference.
      expect(body2.month_key).toBe(body1.month_key);

      // remaining_budget must decrease by exactly AMOUNT_TWO from POST 1
      // to POST 2 — clamped at 0 via Math.max at route.ts:256-259, so a
      // negative on either would flag a budget-arithmetic overflow.
      // Skip the pin if either surface returns a non-number (older
      // route builds pre-P6.5b that omitted the field); the row 152
      // shape assertions already guard the field's presence.
      if (
        typeof body1.remaining_budget === "number" &&
        typeof body2.remaining_budget === "number"
      ) {
        expect(body1.remaining_budget - body2.remaining_budget).toBe(AMOUNT_TWO);
        expect(body2.remaining_budget).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});

// P10 wave-3 row 156b — three-chained-grant identity extends row 156's two-
// grant chain with a THIRD POST (amount=2) so the accumulating identity
// walks past the UPSERT's on-conflict branch a second time. Where row 156
// pins `balanceBefore1 + 5 + 3 === 8` on the second POST, this row pins
// `balanceBefore1 + 5 + 3 + 2 === 10` on the third. Route reference:
// web/src/app/api/reseller/credits/grant/route.ts:143-224 — the pre-write
// balance read at 143-152 + credit_balances UPSERT at 174-198 + response
// echo at 250-260. A regression that (a) mis-handled the ON CONFLICT DO
// UPDATE branch after two successful writes (e.g. a rewrite that split
// UPSERT into INSERT-with-catch → SELECT-then-UPDATE where the third call
// re-read a stale snapshot), (b) introduced any state that only accumulates
// on the first two writes but drops the third (e.g. an in-memory rollup
// invalidated after 2 hits), or (c) reset the newBalance arithmetic on
// the third call (unlikely per route.ts:166's plain sum but pinnable) would
// leave rows 152 + 156 green while surfacing here on POST 3.
//
// amounts = 5 + 3 + 2 chosen deliberately: three distinct primes so a
// `balance = amount` regression on POST 3 (returning 2 instead of 10) reads
// as "matches the third amount, dropped the running total"; a
// `balance = amount_last + amount_second` regression on POST 3 (returning 5)
// reads as "dropped POST 1's contribution"; a
// `balance = balanceBefore + amount_last` regression (returning
// balanceBefore1 + 2) reads as "restored to the pre-attach snapshot". Each
// failure mode diagnoses uniquely from the assertion message alone. Running
// total (10) still well under monthly_credit_budget=20000 per seed-qa-
// reseller active_wholesale defaults so gate 3 fires on all three POSTs
// without ever tripping over_budget_requires_approval (402); headroom
// identical to rows 152/156's CI-replay posture.
//
// Cleanup topology under LIFO restore-closure order (three attach calls):
// closure A pushed before POST 1 (snapshot balance=B0, since=T1); closure B
// before POST 2 (snapshot B0+5, since=T2); closure C before POST 3
// (snapshot B0+8, since=T3). Cleanup pops C→B→A: C deletes rows created
// >= T3 (POST 3 row) + upserts balance back to B0+8; B deletes rows >= T2
// (POST 2 row) + upserts back to B0+5; A deletes rows >= T1 (POST 1 row) +
// either restores to B0 (row existed pre-attach) or deletes the row (fresh
// insert). Net effect atomic — matches the wave-3 self-approve cleanup
// guarantee rows 152 + 156 depend on for CI replay stability.
//
// Sits alongside row 156 in credit-grant-authz.spec.ts per the same
// topology decision: authz specs own the HTTP wire contract (status codes
// + envelope shape + response arithmetic); audit-log-writes.spec.ts owns
// the append-only ledger + mirror-row side effects. A future row 156c
// probing a fourth-grant chain would sit alongside this block.
test.describe("Credit-grant × active_wholesale × three-chained-POST balance-readback — P10 wave-3 row 156b", () => {
  test("active_wholesale — three chained POSTs return balances 5, 8, 10 against a fresh reseller", async ({
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
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    const AMOUNT_ONE = 5;
    const AMOUNT_TWO = 3;
    const AMOUNT_THREE = 2;
    try {
      const attributed = await fixture.attachAttributedCustomer();
      if (!attributed) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      // Snapshot #1 — captures balance BEFORE POST 1 + registers the
      // outermost restore closure. See row 156 header for full rationale.
      const grant1 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_ONE });
      if (!grant1) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore1 = grant1.balanceBefore ?? 0;
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
      const resp1 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200 with the full self-approve envelope. Body: ${await resp1.text()}`,
      ).toBe(200);
      const body1 = (await resp1.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(body1.over_budget).toBe(false);
      expect(body1.balance).toBe(balanceBefore1 + AMOUNT_ONE);
      // Pin body1.credit_transaction_id shape (tick 216 FK-echo lens) —
      // see row 156's rationale for full context.
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #2 — reads credit_balances AFTER POST 1's UPSERT.
      const grant2 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_TWO });
      if (!grant2) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore2 = grant2.balanceBefore ?? 0;
      expect(
        balanceBefore2,
        `credit_balances readback after POST 1 should equal balanceBefore1 + ${AMOUNT_ONE}: ` +
          `got ${balanceBefore2}, expected ${balanceBefore1 + AMOUNT_ONE}.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE);

      const resp2 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_TWO },
      });
      expect(
        resp2.status(),
        `POST 2 returned ${resp2.status()} — expected 200. Body: ${await resp2.text()}`,
      ).toBe(200);
      const body2 = (await resp2.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(body2.over_budget).toBe(false);
      expect(body2.balance).toBe(balanceBefore2 + AMOUNT_TWO);
      expect(body2.balance).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO);
      // Pin body2.credit_transaction_id shape (tick 216 FK-echo lens).
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #3 — reads credit_balances AFTER POST 2's UPSERT. This is
      // the second on-conflict UPDATE the UPSERT path fires (POST 1 was
      // the INSERT branch on a fresh reseller/founder pair; POST 2 was
      // the first on-conflict UPDATE). If the third-write on-conflict
      // path silently dropped the running total, this pin catches it
      // BEFORE the POST 3 arithmetic pin runs.
      const grant3 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_THREE });
      if (!grant3) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore3 = grant3.balanceBefore ?? 0;
      expect(
        balanceBefore3,
        `credit_balances readback after POST 2 should equal balanceBefore1 + ${AMOUNT_ONE} + ${AMOUNT_TWO}: ` +
          `got ${balanceBefore3}, expected ${balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO}. ` +
          `A drift here signals credit_balances was not written on POST 2 despite the 200 envelope.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO);

      const resp3 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_THREE },
      });
      expect(
        resp3.status(),
        `POST 3 returned ${resp3.status()} — expected 200 with the full self-approve envelope. Body: ${await resp3.text()}`,
      ).toBe(200);
      const body3 = (await resp3.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body3.ok, `POST 3 body.ok should be true: ${JSON.stringify(body3)}`).toBe(true);
      expect(body3.over_budget).toBe(false);
      // Pin the three-way chained arithmetic identity — the third POST
      // must accumulate on top of the first two, not overwrite either.
      // Same three shapes as row 156 extended:
      //   (a) body3.balance === grant3.balanceBefore + AMOUNT_THREE  (single-POST)
      //   (b) body3.balance === balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE  (chained)
      //   (c) body3.balance - body2.balance === AMOUNT_THREE          (delta)
      expect(body3.balance).toBe(balanceBefore3 + AMOUNT_THREE);
      expect(body3.balance).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE);
      expect((body3.balance ?? 0) - (body2.balance ?? 0)).toBe(AMOUNT_THREE);

      // credit_transaction_id must be a fresh UUID on the third POST too
      // — pin distinctness against BOTH prior UUIDs so a re-use regression
      // on either the (POST 2, POST 3) pair or the (POST 1, POST 3) pair
      // surfaces here (row 156 already pins the (POST 1, POST 2) pair).
      // Tick 216: extended from typeof-only to UUID_RE so a null / non-
      // UUID payload flags at shape (matches row 152 + body1 + body2)
      // BEFORE the distinctness pins false-pass on three identical nulls.
      expect(typeof body3.credit_transaction_id).toBe("string");
      expect(body3.credit_transaction_id ?? "").toMatch(UUID_RE);
      expect(body3.credit_transaction_id).not.toBe(body1.credit_transaction_id);
      expect(body3.credit_transaction_id).not.toBe(body2.credit_transaction_id);

      // Same-month invariant across all three POSTs — fired within the
      // same test's monotonic clock, so any month_key drift signals a
      // helper regression that recomputed monthKey off a stale Date.
      expect(body3.month_key).toBe(body1.month_key);
      expect(body3.month_key).toBe(body2.month_key);

      // remaining_budget must decrease by exactly AMOUNT_THREE from POST 2
      // to POST 3, and the cumulative decrease from POST 1 to POST 3 must
      // equal AMOUNT_TWO + AMOUNT_THREE. Skip pins if either surface returns
      // a non-number (older route builds pre-P6.5b).
      if (
        typeof body1.remaining_budget === "number" &&
        typeof body2.remaining_budget === "number" &&
        typeof body3.remaining_budget === "number"
      ) {
        expect(body2.remaining_budget - body3.remaining_budget).toBe(AMOUNT_THREE);
        expect(body1.remaining_budget - body3.remaining_budget).toBe(AMOUNT_TWO + AMOUNT_THREE);
        expect(body3.remaining_budget).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});

// P10 wave-3 row 156c — four-chained-grant identity extends row 156b's
// three-grant chain with a FOURTH POST (amount=1) so the accumulating
// identity walks past the UPSERT's on-conflict branch a THIRD time. Where
// row 156b pins `balanceBefore1 + 5 + 3 + 2 === 10` on the third POST, this
// row pins `balanceBefore1 + 5 + 3 + 2 + 1 === 11` on the fourth. Route
// reference: web/src/app/api/reseller/credits/grant/route.ts:143-224 — the
// pre-write balance read at 143-152 + credit_balances UPSERT at 174-198 +
// response echo at 250-260. A regression that (a) mis-handled the ON
// CONFLICT DO UPDATE branch after three successful writes (e.g. a rewrite
// that split UPSERT into INSERT-with-catch → SELECT-then-UPDATE where the
// fourth call re-read a stale snapshot), (b) introduced any state that only
// accumulates on the first three writes but drops the fourth (e.g. an
// in-memory rollup invalidated after 3 hits), or (c) reset the newBalance
// arithmetic on the fourth call (unlikely per route.ts:166's plain sum but
// pinnable) would leave rows 152 + 156 + 156b green while surfacing here on
// POST 4.
//
// amounts = 5 + 3 + 2 + 1 chosen deliberately: four distinct positive
// integers with the fourth being the smallest so a `balance = amount`
// regression on POST 4 (returning 1 instead of 11) reads as "matches the
// fourth amount, dropped the running total"; a `balance = balanceBefore +
// amount_last` regression (returning balanceBefore1 + 1) reads as
// "restored to the pre-attach snapshot"; a `balance = amount_first + ... +
// amount_prev` regression (returning 10) reads as "POST 4 UPSERT went
// through but the response echo lagged one write behind". Each failure
// mode diagnoses uniquely from the assertion message alone. Running total
// (11) still well under monthly_credit_budget=20000 per seed-qa-reseller
// active_wholesale defaults so gate 3 fires on all four POSTs without ever
// tripping over_budget_requires_approval (402); headroom identical to rows
// 152/156/156b's CI-replay posture.
//
// Cleanup topology under LIFO restore-closure order (four attach calls):
// closure A pushed before POST 1 (snapshot balance=B0, since=T1); closure B
// before POST 2 (snapshot B0+5, since=T2); closure C before POST 3
// (snapshot B0+8, since=T3); closure D before POST 4 (snapshot B0+10,
// since=T4). Cleanup pops D→C→B→A: D deletes rows created >= T4 (POST 4
// row) + upserts balance back to B0+10; C deletes rows >= T3 (POST 3 row)
// + upserts back to B0+8; B deletes rows >= T2 (POST 2 row) + upserts back
// to B0+5; A deletes rows >= T1 (POST 1 row) + either restores to B0 (row
// existed pre-attach) or deletes the row (fresh insert). Net effect atomic
// — matches the wave-3 self-approve cleanup guarantee rows 152 + 156 +
// 156b depend on for CI replay stability.
//
// Sits alongside rows 156 + 156b in credit-grant-authz.spec.ts per the
// same topology decision: authz specs own the HTTP wire contract (status
// codes + envelope shape + response arithmetic); audit-log-writes.spec.ts
// owns the append-only ledger + mirror-row side effects. A companion DB
// assertion pinning `mirrorCount === 4` sits alongside row 156b's DB
// companion in audit-log-writes.spec.ts under this same tick.
test.describe("Credit-grant × active_wholesale × four-chained-POST balance-readback — P10 wave-3 row 156c", () => {
  test("active_wholesale — four chained POSTs return balances 5, 8, 10, 11 against a fresh reseller", async ({
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
    if (
      !fixture ||
      !fixture.adminUserId ||
      !fixture.attributedUserId ||
      !fixture.attributionExists
    ) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    const targetUserId = fixture.attributedUserId;
    const AMOUNT_ONE = 5;
    const AMOUNT_TWO = 3;
    const AMOUNT_THREE = 2;
    const AMOUNT_FOUR = 1;
    try {
      const attributed = await fixture.attachAttributedCustomer();
      if (!attributed) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      // Snapshot #1 — captures balance BEFORE POST 1 + registers the
      // outermost restore closure. See row 156 header for full rationale.
      const grant1 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_ONE });
      if (!grant1) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore1 = grant1.balanceBefore ?? 0;
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
      const resp1 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200 with the full self-approve envelope. Body: ${await resp1.text()}`,
      ).toBe(200);
      const body1 = (await resp1.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(body1.over_budget).toBe(false);
      expect(body1.balance).toBe(balanceBefore1 + AMOUNT_ONE);
      // Pin body1.credit_transaction_id shape (tick 216 FK-echo lens) —
      // see row 156's rationale for full context.
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #2 — reads credit_balances AFTER POST 1's UPSERT.
      const grant2 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_TWO });
      if (!grant2) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore2 = grant2.balanceBefore ?? 0;
      expect(
        balanceBefore2,
        `credit_balances readback after POST 1 should equal balanceBefore1 + ${AMOUNT_ONE}: ` +
          `got ${balanceBefore2}, expected ${balanceBefore1 + AMOUNT_ONE}.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE);

      const resp2 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_TWO },
      });
      expect(
        resp2.status(),
        `POST 2 returned ${resp2.status()} — expected 200. Body: ${await resp2.text()}`,
      ).toBe(200);
      const body2 = (await resp2.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(body2.over_budget).toBe(false);
      expect(body2.balance).toBe(balanceBefore2 + AMOUNT_TWO);
      expect(body2.balance).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO);
      // Pin body2.credit_transaction_id shape (tick 216 FK-echo lens).
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #3 — reads credit_balances AFTER POST 2's UPSERT.
      const grant3 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_THREE });
      if (!grant3) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore3 = grant3.balanceBefore ?? 0;
      expect(
        balanceBefore3,
        `credit_balances readback after POST 2 should equal balanceBefore1 + ${AMOUNT_ONE} + ${AMOUNT_TWO}: ` +
          `got ${balanceBefore3}, expected ${balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO}. ` +
          `A drift here signals credit_balances was not written on POST 2 despite the 200 envelope.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO);

      const resp3 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_THREE },
      });
      expect(
        resp3.status(),
        `POST 3 returned ${resp3.status()} — expected 200. Body: ${await resp3.text()}`,
      ).toBe(200);
      const body3 = (await resp3.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body3.ok, `POST 3 body.ok should be true: ${JSON.stringify(body3)}`).toBe(true);
      expect(body3.over_budget).toBe(false);
      expect(body3.balance).toBe(balanceBefore3 + AMOUNT_THREE);
      expect(body3.balance).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE);
      // Pin body3.credit_transaction_id shape (tick 216 FK-echo lens).
      expect(typeof body3.credit_transaction_id).toBe("string");
      expect(body3.credit_transaction_id ?? "").toMatch(UUID_RE);

      // Snapshot #4 — reads credit_balances AFTER POST 3's UPSERT. This is
      // the third on-conflict UPDATE the UPSERT path fires (POST 1 was the
      // INSERT branch on a fresh reseller/founder pair; POST 2 was the
      // first on-conflict UPDATE; POST 3 was the second). If the fourth-
      // write on-conflict path silently dropped the running total, this pin
      // catches it BEFORE the POST 4 arithmetic pin runs.
      const grant4 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_FOUR });
      if (!grant4) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const balanceBefore4 = grant4.balanceBefore ?? 0;
      expect(
        balanceBefore4,
        `credit_balances readback after POST 3 should equal balanceBefore1 + ${AMOUNT_ONE} + ${AMOUNT_TWO} + ${AMOUNT_THREE}: ` +
          `got ${balanceBefore4}, expected ${balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE}. ` +
          `A drift here signals credit_balances was not written on POST 3 despite the 200 envelope.`,
      ).toBe(balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE);

      const resp4 = await page.request.post(ROUTE, {
        data: { target_user_id: targetUserId, amount: AMOUNT_FOUR },
      });
      expect(
        resp4.status(),
        `POST 4 returned ${resp4.status()} — expected 200 with the full self-approve envelope. Body: ${await resp4.text()}`,
      ).toBe(200);
      const body4 = (await resp4.json()) as {
        ok: boolean;
        balance?: number;
        credit_transaction_id?: string;
        over_budget?: boolean;
        month_key?: string;
        remaining_budget?: number;
      };
      expect(body4.ok, `POST 4 body.ok should be true: ${JSON.stringify(body4)}`).toBe(true);
      expect(body4.over_budget).toBe(false);
      // Pin the four-way chained arithmetic identity — the fourth POST
      // must accumulate on top of the first three, not overwrite any.
      // Same three shapes as row 156b extended:
      //   (a) body4.balance === grant4.balanceBefore + AMOUNT_FOUR  (single-POST)
      //   (b) body4.balance === balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE + AMOUNT_FOUR  (chained)
      //   (c) body4.balance - body3.balance === AMOUNT_FOUR          (delta)
      expect(body4.balance).toBe(balanceBefore4 + AMOUNT_FOUR);
      expect(body4.balance).toBe(
        balanceBefore1 + AMOUNT_ONE + AMOUNT_TWO + AMOUNT_THREE + AMOUNT_FOUR,
      );
      expect((body4.balance ?? 0) - (body3.balance ?? 0)).toBe(AMOUNT_FOUR);

      // credit_transaction_id must be a fresh UUID on the fourth POST too
      // — pin distinctness against ALL THREE prior UUIDs so a re-use
      // regression on any of the (POST 1, POST 4), (POST 2, POST 4), or
      // (POST 3, POST 4) pairs surfaces here (rows 156 + 156b already pin
      // the (POST 1, POST 2), (POST 2, POST 3), and (POST 1, POST 3) pairs
      // through their own distinctness assertions).
      // Tick 216: extended from typeof-only to UUID_RE so a null / non-
      // UUID payload flags at shape (matches row 152 + bodies 1..3)
      // BEFORE the distinctness pins false-pass on four identical nulls.
      expect(typeof body4.credit_transaction_id).toBe("string");
      expect(body4.credit_transaction_id ?? "").toMatch(UUID_RE);
      expect(body4.credit_transaction_id).not.toBe(body1.credit_transaction_id);
      expect(body4.credit_transaction_id).not.toBe(body2.credit_transaction_id);
      expect(body4.credit_transaction_id).not.toBe(body3.credit_transaction_id);

      // Same-month invariant across all four POSTs — fired within the
      // same test's monotonic clock, so any month_key drift signals a
      // helper regression that recomputed monthKey off a stale Date.
      expect(body4.month_key).toBe(body1.month_key);
      expect(body4.month_key).toBe(body2.month_key);
      expect(body4.month_key).toBe(body3.month_key);

      // remaining_budget must decrease by exactly AMOUNT_FOUR from POST 3
      // to POST 4, and the cumulative decrease from POST 1 to POST 4 must
      // equal AMOUNT_TWO + AMOUNT_THREE + AMOUNT_FOUR. Skip pins if any
      // surface returns a non-number (older route builds pre-P6.5b).
      if (
        typeof body1.remaining_budget === "number" &&
        typeof body2.remaining_budget === "number" &&
        typeof body3.remaining_budget === "number" &&
        typeof body4.remaining_budget === "number"
      ) {
        expect(body3.remaining_budget - body4.remaining_budget).toBe(AMOUNT_FOUR);
        expect(body1.remaining_budget - body4.remaining_budget).toBe(
          AMOUNT_TWO + AMOUNT_THREE + AMOUNT_FOUR,
        );
        expect(body4.remaining_budget).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
