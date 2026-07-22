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
