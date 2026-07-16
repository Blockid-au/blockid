/**
 * Regression — AU disclaimers on equity/valuation surfaces.
 *
 * Every surface that touches equity, valuation, or investment content must
 * render the "Not financial advice — AU" block per CLO spec. Acceptance
 * modals must require the user to scroll to the bottom before enabling the
 * Accept button.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const DISCLAIMER_ROUTES = [
  "/workspace/equity-offer",
  "/workspace/valuation",
  "/workspace/cap-table",
  "/workspace/tokenization",
];

test.describe("Regression — AU disclaimers", () => {
  for (const path of DISCLAIMER_ROUTES) {
    test(`retail user on ${path} sees 'Not financial advice' block`, async ({ page }) => {
      await loginAs(page, "qa-founder-2@blockid.au");
      const resp = await page.goto(path);
      // Skip if the surface is gated for this user — separate spec covers that.
      test.skip(resp?.status() === 404, "route not present in this build");

      await expect(page.getByText(/not financial advice/i)).toBeVisible();
      await expect(page.getByText(/AU|Australia|ASIC/i)).toBeVisible();
    });
  }

  test("Accept modal requires scroll-to-bottom before Accept enables", async ({ page }) => {
    await loginAs(page, "qa-founder-2@blockid.au");
    await page.goto("/workspace/equity-offer");

    // Trigger the modal (surface-specific button — tolerate two label variants).
    const openBtn = page
      .getByRole("button", { name: /issue|create.*offer|review terms/i })
      .first();
    if (await openBtn.isVisible().catch(() => false)) {
      await openBtn.click();
    }

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    const acceptBtn = modal.getByRole("button", { name: /accept|agree|acknowledge/i });
    await expect(acceptBtn).toBeDisabled();

    // Scroll the modal body to the bottom.
    const body = modal.locator("[data-scrollable='true'], .modal-body, [role='document']").first();
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    await expect(acceptBtn).toBeEnabled({ timeout: 5_000 });
  });
});
