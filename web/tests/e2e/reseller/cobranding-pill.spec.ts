// Reseller co-branding pill — P10_hardening dry-run per plan Verification #6:
// "attributed workspace renders pill; non-attributed workspace does not; VI
// locale renders VI strings."
//
// Extends tick 82's scope-boundary scaffold to the customer-side surface.
// Skips at describe-scope until the attributed-founder harness is provisioned
// (see fixtures/reseller.ts loadAttributedFounderHarness). Landing the spec
// pre-unblock keeps the P10 gate ready to fire once P1.5 (H.20 ABN + GST)
// clears and a QA founder row is seeded with attribution_reseller_id.
//
// ACTIVATED wave-5 row 163 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe covers the
// env-based loadAttributedFounderHarness contract (QA_ATTRIBUTED_FOUNDER_EMAIL
// + QA_RESELLER_DISPLAY_NAME) for hosts that keep that env-var contract alive;
// the new describe covers the temp-reseller mint fixture route so a QAPROBE-
// cohort host — which mints per-variant reseller rows via seed-qa-reseller.mjs
// — covers the workspace-topbar pill render contract without flipping either
// env var. Same cache-column stamp mechanism as wave-5 row 178 (attribution-
// timing me-flip): attachAttributedCustomer() drives
// app_users.attribution_reseller_id so the /api/reseller/me handler (which the
// pill's useResellerAttribution() client hook consumes) resolves the QAPROBE
// reseller row and the topbar pill renders with fixture.displayName.
//
// Pill implementation reference: web/src/components/workspace/reseller-pill.tsx
// — the "via {display_name}" text + title="Introduced by {display_name}" are
// the assertion anchors below.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  attributedFounderSkipReason,
  loadAttributedFounderHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";

test.describe("Reseller co-branding pill — P10 dry-run", () => {
  const harness = loadAttributedFounderHarness();
  test.skip(!harness, attributedFounderSkipReason());

  test("attributed founder sees the pill in the workspace topbar", async ({ page }) => {
    await loginAs(page, harness!.founder.email);
    await page.goto("/workspace");
    const pill = page.locator(
      `[title="Introduced by ${harness!.resellerDisplayName}"]`,
    );
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toContainText(harness!.resellerDisplayName);
    await expect(pill).toContainText(/via/i);
  });

  test("non-attributed founder does NOT see the pill", async ({ page }) => {
    test.skip(
      !harness!.nonAttributedFounder,
      "QA_UNATTRIBUTED_FOUNDER_EMAIL absent — negative-case assertion needs a " +
        "second founder account whose attribution_reseller_id is NULL.",
    );
    await loginAs(page, harness!.nonAttributedFounder!.email);
    await page.goto("/workspace");
    // Give the workspace shell time to render its topbar + settle
    // useResellerAttribution() (60s TTL client hook, but resolves instantly
    // with a null payload for unattributed users).
    await page.waitForLoadState("networkidle");
    const anyPill = page.locator('[title^="Introduced by"]');
    await expect(anyPill).toHaveCount(0);
  });

  test("VI locale renders localised pill wording", async ({ page, context }) => {
    // The pill title flips to the VI "Được giới thiệu bởi" variant when the
    // blockid_lang=vi cookie is set (see web/src/lib/use-locale.ts). Seed the
    // cookie before navigation so the initial render already picks VI —
    // otherwise useSyncExternalStore hydrates from getServerSnapshot()='en'
    // and the assertion races the cookie read on client-side revalidation.
    // Derive the cookie host from playwright.config.ts baseURL so the same
    // spec works against blockid.au staging and localhost dev servers.
    const baseUrl =
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.BASE_URL ??
      process.env.DEMO_URL ??
      "https://blockid.au";
    await context.addCookies([
      { name: "blockid_lang", value: "vi", url: baseUrl },
    ]);
    await loginAs(page, harness!.founder.email);
    await page.goto("/workspace");
    const pill = page.locator(
      `[title="Được giới thiệu bởi ${harness!.resellerDisplayName}"]`,
    );
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toContainText(harness!.resellerDisplayName);
    await expect(pill).toContainText(/qua/i);
  });
});

