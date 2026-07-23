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
      expect(["code_request", "over_budget_approval", "collateral_approval"]).toContain(
        row.request_type,
      );
      expect(typeof row.status).toBe("string");
      expect(["pending", "approved", "denied", "cancelled"]).toContain(row.status);
      expect(typeof row.created_at).toBe("string");
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
      expect(
        row.decision_at === null || typeof row.decision_at === "string",
        `active_wholesale + happy GET row.decision_at should be null or a string timestamp (nullable per 0095:35; NULL on pending rows per ck_decision_shape at 0095:41-45). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
      expect(
        row.decision_reason === null || typeof row.decision_reason === "string",
        `active_wholesale + happy GET row.decision_reason should be null or a string (nullable per 0095:36; no CHECK ties it to status so nullable across all row states). Row: ${JSON.stringify(row)}`,
      ).toBe(true);
    }
  });
});
