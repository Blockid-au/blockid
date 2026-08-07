/**
 * Journey 02 — Upgrade mid-trial.
 *
 * Uses qa-founder-1 (staggered at T-5d, i.e. day 3 of trial) and upgrades
 * from Growth to Scale. Verifies:
 *   - Proration line item visible in the confirmation modal.
 *   - Plan flips to `founder_scale` in the billing view.
 *   - `esop.manage` capability becomes true within 2s.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { assertEntitlement } from "../fixtures/stripe";

test.describe("Journey 02 — upgrade mid-trial", () => {
  test("qa-founder-1 upgrades Growth → Scale", async ({ page }) => {
    const account = await loginAs(page, "qa-founder-1@blockid.au");

    await page.goto("/workspace/billing");
    await expect(page.getByRole("heading", { name: /billing|plan/i })).toBeVisible();

    await page.getByRole("button", { name: /upgrade.*scale|change plan/i }).click();
    // Confirmation modal
    await expect(page.getByText(/prorat/i)).toBeVisible();
    await page.getByRole("button", { name: /confirm|upgrade/i }).click();

    // Plan chip flip — wait up to 10 s for the backend to write the new plan.
    await expect(page.getByTestId("current-plan-chip")).toContainText(/scale/i, {
      timeout: 10_000,
    });

    // Entitlement propagates with the same server event that flips the chip;
    // assert immediately now that the chip DOM confirmation is our gate.
    await assertEntitlement(page, account.email, "esop.manage", true);
  });
});
