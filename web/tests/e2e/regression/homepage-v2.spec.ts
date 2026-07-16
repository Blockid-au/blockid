/**
 * Regression — homepage v2 (behind NEXT_PUBLIC_UPGRADE_V2).
 *
 * Verifies the new hero, segment tabs, and 4-card founder pricing matrix.
 */

import { test, expect } from "@playwright/test";

test.describe("Regression — homepage v2", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: "upgrade_v2", value: "1", url: baseURL ?? "http://localhost:3000" },
    ]);
  });

  test("hero + segment tabs + founder pricing matrix", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /Get Fundable in 7 Days/i,
    );

    const tabs = page.getByTestId("segment-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /founder/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /investor/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /advisor/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /accelerator/i })).toBeVisible();

    // Founder tab is the default; assert 4 pricing cards.
    const matrix = page.getByTestId("pricing-matrix");
    await expect(matrix).toBeVisible();
    const cards = matrix.getByTestId(/^plan-card-founder_/);
    await expect(cards).toHaveCount(4);
  });
});
