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
// Pill implementation reference: web/src/components/workspace/reseller-pill.tsx
// — the "via {display_name}" text + title="Introduced by {display_name}" are
// the assertion anchors below.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  attributedFounderSkipReason,
  loadAttributedFounderHarness,
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

  test.skip(
    "VI locale renders localised pill wording",
    // ResellerPill currently ships EN-only ("via" + title="Introduced by X").
    // The plan verification row calls for a "Được giới thiệu bởi" VI variant
    // — that translation exists in web/src/lib/reseller/email-footer.ts for
    // welcome-email footers but has not been wired into the topbar pill yet.
    // Leaving this test.skip() as the tracking marker so the tick that ships
    // pill i18n unblocks it in the same diff.
    () => {},
  );
});
