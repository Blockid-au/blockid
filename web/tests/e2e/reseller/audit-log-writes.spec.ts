// Reseller audit-log writes — P10_hardening dry-run per plan Verification #5
// (docs/plans/reseller-module-plan.md line 1223):
// "Audit — Playwright: viewing customer detail writes an audit row; anomaly
// alert triggers at > 200 subject-reads/week (simulate)."
//
// This spec covers the "viewing customer detail writes an audit row" half.
// Both privileged read paths in the reseller console — the customer drawer
// (GET /api/reseller/customers/[id]/drawer, action='view_customer_drawer')
// and the email reveal (POST /api/reseller/customers/[id]/reveal-email,
// action='reveal_email') — must land a reseller_audit_log row BEFORE the
// response returns so a mid-flight failure never surfaces plaintext without
// a durable trace. Both route handlers write via
// resellerSupabase(scope).auditLog() (see web/src/lib/reseller/supabase.ts)
// after the scopedReseller + decideReveal chokepoint clears; a regression in
// that ordering is exactly what this spec would catch.
//
// Anomaly-alert half (>200 subject-reads/week) is left to a follow-up tick —
// it needs simulated volume against a rate-limit surface that doesn't exist
// yet.
//
// Skips: describe-scope on loadResellerHarness() (needs
// QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID), per-test
// on loadSupabaseAdmin() (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Matches the row-2 posture in attribution-timing.spec.ts so the outer
// describe still runs any harness-only rows we add later.
//
// ACTIVATED wave-5 row 179 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe covers
// the env-based loadResellerHarness contract for hosts that keep the
// QA_RESELLER_ATTRIBUTED_CUSTOMER_ID env-var contract alive; the new
// describe covers the temp-reseller mint fixture route so a QAPROBE-cohort
// host gets identical coverage without setting either QA_RESELLER_ADMIN_EMAIL
// or QA_RESELLER_ATTRIBUTED_CUSTOMER_ID. Both blocks assert the same
// invariant (reveal-email + drawer emit reseller_audit_log rows before the
// response body ships) so a regression in the audit-write ordering lights
// up on either path.
//
// See docs/plans/reseller-module-plan.md line 1223 for the source spec.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  harnessSkipReason,
  loadAdminHarness,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type AttachApproveTargetResult,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  countResellerAuditLogFor,
  countResellerCreditGrantsFor,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

const REQUESTS_LIST_ROUTE = "/api/admin/resellers/requests";

test.describe("Reseller audit-log writes — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test("GET /api/reseller/customers/[id]/drawer writes action='view_customer_drawer'", async ({
    page,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    await loginAs(page, harness!.admin.email);
    const actorId = await findUserIdByEmail(supabase!, harness!.admin.email);
    expect(
      actorId,
      `expected app_users row for reseller admin ${harness!.admin.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    // Capture cursor BEFORE the request so append-only accumulation from
    // previous runs cannot poison the count. reseller_audit_log is
    // append-only per migration 0093 (mutation triggers block UPDATE/DELETE).
    const since = new Date().toISOString();
    const resp = await page.request.get(
      `/api/reseller/customers/${harness!.attributedCustomerId}/drawer`,
    );
    expect(
      resp.ok(),
      `drawer route returned ${resp.status()} — expected 200 with the harness-attributed customer`,
    ).toBe(true);

    const count = await countResellerAuditLogFor(supabase!, {
      action: "view_customer_drawer",
      actorUserId: actorId!,
      subjectUserId: harness!.attributedCustomerId,
      since,
    });
    expect(
      count,
      `expected ≥1 view_customer_drawer audit row for (actor=${actorId}, subject=${harness!.attributedCustomerId}) since ${since}; got ${count}`,
    ).toBeGreaterThanOrEqual(1);
  });

  test("POST /api/reseller/customers/[id]/reveal-email writes action='reveal_email'", async ({
    page,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    await loginAs(page, harness!.admin.email);
    const actorId = await findUserIdByEmail(supabase!, harness!.admin.email);
    expect(
      actorId,
      `expected app_users row for reseller admin ${harness!.admin.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    const since = new Date().toISOString();
    const resp = await page.request.post(
      `/api/reseller/customers/${harness!.attributedCustomerId}/reveal-email`,
    );
    expect(
      resp.ok(),
      `reveal-email route returned ${resp.status()} — expected 200 with the harness-attributed customer`,
    ).toBe(true);

    const count = await countResellerAuditLogFor(supabase!, {
      action: "reveal_email",
      actorUserId: actorId!,
      subjectUserId: harness!.attributedCustomerId,
      since,
    });
    expect(
      count,
      `expected ≥1 reveal_email audit row for (actor=${actorId}, subject=${harness!.attributedCustomerId}) since ${since}; got ${count}`,
    ).toBeGreaterThanOrEqual(1);
  });
});

