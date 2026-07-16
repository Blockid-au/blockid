/**
 * Regression — menu visibility per plan.
 *
 * For each seeded QA account, log in, visit /dashboard, and assert the nav
 * items present match the plan matrix defined in the CPO spec (mirrored in
 * plans-v2.ts feature flags). Anything a plan should NOT see must be absent.
 */

import { test, expect } from "@playwright/test";
import { allAccounts, loginAs } from "../fixtures/accounts";

// Expected menu items keyed by plan id — kept in sync with cpo-spec.md §4.
// Any nav item not listed here must be absent.
const EXPECTED_MENU: Record<string, string[]> = {
  founder_starter: ["Dashboard", "SVI Score", "Pitch Deck", "Billing"],
  founder_growth: ["Dashboard", "SVI Score", "Pitch Deck", "Cap Table", "Data Room", "Billing"],
  founder_scale: [
    "Dashboard",
    "SVI Score",
    "Pitch Deck",
    "Cap Table",
    "Data Room",
    "ESOP",
    "Dividends",
    "Billing",
  ],
  founder_enterprise: [
    "Dashboard",
    "SVI Score",
    "Pitch Deck",
    "Cap Table",
    "Data Room",
    "ESOP",
    "Dividends",
    "Tokenization",
    "Billing",
  ],
  investor_angel: ["Dashboard", "Deal Flow", "Portfolio", "Billing"],
  investor_vc_small: ["Dashboard", "Deal Flow", "Portfolio", "Diligence", "Billing"],
  investor_vc_enterprise: [
    "Dashboard",
    "Deal Flow",
    "Portfolio",
    "Diligence",
    "LP Reports",
    "Billing",
  ],
  advisor: ["Dashboard", "Clients", "Billing"],
  cohort_starter: ["Dashboard", "Cohort", "Billing"],
  cohort_growth: ["Dashboard", "Cohort", "Deal Flow", "Billing"],
  cohort_enterprise: ["Dashboard", "Cohort", "Deal Flow", "Diligence", "Billing"],
  lp: ["Dashboard", "Fund Reports", "Billing"],
  free: ["Dashboard", "Billing"],
};

test.describe("Regression — menu visibility per plan", () => {
  for (const account of allAccounts()) {
    test(`${account.email} (${account.plan}) sees only allowed menu items`, async ({ page }) => {
      await loginAs(page, account.email);
      await page.goto("/dashboard");

      const nav = page.getByRole("navigation").first();
      await expect(nav).toBeVisible();

      const expected = EXPECTED_MENU[account.plan] ?? EXPECTED_MENU.free;
      for (const item of expected) {
        await expect(nav.getByRole("link", { name: new RegExp(item, "i") })).toBeVisible();
      }

      // Assert nothing extra: gather all link texts and compare set membership.
      const links = await nav.getByRole("link").allTextContents();
      const set = new Set(links.map((l) => l.trim()).filter(Boolean));
      const allKnownItems = new Set<string>(Object.values(EXPECTED_MENU).flat());
      for (const link of set) {
        if (!allKnownItems.has(link)) continue; // ignore utility links (Sign out, etc.)
        expect(expected).toContain(link);
      }
    });
  }
});
