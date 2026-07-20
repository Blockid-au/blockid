/**
 * Smoke — /dataset public surface.
 *
 * The CDO-owned "S&P 500 for AU startups" marketing page. Asserts:
 *   - H1 mentions "Startup Value Index".
 *   - At least one CSV download link (there are three: overall/sector/stage).
 *   - Overall, By sector, and By stage table sections render.
 */

import { test, expect } from "@playwright/test";

const ASSERT_TIMEOUT = 15_000;

test.describe("Smoke — dataset", () => {
  test.setTimeout(30_000);

  test("dataset page shows H1, CSV downloads, and table sections", async ({ page }) => {
    await page.goto("/dataset");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(h1).toContainText(/startup value index/i);

    // CSV download links point at /api/index/svi?...format=csv.
    const csvLinks = page.locator('a[href*="/api/index/svi"][href*="format=csv"]');
    const csvCount = await csvLinks.count();
    expect(csvCount).toBeGreaterThanOrEqual(1);

    // Section headings — the page renders "Overall percentiles", "By sector",
    // and "By stage" H2s.
    await expect(page.getByRole("heading", { name: /overall percentiles/i })).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(page.getByRole("heading", { name: /by sector/i })).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(page.getByRole("heading", { name: /by stage/i })).toBeVisible({ timeout: ASSERT_TIMEOUT });
  });
});
