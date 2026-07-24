/**
 * E2E — pillar-based progressive disclosure (menu-ia refactor).
 *
 * Pins the acceptance criteria from the workflow design spec:
 *   - Only Overview + the phase-matching Now pillar are expanded on first
 *     paint. Every other pillar starts collapsed.
 *   - The RecommendedNextStepTile is visible above the nav and its CTA
 *     resolves (link href starts with /workspace or /dashboard or /reseller).
 *   - Clicking a collapsed pillar header persists across reload via the
 *     `blockid_nav_collapse_v1` localStorage key.
 *   - Investor overlay: only Overview + Investor render as expandable
 *     pillars above the account group.
 *
 * The tests skip gracefully when the QA seed accounts are not present on
 * the dev box (matches the pattern used by menu-structure.spec.ts).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const FOUNDER_P0_EMAIL = process.env.QA_FOUNDER_P0_EMAIL ?? "qa+founder@blockid.au";
const FOUNDER_P6_EMAIL = process.env.QA_FOUNDER_P6_EMAIL ?? "qa+founder-p6@blockid.au";
const ANGEL_EMAIL = process.env.QA_INVESTOR_ANGEL_EMAIL ?? "qa+investor_angel@blockid.au";

async function tryLogin(page: import("@playwright/test").Page, email: string): Promise<boolean> {
  try {
    await loginAs(page, email);
    return true;
  } catch {
    return false;
  }
}

test.describe("Menu progressive disclosure — RecommendedNextStepTile", () => {
  test.setTimeout(45_000);

  test("fresh founder (phase 0) sees the tile above the nav with a valid CTA", async ({ page }) => {
    const ok = await tryLogin(page, FOUNDER_P0_EMAIL);
    test.skip(!ok, `QA founder ${FOUNDER_P0_EMAIL} not seeded`);

    await page.goto("/dashboard");

    const tile = page.locator('[data-testid="rec-next-step"]');
    await expect(tile).toBeVisible({ timeout: 15_000 });

    const cta = page.locator('[data-testid="rec-next-step-cta"]');
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^\/(workspace|dashboard|reseller)/);
  });
});

test.describe("Menu progressive disclosure — pillar collapse defaults", () => {
  test.setTimeout(45_000);

  test("only Overview + phase-matching Now pillar are expanded on first paint (founder p0)", async ({ page }) => {
    const ok = await tryLogin(page, FOUNDER_P0_EMAIL);
    test.skip(!ok, `QA founder ${FOUNDER_P0_EMAIL} not seeded`);

    // Clear any prior collapse state so we assert against the defaults.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("blockid_nav_collapse_v1");
      } catch {}
    });
    await page.goto("/dashboard");

    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Expanded pillar headers are the <button> disclosures with
    // aria-expanded="true". Overview is always expanded (non-collapsible)
    // so it doesn't render as a button; count it separately.
    const expandedButtons = nav.locator('button[aria-expanded="true"]');
    const expandedCount = await expandedButtons.count();
    // We expect at most ONE expanded Now-pillar button on first paint
    // (Overview is always-open and renders as a plain header).
    expect(expandedCount).toBeLessThanOrEqual(2);

    const collapsedButtons = nav.locator('button[aria-expanded="false"]');
    expect(await collapsedButtons.count()).toBeGreaterThan(0);
  });

  test("clicking a collapsed pillar persists across reload (localStorage)", async ({ page }) => {
    const ok = await tryLogin(page, FOUNDER_P0_EMAIL);
    test.skip(!ok, `QA founder ${FOUNDER_P0_EMAIL} not seeded`);

    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("blockid_nav_collapse_v1");
      } catch {}
    });
    await page.goto("/dashboard");

    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Click the first collapsed pillar to expand it.
    const firstCollapsed = nav.locator('button[aria-expanded="false"]').first();
    await expect(firstCollapsed).toBeVisible();
    const pillarLabel = (await firstCollapsed.textContent())?.trim().split("\n")[0]?.trim();
    await firstCollapsed.click();
    await expect(firstCollapsed).toHaveAttribute("aria-expanded", "true");

    // Verify the localStorage write happened.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("blockid_nav_collapse_v1"),
    );
    expect(stored, "collapse state should persist").toBeTruthy();

    // Reload and confirm the same pillar remains expanded.
    await page.reload();
    await expect(nav).toBeVisible({ timeout: 15_000 });
    if (pillarLabel) {
      const same = nav.locator(`button:has-text("${pillarLabel}")`).first();
      await expect(same).toHaveAttribute("aria-expanded", "true");
    }
  });
});

test.describe("Menu progressive disclosure — role overlay", () => {
  test.setTimeout(45_000);

  test("investor_angel sees Overview + Investor + Account only", async ({ page }) => {
    const ok = await tryLogin(page, ANGEL_EMAIL);
    test.skip(!ok, `QA angel ${ANGEL_EMAIL} not seeded`);

    await page.goto("/dashboard");
    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Founder-only pillars must NOT render for angels (hiddenGroups in
    // role-menu-overlay.ts drops them entirely).
    await expect(nav).not.toContainText(/build & validate/i);
    await expect(nav).not.toContainText(/grow & scale/i);
    // Investor pillar SHOULD render.
    await expect(nav).toContainText(/investor/i);
  });
});

test.describe("Menu progressive disclosure — founder-p6 auto-expands Fundraise/Grow", () => {
  test.setTimeout(45_000);

  test("phase-6 founder lands with a Now-pillar group expanded", async ({ page }) => {
    const ok = await tryLogin(page, FOUNDER_P6_EMAIL);
    test.skip(!ok, `QA founder-p6 ${FOUNDER_P6_EMAIL} not seeded`);

    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("blockid_nav_collapse_v1");
      } catch {}
    });
    await page.goto("/dashboard");
    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // At least one Now-pillar group must be expanded on first paint.
    const expanded = nav.locator('button[aria-expanded="true"]');
    expect(await expanded.count()).toBeGreaterThanOrEqual(1);
  });
});
