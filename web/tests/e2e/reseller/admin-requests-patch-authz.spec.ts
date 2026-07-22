// PATCH /api/admin/resellers/requests/[id] pre-write authorization contract —
// P10 dry-run per plan §C.5 (admin approval flows) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate ordering
// surfaces before the endpoint reads reseller_requests, validates the
// approve/deny/cancel decision, mints a Stripe coupon, or writes any of the
// four downstream tables — credit_balances, credit_transactions,
// reseller_credit_grants, reseller_promotion_codes, reseller_requests).
//
// Mirrors admin-reseller-patch-authz.spec.ts (tick 103) — both routes use the
// shared requireAdmin() middleware from web/src/lib/reseller/require-admin.ts
// (see route.ts:46-54). The gate throws AdminGateError with code="no_user" |
// "not_admin" and the route emits { ok:false, reason:<code> } at HTTP 401 for
// BOTH branches (route.ts:50-51). Symmetric envelope so a refactor that
// collapses either 401 reason or drops the requireAdmin() gate here would
// light up alongside its sibling on the next `npx playwright test` pass.
//
// Two branches are harness-free and safe against staging (no
// reseller_requests SELECT fires, no validateAdminDecision runs, no Stripe
// coupon is minted, no credit_balances/credit_transactions/reseller_credit_grants
// /reseller_promotion_codes/reseller_requests write happens):
//
//   1. unauthenticated  — PATCH with no session         → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401 BEFORE
//                          params resolution, getSupabaseAdmin, JSON parse,
//                          reseller_requests SELECT, decision validation, any
//                          Stripe mint, or the approve/deny/cancel UPDATE)
//   2. non_admin        — PATCH as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → requireAdmin throws
//                          AdminGateError("not_admin") → gate returns 401 BEFORE
//                          any of the above fires)
//
// Route reference: web/src/app/api/admin/resellers/requests/[id]/route.ts
//   Line 46-54:   gate() — getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 55-57:   (redundant) if (!user) → 401 no_user (dead branch — requireAdmin
//                 already threw; kept as a belt-and-braces guard)
//   Line 59-63:   params await + getSupabaseAdmin → 503 not_configured
//   Line 65:      request.json parse (null-safe)
//   Line 67-80:   reseller_requests SELECT → 500 read_failed / 404 not_found
//   Line 83-87:   validateAdminDecision   → 400 <reason> / 409 already_decided
//   Line 93-224:  approve branch fan-out (Stripe coupon mint, promotion_code
//                 insert, credit ledger writes for over_budget_approval,
//                 collateral_approval status flip)
//   Line 226+:    reseller_requests UPDATE — status flip + linked_credit_transaction_id
//                 / linked_promotion_code_id stamp + decision_reason + decided_at
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this spec
//   lights up in CI on the next `npx playwright test` pass alongside
//   admin-reseller-patch-authz.spec.ts, sandbox-setup-authz.spec.ts,
//   billing-authz.spec.ts, reveal-email-authz.spec.ts, drawer-authz.spec.ts,
//   me-attribution.spec.ts, and reports-signed-url-authz.spec.ts.
//
// Deliberately out of scope (needs the admin QA harness or per-test seeding
// which plan §J.2 forbids):
//   - not_configured (503) — needs SUPABASE_URL/SERVICE_ROLE unset which would
//     break every other Playwright spec in the same worker.
//   - not_found (404) — sits BEHIND requireAdmin (route.ts:78 vs :46), needs
//     an admin session PLUS an [id] that does not resolve to a reseller_requests
//     row.
//   - validateAdminDecision (400 <reason> / 409 already_decided) — needs an
//     admin session PLUS a real pending request row PLUS an ill-formed body
//     (missing action, unknown action, or already-decided row).
//   - payload_incomplete (422) — approve branch only, needs an admin session
//     PLUS a code_request row with a non-finite tier_pct payload.
//   - reseller_read_failed / existing_code_read_failed / promotion_code_insert
//     _failed / credit ledger insert failures / update_failed (500) — all fold
//     into the admin QA harness follow-up alongside the deferred rows from
//     ticks 94/95/96/97/98/99/100/101/102/103/104.
//   - Happy path (200) — fires a reseller_requests UPDATE + (approve branch)
//     either a Stripe coupon+promotion_code mint or the credit-grant ledger
//     triple-write. Belongs to the temp-reseller mint fixture follow-up.
//
// Placeholder id used in the URL path: a well-formed UUID
// (00000000-0000-0000-0000-000000000000) sits in the [id] segment so it passes
// Next.js dynamic-segment matching. Both rows return BEFORE the params await
// runs (row 1 bails in gate() → getCurrentUser; row 2 bails in gate() →
// requireAdmin), so the placeholder value never reaches
// supabase.from("reseller_requests").eq("id", id).
//
// Body: {action:"approve"} is the smallest well-formed request body that would
// otherwise reach validateAdminDecision. Both rows return BEFORE the JSON
// parse runs so the body is not inspected — any parsable JSON would work.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/admin/resellers/requests/${PLACEHOLDER_ID}`;
const PATCH_BODY = { action: "approve" };

test.describe("Admin reseller requests PATCH pre-write authorization — P10 dry-run", () => {
  test("unauthenticated — PATCH with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — PATCH as a founder QA account returns 401 not_admin", async ({
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
    const resp = await page.request.patch(ROUTE, { data: PATCH_BODY });
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before params await, getSupabaseAdmin, JSON parse, reseller_requests SELECT, validateAdminDecision, Stripe mint, or reseller_requests UPDATE. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});
