// E2E — /compliance/wgea founder form UI walk-through
// (P1n-form-ui-e2e — closes the P1n-wgea-modslavery-e2e tail-note
// "Founder-driven end-to-end UI walk-through Playwright specs
// (`/compliance/wgea` form submit → toast → banner re-render) remain a
// future tick — this ships the API-contract half only.")
//
// Strategy mirrors tests/e2e/founder/rofr-wizard.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. Navigate to /compliance/wgea; skip cleanly when the form is not
//      mounted (auth-gated redirect on unseeded fixtures).
//   3. Type headcount 120 + toggle Save & check → banner re-renders with
//      the WGEA-report-required headline (s3 relevant employer band).
//   4. Type headcount 12 + resubmit → banner flips to the below-threshold
//      headline (s3 not applicable).
//
// Zero source-code churn — the form already exposes
// data-testid="wgea-result-banner" from the P1n-form ship.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/wgea";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_WGEA_FORM_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("WgeaFormClient — P1n-form-ui-e2e", () => {
  test.setTimeout(30_000);

  test("headcount 120 → report_required banner; 12 → not_required banner", async ({
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
      name: "WGEA reporting threshold",
    });
    const mounted = (await heading.count()) > 0;
    test.skip(
      !mounted,
      `WGEA form not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    // ── Fill 120 + submit → banner renders with report-required headline ─
    const headcount = page.getByLabel("Australian employees today");
    await headcount.fill("120");

    await page.getByRole("button", { name: "Save & check" }).click();

    const banner = page.getByTestId("wgea-result-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("WGEA report required");
    await expect(banner).toContainText("120");
    await expect(banner).toContainText("100"); // threshold surfaced

    // ── Change to 12 + resubmit → banner flips to below-threshold ────────
    await headcount.fill("12");
    await page.getByRole("button", { name: "Save & check" }).click();

    await expect(banner).toContainText("Below the WGEA threshold");
    await expect(banner).toContainText("12");
  });
});
