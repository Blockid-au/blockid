/**
 * Landmark uniqueness — G13-W5-IA5 "one header, one footer".
 *
 * Every public and auth page must expose exactly ONE `banner` and ONE
 * `contentinfo` landmark: NavV2 (`<header>`) and the shared `Footer`
 * (`<footer>`). Before S-IA5 two headers (NavV2 + site/navbar) and two
 * footers (MarketingFooter + site/footer) existed and pages mixed them.
 *
 * A `<header>` / `<footer>` is only a landmark when it is not nested inside
 * <article>, <aside>, <main>, <nav> or <section> (HTML-AAM) — insights
 * posts and guide chapters legitimately carry article headers — so the
 * count is taken over top-level elements only, exactly as axe's
 * `landmark-no-duplicate-banner` / `-contentinfo` rules do.
 *
 * Auth pages (login / reset / error) mount the light skin; the assertion is
 * skin-agnostic.
 */

import { test, expect } from "@playwright/test";

const PAGES: readonly string[] = [
  // marketing shell
  "/",
  "/pricing",
  "/about",
  "/about/invest",
  "/solutions/investor",
  "/funding/grants",
  "/showcase",
  // docs / guides / tools / index (legacy site/navbar pages until S-IA5)
  "/docs",
  "/guide",
  "/guides/features",
  "/developers",
  "/benchmarks",
  "/tools",
  "/tools/esic",
  "/tools/idea-valuation",
  "/startup-index",
  "/score",
  "/investor",
  // auth (light skin)
  "/auth/login",
  "/auth/reset",
  "/auth/error",
  "/unsubscribe",
];

const SECTIONING = "article, aside, main, nav, section";

async function landmarkCounts(page: import("@playwright/test").Page): Promise<{ banner: number; contentinfo: number }> {
  return page.evaluate((sectioning) => {
    const count = (tag: string) =>
      Array.from(document.querySelectorAll(tag)).filter((el) => !el.parentElement?.closest(sectioning)).length;
    return { banner: count("header"), contentinfo: count("footer") };
  }, SECTIONING);
}

test.describe("A11y — one <header> + one <footer> landmark per page (S-IA5)", () => {
  test.setTimeout(30_000);

  for (const route of PAGES) {
    test(`landmarks: ${route}`, async ({ page }) => {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (resp && resp.status() === 404) {
        test.skip(true, `Route ${route} returned 404`);
        return;
      }
      const primary = page.locator('header nav[aria-label="Primary"]');
      await expect(primary, `${route} mounts NavV2`).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator("footer#marketing-footer, footer[aria-labelledby='marketing-footer-heading']"), `${route} mounts the shared Footer`).toHaveCount(1);
      const counts = await landmarkCounts(page);
      expect(counts, `${route} landmark counts`).toEqual({ banner: 1, contentinfo: 1 });
    });
  }
});