// Wave-5 row 179 — audit row emitted after row 148's reveal-email call
// against the temp-reseller mint fixture's active_wholesale variant. Uses
// loadTempReseller('active_wholesale') to resolve (reseller admin,
// attributed founder user_id) without leaning on the env-based
// QA_RESELLER_ADMIN_EMAIL / QA_RESELLER_ATTRIBUTED_CUSTOMER_ID contract
// that the pre-existing describe uses, so a QAPROBE-cohort host — which
// mints per-variant reseller rows via web/scripts/seed-qa-reseller.mjs —
// covers the same invariant without a second env-var flip. Mirror-shape of
// wave-5 row 176 (showcase-reviews founder GET happy 200): fixture in
// beforeAll, five-step skip discipline (fixture null / attributedUserId
// null / !attributionExists / supabase null / actorId null), attach the
// cache column via attachAttributedCustomer(), fire the request, count
// audit rows.
//
// Firing both drawer AND reveal-email in the same describe because plan
// §1223 pins BOTH as privileged reads that must emit audit rows before the
// response returns — a regression that skips one but not the other would
// still be caught by the pre-existing describe's twin tests, but landing
// both here means the QAPROBE cohort has the identical assertion pair
// without needing a second env-var flip to also fire the env-based
// describe. cleanup() runs in afterAll to restore the attributed founder's
// app_users.attribution_reseller_id cache column so a follow-up spec that
// asserts on the pre-attach state does not see leaked mutation.
test.describe("Reseller audit-log writes — P10 wave-5 row 179 happy path", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // attribution_reseller_id state into the next spec worker.
        throw new Error(
          `wave-5 row 179 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  test("GET drawer + POST reveal-email each emit a reseller_audit_log row", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    if (!fixture.attributionExists) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so scopedReseller().allowedCustomerIds() would return 403 not_in_scope on both drawer and reveal-email. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attribution row lands alongside the reseller_admins mirror.`,
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    // attachAttributedCustomer() mirrors the wave-2 row 145 posture: the
    // seed script only writes reseller_attributions (per-project), not the
    // app_users.attribution_reseller_id cache column that /api/reseller/*
    // route code sometimes hydrates through. Attaching the cache column
    // here means the reseller-admin session sees the founder inside its
    // scope on the first request without relying on a cache-warming side
    // effect from a sibling spec. The restore closure runs in afterAll via
    // fixture.cleanup() so a failing assertion cannot leak the cache flip.
    const attach = await fixture.attachAttributedCustomer();
    if (!attach) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }

    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const actorId = await findUserIdByEmail(supabase, fixture.adminEmail);
    if (!actorId) {
      test.skip(
        true,
        `reseller-admin app_users row missing for ${fixture.adminEmail} — seed-test-users.mjs was not run against this host with QA_RESELLER_MULTI_ADMIN=1`,
      );
      return;
    }

    // Capture cursor BEFORE the request so append-only accumulation from
    // previous runs cannot poison the count. reseller_audit_log is
    // append-only per migration 0093 (mutation triggers block UPDATE/DELETE).
    const drawerSince = new Date().toISOString();
    const drawerResp = await page.request.get(
      `/api/reseller/customers/${attach.attributedUserId}/drawer`,
    );
    expect(
      drawerResp.ok(),
      `drawer route returned ${drawerResp.status()} — expected 200 with the fixture-attributed customer. Body: ${await drawerResp.text()}`,
    ).toBe(true);

    const drawerCount = await countResellerAuditLogFor(supabase, {
      action: "view_customer_drawer",
      actorUserId: actorId,
      subjectUserId: attach.attributedUserId,
      since: drawerSince,
    });
    expect(
      drawerCount,
      `expected ≥1 view_customer_drawer audit row for (actor=${actorId}, subject=${attach.attributedUserId}) since ${drawerSince}; got ${drawerCount}`,
    ).toBeGreaterThanOrEqual(1);

    const revealSince = new Date().toISOString();
    const revealResp = await page.request.post(
      `/api/reseller/customers/${attach.attributedUserId}/reveal-email`,
    );
    expect(
      revealResp.ok(),
      `reveal-email route returned ${revealResp.status()} — expected 200 with the fixture-attributed customer. Body: ${await revealResp.text()}`,
    ).toBe(true);

    const revealCount = await countResellerAuditLogFor(supabase, {
      action: "reveal_email",
      actorUserId: actorId,
      subjectUserId: attach.attributedUserId,
      since: revealSince,
    });
    expect(
      revealCount,
      `expected ≥1 reveal_email audit row for (actor=${actorId}, subject=${attach.attributedUserId}) since ${revealSince}; got ${revealCount}`,
    ).toBeGreaterThanOrEqual(1);
  });
});

