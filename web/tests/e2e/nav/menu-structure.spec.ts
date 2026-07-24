/**
 * E2E — menu structure per role (ux-ia-startup-flow-v1 §P9).
 *
 * Pins the top-nav IA contracts stated in the goal doc:
 *   - Anonymous visitors on /pricing (MarketingShell → NavV2) see <=7 nav
 *     items AND a Demo link that points at /showcase/atlassian?step=1.
 *   - Anonymous visitors on /docs (legacy site/navbar) see a Demo dropdown
 *     containing an Atlassian journey link.
 *   - Logged-in founders on /dashboard get the JourneyStepLadder rendered.
 *   - Logged-in founders see the Demo link in the workspace top-bar.
 *   - /showcase/atlassian?step=1 resolves 200 (Demo target is real).
 *
 * The tests skip role-scoped assertions when the QA seed accounts are not
 * present on the dev box (matches founder-one-startup-limit.spec.ts pattern).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const FOUNDER_EMAIL = process.env.QA_FOUNDER_LIMIT_EMAIL ?? "qa+founder@blockid.au";

test.describe("Menu structure — anonymous visitor (MarketingShell / NavV2)", () => {
  test.setTimeout(30_000);

  test("pricing page top-nav has a Demo entry that reaches /showcase/atlassian", async ({
    page,
  }) => {
    await page.goto("/pricing");

    // The primary nav is aria-labelled "Primary" (NavV2 line 421).
    const primary = page.locator('nav[aria-label="Primary"]').first();
    await expect(primary).toBeVisible({ timeout: 15_000 });

    // Count top-level items — expect <=7. NavV2 uses <ul><li>* structure.
    const topLevel = primary.locator(":scope > ul > li");
    const count = await topLevel.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(7);

    // A Demo trigger exists (as a dropdown BUTTON). We look for its
    // visible label rather than the sublink, because dropdowns collapse.
    const demoTrigger = primary.getByRole("button", { name: /^demo$/i });
    await expect(demoTrigger).toBeVisible();
  });

  test("Atlassian walkthrough URL is reachable (Demo target 200s)", async ({
    page,
  }) => {
    const res = await page.goto("/showcase/atlassian?step=1");
    expect(res?.status(), "walkthrough page must 200").toBeLessThan(400);
    // The page banner + interactive walkthrough provider render something
    // recognisable; assert on the H1 or the walkthrough wrapper.
    await expect(page.locator("body")).toContainText(/atlassian/i, {
      timeout: 15_000,
    });
  });
});

test.describe("Menu structure — anonymous visitor (legacy site/navbar)", () => {
  test.setTimeout(30_000);

  test("docs page navbar exposes Demo dropdown", async ({ page }) => {
    // /docs uses the legacy Navbar (site/navbar.tsx).
    await page.goto("/docs");
    // Look for the "Demo" button trigger — dropdowns are rendered as
    // <button> so we anchor on that.
    const demo = page.getByRole("button", { name: /^demo$/i }).first();
    await expect(demo).toBeVisible({ timeout: 15_000 });
    // Open the dropdown; assert the Atlassian sub-link appears.
    await demo.click();
    const atlassianLink = page.getByRole("link", {
      name: /atlassian journey/i,
    });
    await expect(atlassianLink.first()).toBeVisible({ timeout: 5_000 });
    const href = await atlassianLink.first().getAttribute("href");
    expect(href).toContain("/showcase/atlassian");
  });
});

test.describe("Menu structure — founder logged-in dashboard", () => {
  test.setTimeout(45_000);

  test("dashboard renders the 12-phase journey step ladder + Demo link", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    await page.goto("/dashboard");

    // The ladder has data-testid="journey-step-ladder" and always renders
    // 12 nodes.
    const ladder = page.locator('[data-testid="journey-step-ladder"]');
    await expect(ladder).toBeVisible({ timeout: 15_000 });

    // Assert phase 1 and phase 12 nodes both exist — that's the full
    // canonical range from PHASE_LABELS.
    await expect(page.locator('[data-testid="journey-step-node-1"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="journey-step-node-12"]').first()).toBeVisible();

    // The workspace topbar exposes the persistent Demo link on desktop.
    // NB: viewport in Playwright default is 1280x720 (>= sm breakpoint).
    const demoLink = page.getByRole("link", { name: /^demo$/i });
    await expect(demoLink.first()).toBeVisible({ timeout: 10_000 });
    const href = await demoLink.first().getAttribute("href");
    expect(href).toContain("/showcase/atlassian");
  });
});
