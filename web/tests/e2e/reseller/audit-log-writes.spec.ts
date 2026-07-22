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
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  countResellerAuditLogFor,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

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