// P10 wave-5 row 179 — approve fan-out ledger-row DB assertions. Companion
// block to the row 175 approve(over_budget_approval) wire-envelope block in
// admin-requests-patch-authz.spec.ts (line 544). That block owns the
// response envelope (200 + linked_credit_transaction_id UUID + null
// linked_promotion_code_id); this block owns the DB-level state check on
// the four writes the approve branch fans out via
// web/src/app/api/admin/resellers/requests/[id]/route.ts:200-293:
//
//   1. credit_balances UPSERT — balance + lifetime_earned bumped by
//      payload.requested_amount (route.ts:228-238).
//   2. credit_transactions INSERT — reason='reseller_grant_over_budget',
//      granted_by_reseller_id + metadata.reseller_request_id ===
//      requestId (route.ts:246-260).
//   3. reseller_credit_grants INSERT — kind='grant', over_budget=true,
//      metadata.reseller_request_id === requestId, links back to the
//      credit_transactions row via credit_transaction_id (route.ts:271-287).
//   4. reseller_requests UPDATE — status=approved with linked_credit_
//      transaction_id stamped (route.ts:296-310); already covered by the
//      row 175 approve block's response-body assertions.
//
// Folding the DB assertions here (rather than into the admin-requests-
// patch-authz block) matches the existing pattern for the audit-log side
// effects — the "audit-log-writes.spec.ts" file already owns Supabase
// service-role DB peeks via loadSupabaseAdmin(), so the ledger reads
// piggyback on the same env-gate (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// without a second env-flip. attachApproveTarget() snapshot-restores all
// four writes on fixture.cleanup(), so this block is idempotent under CI
// replay and does not race the row 175 approve block (each attach mints a
// distinct gen_random_uuid() requestId; the metadata->>reseller_request_id
// filter isolates the assertions).
//
// Skip discipline mirrors row 175 approve: describe-scope on admin
// harness; test-scope on fixture load throw / fixture null / attach throw
// / attach null / loginAs throw / supabase null. Distinct decision_reason
// probe ("p10_wave5_row_179_ledger_probe") so a failed cleanup that
// leaks either row surfaces on the next run via the pending-inbox scan
// without confusing rows from the row 175 approve probe.
test.describe("Reseller audit-log writes — P10 wave-5 row 179 approve fan-out ledger assertions", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  let fixture: TempResellerFixture | null = null;
  let fixtureError: Error | null = null;
  let attach: AttachApproveTargetResult | null = null;
  let attachError: Error | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = err as Error;
      return;
    }
    if (!fixture) return;
    try {
      attach = await fixture.attachApproveTarget({
        reason: "p10_wave5_row_179_ledger_probe",
      });
    } catch (err) {
      attachError = err as Error;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // credit_balances / credit_transactions / reseller_credit_grants
        // rows into the next spec worker.
        throw new Error(
          `wave-5 row 179 approve-fanout cleanup failed — ledger tables may still hold rows keyed by reseller_request_id=${attach?.requestId ?? "<none>"}: ${(err as Error).message}`,
        );
      }
    }
  });

  test("approve PATCH writes credit_balances + credit_transactions + reseller_credit_grants rows keyed by reseller_request_id", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${fixtureError.message}. ${tempResellerSkipReason("active_wholesale")}`,
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (attachError) {
      test.skip(
        true,
        `attachApproveTarget threw: ${attachError.message}. Common ` +
          `causes: migration 0091/0095/0096 not applied on this host, or ` +
          `the credit_balances / credit_transactions / reseller_credit_grants ` +
          `/ reseller_requests table missing.`,
      );
      return;
    }
    if (!attach) {
      test.skip(
        true,
        "attachApproveTarget returned null — attributed founder or " +
          "reseller-admin app_users row missing on this host. Run " +
          "scripts/seed-qa-reseller.mjs + scripts/seed-test-users.mjs " +
          "with QA_RESELLER_MULTI_ADMIN=1 to plant both rows.",
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
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

    const actorId = await findUserIdByEmail(supabase, harness!.admin.email);
    expect(
      actorId,
      `expected app_users row for admin ${harness!.admin.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    // Capture cursor BEFORE the PATCH so the audit-row assertion (below,
    // after the ledger triple-write assertions) filters out any pre-existing
    // approve_request rows the same admin may have written against the same
    // target in a previous run. reseller_audit_log is append-only per
    // migration 0093 (mutation triggers block UPDATE/DELETE).
    const patchSince = new Date().toISOString();

    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${attach.requestId}`,
      {
        data: {
          action: "approve",
          decision_reason: "p10_wave5_row_179_ledger_probe",
        },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `approve returned ${patchResp.status()} — expected 200 after the credit-ledger triple-write. Body: ${await patchResp.text()}`,
    ).toBe(200);

    const expectedBalance = (attach.balanceBefore ?? 0) + attach.requestedAmount;
    const expectedLifetime =
      (attach.lifetimeEarnedBefore ?? 0) + attach.requestedAmount;

    // 1. credit_balances — UPSERT bumps balance + lifetime_earned by
    //    payload.requested_amount. A regression that dropped either write
    //    (or swapped the sign) surfaces here as a mismatch against the
    //    snapshot captured by attachApproveTarget().
    const { data: balanceRow, error: balReadErr } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_earned")
      .eq("user_id", attach.targetUserId)
      .maybeSingle();
    expect(
      balReadErr,
      `credit_balances read failed for target_user_id=${attach.targetUserId}: ${balReadErr?.message}`,
    ).toBeNull();
    expect(
      balanceRow,
      `expected a credit_balances row for target_user_id=${attach.targetUserId} after approve UPSERT`,
    ).not.toBeNull();
    expect(
      Number(balanceRow!.balance),
      `credit_balances.balance mismatch: expected ${expectedBalance} (balanceBefore=${attach.balanceBefore} + requested=${attach.requestedAmount}), got ${balanceRow!.balance}`,
    ).toBe(expectedBalance);
    expect(
      Number(balanceRow!.lifetime_earned),
      `credit_balances.lifetime_earned mismatch: expected ${expectedLifetime} (lifetimeEarnedBefore=${attach.lifetimeEarnedBefore} + requested=${attach.requestedAmount}), got ${balanceRow!.lifetime_earned}`,
    ).toBe(expectedLifetime);

    // 2. credit_transactions — INSERT with reason='reseller_grant_over_budget',
    //    amount === requestedAmount, metadata.reseller_request_id === requestId.
    //    Filter by metadata path so parallel workers do not collide on the
    //    (user_id, amount) tuple; the requestId is a fresh UUID per attach
    //    call.
    const { data: txRows, error: txReadErr } = await supabase
      .from("credit_transactions")
      .select("id, amount, balance_after, reason, granted_by_reseller_id, metadata")
      .eq("user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      txReadErr,
      `credit_transactions read failed for reseller_request_id=${attach.requestId}: ${txReadErr?.message}`,
    ).toBeNull();
    expect(
      txRows?.length ?? 0,
      `expected exactly 1 credit_transactions row for reseller_request_id=${attach.requestId}; got ${txRows?.length ?? 0}. A regression that fired the INSERT twice (e.g. missing idempotency guard) or dropped it (approve returned 200 without the INSERT) surfaces here.`,
    ).toBe(1);
    const txRow = txRows![0]!;
    expect(txRow.reason).toBe("reseller_grant_over_budget");
    expect(Number(txRow.amount)).toBe(attach.requestedAmount);
    expect(Number(txRow.balance_after)).toBe(expectedBalance);
    const txMetadata = txRow.metadata as Record<string, unknown> | null;
    expect(
      (txMetadata ?? {})["reseller_request_id"],
      `credit_transactions.metadata.reseller_request_id mismatch: expected ${attach.requestId}, got ${JSON.stringify(txMetadata)}`,
    ).toBe(attach.requestId);

    // 3. reseller_credit_grants — INSERT with kind='grant', over_budget=true,
    //    metadata.reseller_request_id === requestId, credit_transaction_id
    //    links back to the row 2 row. A regression that folded a
    //    sandbox_spend row into the approve branch (impossible per
    //    ck_amount_sign but the assertion catches a schema drift) or
    //    dropped over_budget=true (breaking the monthly budget rollup)
    //    surfaces here.
    const { data: grantRows, error: grantReadErr } = await supabase
      .from("reseller_credit_grants")
      .select("id, kind, amount, over_budget, credit_transaction_id, target_user_id, metadata")
      .eq("target_user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      grantReadErr,
      `reseller_credit_grants read failed for reseller_request_id=${attach.requestId}: ${grantReadErr?.message}`,
    ).toBeNull();
    expect(
      grantRows?.length ?? 0,
      `expected exactly 1 reseller_credit_grants row for reseller_request_id=${attach.requestId}; got ${grantRows?.length ?? 0}. The mirror INSERT lives at route.ts:271-287 — a regression that dropped it surfaces here even though the credit_transactions row (row 2) landed.`,
    ).toBe(1);
    const grantRow = grantRows![0]!;
    expect(grantRow.kind).toBe("grant");
    expect(grantRow.over_budget).toBe(true);
    expect(Number(grantRow.amount)).toBe(attach.requestedAmount);
    expect(
      grantRow.credit_transaction_id,
      `reseller_credit_grants.credit_transaction_id mismatch: expected ${txRow.id} (the row 2 credit_transactions id), got ${grantRow.credit_transaction_id}`,
    ).toBe(txRow.id);

    // 4. reseller_audit_log — the tick 186 non-fatal write from route.ts:338-366
    //    emits exactly one action='approve_request' row per PATCH, keyed on
    //    (reseller_id, actor_user_id, subject_user_id=target_user_id for
    //    over_budget_approval). Filtering by (action, actor, subject, since)
    //    isolates this run from any prior approve_request rows the same
    //    admin may have written against the same target. A regression that
    //    dropped the audit insert (e.g. broke the try/catch swallow into a
    //    throw or moved the insert BEFORE the status flip so it fires on
    //    every failed decode too) surfaces here as count === 0 or > 1.
    const auditCount = await countResellerAuditLogFor(supabase, {
      action: "approve_request",
      actorUserId: actorId!,
      subjectUserId: attach.targetUserId,
      since: patchSince,
    });
    expect(
      auditCount,
      `expected exactly 1 approve_request audit row for (actor=${actorId}, subject=${attach.targetUserId}) since ${patchSince}; got ${auditCount}. Route write lives at web/src/app/api/admin/resellers/requests/[id]/route.ts:338-366 (non-fatal try/catch — a swallowed exception would show as 0).`,
    ).toBe(1);
  });
});

// P10 wave-5 row 179 — deny/cancel symmetric probe. The tick 186 audit
// write in web/src/app/api/admin/resellers/requests/[id]/route.ts:338-366
// fires on approve AND deny AND cancel (action = `${decision.status ===
// "cancelled" ? "cancel" : decision.status === "approved" ? "approve" :
// "deny"}_request`). This block asserts:
//
//   (a) the audit-write side effect is symmetric — deny + cancel each
//       emit exactly one reseller_audit_log row keyed on the same
//       (actor_user_id, subject_user_id) pair the approve branch uses,
//       so the observability surface never silently drops a decision
//       terminal from a regression like a `if decision.status ===
//       'approved'` guard being accidentally added around the insert.
//
//   (b) the ledger triple-write NEVER fires on deny or cancel — a
//       regression that folded a stray credit_balances UPSERT into the
//       terminal handler (e.g. moved the UPSERT above the
//       `if (decision.status === "approved" && current.request_type ===
//       "over_budget_approval")` guard) surfaces here as unexpected
//       credit_transactions / reseller_credit_grants rows keyed by
//       reseller_request_id, or as a mutated credit_balances snapshot.
//
// Fixture: attachApproveTarget() minted an over_budget_approval pending
// request whose payload.target_user_id is set. The route stamps
// subject_user_id from that payload on the audit row for over_budget_
// approval terminals regardless of decision.status, so the deny/cancel
// blocks reuse the same subject-user filter path the approve block uses.
// Each block mints a fresh gen_random_uuid() requestId + distinct probe
// reason ("p10_wave5_row_179_{deny,cancel}_probe") so a leaked cleanup
// row surfaces unambiguously on the pending-inbox scan; the balance
// snapshot restore in fixture.cleanup() is a no-op in the deny/cancel
// case (nothing to restore) but the request-row + audit-row deletes are
// still needed. Note: reseller_audit_log has DELETE-blocking mutation
// triggers per 0093, so leaked audit rows accumulate append-only — the
// `since` cursor in every count query keeps that accumulation from
// poisoning the assertion.
test.describe("Reseller audit-log writes — P10 wave-5 row 179 deny symmetric ledger + audit", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  let fixture: TempResellerFixture | null = null;
  let fixtureError: Error | null = null;
  let attach: AttachApproveTargetResult | null = null;
  let attachError: Error | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = err as Error;
      return;
    }
    if (!fixture) return;
    try {
      attach = await fixture.attachApproveTarget({
        reason: "p10_wave5_row_179_deny_probe",
      });
    } catch (err) {
      attachError = err as Error;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        throw new Error(
          `wave-5 row 179 deny cleanup failed — reseller_requests row keyed by reseller_request_id=${attach?.requestId ?? "<none>"} may leak into the pending inbox: ${(err as Error).message}`,
        );
      }
    }
  });

  test("deny PATCH leaves credit ledger untouched AND emits exactly one deny_request audit row", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${fixtureError.message}. ${tempResellerSkipReason("active_wholesale")}`,
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (attachError) {
      test.skip(
        true,
        `attachApproveTarget threw: ${attachError.message}. Common causes: migration 0091/0095 not applied on this host, or reseller_requests table missing.`,
      );
      return;
    }
    if (!attach) {
      test.skip(
        true,
        "attachApproveTarget returned null — attributed founder or reseller-admin app_users row missing on this host. Run scripts/seed-qa-reseller.mjs + scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to plant both rows.",
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const actorId = await findUserIdByEmail(supabase, harness!.admin.email);
    if (!actorId) {
      test.skip(
        true,
        `admin app_users row missing for ${harness!.admin.email} — seed-test-users.mjs was not run against this host`,
      );
      return;
    }

    const patchSince = new Date().toISOString();
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${attach.requestId}`,
      {
        data: {
          action: "deny",
          decision_reason: "p10_wave5_row_179_deny_probe",
        },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `deny returned ${patchResp.status()} — expected 200 (pure status flip). Body: ${await patchResp.text()}`,
    ).toBe(200);

    // Ledger table 1: credit_balances snapshot MUST match the pre-attach
    // snapshot. A regression that fired the UPSERT on the deny branch
    // would surface as balance !== balanceBefore or lifetime_earned !==
    // lifetimeEarnedBefore. When balanceBefore is null the row must
    // still not exist post-deny.
    const { data: balanceRow, error: balReadErr } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_earned")
      .eq("user_id", attach.targetUserId)
      .maybeSingle();
    expect(
      balReadErr,
      `credit_balances read failed for target_user_id=${attach.targetUserId}: ${balReadErr?.message}`,
    ).toBeNull();
    if (attach.balanceBefore === null) {
      expect(
        balanceRow,
        `credit_balances row for target_user_id=${attach.targetUserId} did not exist before the deny; a row now indicates the deny path incorrectly UPSERTed the balance.`,
      ).toBeNull();
    } else {
      expect(
        balanceRow,
        `credit_balances row for target_user_id=${attach.targetUserId} vanished — cleanup ran early?`,
      ).not.toBeNull();
      expect(
        Number(balanceRow!.balance),
        `credit_balances.balance mutated on deny: expected snapshot ${attach.balanceBefore}, got ${balanceRow!.balance}. The approve-only UPSERT guard at route.ts:209 must not fire on deny.`,
      ).toBe(attach.balanceBefore);
      expect(
        Number(balanceRow!.lifetime_earned),
        `credit_balances.lifetime_earned mutated on deny: expected snapshot ${attach.lifetimeEarnedBefore}, got ${balanceRow!.lifetime_earned}`,
      ).toBe(attach.lifetimeEarnedBefore ?? 0);
    }

    // Ledger table 2: credit_transactions — must be zero rows keyed by
    // reseller_request_id. A regression that let the INSERT escape the
    // approve guard surfaces here.
    const { data: txRows, error: txReadErr } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      txReadErr,
      `credit_transactions read failed for reseller_request_id=${attach.requestId}: ${txReadErr?.message}`,
    ).toBeNull();
    expect(
      txRows?.length ?? 0,
      `expected 0 credit_transactions rows for a denied over_budget_approval keyed by reseller_request_id=${attach.requestId}; got ${txRows?.length ?? 0}. The INSERT at route.ts:255-271 must stay inside the approve guard.`,
    ).toBe(0);

    // Ledger table 3: reseller_credit_grants — must be zero rows keyed
    // by reseller_request_id.
    const { data: grantRows, error: grantReadErr } = await supabase
      .from("reseller_credit_grants")
      .select("id")
      .eq("target_user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      grantReadErr,
      `reseller_credit_grants read failed for reseller_request_id=${attach.requestId}: ${grantReadErr?.message}`,
    ).toBeNull();
    expect(
      grantRows?.length ?? 0,
      `expected 0 reseller_credit_grants rows for a denied over_budget_approval keyed by reseller_request_id=${attach.requestId}; got ${grantRows?.length ?? 0}. The mirror INSERT at route.ts:280-296 must stay inside the approve guard.`,
    ).toBe(0);

    // Audit write: exactly one action='deny_request' row keyed on
    // (actor, subject=target_user_id, since=patchSince). subject_user_id
    // is stamped from payload.target_user_id for over_budget_approval
    // terminals regardless of decision.status per route.ts:340-343.
    const auditCount = await countResellerAuditLogFor(supabase, {
      action: "deny_request",
      actorUserId: actorId,
      subjectUserId: attach.targetUserId,
      since: patchSince,
    });
    expect(
      auditCount,
      `expected exactly 1 deny_request audit row for (actor=${actorId}, subject=${attach.targetUserId}) since ${patchSince}; got ${auditCount}. Route write lives at route.ts:338-366 (non-fatal try/catch — a swallowed exception would show as 0; a duplicated insert would show as > 1).`,
    ).toBe(1);
  });
});

