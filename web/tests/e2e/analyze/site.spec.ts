/**
 * Block 5 Phase 1 — /analyze site-variant smoke.
 *
 * Pastes a URL (stripe.com) into the omnibox, confirms the cost modal, and
 * asserts the SiteVisitorPanel renders the address bar + page counter. The
 * real multi-page crawl SSE is exercised in a separate SSE test; here we
 * guard the intake → panel handoff only.
 */

import { test, expect } from "@playwright/test";

const ASSERT_TIMEOUT = 15_000;
const SEED_URL = "https://stripe.com";

test.describe("/analyze — URL paste", () => {
  test.setTimeout(45_000);

  test("URL paste opens the site-visitor panel with the address bar", async ({ page }) => {
    await page.goto("/analyze");

    const input = page.getByTestId("smart-intake-text");
    await expect(input).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await input.fill(SEED_URL);

    const cta = page.getByTestId("smart-intake-cta");
    await expect(cta).toContainText(/visit my site/i, { timeout: ASSERT_TIMEOUT });
    await cta.click();

    const modal = page.getByTestId("analyze-cost-modal");
    await expect(modal).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await page.getByTestId("cost-confirm").click();

    const panel = page.getByTestId("site-visitor-panel");
    await expect(panel).toBeVisible({ timeout: ASSERT_TIMEOUT });

    const addr = page.getByTestId("site-address-bar");
    await expect(addr).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(addr).toContainText("stripe.com");

    // The counter should be present, even if it reads "0 pages" until the
    // crawler pushes its first event.
    await expect(page.getByTestId("site-page-counter")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
  });
});
