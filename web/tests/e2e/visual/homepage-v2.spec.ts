/**
 * Visual regression — core marketing pages.
 *
 * Matrix: 3 pages x 4 viewports x 2 themes = 24 baseline snapshots.
 * Uses Playwright's built-in toHaveScreenshot() with a 2% pixel-diff budget.
 *
 * Theme toggle: sets `data-theme` on <html> (and <body> for legacy CSS)
 * before capture, then waits for networkidle to ensure fonts/images settle.
 */

import { test, expect } from "@playwright/test";

interface Viewport {
  name: string;
  width: number;
  height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1920, height: 1080 },
];

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const PAGES: readonly { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "for-founder", path: "/for/founder" },
];

async function applyTheme(
  page: import("@playwright/test").Page,
  theme: Theme,
): Promise<void> {
  await page.addInitScript((t: Theme) => {
    try {
      document.documentElement.setAttribute("data-theme", t);
      document.body?.setAttribute("data-theme", t);
      // Persist for any early theme-provider read.
      localStorage.setItem("theme", t);
      document.cookie = `theme=${t}; path=/`;
    } catch {
      /* pre-DOM script — retry after load */
    }
  }, theme);
}

test.describe("Visual — core marketing pages", () => {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const p of PAGES) {
        test(`${p.name} @ ${vp.name} (${theme})`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await applyTheme(page, theme);

          await page.goto(p.path, { waitUntil: "domcontentloaded" });

          // Re-apply post-load in case a theme provider clobbered our init.
          await page.evaluate((t: Theme) => {
            document.documentElement.setAttribute("data-theme", t);
            document.body?.setAttribute("data-theme", t);
          }, theme);

          await page.waitForLoadState("networkidle").catch(() => {
            /* tolerate long-poll endpoints */
          });

          // Neutralize animation-driven flake.
          await page.addStyleTag({
            content:
              "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }",
          });

          await expect(page).toHaveScreenshot(
            `${p.name}-${vp.name}-${theme}.png`,
            {
              fullPage: true,
              maxDiffPixelRatio: 0.02,
              animations: "disabled",
            },
          );
        });
      }
    }
  }
});