test.describe("Reseller audit-log writes — P10 wave-5 row 179 cancel symmetric ledger + audit", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  let fixture: TempResellerFixture | null = null;
  let fixtureError: Error | null = null;
  let attach: AttachApproveTargetResult | null = null;
  let attachError: Error | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = err as Error;
      return;
    }
    if (!fixture) return;
    try {
      attach = await fixture.attachApproveTarget({
        reason: "p10_wave5_row_179_cancel_probe",
      });
    } catch (err) {
      attachError = err as Error;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        throw new Error(
          `wave-5 row 179 cancel cleanup failed — reseller_requests row keyed by reseller_request_id=${attach?.requestId ?? "<none>"} may leak into the pending inbox: ${(err as Error).message}`,
        );
      }
    }
  });

  test("cancel PATCH leaves credit ledger untouched AND emits exactly one cancel_request audit row", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(
        true,
        `loadTempReseller('active_wholesale') threw: ${fixtureError.message}. ${tempResellerSkipReason("active_wholesale")}`,
      );
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (attachError) {
      test.skip(
        true,
        `attachApproveTarget threw: ${attachError.message}. Common causes: migration 0091/0095 not applied on this host, or reseller_requests table missing.`,
      );
      return;
    }
    if (!attach) {
      test.skip(
        true,
        "attachApproveTarget returned null — attributed founder or reseller-admin app_users row missing on this host. Run scripts/seed-qa-reseller.mjs + scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to plant both rows.",
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const actorId = await findUserIdByEmail(supabase, harness!.admin.email);
    if (!actorId) {
      test.skip(
        true,
        `admin app_users row missing for ${harness!.admin.email} — seed-test-users.mjs was not run against this host`,
      );
      return;
    }

    const patchSince = new Date().toISOString();
    const patchResp = await page.request.patch(
      `${REQUESTS_LIST_ROUTE}/${attach.requestId}`,
      {
        data: {
          action: "cancel",
          decision_reason: "p10_wave5_row_179_cancel_probe",
        },
        headers: { "content-type": "application/json" },
      },
    );
    expect(
      patchResp.status(),
      `cancel returned ${patchResp.status()} — expected 200 (pure status flip). Body: ${await patchResp.text()}`,
    ).toBe(200);

    const { data: balanceRow, error: balReadErr } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_earned")
      .eq("user_id", attach.targetUserId)
      .maybeSingle();
    expect(
      balReadErr,
      `credit_balances read failed for target_user_id=${attach.targetUserId}: ${balReadErr?.message}`,
    ).toBeNull();
    if (attach.balanceBefore === null) {
      expect(
        balanceRow,
        `credit_balances row for target_user_id=${attach.targetUserId} did not exist before the cancel; a row now indicates the cancel path incorrectly UPSERTed the balance.`,
      ).toBeNull();
    } else {
      expect(
        balanceRow,
        `credit_balances row for target_user_id=${attach.targetUserId} vanished — cleanup ran early?`,
      ).not.toBeNull();
      expect(
        Number(balanceRow!.balance),
        `credit_balances.balance mutated on cancel: expected snapshot ${attach.balanceBefore}, got ${balanceRow!.balance}. The approve-only UPSERT guard at route.ts:209 must not fire on cancel.`,
      ).toBe(attach.balanceBefore);
      expect(
        Number(balanceRow!.lifetime_earned),
        `credit_balances.lifetime_earned mutated on cancel: expected snapshot ${attach.lifetimeEarnedBefore}, got ${balanceRow!.lifetime_earned}`,
      ).toBe(attach.lifetimeEarnedBefore ?? 0);
    }

    const { data: txRows, error: txReadErr } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      txReadErr,
      `credit_transactions read failed for reseller_request_id=${attach.requestId}: ${txReadErr?.message}`,
    ).toBeNull();
    expect(
      txRows?.length ?? 0,
      `expected 0 credit_transactions rows for a cancelled over_budget_approval keyed by reseller_request_id=${attach.requestId}; got ${txRows?.length ?? 0}. The INSERT at route.ts:255-271 must stay inside the approve guard.`,
    ).toBe(0);

    const { data: grantRows, error: grantReadErr } = await supabase
      .from("reseller_credit_grants")
      .select("id")
      .eq("target_user_id", attach.targetUserId)
      .filter("metadata->>reseller_request_id", "eq", attach.requestId);
    expect(
      grantReadErr,
      `reseller_credit_grants read failed for reseller_request_id=${attach.requestId}: ${grantReadErr?.message}`,
    ).toBeNull();
    expect(
      grantRows?.length ?? 0,
      `expected 0 reseller_credit_grants rows for a cancelled over_budget_approval keyed by reseller_request_id=${attach.requestId}; got ${grantRows?.length ?? 0}. The mirror INSERT at route.ts:280-296 must stay inside the approve guard.`,
    ).toBe(0);

    const auditCount = await countResellerAuditLogFor(supabase, {
      action: "cancel_request",
      actorUserId: actorId,
      subjectUserId: attach.targetUserId,
      since: patchSince,
    });
    expect(
      auditCount,
      `expected exactly 1 cancel_request audit row for (actor=${actorId}, subject=${attach.targetUserId}) since ${patchSince}; got ${auditCount}. Route write lives at route.ts:338-366 (non-fatal try/catch — a swallowed exception would show as 0; a duplicated insert would show as > 1).`,
    ).toBe(1);
  });
});