// P10 wave-5 row 163 — cobranding-pill spec activated for the temp-reseller
// mint fixture cohort. Twin coverage on the workspace-topbar pill render
// contract without needing the env-based loadAttributedFounderHarness
// (QA_ATTRIBUTED_FOUNDER_EMAIL + QA_RESELLER_DISPLAY_NAME) that the pre-
// existing describe consumes. Per docs/plans/p10-deferred-spec-activation-
// order.md wave 5:
//   163 | cobranding-pill.spec.ts | active_wholesale | attributed founder pill EN+VI | pill visible
//
// Fixture wiring (mirrors wave-2 row 145 + wave-5 row 178 posture):
//   - loadTempReseller("active_wholesale") reads the QAPROBEWHOLESALEACTIVE
//     seed row + resolves attributedUserId via QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL
//     (default qa-founder-attributed-1@blockid.au) → app_users.id.
//   - fixture.attachAttributedCustomer() stamps
//     app_users.attribution_reseller_id = fixture.resellerId so the
//     useResellerAttribution() client hook consumed by <ResellerPill /> in
//     workspace-layout.tsx receives a populated /api/reseller/me payload and
//     the topbar pill renders with fixture.displayName. afterAll
//     fixture.cleanup() restores the previous value so cross-spec state does
//     not leak into the next worker.
//   - loginAs(page, fixture.attributedFounderEmail) signs the founder in via
//     the QA login endpoint; the workspace shell then hydrates the topbar
//     with the pill anchored on the just-stamped cache column.
//
// Skip conditions (mirrors wave-5 row 178 verbatim):
//   - loadTempReseller returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are unset or the QAPROBEWHOLESALEACTIVE seed row is missing.
//   - fixture.attributedUserId / attributedFounderEmail null when
//     qa-founder-attributed-1 is not in app_users (seed-test-users.mjs delta
//     not run).
//   - attachAttributedCustomer() returns null (variant mismatch or lookup gap).
//   - loginAs throws when /tmp/blockid-qa-accounts.txt has no row for the
//     resolved email (seed-test-users.mjs not run against the target host).
//
// Non-Stripe / non-GST discipline: the pill render path only reads
// app_users + resellers (via /api/reseller/me). No promotion_code lookup,
// no revenue_events read, no Stripe network call, no InfoVision dependency.
// P8.5 + P1.5 remain neither a dependency nor a consequence.
test.describe("Reseller co-branding pill — P10 wave-5 row 163", () => {
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
          `wave-5 row 163 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  test("active_wholesale attributed founder — EN topbar pill renders with QAPROBE display_name", async ({
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
    if (!fixture.attributedUserId || !fixture.attributedFounderEmail) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId or attributedFounderEmail null (attributed founder app_users row missing on this host).`,
      );
      return;
    }
    const attributedFounderEmail = fixture.attributedFounderEmail;

    const attach = await fixture.attachAttributedCustomer();
    if (!attach) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
      );
      return;
    }

    try {
      await loginAs(page, attributedFounderEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${attributedFounderEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }

    await page.goto("/workspace");
    const pill = page.locator(
      `[title="Introduced by ${fixture.displayName}"]`,
    );
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toContainText(fixture.displayName);
    await expect(pill).toContainText(/via/i);
  });

  test("active_wholesale attributed founder — VI topbar pill renders 'Được giới thiệu bởi' variant", async ({
    page,
    context,
  }) => {
    if (fixtureError) {
      test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
      return;
    }
    if (!fixture) {
      test.skip(true, tempResellerSkipReason("active_wholesale"));
      return;
    }
    if (!fixture.attributedUserId || !fixture.attributedFounderEmail) {
      test.skip(
        true,
        `${tempResellerSkipReason("active_wholesale")} — attributedUserId or attributedFounderEmail null.`,
      );
      return;
    }
    const attributedFounderEmail = fixture.attributedFounderEmail;

    const attach = await fixture.attachAttributedCustomer();
    if (!attach) {
      test.skip(
        true,
        "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed.",
      );
      return;
    }

    // Seed blockid_lang=vi BEFORE loginAs so the workspace shell's initial
    // render picks VI and the pill's useLocale() consumer resolves to the
    // Vietnamese variant. Cookie host derived from the same env-var ladder as
    // the pre-existing VI test so the spec works against blockid.au staging
    // and localhost dev servers alike.
    const baseUrl =
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.BASE_URL ??
      process.env.DEMO_URL ??
      "https://blockid.au";
    await context.addCookies([
      { name: "blockid_lang", value: "vi", url: baseUrl },
    ]);

    try {
      await loginAs(page, attributedFounderEmail);
    } catch (err) {
      test.skip(
        true,
        `loginAs(${attributedFounderEmail}) threw: ${(err as Error).message}. ` +
          tempResellerSkipReason("active_wholesale"),
      );
      return;
    }

    await page.goto("/workspace");
    const pill = page.locator(
      `[title="Được giới thiệu bởi ${fixture.displayName}"]`,
    );
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toContainText(fixture.displayName);
    await expect(pill).toContainText(/qua/i);
  });
});
