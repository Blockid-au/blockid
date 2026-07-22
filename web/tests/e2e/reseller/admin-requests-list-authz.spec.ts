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
        payload?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
      };
      expect(typeof r.id).toBe("string");
      expect(r.id as string).toMatch(UUID_RE);
      expect(typeof r.reseller_id).toBe("string");
      expect(r.reseller_id as string).toMatch(UUID_RE);
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
      // decision_at / decision_reason are both nullable for pending rows
      // (only populated by the PATCH branch at route.ts, which flips the
      // status to approved / denied / cancelled). Do NOT pin their values;
      // only their presence-or-null-ness so a schema regression that
      // dropped them from the SELECT list surfaces as undefined.
      expect(r.decision_at === null || typeof r.decision_at === "string").toBe(
        true,
      );
      expect(
        r.decision_reason === null || typeof r.decision_reason === "string",
      ).toBe(true);
    }
  });
});