// P10 wave-3 row 154 — credit-grant self-approve fan-out audit-log assertion.
// Companion block to the row 152 wire-envelope test in
// credit-grant-authz.spec.ts (line 361). That block owns the response
// envelope (200 + ok=true + credit_transaction_id UUID + over_budget=false +
// month_key YYYY-MM + non-negative remaining_budget); this block owns the
// DB-level audit-row check on the last write the happy path fans out via
// web/src/app/api/reseller/credits/grant/route.ts:227-242:
//
//   db.auditLog({
//     actor_user_id: user.id,          // == fixture.adminUserId
//     subject_user_id: targetUserId,   // == fixture.attributedUserId
//     action: "grant_credits",
//     metadata: { amount, month_key, over_budget:false, credit_transaction_id },
//   })
//
// The route wraps the auditLog() call in try/catch and returns 500
// audit_failed on throw (route.ts:243-248), so a swallowed exception in the
// wrapper would still surface as a non-200 on the credit-grant response —
// but a resellerSupabase.auditLog() regression that returned success without
// inserting the row (e.g., silent RLS deny under an incorrect scope) would
// pass row 152's wire assertions AND leave the reseller_audit_log ledger
// silent on the privileged mutation. That gap is exactly what this block
// closes: the count check runs against the same append-only 0093 ledger the
// wave-5 rows 179 read from, using an ISO cursor captured immediately
// before the POST so prior-run rows against the same (reseller, month) pair
// cannot inflate the assertion.
//
// Folding the audit assertion into audit-log-writes.spec.ts (rather than
// extending credit-grant-authz.spec.ts's row 152 block) mirrors the wave-5
// row 179 topology: authz specs assert on the HTTP contract (status codes,
// response envelopes, cache-column reads) while audit-log-writes.spec.ts
// asserts on the append-only ledger side effect. Downstream a route
// refactor that hoisted the auditLog() call above the credit_transactions
// INSERT would still leave row 152 green (envelope unchanged) but light
// this block up (subject_user_id would remain correct but the actor/subject
// pairing would sit on the pre-mutation branch instead of the post-mutation
// branch — the reseller_audit_log row's metadata.credit_transaction_id
// would drift null which the countResellerAuditLogFor helper already
// filters via the (action, actorUserId, subjectUserId, since) triple).
//
// Skip discipline matches wave-5 row 179 verbatim (five-step: fixtureError
// / fixture null / attributedUserId null / !attributionExists / supabase
// null / adminUserId null / attach null / grant null) so an
// under-provisioned host (no seed-qa-reseller.mjs run, no
// QA_RESELLER_MULTI_ADMIN=1) skips cleanly rather than throwing a
// partial-fixture 500 under Playwright's default parallelism.
test.describe("Reseller audit-log writes — P10 wave-3 row 154 credit-grant fan-out", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // credit_balances / credit_transactions / reseller_credit_grants
        // rows into the next spec worker. reseller_audit_log rows are
        // append-only per migration 0093 and are intentionally NOT swept by
        // fixture.cleanup() — see attachGrantSelfApprove doc-comment.
        throw new Error(
          `wave-3 row 154 cleanup failed — attributed founder's credit_balances / credit_transactions / reseller_credit_grants rows may still leak: ${(err as Error).message}`,
        );
      }
    }
  });

  test("POST /api/reseller/credits/grant emits a reseller_audit_log(grant_credits) row", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    if (!fixture.attributionExists) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so scopedReseller().allowedCustomerIds() would return 403 not_in_scope before decideGrant fires. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }
    if (!fixture.adminUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — adminUserId null (reseller_admins mirror missing on this host) so the auditLog actor_user_id assertion cannot resolve. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    // Mirrors credit-grant-authz.spec.ts row 152 setup: attach the
    // attribution_reseller_id cache column before the POST (not strictly
    // required for the grant route but keeps fixture state consistent with
    // the wave-2 posture) then snapshot credit_balances + register the
    // restore closure so cleanup() reverses the four-write fan-out. Both
    // attaches route through fixture.cleanup() so a mid-request failure
    // still gets swept in afterAll.
    const attributed = await fixture.attachAttributedCustomer();
    if (!attributed) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }
    const AMOUNT = 5;
    const grant = await fixture.attachGrantSelfApprove({ amount: AMOUNT });
    if (!grant) {
      test.skip(
        true,
        "attachGrantSelfApprove() returned null — credit_balances snapshot failed or adminUserId missing after beforeAll seed.",
      );
      return;
    }

    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }

    // Capture cursor BEFORE the POST so prior-run rows against the same
    // (actor, subject) pair cannot poison the count. reseller_audit_log is
    // append-only per migration 0093 (mutation triggers block UPDATE/DELETE)
    // so the `since` filter is the only sweep-free way to scope this.
    const grantSince = new Date().toISOString();
    const resp = await page.request.post("/api/reseller/credits/grant", {
      data: { target_user_id: fixture.attributedUserId, amount: AMOUNT },
    });
    expect(
      resp.status(),
      `credit-grant route returned ${resp.status()} — expected 200 with the fixture-attributed customer. Body: ${await resp.text()}`,
    ).toBe(200);

    const auditCount = await countResellerAuditLogFor(supabase, {
      action: "grant_credits",
      actorUserId: fixture.adminUserId,
      subjectUserId: fixture.attributedUserId,
      since: grantSince,
    });
    expect(
      auditCount,
      `expected ≥1 grant_credits audit row for (actor=${fixture.adminUserId}, subject=${fixture.attributedUserId}) since ${grantSince}; got ${auditCount}. Route write lives at route.ts:227-242 — a 200 without a matching audit row would flag either a resellerSupabase.auditLog() regression or an RLS-scope drift on the append-only 0093 ledger.`,
    ).toBeGreaterThanOrEqual(1);
  });
});

