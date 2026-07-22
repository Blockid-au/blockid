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
    // Strict === 1: /api/reseller/customers/[id]/drawer/route.ts:120-129
    // performs exactly one db.auditLog() call per successful call, wrapped in
    // try/catch that returns 500 audit_failed on throw. The since cursor was
    // captured immediately before the GET so cross-run rows cannot inflate the
    // count. A regression that hoisted the audit call into a retry loop or
    // duplicated it (e.g. a defensive double-emit around a route refactor)
    // would slip past the prior ≥ 1 assertion but flag here.
    expect(
      drawerCount,
      `expected exactly 1 view_customer_drawer audit row for (actor=${actorId}, subject=${attach.attributedUserId}) since ${drawerSince}; got ${drawerCount}`,
    ).toBe(1);

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
    // Strict === 1: /api/reseller/customers/[id]/reveal-email/route.ts:78-93
    // performs exactly one db.auditLog() call per successful call. Same
    // rationale as the drawer companion assertion above — since cursor
    // captured immediately before POST, so count > 1 flags a duplicate-emit
    // regression.
    expect(
      revealCount,
      `expected exactly 1 reveal_email audit row for (actor=${actorId}, subject=${attach.attributedUserId}) since ${revealSince}; got ${revealCount}`,
    ).toBe(1);
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

    // 3b. Second-lens mirror-row count via countResellerCreditGrantsFor —
    //     aligns the admin-approve fan-out mirror lens with the self-approve
    //     lenses used by rows 155 / 156 DB companion / 156b DB companion in
    //     this same file, so both branches of the credit-grant surface
    //     (POST /api/reseller/credits/grant self-approve + PATCH
    //     /api/admin/resellers/requests/[id] over_budget approve) share a
    //     single shared counting helper for their mirror-row assertions.
    //     Diagnostic delta vs the shape read above: the shape read scopes
    //     only by (target_user_id, metadata->>reseller_request_id), so a
    //     regression that landed the mirror insert but keyed it to a
    //     different reseller_id (e.g. actor_user_id inadvertently threaded
    //     as reseller_id, or a schema drift where reseller_id defaulted to
    //     the admin's user_id under a broken CTE) would still return the
    //     matching row and leave the shape read green. Filtering by
    //     (reseller_id=fixture.resellerId, target_user_id, kind='grant',
    //     since=patchSince) additionally guards that dimension. The
    //     `patchSince` cursor is already captured at line 441 before the
    //     PATCH so cross-run mirror rows against the same pair (which
    //     accumulate across the whole month_key window per route.ts:214)
    //     cannot poison the count. Same shape/count split posture used by
    //     rows 155 / 156 DB companion / 156b DB companion for the self-
    //     approve path.
    const mirrorCount = await countResellerCreditGrantsFor(supabase, {
      resellerId: fixture.resellerId,
      targetUserId: attach.targetUserId,
      kind: "grant",
      since: patchSince,
    });
    expect(
      mirrorCount,
      `expected exactly 1 reseller_credit_grants(kind='grant') mirror row for (reseller=${fixture.resellerId}, target=${attach.targetUserId}) since ${patchSince}; got ${mirrorCount}. Route write lives at web/src/app/api/admin/resellers/requests/[id]/route.ts:271-287. 0 → mirror insert dropped OR keyed to a different reseller_id (shape read above would stay green under the reseller_id-drift regression); >1 → duplicated write (fan-out ran twice).`,
    ).toBe(1);

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

    // Ledger table 3b (second-lens negative). Mirrors the tick 208 approve
    // shape+helper alignment onto the deny branch: the shape read above is
    // scoped only by (target_user_id, metadata->>reseller_request_id) so a
    // regression that landed a stray mirror insert on the deny branch AND
    // keyed it to a different reseller_id (e.g. actor_user_id inadvertently
    // threaded as reseller_id, or a schema drift where reseller_id defaulted
    // to the admin's user_id under a broken CTE) would leak past the
    // metadata-scoped read. Filtering by (reseller_id=fixture.resellerId,
    // target_user_id, kind='grant', since=patchSince) additionally guards
    // that dimension. `patchSince` is captured at line 727 before the PATCH
    // so cross-run mirror rows against the same (reseller, target) pair —
    // which accumulate across the whole month_key window per route.ts:214
    // when the approve branch DOES fire in a sibling test — cannot poison
    // the count. Expected 0: the deny branch must never emit a
    // reseller_credit_grants row.
    const mirrorCount = await countResellerCreditGrantsFor(supabase, {
      resellerId: fixture.resellerId,
      targetUserId: attach.targetUserId,
      kind: "grant",
      since: patchSince,
    });
    expect(
      mirrorCount,
      `expected 0 reseller_credit_grants(kind='grant') mirror rows for (reseller=${fixture.resellerId}, target=${attach.targetUserId}) since ${patchSince}; got ${mirrorCount}. The mirror INSERT lives at web/src/app/api/admin/resellers/requests/[id]/route.ts:271-287 gated by the same approve+over_budget_approval branch as the credit_transactions insert (route.ts:255-271). >0 → the mirror insert escaped the approve guard, likely under a reseller_id-drift regression that the metadata-scoped shape read above would miss.`,
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

    // Ledger table 3b (second-lens negative). Same shape+helper alignment
    // rationale as the deny block above: the metadata-scoped shape read
    // would stay green under a reseller_id-drift regression that emitted a
    // mirror insert on the cancel branch with reseller_id keyed to
    // actor_user_id (or a default drift). The helper filters by
    // (reseller_id=fixture.resellerId, target_user_id, kind='grant',
    // since=patchSince) so that regression class lights up here. `patchSince`
    // is captured at line 919 before the PATCH; the approve guard at
    // route.ts:271-287 must exclude the cancel branch just as it excludes
    // deny.
    const mirrorCount = await countResellerCreditGrantsFor(supabase, {
      resellerId: fixture.resellerId,
      targetUserId: attach.targetUserId,
      kind: "grant",
      since: patchSince,
    });
    expect(
      mirrorCount,
      `expected 0 reseller_credit_grants(kind='grant') mirror rows for (reseller=${fixture.resellerId}, target=${attach.targetUserId}) since ${patchSince}; got ${mirrorCount}. The mirror INSERT lives at web/src/app/api/admin/resellers/requests/[id]/route.ts:271-287 gated by the same approve+over_budget_approval branch as the credit_transactions insert. >0 → the mirror insert escaped the approve guard, likely under a reseller_id-drift regression that the metadata-scoped shape read above would miss.`,
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
    // Strict === 1: /api/reseller/credits/grant/route.ts:226-248 performs
    // exactly one db.auditLog() call per successful POST, wrapped in try/catch
    // that returns 500 audit_failed on throw. The since cursor was captured
    // immediately before the POST so cross-run rows against the same
    // (actor, subject) pair cannot inflate the count. Prior ≥ 1 posture
    // silently accepted a duplicate-emit regression (e.g. a retry loop or a
    // second auditLog() call landed by a route refactor); === 1 flags it.
    expect(
      auditCount,
      `expected exactly 1 grant_credits audit row for (actor=${fixture.adminUserId}, subject=${fixture.attributedUserId}) since ${grantSince}; got ${auditCount}. Route write lives at route.ts:227-242 — a 200 with 0 rows flags a resellerSupabase.auditLog() regression or an RLS-scope drift on the append-only 0093 ledger; > 1 flags a duplicate-emit regression that the prior ≥ 1 posture silently accepted.`,
    ).toBe(1);
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

    // Parse the response envelope once — used for both the mirror-row shape
    // read below (credit_transaction_id FK match) and to catch drift where
    // route.ts:250-260 stops echoing credit_transaction_id / month_key.
    const body = (await resp.json()) as {
      ok: boolean;
      credit_transaction_id?: string;
      month_key?: string;
      over_budget?: boolean;
      balance?: number;
    };
    expect(body.ok, `body.ok should be true: ${JSON.stringify(body)}`).toBe(true);
    expect(typeof body.credit_transaction_id).toBe("string");
    expect(body.credit_transaction_id ?? "").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

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

    // Second-lens shape read on the mirror row — pins per-field values that
    // the count-only helper above cannot catch. Companion assertion to the
    // shape+helper alignment ticks 208-209 landed on row 179 approve/deny/
    // cancel branches and tick 207 landed on row 156b DB companion three-
    // chain. A regression that landed the mirror insert with wrong
    // granted_by_user_id (e.g. NULL, or targetUserId, or a stale actor),
    // wrong amount (off-by-one), wrong over_budget (true when a self-approve
    // POST never trips gate 3), wrong month_key (AEST vs UTC drift on the
    // route.ts:101 monthKey() call), wrong metadata.reason (route default
    // dropped or overridden), or wrong credit_transaction_id FK (dangling
    // or pointing at a prior-run tx) would leave mirrorCount === 1 green
    // while surfacing here on the specific-field assertion. Scoped by
    // (reseller_id, target_user_id, kind='grant', created_at >= grantSince)
    // so parallel workers on the same variant do not collide and prior-run
    // rows under the same month_key window cannot poison the read.
    const { data: mirrorRow, error: mirrorReadErr } = await supabase
      .from("reseller_credit_grants")
      .select(
        "kind, amount, over_budget, granted_by_user_id, credit_transaction_id, month_key, metadata",
      )
      .eq("reseller_id", fixture.resellerId)
      .eq("target_user_id", fixture.attributedUserId)
      .eq("kind", "grant")
      .gte("created_at", grantSince)
      .maybeSingle();
    expect(
      mirrorReadErr,
      `reseller_credit_grants shape read failed for (reseller=${fixture.resellerId}, target=${fixture.attributedUserId}) since ${grantSince}: ${mirrorReadErr?.message}`,
    ).toBeNull();
    expect(
      mirrorRow,
      `expected the reseller_credit_grants row for (reseller=${fixture.resellerId}, target=${fixture.attributedUserId}) since ${grantSince} to resolve after mirrorCount===1 landed — a null row here would flag an RLS scope drift between countResellerCreditGrantsFor's count(*) and the shape SELECT (both go through loadSupabaseAdmin's service-role client so this should never race).`,
    ).not.toBeNull();
    expect(mirrorRow!.kind).toBe("grant");
    expect(Number(mirrorRow!.amount)).toBe(AMOUNT);
    expect(mirrorRow!.over_budget).toBe(false);
    expect(
      mirrorRow!.granted_by_user_id,
      `reseller_credit_grants.granted_by_user_id mismatch: expected fixture.adminUserId=${fixture.adminUserId}, got ${mirrorRow!.granted_by_user_id}. A regression that threaded targetUserId here (a self-service credit theft class) or NULL'd the column (would break the P4 audit-trail attribution) surfaces here.`,
    ).toBe(fixture.adminUserId);
    expect(
      mirrorRow!.credit_transaction_id,
      `reseller_credit_grants.credit_transaction_id mismatch: expected ${body.credit_transaction_id} (the response body's echo of the credit_transactions.id INSERT at route.ts:187-198), got ${mirrorRow!.credit_transaction_id}. A dangling FK here means route.ts:213 read from the wrong txRow variable (e.g. shadowed by a refactor) or the mirror INSERT stamped a stale UUID from a prior in-request scope.`,
    ).toBe(body.credit_transaction_id);
    // month_key is stamped by route.ts:101 via monthKey(new Date()) which
    // mirrors web/src/lib/reseller/credit-grants.ts:34's YYYY-MM UTC
    // discipline. Assert by computing the current UTC month key inline (no
    // import from app libs per audit-log-writes.spec.ts's fixture-only
    // import discipline). A drift to AEST here would surface on the first
    // of each UTC month between 00:00 and 10:00 UTC (10 AM AEST = 00 UTC),
    // which is when the credit-reset cron rolls the budget window.
    const now = new Date();
    const expectedMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(
      mirrorRow!.month_key,
      `reseller_credit_grants.month_key mismatch: expected ${expectedMonthKey} (UTC YYYY-MM at test time), got ${mirrorRow!.month_key}.`,
    ).toBe(expectedMonthKey);
    // Response echo already pinned month_key via body.month_key; assert
    // the DB row matches the echo too so a regression that split the two
    // (e.g. mirror INSERT stamps its own key from a stale variable while
    // the response echo still reads route.ts:101's `key`) surfaces here.
    expect(
      mirrorRow!.month_key,
      `reseller_credit_grants.month_key ${mirrorRow!.month_key} does not match response echo body.month_key ${body.month_key} — a split here means the mirror INSERT stamped a different key from the one route.ts:255 echoes back to the caller.`,
    ).toBe(body.month_key);
    const mirrorMetadata = mirrorRow!.metadata as Record<string, unknown> | null;
    expect(
      (mirrorMetadata ?? {})["reason"],
      `reseller_credit_grants.metadata.reason mismatch: expected 'reseller_grant' (route.ts:74-76 default when body.reason omitted), got ${JSON.stringify(mirrorMetadata)}. This POST omits body.reason so the route falls through to the default; a regression that dropped the default or replaced it with an empty string surfaces here.`,
    ).toBe("reseller_grant");
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
      const body1 = (await resp1.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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
      const body2 = (await resp2.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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
      const body3 = (await resp3.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body3.ok, `POST 3 body.ok should be true: ${JSON.stringify(body3)}`).toBe(true);
      expect(typeof body3.credit_transaction_id).toBe("string");
      expect(body3.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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

      // Second-lens shape read — pins per-field values the count-only helper
      // above cannot catch on any of the three chained mirror rows. Companion
      // assertion to tick 211's row 155 single-POST shape+helper alignment
      // and tick 212's row 156 two-chain shape+helper alignment. The count
      // helper catches "mirror insert dropped" (count<3) and "mirror insert
      // duplicated" (count>3) but stays green under: (a) POST 2 or POST 3's
      // mirror insert reusing a prior POST's credit_transaction_id (FK
      // collision that preserves count but breaks the per-grant ledger
      // link); (b) any row's amount stamped from a stale variable across
      // re-entries (off-by-one on the second or third UPSERT re-entry that
      // still writes the correct credit_balances math); (c) any row's
      // granted_by_user_id NULL'd or threaded as targetUserId (self-service
      // credit theft class); (d) any row's over_budget flipped true when
      // none of the three self-approve POSTs trip gate 3 (5+3+2=10, budget
      // 20000); (e) any row's month_key drifting AEST vs UTC on the first-
      // of-month rollover; (f) any row's metadata.reason dropped or
      // replaced. Rows fetched ordered by created_at ASC so per-row amount
      // matches the sequenced 5/3/2 pin from AMOUNT_ONE/TWO/THREE without
      // a second lookup.
      const { data: mirrorRows, error: mirrorReadErr } = await supabase
        .from("reseller_credit_grants")
        .select(
          "kind, amount, over_budget, granted_by_user_id, credit_transaction_id, month_key, metadata, created_at",
        )
        .eq("reseller_id", fixture.resellerId)
        .eq("target_user_id", targetUserId)
        .eq("kind", "grant")
        .gte("created_at", chainSince)
        .order("created_at", { ascending: true });
      expect(
        mirrorReadErr,
        `reseller_credit_grants shape read failed for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}: ${mirrorReadErr?.message}`,
      ).toBeNull();
      expect(
        mirrorRows,
        `expected the reseller_credit_grants rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince} to resolve after mirrorCount===3 landed — a null result here would flag an RLS scope drift between countResellerCreditGrantsFor's count(*) call path and the shape SELECT (both go through loadSupabaseAdmin's service-role client so this should never race).`,
      ).not.toBeNull();
      expect(mirrorRows!.length).toBe(3);
      // Compute expected UTC month_key inline (no import from app libs per
      // this spec's fixture-only import discipline) — mirrors route.ts:101's
      // monthKey(new Date()) YYYY-MM UTC discipline.
      const nowThreeChain = new Date();
      const expectedMonthKeyThreeChain = `${nowThreeChain.getUTCFullYear()}-${String(nowThreeChain.getUTCMonth() + 1).padStart(2, "0")}`;
      const expectedAmounts = [AMOUNT_ONE, AMOUNT_TWO, AMOUNT_THREE];
      const expectedTxIds = [
        body1.credit_transaction_id,
        body2.credit_transaction_id,
        body3.credit_transaction_id,
      ];
      const expectedBodyMonthKeys = [body1.month_key, body2.month_key, body3.month_key];
      for (let idx = 0; idx < mirrorRows!.length; idx++) {
        const row = mirrorRows![idx]!;
        const metadata = row.metadata as Record<string, unknown> | null;
        expect(row.kind, `mirror row ${idx} kind mismatch: got ${row.kind}`).toBe("grant");
        expect(
          Number(row.amount),
          `mirror row ${idx} amount mismatch: expected ${expectedAmounts[idx]} (POST ${idx + 1} of the 5+3+2 chain), got ${row.amount}. A regression that stamped the amount from a stale variable across UPSERT re-entries surfaces here.`,
        ).toBe(expectedAmounts[idx]);
        expect(
          row.over_budget,
          `mirror row ${idx} over_budget mismatch: expected false (self-approve POST never trips gate 3 at active_wholesale monthly_credit_budget=20000 with a 5+3+2=10 running total), got ${row.over_budget}. A regression that inverted the boolean would break the P11 monthly budget rollup dashboards.`,
        ).toBe(false);
        expect(
          row.granted_by_user_id,
          `mirror row ${idx} granted_by_user_id mismatch: expected fixture.adminUserId=${fixture.adminUserId}, got ${row.granted_by_user_id}. A regression that threaded targetUserId here on any re-entry (a self-service credit theft class where the audit-trail attribution defames the customer as their own grantor) or NULL'd the column surfaces here.`,
        ).toBe(fixture.adminUserId);
        expect(
          row.credit_transaction_id,
          `mirror row ${idx} credit_transaction_id mismatch: expected ${expectedTxIds[idx]} (POST ${idx + 1}'s response body echo of route.ts:187-198's credit_transactions.id INSERT), got ${row.credit_transaction_id}. A dangling FK here means route.ts:213 read from the wrong txRow variable across the UPSERT re-entry, or the mirror INSERT stamped a prior POST's UUID on a later POST (FK collision that preserves count but breaks the per-grant ledger link).`,
        ).toBe(expectedTxIds[idx]);
        expect(
          row.month_key,
          `mirror row ${idx} month_key mismatch: expected ${expectedMonthKeyThreeChain} (UTC YYYY-MM at test time), got ${row.month_key}. A drift to AEST here would surface on the first of each UTC month between 00:00 and 10:00 UTC.`,
        ).toBe(expectedMonthKeyThreeChain);
        expect(
          row.month_key,
          `mirror row ${idx} month_key ${row.month_key} does not match response echo body.month_key ${expectedBodyMonthKeys[idx]} — a split here means the mirror INSERT stamped a different key from the one route.ts:255 echoes back to the caller.`,
        ).toBe(expectedBodyMonthKeys[idx]);
        expect(
          (metadata ?? {})["reason"],
          `mirror row ${idx} metadata.reason mismatch: expected 'reseller_grant' (route.ts:74-76 default when body.reason omitted), got ${JSON.stringify(metadata)}. This POST omits body.reason so the route falls through to the default.`,
        ).toBe("reseller_grant");
      }
      // Distinctness across all three credit_transaction_ids — catches a
      // regression where any later POST's mirror insert stamped an earlier
      // POST's UUID (would preserve mirrorCount===3 AND per-row amount if
      // the wrong txRow variable was read at route.ts:213 but the amount
      // came from the fresh request body). All three pairs — (1,2), (1,3),
      // (2,3) — are covered by the Set-size assertion.
      expect(
        new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size,
        `expected 3 distinct credit_transaction_id values across the three mirror rows; got ${new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size} distinct. A collision here means at least one later UPSERT re-entry linked its mirror row back to an earlier POST's tx (FK integrity survives but the per-grant ledger loses at least one entry).`,
      ).toBe(3);
    } finally {
      await fixture.cleanup();
    }
  });
});

