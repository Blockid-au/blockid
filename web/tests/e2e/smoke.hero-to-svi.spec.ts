/**
 * Smoke — hero → SVI hand-off.
 *
 * Types a company name into the homepage HeroSearch, submits, and asserts
 * the browser lands on /svi?query=<x> with the SVIEntrance textarea
 * prefilled from the URL. Guards the single most important funnel entry.
 */

import { test, expect } from "@playwright/test";

const ASSERT_TIMEOUT = 15_000;

test.describe("Smoke — hero to SVI", () => {
  test.setTimeout(30_000);

  test("typing a company in the hero routes to /svi?query and prefills", async ({ page }) => {
    await page.goto("/");

    const input = page.locator("#hero-search-input");
    await expect(input).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await input.fill("Canva");

    await Promise.all([
      page.waitForURL(/\/svi\?query=Canva/i, { timeout: ASSERT_TIMEOUT }),
      page
        .getByRole("search")
        .getByRole("button", { name: /score|analyse|analyze|get|submit/i })
        .first()
        .click(),
    ]);

    expect(page.url()).toContain("/svi?query=Canva");

    // SVIEntrance prefills its textarea from ?query=. Look for any
    // textarea on the page that contains "Canva".
    const prefilled = page.locator('textarea:has-text("Canva")').first();
    await expect(prefilled).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(prefilled).toHaveValue(/Canva/i, { timeout: ASSERT_TIMEOUT });
  });
});