// P10 wave-3 row 155 — credit-grant self-approve mirror-row DB assertion.
// Companion block to row 152 (HTTP wire envelope in credit-grant-authz.spec.ts)
// and row 154 (grant_credits audit-log row above). This block owns the
// DB-level mirror-row check on the fourth write in the fan-out:
//
//   web/src/app/api/reseller/credits/grant/route.ts:206-218 —
//     supabase.from('reseller_credit_grants').insert({
//       reseller_id, target_user_id, kind:'grant', amount,
//       credit_transaction_id, month_key, over_budget:false,
//       granted_by_user_id, metadata: { reason, ...clientMetadata },
//     })
//
// Row 152's response envelope + row 154's audit trail would both stay green
// under a regression that dropped the mirror insert (e.g. a silent RLS deny
// on the reseller_credit_grants scope, or a route refactor that moved the
// insert behind an early return), because the endpoint returns 200 the
// moment the credit_transactions row lands and the auditLog() call at
// route.ts:227-242 runs against the append-only 0093 ledger which the mirror
// table does not share. Only a mirror-scoped count assertion catches that
// drift — which is exactly what this row does.
//
// Assertion: after a 200 self-approve POST, exactly ONE new
// reseller_credit_grants row exists for the (reseller_id, target_user_id)
// pair since the pre-request cursor. `since` is captured immediately before
// the POST because reseller_credit_grants accumulates across the whole
// month_key window (route.ts:214 stamps YYYY-MM) — a prior-run row against
// the same customer would otherwise inflate the count.
//
// Cleanup posture matches row 154: attachGrantSelfApprove() closure sweeps
// reseller_credit_grants first (before credit_transactions so the FK
// credit_transaction_id → credit_transactions.id doesn't dangle), then
// credit_transactions, then credit_balances (upsert-back or delete branch).
// reseller_audit_log rows stay in place (append-only per 0093 mutation
// triggers) — row 154's since cursor still catches drift on the next run.
//
// Skip-guard replicates row 154 verbatim so an under-provisioned host
// (missing seed-qa-reseller.mjs, no QA_RESELLER_MULTI_ADMIN=1) skips cleanly
// rather than false-failing on a partial-fixture 500.
test.describe("Reseller credit-grant mirror row — P10 wave-3 row 155", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        throw new Error(
          `wave-3 row 155 cleanup failed — attributed founder's credit_balances / credit_transactions / reseller_credit_grants rows may still leak: ${(err as Error).message}`,
        );
      }
    }
  });

  test("POST /api/reseller/credits/grant inserts exactly one reseller_credit_grants(kind='grant') mirror row", async ({
    page,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    if (!fixture.attributionExists) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so scopedReseller().allowedCustomerIds() would return 403 not_in_scope before decideGrant fires. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }
    if (!fixture.adminUserId) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — adminUserId null (reseller_admins mirror missing on this host) so the mirror row's granted_by_user_id column cannot resolve. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }

    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
      return;
    }

    const attributed = await fixture.attachAttributedCustomer();
    if (!attributed) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }
    const AMOUNT = 5;
    const grant = await fixture.attachGrantSelfApprove({ amount: AMOUNT });
    if (!grant) {
      test.skip(
        true,
        "attachGrantSelfApprove() returned null — credit_balances snapshot failed or adminUserId missing after beforeAll seed.",
      );
      return;
    }

    try {
      await loginAs(page, fixture.adminEmail);
    } catch (err) {
      test.skip(
        true,
        `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1.`,
      );
      return;
    }

    // Capture cursor BEFORE the POST so prior-run mirror rows against the
    // same (reseller_id, target_user_id) pair (which accumulate across the
    // whole month_key window per route.ts:214) cannot poison the count.
    const grantSince = new Date().toISOString();
    const resp = await page.request.post("/api/reseller/credits/grant", {
      data: { target_user_id: fixture.attributedUserId, amount: AMOUNT },
    });
    expect(
      resp.status(),
      `credit-grant route returned ${resp.status()} — expected 200 with the fixture-attributed customer. Body: ${await resp.text()}`,
    ).toBe(200);

    const mirrorCount = await countResellerCreditGrantsFor(supabase, {
      resellerId: fixture.resellerId,
      targetUserId: fixture.attributedUserId,
      kind: "grant",
      since: grantSince,
    });
    expect(
      mirrorCount,
      `expected exactly 1 reseller_credit_grants(kind='grant') mirror row for (reseller=${fixture.resellerId}, target=${fixture.attributedUserId}) since ${grantSince}; got ${mirrorCount}. Route write lives at route.ts:206-218 — 0 flags a silent mirror-insert regression (route drops the insert or RLS scope drift); >1 flags a duplicated write (fan-out ran twice).`,
    ).toBe(1);
  });
});