// P10 wave-3 row 156 DB companion — two-chained credit-grant mirror-row
// fanout DB assertion. Companion to row 156's HTTP arithmetic block in
// credit-grant-authz.spec.ts (which pins the response-envelope balance
// identity `balanceBefore + 5 + 3 === 8` across two sequential POSTs) and
// the intermediate step between row 155's single-POST fanout (== 1 mirror
// row) and row 156b's three-chain fanout (== 3 mirror rows).
//
// Rationale for a dedicated two-chain block instead of leaning on
// row 156b: the three-chain assertion counts 3 mirror rows across three
// POSTs, so a regression that landed 2 mirror rows for 3 POSTs and a
// regression that landed 2 mirror rows for 2 POSTs are BOTH surfaced as
// `mirrorCount === 2 !== 3` in the three-chain block — the diagnostic
// signal cannot distinguish "on-conflict UPSERT branch dropped the second
// insert" from "on-conflict UPSERT branch dropped the third insert". The
// two-chain block pins the specific on-conflict UPSERT branch entered by
// POST 2 (the FIRST time route.ts:206-218 re-fires the mirror insert
// against a (reseller_id, target_user_id) pair that already has a row
// under the same month_key window) independently of the third-POST re-
// entry. A route rewrite that collapsed the mirror insert into an
// idempotent-by-month_key branch (assuming the mirror table is a
// per-month rollup rather than a per-grant ledger) would leave row 155
// green (single POST → 1 row) and row 156b failing at mirrorCount==1 with
// the same signal as a two-POST regression — this block splits those
// signals apart.
//
// Assertion contract:
//   - After two chained self-approve POSTs, exactly 2 mirror rows land
//     for the (reseller_id, target_user_id) pair with kind='grant' since
//     the pre-first-POST cursor.
//   - 0 → both inserts dropped (would also break row 155).
//   - 1 → POST 2's mirror insert silently skipped despite the 200
//         envelope — the specific on-conflict UPSERT drift this row pins.
//   - >2 → duplicated write on one of the two POSTs (fan-out ran twice
//          on a single request).
//
// Single-cursor posture inherited from row 156b: a per-POST cursor pair
// would give two independent "expected 1, got 1" assertions but would
// MASK a regression where POST 2 duplicated a POST 1 row (both cursors
// see their expected 1 because the duplicate lands under a different
// cursor window). One cursor spanning both POSTs gives a single
// unambiguous count that catches drop, duplicate, AND cross-POST
// misattribution simultaneously — same discipline row 155 uses for its
// single-POST cursor.
//
// Cleanup topology follows row 156b's LIFO restore-closure order (two
// attachGrantSelfApprove calls push A, B snapshots; cleanup pops B→A).
// fixture.cleanup() at the end of the try/finally sweeps both
// reseller_credit_grants rows before their FK-linked credit_transactions
// rows to satisfy credit_transaction_id → credit_transactions.id.
// reseller_audit_log rows stay in place (append-only per migration 0093).
//
// Sits in audit-log-writes.spec.ts per the same topology decision that
// placed rows 155 + 156b here: authz specs own the HTTP contract (row
// 156 in credit-grant-authz.spec.ts); audit-log-writes.spec.ts owns the
// DB-level side effects on the append-only ledger + mirror table.
//
// Amounts 5 + 3 chosen to match row 156's HTTP arithmetic pin verbatim
// so both blocks share the same test-side fixture state under CI replay.
// Running total (8) stays well under active_wholesale's
// monthly_credit_budget=20000 so gate 3 fires on both POSTs without ever
// tripping over_budget_requires_approval (402). Same CI-replay posture
// as rows 152/155/156/156b.
//
// Non-Stripe / non-GST discipline: pure reseller_credit_grants +
// credit_transactions + credit_balances writes; no promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision
// dependency. P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Reseller credit-grant mirror rows — P10 wave-3 row 156 DB companion (two-chain fanout)", () => {
  test("two chained self-approve POSTs insert exactly 2 reseller_credit_grants(kind='grant') mirror rows", async ({
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

      // Single cursor spanning both POSTs — see header for rationale.
      const chainSince = new Date().toISOString();

      const resp1 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200. Body: ${await resp1.text()}`,
      ).toBe(200);
      const body1 = (await resp1.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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
      const body2 = (await resp2.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const mirrorCount = await countResellerCreditGrantsFor(supabase, {
        resellerId: fixture.resellerId,
        targetUserId,
        kind: "grant",
        since: chainSince,
      });
      expect(
        mirrorCount,
        `expected exactly 2 reseller_credit_grants(kind='grant') mirror rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}; got ${mirrorCount}. Route write lives at route.ts:206-218. ` +
          `0 → both inserts dropped (would also break row 155); ` +
          `1 → POST 2 silently skipped the mirror insert despite 200 (on-conflict UPSERT re-fired credit_transactions but not reseller_credit_grants — the specific drift this row pins independently of the row 156b three-chain block); ` +
          `>2 → duplicated write on one of the two POSTs (fan-out ran twice on a single request).`,
      ).toBe(2);

      // Second-lens shape read — pins per-field values the count-only helper
      // above cannot catch on either of the two chained mirror rows. Companion
      // assertion to tick 211's row 155 single-POST shape+helper alignment and
      // tick 212's row 156b three-chain shape+helper alignment. The count
      // helper catches "mirror insert dropped" (count<2) and "mirror insert
      // duplicated" (count>2) but stays green under: (a) POST 2's mirror
      // insert reusing POST 1's credit_transaction_id (FK collision that
      // preserves count but breaks the per-grant ledger link); (b) POST 2's
      // amount stamped as POST 1's amount (off-by-one on the second UPSERT
      // re-entry that still writes the correct credit_balances math); (c)
      // either row's granted_by_user_id NULL'd or threaded as targetUserId
      // (self-service credit theft class); (d) either row's over_budget
      // flipped true when neither self-approve POST trips gate 3; (e) either
      // row's month_key drifting AEST vs UTC on the first-of-month rollover;
      // (f) either row's metadata.reason dropped or replaced. Rows fetched
      // ordered by created_at ASC so per-row amount matches the sequenced
      // 5/3 pin from AMOUNT_ONE/AMOUNT_TWO without a second lookup.
      const { data: mirrorRows, error: mirrorReadErr } = await supabase
        .from("reseller_credit_grants")
        .select(
          "kind, amount, over_budget, granted_by_user_id, credit_transaction_id, month_key, metadata, created_at",
        )
        .eq("reseller_id", fixture.resellerId)
        .eq("target_user_id", targetUserId)
        .eq("kind", "grant")
        .gte("created_at", chainSince)
        .order("created_at", { ascending: true });
      expect(
        mirrorReadErr,
        `reseller_credit_grants shape read failed for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}: ${mirrorReadErr?.message}`,
      ).toBeNull();
      expect(
        mirrorRows,
        `expected the reseller_credit_grants rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince} to resolve after mirrorCount===2 landed — a null result here would flag an RLS scope drift between countResellerCreditGrantsFor's count(*) call path and the shape SELECT (both go through loadSupabaseAdmin's service-role client so this should never race).`,
      ).not.toBeNull();
      expect(mirrorRows!.length).toBe(2);
      // Compute expected UTC month_key inline (no import from app libs per
      // this spec's fixture-only import discipline) — mirrors route.ts:101's
      // monthKey(new Date()) YYYY-MM UTC discipline.
      const nowTwoChain = new Date();
      const expectedMonthKeyTwoChain = `${nowTwoChain.getUTCFullYear()}-${String(nowTwoChain.getUTCMonth() + 1).padStart(2, "0")}`;
      const expectedAmounts = [AMOUNT_ONE, AMOUNT_TWO];
      const expectedTxIds = [body1.credit_transaction_id, body2.credit_transaction_id];
      const expectedBodyMonthKeys = [body1.month_key, body2.month_key];
      for (let idx = 0; idx < mirrorRows!.length; idx++) {
        const row = mirrorRows![idx]!;
        const metadata = row.metadata as Record<string, unknown> | null;
        expect(row.kind, `mirror row ${idx} kind mismatch: got ${row.kind}`).toBe("grant");
        expect(
          Number(row.amount),
          `mirror row ${idx} amount mismatch: expected ${expectedAmounts[idx]} (POST ${idx + 1} of the 5+3 chain), got ${row.amount}. A regression that stamped the amount from a stale variable across the two UPSERT re-entries surfaces here.`,
        ).toBe(expectedAmounts[idx]);
        expect(
          row.over_budget,
          `mirror row ${idx} over_budget mismatch: expected false (self-approve POST never trips gate 3 at active_wholesale monthly_credit_budget=20000 with a 5+3=8 running total), got ${row.over_budget}. A regression that inverted the boolean would break the P11 monthly budget rollup dashboards.`,
        ).toBe(false);
        expect(
          row.granted_by_user_id,
          `mirror row ${idx} granted_by_user_id mismatch: expected fixture.adminUserId=${fixture.adminUserId}, got ${row.granted_by_user_id}. A regression that threaded targetUserId here on either re-entry (a self-service credit theft class where the audit-trail attribution defames the customer as their own grantor) or NULL'd the column surfaces here.`,
        ).toBe(fixture.adminUserId);
        expect(
          row.credit_transaction_id,
          `mirror row ${idx} credit_transaction_id mismatch: expected ${expectedTxIds[idx]} (POST ${idx + 1}'s response body echo of route.ts:187-198's credit_transactions.id INSERT), got ${row.credit_transaction_id}. A dangling FK here means route.ts:213 read from the wrong txRow variable across the UPSERT re-entry, or the mirror INSERT stamped POST 1's UUID on POST 2 (FK collision that preserves count but breaks the per-grant ledger link).`,
        ).toBe(expectedTxIds[idx]);
        expect(
          row.month_key,
          `mirror row ${idx} month_key mismatch: expected ${expectedMonthKeyTwoChain} (UTC YYYY-MM at test time), got ${row.month_key}. A drift to AEST here would surface on the first of each UTC month between 00:00 and 10:00 UTC.`,
        ).toBe(expectedMonthKeyTwoChain);
        expect(
          row.month_key,
          `mirror row ${idx} month_key ${row.month_key} does not match response echo body.month_key ${expectedBodyMonthKeys[idx]} — a split here means the mirror INSERT stamped a different key from the one route.ts:255 echoes back to the caller.`,
        ).toBe(expectedBodyMonthKeys[idx]);
        expect(
          (metadata ?? {})["reason"],
          `mirror row ${idx} metadata.reason mismatch: expected 'reseller_grant' (route.ts:74-76 default when body.reason omitted), got ${JSON.stringify(metadata)}. This POST omits body.reason so the route falls through to the default.`,
        ).toBe("reseller_grant");
      }
      // Distinctness across the two credit_transaction_ids catches a
      // regression where POST 2's mirror insert stamped POST 1's UUID
      // (would preserve mirrorCount===2 AND per-row amount if the wrong
      // txRow variable was read at route.ts:213 but the amount came from
      // the fresh POST 2 request body).
      expect(
        new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size,
        `expected 2 distinct credit_transaction_id values across the two mirror rows; got ${mirrorRows!.length - (mirrorRows!.length - new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size)} distinct. A collision here means the second UPSERT re-entry linked its mirror row back to the first POST's tx (FK integrity survives but the per-grant ledger loses one entry).`,
      ).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });
});

