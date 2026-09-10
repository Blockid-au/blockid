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

  // The hero submits through SmartIntake, which classifies the input and
  // pushes /analyze?q=…&kind=… for /analyze to claim on mount. A submission
  // needs a URL or at least 8 words; a bare company name is neither, and the
  // CTA stays disabled — that is intended, not a bug. The earlier version of
  // this test typed "Canva" and expected /svi?query=, a contract retired with
  // the homepage redesign.

  test("a URL in the hero routes to /analyze with the query carried through", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("smart-intake-text");
    await expect(input).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await input.fill("https://www.canva.com");
    const cta = page.getByTestId("smart-intake-cta");
    await expect(cta).toBeEnabled({ timeout: ASSERT_TIMEOUT });

    await Promise.all([
      page.waitForURL(/\/analyze\?/, { timeout: ASSERT_TIMEOUT }),
      cta.click(),
    ]);

    const params = new URL(page.url()).searchParams;
    expect(params.get("q")).toBe("https://www.canva.com");
    expect(params.get("kind")).toBe("url");
  });

  test("an idea sentence in the hero routes to /analyze as an idea", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("smart-intake-text");
    await expect(input).toBeVisible({ timeout: ASSERT_TIMEOUT });

    const idea = "An AI tool that reconciles supplier invoices for Australian cafes automatically";
    await input.fill(idea);
    const cta = page.getByTestId("smart-intake-cta");
    await expect(cta).toBeEnabled({ timeout: ASSERT_TIMEOUT });

    await Promise.all([
      page.waitForURL(/\/analyze\?/, { timeout: ASSERT_TIMEOUT }),
      cta.click(),
    ]);

    const params = new URL(page.url()).searchParams;
    expect(params.get("q")).toBe(idea);
    expect(params.get("kind")).toBe("idea");
  });

  test("a bare company name is not enough to submit", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("smart-intake-text");
    await expect(input).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await input.fill("Canva");
    await expect(page.getByTestId("smart-intake-cta")).toBeDisabled();
  });
});
