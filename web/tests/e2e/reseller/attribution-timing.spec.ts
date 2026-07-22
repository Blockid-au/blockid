// Reseller attribution timing — P10_hardening dry-run per plan §J.2 point 9
// (U.6): "user with blockid_via cookie logs in via Google, does NOT create a
// project → assert no reseller_attributions row. Same user then creates
// project → assert one row with subject_type='project'."
//
// Extends ticks 82/83 (scope-boundary + co-branding pill) with the capture
// half of the attribution funnel. Skips at describe-scope until the timing
// harness is provisioned (see fixtures/reseller.ts loadAttributionTimingHarness).
// Landing the scaffold pre-unblock keeps the P10 gate ready to fire once
// P1.5 (H.20 InfoVision ABN + GST) clears and a fresh QA founder row is
// seeded with attribution_reseller_id=NULL alongside a live reseller code.
//
// Attribution write reference:
//   - login-form.tsx:167, google/route.ts:114, auth.ts:517/642 → app_users
//     .attribution_reseller_id (user-level cache; P2.5 stamp-on-signup).
//   - createProject() at web/src/lib/projects.ts writes the
//     reseller_attributions(subject_type='project') row per U.6.
// This spec covers the cache flip; the row-existence assertion waits on a
// DB-inspection helper (kept as test.skip stubs, same tracking pattern used
// for the VI locale row in tick 83).
//
// See docs/plans/reseller-module-plan.md §J.2 point 9 for the full spec.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  attributionTimingSkipReason,
  loadAttributionTimingHarness,
} from "../fixtures/reseller";

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

  test.skip(
    "no reseller_attributions row exists until the founder creates a project (U.6)",
    // Verifying "no row in reseller_attributions before createProject()" needs
    // a DB-inspection helper — either a QA-only admin endpoint that reads the
    // reseller_attributions table by user_id, or a service-role Supabase
    // client wired into the fixture layer. Neither exists yet. Leaving this
    // row as the tracking marker so the tick that ships the DB helper drops
    // the .skip() and adds the "count == 0" assertion in the same diff.
    () => {},
  );

  test.skip(
    "reseller_attributions row appears with subject_type='project' after createProject() (U.6)",
    // Same reason as the row above — needs the DB-inspection helper before
    // this row can be authored. Once the helper lands, this row should:
    //   1. Navigate to /onboarding or /workspace/projects/new
    //   2. Submit a minimal project (name only)
    //   3. Poll the DB helper until one reseller_attributions row exists for
    //      the founder with subject_type='project' + promotion_code_id
    //      matching the tier decoded from harness.resellerCode.
    () => {},
  );
});
