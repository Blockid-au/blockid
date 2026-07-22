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
//   - Happy path (200) approve branch — fires a Stripe coupon+promotion_code
//     mint (code_request) or the credit-grant ledger triple-write
//     (over_budget_approval → credit_balances UPSERT + credit_transactions
//     INSERT + reseller_credit_grants INSERT). Deferred alongside the
//     temp-reseller mint fixture follow-up: activating the approve branch
//     safely needs deterministic control over the row's target_user_id AND
//     the pre/post credit_balances state so the test can assert the ledger
//     delta without cross-run drift. Follow-up tick can seed the row via
//     scripts/seed-qa-reseller.mjs (add an approve-target variant) rather
//     than doing per-test writes from the spec.
//   - Happy path (200) cancel branch — ACTIVATED wave-5 row 175 cancel-
//     branch block below via loadAdminHarness() (qa-admin-1@blockid.au) once
//     row 155-b seeder landed in requests-authz.spec.ts (tick 164) to insert
//     a second pending over_budget_approval row per CI pass. Cancel mirrors
//     deny at route.ts:296-311 — pure status flip with no Stripe coupon
//     mint, no credit_balances / credit_transactions / reseller_credit_grants
//     write, no revenue_events read. Idempotent net-of-(row-155, row-155-b):
//     deny consumes row 155's seed; cancel consumes row 155-b's seed; the
//     queue nets to zero rather than accumulating pending rows. Fresh CI
//     hosts (where neither row 155 nor row 155-b has run yet) test.skip
//     when the pending enumeration returns fewer than the expected rows.
//   - Happy path (200) DENY branch — ACTIVATED wave-5 row 175 below via
//     loadAdminHarness() (qa-admin-1@blockid.au) so the requireAdmin() gate
//     passes. Deny is the safest of the three transitions: pure status flip
//     at route.ts:296-311 (no Stripe coupon mint, no credit_balances /
//     credit_transactions / reseller_credit_grants write, no
//     revenue_events read, no reseller_promotion_codes insert). Idempotent
//     under CI replay net-of-row-155: row 155 inserts one pending
//     over_budget_approval row per CI pass; this row consumes it via the
//     PATCH so the queue nets to zero rather than accumulating. Fresh CI
//     hosts (where row 155 has not run yet) test.skip when the pending
//     enumeration returns an empty array — no false failure.
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
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const ROUTE = `/api/admin/resellers/requests/${PLACEHOLDER_ID}`;
const PATCH_BODY = { action: "approve" };

const REQUESTS_LIST_ROUTE = "/api/admin/resellers/requests";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// P10 wave-5 row 175 — happy path DENY branch. Admin PATCHes a pending
// over_budget_approval row seeded by wave-3 row 155 (see
// requests-authz.spec.ts:253+) and flips status pending → denied via
// {action:"deny", decision_reason:"..."}. Deny is picked over approve /
// cancel per the "Deliberately out of scope" block above — pure status
// flip at web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311
// with no Stripe coupon mint, no credit_balances / credit_transactions /
// reseller_credit_grants write, no revenue_events read. Idempotent net-of-
// row-155: row 155 inserts one pending over_budget_approval row per CI
// pass; this row consumes it via the PATCH so the reseller_requests queue
// nets to zero rather than accumulating pending rows. Fresh CI hosts
// (where row 155 has not run yet) test.skip when the pending enumeration
// returns an empty array — no false failure.
//
// Coverage-vs-duplication call: pin 200 + body.ok=true + body.request.id
// matching UUID_RE + body.request.status === "denied" + body.request
// .decision_reason non-empty string. Do NOT pin body.request.decision_at
// (a timestamp string that drifts every run — assert typeof string only).
// Do NOT pin linked_credit_transaction_id / linked_promotion_code_id —
// both are null for the deny branch (approve branch would populate them;
// deferred here), so pin their null-ness so a route regression that leaks
// a stray ledger insert into the deny path surfaces here as a non-null
// linked_credit_transaction_id.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status flip + decision_reason + decision_at + decision_by) but does
// NOT touch credit_balances, credit_transactions, reseller_credit_grants,
// reseller_promotion_codes, revenue_events, or Stripe. Net-of-row-155 the
// pending queue length is unchanged across CI passes. Row 155 was
// intentionally scoped to over_budget_approval (not code_request) so its
// pending row lives outside the reseller_requests_pending_code_uniq
// partial unique index — a rerun that lands a fresh pending row before
// this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the deny branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no
// Stripe network call, no revenue_events read, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list (fresh CI host where row 155 has not run yet) → test-scope
// skip with a pointer at wave-3 row 155. Sibling admin-only rows (164 +
// 173 + 174) use the same pattern; row 174 skips discipline mirrors this
// one but skips at test-scope only for loginAs since its assertion loop
// greens over empty-array too.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (deny)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("deny — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=denied with a decision_reason", async ({
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

    // Enumerate pending requests to find a row we can safely deny. The
    // list endpoint's default status filter is 'pending' (route.ts:37+46
    // of the list route) so an omit-?status query returns exactly the
    // rows we want. Filter to over_budget_approval to avoid depleting
    // any code_request row that a downstream approve-branch tick may
    // need — over_budget_approval sits outside the pending-code partial
    // unique index (0095:71-73) so denying one does not create a slot
    // race with the code_request seeder.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to deny — " +
          "wave-3 row 155 (requests-authz.spec.ts:253+) has not run yet on " +
          "this host. Run the wave-3 seeder step or execute row 155 before " +
          "this row to populate at least one pending row.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_deny_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "deny", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `deny returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker (fold into the retry posture below if seen); a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("denied");
    // decision_at is a timestamp string set inside the route at now =
    // new Date().toISOString() (route.ts:89) — assert typeof string only
    // so the value can drift.
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Deny branch skips the code_request + over_budget_approval fan-outs
    // so both linked_* columns stay null. A route regression that leaked
    // an approve-branch ledger insert or coupon mint into the deny path
    // would surface here as a non-null linked_credit_transaction_id or
    // linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();
  });
});

