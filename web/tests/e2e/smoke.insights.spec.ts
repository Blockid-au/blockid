/**
 * Smoke — /insights index and single-article render.
 *
 * Confirms the 3 SEO articles the CMO ships are actually reachable, and
 * that the article page renders an H1, an application/ld+json script
 * (ArticleJsonLd), and a reading-time indicator.
 */

import { test, expect } from "@playwright/test";

const ASSERT_TIMEOUT = 15_000;

const REQUIRED_TITLES = [
  /how to value an australian startup/i,
  /startup investor readiness checklist/i,
  /esic and r&d tax incentive/i,
];

const ARTICLE_SLUG = "how-to-value-an-australian-startup";

test.describe("Smoke — insights", () => {
  test.setTimeout(30_000);

  test("insights index lists the 3 flagship articles", async ({ page }) => {
    await page.goto("/insights");

    for (const title of REQUIRED_TITLES) {
      await expect(
        page.getByRole("link", { name: title }).first(),
      ).toBeVisible({ timeout: ASSERT_TIMEOUT });
    }
  });

  test("article page renders H1, JSON-LD, and reading time", async ({ page }) => {
    const response = await page.goto(`/insights/${ARTICLE_SLUG}`);
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // JSON-LD script tag (ArticleJsonLd component).
    const jsonLd = page.locator('script[type="application/ld+json"]').first();
    await expect(jsonLd).toHaveCount(1, { timeout: ASSERT_TIMEOUT });

    // Reading-time indicator — the page renders "N min read".
    await expect(page.getByText(/\d+\s*min\s*read/i).first()).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
  });
});
