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
// See docs/plans/reseller-module-plan.md line 1223 for the source spec.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";
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
