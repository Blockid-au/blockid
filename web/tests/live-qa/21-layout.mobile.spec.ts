/**
 * 21 — 390 × 844 layout (lane 1 #51, F4 fix): no horizontal scroll on any
 * workspace page, the header fits the viewport, and the account menu
 * (name, credits, theme, sign out) is reachable from the avatar button.
 * Runs in the `live-qa-mobile` project only (see playwright.live-qa.config.ts).
 */
import { test, expect, WORKSPACE_PAGES, GROWTH_GATED_PAGES } from "./fixtures";
import { evidence } from "./lib/api";

test.describe.configure({ mode: "serial" });

test.describe("Mobile 390 px", () => {
  for (const path of WORKSPACE_PAGES) {
    test(`${path} — no horizontal scroll, header within the viewport`, async ({ page, visit, qa }, testInfo) => {
      test.skip(!qa.elevated && GROWTH_GATED_PAGES.has(path), "Growth-gated page redirects to /pricing on Free");
      await visit(path);
      const header = page.getByTestId("workspace-header");
      await expect(header).toBeVisible({ timeout: 30_000 });
      const metrics = await page.evaluate(() => {
        const se = document.scrollingElement ?? document.documentElement;
        const header = document.querySelector('[data-testid="workspace-header"]');
        const actions = document.querySelector('[data-testid="header-actions"]');
        const rect = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const wide = Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed";
          })
          .slice(0, 8)
          .map((el) => ({ tag: el.tagName.toLowerCase(), testid: el.getAttribute("data-testid"), cls: el.className?.toString().slice(0, 60), right: Math.round(el.getBoundingClientRect().right) }));
        return {
          innerWidth: window.innerWidth,
          scrollWidth: se.scrollWidth,
          clientWidth: se.clientWidth,
          header: rect(header),
          actions: rect(actions),
          wide,
        };
      });
      await evidence(testInfo, "metrics", metrics);
      expect(metrics.scrollWidth, "document must not scroll horizontally").toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.header?.right ?? 0, "header right edge inside the viewport").toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.actions?.right ?? 0, "header actions cluster inside the viewport").toBeLessThanOrEqual(metrics.innerWidth + 1);
      // Elements overflowing to the right (outside an overflow-x:auto table) are a layout regression.
      const overflowing = metrics.wide.filter((w) => !/table|overflow/.test(w.cls ?? ""));
      expect(overflowing, "no element extends past the right edge").toEqual([]);
    });
  }

  test("header account menu opens from the avatar and exposes credits, theme and sign out", async ({ page, visit }, testInfo) => {
    await visit("/workspace/investors");
    const bell = page.getByRole("button", { name: "Notifications" });
    await expect(bell).toBeVisible({ timeout: 30_000 });
    const bellBox = await bell.boundingBox();
    expect(bellBox && bellBox.x + bellBox.width <= 390, "notifications bell inside 390 px").toBe(true);

    const button = page.getByTestId("header-account-menu-button");
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box && box.x + box.width <= 390, "avatar button inside 390 px").toBe(true);
    await expect(page.getByTestId("header-actions-desktop")).toBeHidden();
    await button.click();
    const panel = page.getByTestId("header-account-menu-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/credits?/i);
    await expect(panel).toContainText(/Theme/);
    await expect(panel.getByRole("button", { name: /Sign out/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeVisible();
    const panelBox = await panel.boundingBox();
    await evidence(testInfo, "menu", { text: await panel.innerText(), panelBox });
    expect(panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390, "menu panel inside the viewport").toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });
});
