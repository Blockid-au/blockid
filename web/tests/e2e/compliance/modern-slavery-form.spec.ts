// E2E — /compliance/modern-slavery founder form UI walk-through
// (P1n-form-ui-e2e — closes the P1n-wgea-modslavery-e2e tail-note
// "Founder-driven end-to-end UI walk-through Playwright specs
// (`/compliance/wgea` form submit → toast → banner re-render) remain a
// future tick — this ships the API-contract half only.")
//
// Strategy mirrors tests/e2e/founder/rofr-wizard.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. Navigate to /compliance/modern-slavery; skip cleanly when the form
//      is not mounted (auth-gated redirect on unseeded fixtures).
//   3. Type A$120M current period + submit → banner re-renders with the
//      statement-required headline (s5 reporting entity band).
//   4. Type A$2.5M current period + resubmit → banner flips to the
//      below-threshold headline (s5 not applicable).
//
// Zero source-code churn — the form already exposes
// data-testid="modern-slavery-result-banner" from the P1n-form ship.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/modern-slavery";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_MODSLAVERY_FORM_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("ModernSlaveryFormClient — P1n-form-ui-e2e", () => {
  test.setTimeout(30_000);

  test("A$120M → statement_required banner; A$2.5M → not_required banner", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    await page.goto(ROUTE);

    const heading = page.getByRole("heading", {
      name: "Modern Slavery reporting threshold",
    });
    const mounted = (await heading.count()) > 0;
    test.skip(
      !mounted,
      `Modern Slavery form not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    // ── Fill A$120M current period + submit → statement_required banner ──
    const current = page.getByLabel("Current period revenue so far (AUD)");
    await current.fill("120000000");

    await page.getByRole("button", { name: "Save & check" }).click();

    const banner = page.getByTestId("modern-slavery-result-banner");
    await expect(banner).toBeVisible();
    // A$120M current period + no projected/prior → assessor picks the
    // "Statement required" branch (projected current-period ≥ A$100M pre-FY-end).
    await expect(banner).toContainText("Statement required");
    await expect(banner).toContainText("120,000,000");

    // ── Change to A$2.5M + resubmit → banner flips to below-threshold ────
    await current.fill("2500000");
    await page.getByRole("button", { name: "Save & check" }).click();

    await expect(banner).toContainText("Below the reporting threshold");
    await expect(banner).toContainText("2,500,000");
  });
});