// P10 wave-5 row 175 — happy path CANCEL branch. Admin PATCHes a second
// pending over_budget_approval row (seeded by wave-5 row 155-b in
// requests-authz.spec.ts) and flips status pending → cancelled via
// {action:"cancel", decision_reason:"..."}. Cancel mirrors deny at
// web/src/app/api/admin/resellers/requests/[id]/route.ts:296-311 with the
// same pure status flip — no Stripe coupon mint, no credit_balances /
// credit_transactions / reseller_credit_grants / reseller_promotion_codes /
// revenue_events write. Idempotent net-of-(row-155, row-155-b): the deny
// block above consumes row 155's seed; this block consumes row 155-b's
// seed; the reseller_requests queue nets to zero rather than accumulating.
//
// Coverage-vs-duplication call vs the deny block: pin 200 + body.ok=true +
// body.request.id matching UUID_RE + body.request.status === "cancelled" +
// body.request.decision_reason === "p10_wave5_row_175_cancel_probe" + both
// linked_* columns null. Do NOT pin body.request.decision_at value (a
// timestamp string set at now = new Date().toISOString() inside the route —
// assert typeof string only). The status === "cancelled" pin catches a
// regression that mis-computed the status enum from action (validateAdmin
// Decision at web/src/lib/reseller/requests.ts:301-303 folds action ===
// "cancel" → "cancelled"). Pinning both status enums across the two blocks
// (denied vs cancelled) catches a folded-together regression where cancel
// and deny both round-trip to the same string.
//
// Skip discipline: loadAdminHarness() returns null → describe-scope skip
// via adminHarnessSkipReason(); loginAs throw → test-scope skip; empty
// pending list AFTER the deny block consumed row 155's seed and row 155-b
// has not run yet (fresh CI host or partial-seed) → test-scope skip with a
// pointer at wave-5 row 155-b. The enumeration filter mirrors the deny
// block (request_type === "over_budget_approval") so cancel and deny each
// find a distinct row via the array-order traversal without needing an
// explicit row-id exchange between the two describe blocks.
//
// State-pollution posture: the PATCH mutates ONE reseller_requests row
// (status pending → cancelled + decision_by + decision_at + decision_reason
// + linked_credit_transaction_id + linked_promotion_code_id, both nulls).
// No credit_balances / credit_transactions / reseller_credit_grants /
// reseller_promotion_codes / revenue_events / Stripe writes. Net-of-
// (row-155, row-155-b) the pending queue length is unchanged across CI
// passes. Row 155-b is scoped to over_budget_approval (not code_request) so
// its seeded row lives outside the reseller_requests_pending_code_uniq
// partial unique index (0095:71-73) — a rerun that lands a fresh pending
// row before this spec fires does not 409 duplicate the seed either.
//
// Non-Stripe / non-GST discipline: the cancel branch only writes
// reseller_requests. No promotion_code lookup, no credit ledger, no Stripe
// network call, no revenue_events read, no InfoVision dependency. P8.5 +
// P1.5 remain neither a dependency nor a consequence.
test.describe("Admin reseller requests PATCH — P10 wave-5 row 175 happy path (cancel)", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("cancel — PATCH as qa-admin-1 flips a pending over_budget_approval row to status=cancelled with a decision_reason", async ({
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

    // Enumerate pending requests to find a row we can safely cancel. The
    // list endpoint's default status filter is 'pending' so an omit-?status
    // query returns exactly the rows we want. Filter to over_budget_approval
    // for the same reason as the deny block above — cancel + deny each need
    // a distinct pending row (row 155 for deny, row 155-b for cancel), and
    // scoping to over_budget_approval leaves any pending code_request row
    // alone for a downstream approve-branch tick that may need it.
    const listResp = await page.request.get(REQUESTS_LIST_ROUTE);
    expect(
      listResp.status(),
      `list route returned ${listResp.status()} — expected 200 to enumerate pending rows before the PATCH. A 401 here means the admin session was not established; a 5xx means the SELECT leaked through. Body: ${await listResp.text()}`,
    ).toBe(200);
    const listBody = (await listResp.json()) as {
      ok?: unknown;
      requests?: unknown;
    };
    expect(listBody.ok).toBe(true);
    expect(Array.isArray(listBody.requests)).toBe(true);

    const rows = (listBody.requests as Array<{
      id?: unknown;
      request_type?: unknown;
      status?: unknown;
    }>) ?? [];
    const target = rows.find(
      (row) =>
        typeof row?.id === "string" &&
        row.request_type === "over_budget_approval" &&
        row.status === "pending",
    );

    if (!target) {
      test.skip(
        true,
        "No pending over_budget_approval row available to cancel — " +
          "wave-5 row 155-b (requests-authz.spec.ts row 155-b describe " +
          "block) has not run yet on this host, or the deny block above " +
          "consumed the only pending row on a partial-seed host. Run the " +
          "wave-3 + wave-5 seeder blocks or execute rows 155 + 155-b before " +
          "this row to populate at least two pending rows.",
      );
      return;
    }

    const targetId = target.id as string;
    expect(targetId).toMatch(UUID_RE);

    const decisionReason = "p10_wave5_row_175_cancel_probe";
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${targetId}`,
      {
        data: { action: "cancel", decision_reason: decisionReason },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `cancel returned ${patchResp.status()} — expected 200 after requireAdmin() + validateAdminDecision() pass. A 401 means the admin session dropped mid-test; a 404 not_found means the target row was consumed by a concurrent CI worker; a 409 already_decided means a concurrent PATCH raced this one; a 500 update_failed means the reseller_requests UPDATE (route.ts:296-322) leaked through. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const patchBody = (await patchResp.json()) as {
      ok?: unknown;
      request?: {
        id?: unknown;
        status?: unknown;
        decision_at?: unknown;
        decision_reason?: unknown;
        linked_credit_transaction_id?: unknown;
        linked_promotion_code_id?: unknown;
      };
    };
    expect(patchBody.ok).toBe(true);
    expect(typeof patchBody.request?.id).toBe("string");
    expect(patchBody.request?.id as string).toBe(targetId);
    expect(patchBody.request?.status).toBe("cancelled");
    expect(typeof patchBody.request?.decision_at).toBe("string");
    expect(patchBody.request?.decision_reason).toBe(decisionReason);
    // Cancel branch skips the code_request + over_budget_approval fan-outs
    // (same as deny) so both linked_* columns stay null. A route regression
    // that leaked an approve-branch ledger insert or coupon mint into the
    // cancel path would surface here as a non-null linked_credit_transaction
    // _id or linked_promotion_code_id.
    expect(patchBody.request?.linked_credit_transaction_id).toBeNull();
    expect(patchBody.request?.linked_promotion_code_id).toBeNull();
  });
});