// P10 wave-3 row 156c DB companion — four-chained credit-grant mirror-row
// fanout DB assertion. Companion to row 156c's HTTP arithmetic block in
// credit-grant-authz.spec.ts (this tick) and extension of the row 155 /
// row 156 DB companion / row 156b DB companion staircase above:
//   - row 155              → 1 mirror row after a single POST
//   - row 156 DB companion → 2 mirror rows after two chained POSTs
//   - row 156b DB companion → 3 mirror rows after three chained POSTs
//   - row 156c DB companion → 4 mirror rows after four chained POSTs (this)
//
// Row 156c HTTP pins the response-envelope balance identity `balanceBefore
// + 5 + 3 + 2 + 1 === 11` across four sequential POSTs but never verifies
// that the mirror-INSERT fan-out fired four times — a regression where the
// on-conflict UPSERT on POST 2, POST 3, OR POST 4 silently dropped the
// reseller_credit_grants insert while still returning 200 with the correct
// credit_balances math would leave row 156c HTTP green. This block closes
// that gap by counting kind='grant' rows for (resellerId, targetUserId)
// since a single pre-first-POST cursor and asserting == 4.
//
// Diagnostic power of the four-chain vs three-chain: row 156b DB companion
// catches the failure mode "on-conflict UPSERT drops the mirror insert on
// re-entry" but cannot distinguish WHICH re-entry (POST 2, POST 3) dropped
// it — mirrorCount === 2 in the three-chain block is ambiguous between
// "POST 2 dropped" and "POST 3 dropped". The four-chain block extends the
// staircase by one step so a regression that only affects the THIRD on-
// conflict re-entry (POST 4 here, the second re-re-entry) surfaces here at
// mirrorCount === 3 while the row 156b DB companion still sees its
// expected mirrorCount === 3 (its assertion is `expect(mirrorCount).toBe(3)`
// but its fixture only fires three POSTs — it counts 3, passes). Together
// the four blocks (row 155 + 156 + 156b + 156c) provide a complete
// on-conflict UPSERT re-entry diagnostic: 1, 2, 3, 4 POSTs → 1, 2, 3, 4
// mirror rows, one block per stair.
//
// Assertion contract:
//   - After four chained self-approve POSTs, exactly 4 mirror rows land
//     for the (reseller_id, target_user_id) pair with kind='grant' since
//     the pre-first-POST cursor.
//   - 0 → all four inserts dropped (would also break row 155).
//   - 1 → only the first insert landed; POSTs 2 + 3 + 4 silently skipped.
//   - 2 → two of the four inserts silently dropped (specific to on-conflict
//     UPSERT paths that re-fire credit_transactions but not the mirror on
//     both re-entries).
//   - 3 → one of the four inserts silently dropped — the specific drift
//     row 156b DB companion cannot catch because its chain is one shorter.
//   - >4 → duplicated write on one of the four POSTs (fan-out ran twice).
//
// The single-cursor posture is inherited from row 156b DB companion for
// the same reason: a four-cursor design would give four independent
// "expected 1, got 1" assertions but would MASK a regression where POST N
// duplicated a POST N-1 row (both cursors would see their expected 1
// because the duplicate lands under a different cursor slice). One cursor
// spanning all four POSTs gives a single unambiguous count that catches
// drop, duplicate, AND cross-POST misattribution simultaneously.
//
// Cleanup topology inherits row 156b DB companion's LIFO restore-closure
// order (four attachGrantSelfApprove calls push A, B, C, D snapshots;
// cleanup pops D→C→B→A). fixture.cleanup() at the end of the try/finally
// sweeps all four reseller_credit_grants rows before their FK-linked
// credit_transactions rows to satisfy credit_transaction_id →
// credit_transactions.id, mirroring the row 156b DB companion posture.
// reseller_audit_log rows stay in place (append-only per migration 0093).
//
// Sits in audit-log-writes.spec.ts per the same topology decision that
// placed rows 155 / 156 DB companion / 156b DB companion here: authz specs
// own the HTTP contract (row 156c HTTP in credit-grant-authz.spec.ts);
// audit-log-writes.spec.ts owns the DB-level side effects on the append-
// only ledger + mirror table.
//
// Non-Stripe / non-GST discipline: pure reseller_credit_grants +
// credit_transactions + credit_balances writes; no promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision
// dependency. P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Reseller credit-grant mirror rows — P10 wave-3 row 156c DB companion (four-chain fanout)", () => {
  test("four chained self-approve POSTs insert exactly 4 reseller_credit_grants(kind='grant') mirror rows", async ({
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
    const AMOUNT_FOUR = 1;
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

      // Single cursor spanning all four POSTs — see header for rationale.
      const chainSince = new Date().toISOString();

      const resp1 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_ONE },
      });
      expect(
        resp1.status(),
        `POST 1 returned ${resp1.status()} — expected 200. Body: ${await resp1.text()}`,
      ).toBe(200);
      const body1 = (await resp1.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body1.ok, `POST 1 body.ok should be true: ${JSON.stringify(body1)}`).toBe(true);
      expect(typeof body1.credit_transaction_id).toBe("string");
      expect(body1.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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
      const body2 = (await resp2.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body2.ok, `POST 2 body.ok should be true: ${JSON.stringify(body2)}`).toBe(true);
      expect(typeof body2.credit_transaction_id).toBe("string");
      expect(body2.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

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
      const body3 = (await resp3.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body3.ok, `POST 3 body.ok should be true: ${JSON.stringify(body3)}`).toBe(true);
      expect(typeof body3.credit_transaction_id).toBe("string");
      expect(body3.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const grant4 = await fixture.attachGrantSelfApprove({ amount: AMOUNT_FOUR });
      if (!grant4) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      const resp4 = await page.request.post("/api/reseller/credits/grant", {
        data: { target_user_id: targetUserId, amount: AMOUNT_FOUR },
      });
      expect(
        resp4.status(),
        `POST 4 returned ${resp4.status()} — expected 200. Body: ${await resp4.text()}`,
      ).toBe(200);
      const body4 = (await resp4.json()) as {
        ok: boolean;
        credit_transaction_id?: string;
        month_key?: string;
      };
      expect(body4.ok, `POST 4 body.ok should be true: ${JSON.stringify(body4)}`).toBe(true);
      expect(typeof body4.credit_transaction_id).toBe("string");
      expect(body4.credit_transaction_id ?? "").toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const mirrorCount = await countResellerCreditGrantsFor(supabase, {
        resellerId: fixture.resellerId,
        targetUserId,
        kind: "grant",
        since: chainSince,
      });
      expect(
        mirrorCount,
        `expected exactly 4 reseller_credit_grants(kind='grant') mirror rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}; got ${mirrorCount}. Route write lives at route.ts:206-218. ` +
          `0 → all four inserts dropped (would also break row 155); ` +
          `1 → only POST 1's mirror insert landed; POSTs 2 + 3 + 4 silently skipped; ` +
          `2 → two of the four chained mirror inserts silently dropped (on-conflict UPSERT path re-fired credit_transactions but not reseller_credit_grants on both re-entries); ` +
          `3 → one of the four chained mirror inserts silently dropped — the specific on-conflict re-entry drift the row 156b DB companion three-chain block cannot catch because its chain is one shorter; ` +
          `>4 → duplicated write on one of the four POSTs (fan-out ran twice on a single request).`,
      ).toBe(4);

      // Second-lens shape read — pins per-field values the count-only helper
      // above cannot catch on any of the four chained mirror rows. Companion
      // assertion to tick 211's row 155 single-POST shape+helper alignment
      // and tick 212's row 156 two-chain / row 156b three-chain shape+helper
      // alignments. The count helper catches "mirror insert dropped" (count<4)
      // and "mirror insert duplicated" (count>4) but stays green under: (a)
      // any later POST's mirror insert reusing an earlier POST's credit_
      // transaction_id (FK collision that preserves count but breaks the
      // per-grant ledger link — the wrong txRow variable read at route.ts:213
      // across the UPSERT re-entry); (b) any row's amount stamped from a
      // stale variable across UPSERT re-entries (off-by-one on the second,
      // third, or fourth UPSERT re-entry that still writes the correct
      // credit_balances math); (c) any row's granted_by_user_id NULL'd or
      // threaded as targetUserId (self-service credit theft class); (d) any
      // row's over_budget flipped true when none of the four self-approve
      // POSTs trip gate 3 (5+3+2+1=11, budget 20000); (e) any row's
      // month_key drifting AEST vs UTC on the first-of-month rollover; (f)
      // any row's metadata.reason dropped or replaced. Rows fetched ordered
      // by created_at ASC so per-row amount matches the sequenced 5/3/2/1
      // pin from AMOUNT_ONE/TWO/THREE/FOUR without a second lookup.
      const { data: mirrorRows, error: mirrorReadErr } = await supabase
        .from("reseller_credit_grants")
        .select(
          "kind, amount, over_budget, granted_by_user_id, credit_transaction_id, month_key, metadata, created_at",
        )
        .eq("reseller_id", fixture.resellerId)
        .eq("target_user_id", targetUserId)
        .eq("kind", "grant")
        .gte("created_at", chainSince)
        .order("created_at", { ascending: true });
      expect(
        mirrorReadErr,
        `reseller_credit_grants shape read failed for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince}: ${mirrorReadErr?.message}`,
      ).toBeNull();
      expect(
        mirrorRows,
        `expected the reseller_credit_grants rows for (reseller=${fixture.resellerId}, target=${targetUserId}) since ${chainSince} to resolve after mirrorCount===4 landed — a null result here would flag an RLS scope drift between countResellerCreditGrantsFor's count(*) call path and the shape SELECT (both go through loadSupabaseAdmin's service-role client so this should never race).`,
      ).not.toBeNull();
      expect(mirrorRows!.length).toBe(4);
      // Compute expected UTC month_key inline (no import from app libs per
      // this spec's fixture-only import discipline) — mirrors route.ts:101's
      // monthKey(new Date()) YYYY-MM UTC discipline.
      const nowFourChain = new Date();
      const expectedMonthKeyFourChain = `${nowFourChain.getUTCFullYear()}-${String(nowFourChain.getUTCMonth() + 1).padStart(2, "0")}`;
      const expectedAmounts = [AMOUNT_ONE, AMOUNT_TWO, AMOUNT_THREE, AMOUNT_FOUR];
      const expectedTxIds = [
        body1.credit_transaction_id,
        body2.credit_transaction_id,
        body3.credit_transaction_id,
        body4.credit_transaction_id,
      ];
      const expectedBodyMonthKeys = [
        body1.month_key,
        body2.month_key,
        body3.month_key,
        body4.month_key,
      ];
      for (let idx = 0; idx < mirrorRows!.length; idx++) {
        const row = mirrorRows![idx]!;
        const metadata = row.metadata as Record<string, unknown> | null;
        expect(row.kind, `mirror row ${idx} kind mismatch: got ${row.kind}`).toBe("grant");
        expect(
          Number(row.amount),
          `mirror row ${idx} amount mismatch: expected ${expectedAmounts[idx]} (POST ${idx + 1} of the 5+3+2+1 chain), got ${row.amount}. A regression that stamped the amount from a stale variable across UPSERT re-entries surfaces here.`,
        ).toBe(expectedAmounts[idx]);
        expect(
          row.over_budget,
          `mirror row ${idx} over_budget mismatch: expected false (self-approve POST never trips gate 3 at active_wholesale monthly_credit_budget=20000 with a 5+3+2+1=11 running total), got ${row.over_budget}. A regression that inverted the boolean would break the P11 monthly budget rollup dashboards.`,
        ).toBe(false);
        expect(
          row.granted_by_user_id,
          `mirror row ${idx} granted_by_user_id mismatch: expected fixture.adminUserId=${fixture.adminUserId}, got ${row.granted_by_user_id}. A regression that threaded targetUserId here on any re-entry (a self-service credit theft class where the audit-trail attribution defames the customer as their own grantor) or NULL'd the column surfaces here.`,
        ).toBe(fixture.adminUserId);
        expect(
          row.credit_transaction_id,
          `mirror row ${idx} credit_transaction_id mismatch: expected ${expectedTxIds[idx]} (POST ${idx + 1}'s response body echo of route.ts:187-198's credit_transactions.id INSERT), got ${row.credit_transaction_id}. A dangling FK here means route.ts:213 read from the wrong txRow variable across the UPSERT re-entry, or the mirror INSERT stamped a prior POST's UUID on a later POST (FK collision that preserves count but breaks the per-grant ledger link).`,
        ).toBe(expectedTxIds[idx]);
        expect(
          row.month_key,
          `mirror row ${idx} month_key mismatch: expected ${expectedMonthKeyFourChain} (UTC YYYY-MM at test time), got ${row.month_key}. A drift to AEST here would surface on the first of each UTC month between 00:00 and 10:00 UTC.`,
        ).toBe(expectedMonthKeyFourChain);
        expect(
          row.month_key,
          `mirror row ${idx} month_key ${row.month_key} does not match response echo body.month_key ${expectedBodyMonthKeys[idx]} — a split here means the mirror INSERT stamped a different key from the one route.ts:255 echoes back to the caller.`,
        ).toBe(expectedBodyMonthKeys[idx]);
        expect(
          (metadata ?? {})["reason"],
          `mirror row ${idx} metadata.reason mismatch: expected 'reseller_grant' (route.ts:74-76 default when body.reason omitted), got ${JSON.stringify(metadata)}. This POST omits body.reason so the route falls through to the default.`,
        ).toBe("reseller_grant");
      }
      // Distinctness across all four credit_transaction_ids — catches a
      // regression where any later POST's mirror insert stamped an earlier
      // POST's UUID (would preserve mirrorCount===4 AND per-row amount if
      // the wrong txRow variable was read at route.ts:213 but the amount
      // came from the fresh request body). All six pairs — (1,2), (1,3),
      // (1,4), (2,3), (2,4), (3,4) — are covered by the Set-size assertion,
      // a superset of the three-chain block's three-pair distinctness lens.
      expect(
        new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size,
        `expected 4 distinct credit_transaction_id values across the four mirror rows; got ${new Set(mirrorRows!.map((r) => r.credit_transaction_id)).size} distinct. A collision here means at least one later UPSERT re-entry linked its mirror row back to an earlier POST's tx (FK integrity survives but the per-grant ledger loses at least one entry).`,
      ).toBe(4);
    } finally {
      await fixture.cleanup();
    }
  });
});