// P10 wave-3 row 156b DB companion — three-chained credit-grant mirror-row
// fanout DB assertion. Companion to row 156b's HTTP arithmetic block in
// credit-grant-authz.spec.ts (tick 204) and extension of row 155's single-
// grant mirror-row assertion above. Row 156b pins the response-envelope
// balance identity across three sequential POSTs (5 → 3 → 2 landing on 10)
// but never verifies that the mirror-INSERT fan-out fired three times — a
// regression where the on-conflict UPSERT on POST 2 OR POST 3 silently
// dropped the reseller_credit_grants insert while still returning 200 with
// the correct credit_balances math would leave row 156b green. This block
// closes that gap by counting kind='grant' rows for (resellerId,
// targetUserId) since a single pre-first-POST cursor and asserting == 3.
//
// Assertion contract:
//   - After three chained self-approve POSTs, exactly 3 mirror rows land
//     for the (reseller_id, target_user_id) pair with kind='grant' since
//     the pre-first-POST cursor.
//   - 0 → all three inserts dropped (unlikely — would also break row 155).
//   - 1 → only the first insert landed; POST 2 and POST 3 silently skipped.
//   - 2 → one of the three inserts silently dropped (specific to on-conflict
//     UPSERT paths that only re-fire the credit_transactions insert without
//     the mirror insert).
//   - >3 → duplicated write on one of the three POSTs (fan-out ran twice).
//
// The single-cursor posture is deliberate: row 155 uses a fresh cursor per
// POST because it only ever fires one, but a three-cursor design here would
// mask a POST 3 regression that also duplicated a POST 1 row (both cursors
// would see their expected 1 each). One cursor spanning all three POSTs
// gives a single unambiguous count that catches drop, duplicate, AND
// cross-POST misattribution simultaneously.
//
// Cleanup topology inherits row 156b's LIFO restore-closure order (three
// attachGrantSelfApprove calls push A, B, C snapshots; cleanup pops
// C→B→A). fixture.cleanup() at the end of the try/finally sweeps all
// three reseller_credit_grants rows before their FK-linked
// credit_transactions rows to satisfy credit_transaction_id → credit_
// transactions.id, mirroring the row 156b posture in credit-grant-authz.
// reseller_audit_log rows stay in place (append-only per migration 0093).
//
// Sits in audit-log-writes.spec.ts per the same topology decision that
// placed row 155 here: authz specs own the HTTP contract (row 156b in
// credit-grant-authz.spec.ts); audit-log-writes.spec.ts owns the DB-level
// side effects on the append-only ledger + mirror table. A future row
// 156c four-chain variant would sit alongside this block, sharing the
// same fixture and helper.
//
// Non-Stripe / non-GST discipline: pure reseller_credit_grants +
// credit_transactions + credit_balances writes; no promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision
// dependency. P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Reseller credit-grant mirror rows — P10 wave-3 row 156b DB companion (three-chain fanout)", () => {
  test("three chained self-approve POSTs insert exactly 3 reseller_credit_grants(kind='grant') mirror rows", async ({
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
    const supabase = loadSupabaseAdmin();
    if (!supabase) {
      test.skip(true, supabaseAdminSkipReason());
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
      const grant1 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_ONE });
      if (!grant1) {
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

      // Single cursor spanning all three POSTs — see header for rationale.
      const chainSince = new Date().toISOString();

      const resp1 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200. Body: ${await resp1.text()}`,
      ).toBe(200);

      const grant2 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_TWO });
      if (!grant2) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const resp2 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_TWO },
      });
      expect(
        resp2.status(),
        `POST 2 returned ${resp2.status()} — expected 200. Body: ${await resp2.text()}`,
      ).toBe(200);

      const grant3 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_THREE });
      if (!grant3) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const resp3 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_THREE },
      });
      expect(
        resp3.status(),
        `POST 3 returned ${resp3.status()} — expected 200. Body: ${await resp3.text()}`,
      ).toBe(200);

      const mirrorCount = await countResellerCreditGrantsFor(supabase, {
        resellerId: fixture.resellerId,
        targetUserId,
        kind: "grant",
        since: chainSince,
      });
      expect(
        mirrorCount,
        `expected exactly 3 reseller_credit_grants(kind='grant') mirror rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}; got ${mirrorCount}. Route write lives at route.ts:206-218. ` +
          `0 → all three inserts dropped (would also break row 155); ` +
          `1 → POST 2 and POST 3 silently skipped the mirror insert despite 200; ` +
          `2 → one of the three chained mirror inserts silently dropped (on-conflict UPSERT path re-fired credit_transactions but not reseller_credit_grants); ` +
          `>3 → duplicated write on one of the three POSTs (fan-out ran twice on a single request).`,
      ).toBe(3);
    } finally {
      await fixture.cleanup();
    }
  });
});
