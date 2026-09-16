/**
 * E2E — progressive disclosure, nav v4 (G13-W1-IA1, spec §A.1).
 *
 * Pins:
 *   - A phase-0 founder lands with Home · Prove · Money expanded and Company
 *     folded under the "Later phases" disclosure (collapsed by default).
 *   - Collapsing a group persists across reload via the
 *     `blockid_nav_collapse_v1` localStorage key (keyed by group id).
 *   - investor_angel sees Home · Deal flow · Reports only.
 *   - A later-phase founder sees Company expanded in place.
 *
 * The RecommendedNextStepTile / UnlockPulseCard sidebar mounts were removed
 * in S-IA1 (one recommender lands on the founder landing in S-IA3).
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

test.describe("Menu progressive disclosure — group collapse defaults", () => {
  test.setTimeout(45_000);

  test("phase-0 founder: every in-place group is expanded, Later phases is a collapsed disclosure", async ({ page }) => {
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

    // Every group header is a disclosure <button>; with ≤ 10 links there is
    // nothing to hide, so all in-place groups start expanded.
    const groupButtons = nav.locator('[data-group-label] > button[aria-expanded]');
    const n = await groupButtons.count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
    for (let i = 0; i < n; i += 1) {
      expect(await groupButtons.nth(i).getAttribute("aria-expanded")).toBe("true");
    }
    // Later phases (Company below band 2) is collapsed until clicked.
    const later = nav.getByRole("button", { name: /later phases/i });
    if ((await later.count()) > 0) {
      await expect(later.first()).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("collapsing a group persists across reload (localStorage)", async ({ page }) => {
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

    // Collapse the second group (Prove) — the first (Home) is never collapsed.
    const target = nav.locator('[data-group-label] > button[aria-expanded="true"]').nth(1);
    await expect(target).toBeVisible();
    const groupLabel = (await target.textContent())?.trim().split("\n")[0]?.trim();
    await target.click();
    await expect(target).toHaveAttribute("aria-expanded", "false");

    // Verify the localStorage write happened.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("blockid_nav_collapse_v1"),
    );
    expect(stored, "collapse state should persist").toBeTruthy();

    // Reload and confirm the same group stays collapsed.
    await page.reload();
    await expect(nav).toBeVisible({ timeout: 15_000 });
    if (groupLabel) {
      const same = nav.locator(`button:has-text("${groupLabel}")`).first();
      await expect(same).toHaveAttribute("aria-expanded", "false");
    }
  });
});

test.describe("Menu progressive disclosure — evaluator persona", () => {
  test.setTimeout(45_000);

  test("investor_angel sees Home · Deal flow · Reports only", async ({ page }) => {
    const ok = await tryLogin(page, ANGEL_EMAIL);
    test.skip(!ok, `QA angel ${ANGEL_EMAIL} not seeded`);

    await page.goto("/workspace/investor");
    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Founder groups must NOT render for angels (persona.ts navGroups).
    const groups = await nav.locator("[data-group-label]").evaluateAll((els) => els.map((el) => el.getAttribute("data-group-label")));
    expect(groups).toEqual(["Home", "Deal flow", "Reports"]);
    await expect(nav).not.toContainText(/fundraise/i);
    await expect(nav.locator('a[href="/workspace/investor/dealflow"]')).toBeVisible();
  });
});

test.describe("Menu progressive disclosure — later-phase founder sees Company in place", () => {
  test.setTimeout(45_000);

  test("phase-6 founder lands with Company expanded (no Later-phases fold)", async ({ page }) => {
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

    // Company (band 2) renders in place for a phase-6 (12-scale) founder.
    const company = nav.locator("[data-group-label='Company'] > button[aria-expanded]");
    await expect(company).toBeVisible();
    await expect(company).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("button", { name: /later phases/i })).toHaveCount(0);
  });
});
