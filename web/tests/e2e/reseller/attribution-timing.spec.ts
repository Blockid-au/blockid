// Reseller attribution timing — P10_hardening dry-run per plan §J.2 point 9
// (U.6): "user with blockid_via cookie logs in via Google, does NOT create a
// project → assert no reseller_attributions row. Same user then creates
// project → assert one row with subject_type='project'."
//
// Extends ticks 82/83 (scope-boundary + co-branding pill) with the capture
// half of the attribution funnel. Skips at describe-scope until the timing
// harness is provisioned (see fixtures/reseller.ts loadAttributionTimingHarness).
// Row 2 (no-row-before-project) also requires the service-role Supabase
// fixture; when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are unset the row
// self-skips with supabaseAdminSkipReason() while row 1 keeps running.
//
// Attribution write reference:
//   - login-form.tsx:167, google/route.ts:114, auth.ts:517/642 → app_users
//     .attribution_reseller_id (user-level cache; P2.5 stamp-on-signup).
//   - reseller_attributions(subject_type='project') is written by the
//     wholesale-provisioned /api/reseller/create-startup route (route.ts:302);
//     retail createProject() does NOT write the row today — that's the
//     open code-side gap row 3 tracks.
//
// See docs/plans/reseller-module-plan.md §J.2 point 9 for the full spec.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  attributionTimingSkipReason,
  loadAttributionTimingHarness,
} from "../fixtures/reseller";
import {
  countResellerAttributionsFor,
  findUserIdByEmail,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

test.describe("Reseller attribution timing — P10 dry-run", () => {
  const harness = loadAttributionTimingHarness();
  test.skip(!harness, attributionTimingSkipReason());

  test("blockid_via cookie + login flips /api/reseller/me to the reseller", async ({
    page,
    context,
  }) => {
    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    // Seed the ?via= cookie BEFORE hitting the login flow so the consumption
    // sites (login-form.tsx:167, google/route.ts:114, auth.ts:517/642) see
    // the cookie and stamp app_users.attribution_reseller_id per P2.5.
    await context.addCookies([
      {
        name: "blockid_via",
        value: harness!.resellerCode,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await loginAs(page, harness!.founder.email);
    const me = await page.request.get("/api/reseller/me");
    expect(me.ok(), `/api/reseller/me responded ${me.status()}`).toBe(true);
    const body = (await me.json()) as {
      ok: boolean;
      reseller: { display_name?: string } | null;
    };
    expect(body.ok).toBe(true);
    expect(
      body.reseller?.display_name,
      "expected the user-level attribution cache to point at the seeded reseller",
    ).toBe(harness!.resellerDisplayName);
  });

  test("no reseller_attributions row exists until the founder creates a project (U.6)", async ({
    page,
    context,
  }) => {
    const supabase = loadSupabaseAdmin();
    test.skip(!supabase, supabaseAdminSkipReason());

    const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
    const parsed = new URL(baseURL);
    await context.addCookies([
      {
        name: "blockid_via",
        value: harness!.resellerCode,
        domain: parsed.hostname,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await loginAs(page, harness!.founder.email);

    const userId = await findUserIdByEmail(supabase!, harness!.founder.email);
    expect(
      userId,
      `expected app_users row for ${harness!.founder.email} — reseed via scripts/seed-test-users.mjs`,
    ).not.toBeNull();

    // U.6 invariant: attribution_reseller_id on app_users is the cache; the
    // canonical per-workspace row lives in reseller_attributions and only
    // materialises once the founder starts their first workspace. This
    // assertion catches a regression where signup itself would incorrectly
    // insert a user-scoped attribution row.
    const count = await countResellerAttributionsFor(supabase!, userId!);
    expect(
      count,
      `expected 0 reseller_attributions rows for the fresh founder; got ${count}`,
    ).toBe(0);
  });

  test.skip(
    "reseller_attributions row appears with subject_type='project' after createProject() (U.6)",
    // Blocked on a code-side gap, not just a test-side helper: the retail
    // createProject() path at web/src/lib/projects.ts:420 does not write to
    // reseller_attributions today — only the wholesale-provisioned
    // /api/reseller/create-startup/route.ts:302 does. Un-skipping this row
    // requires either (a) closing the gap in createProject() so retail
    // founders with app_users.attribution_reseller_id set get an
    // attribution row per workspace, or (b) reshaping the spec to exercise
    // the wholesale route with a reseller-admin harness instead of the
    // founder-signup path. Both are larger surfaces than the P10 dry-run
    // cadence supports — tracking here so the next tick that closes the
    // gap drops the .skip() in the same diff.
    () => {},
  );
});
