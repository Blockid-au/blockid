/**
 * Journey 05 — Cancel → COMEBACK30 offer → reject → confirm cancel
 * → reactivate within 30d with coupon applied.
 *
 * Uses qa-founder-6 (renewed, active paid). Exercises full save/comeback
 * flow, then a subsequent reactivate flow.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

test.describe("Journey 05 — cancel + reactivate", () => {
  test("qa-founder-6 rejects save-offer, cancels, reactivates with COMEBACK30", async ({ page }) => {
    await loginAs(page, "qa-founder-6@blockid.au");

    // Cancel flow
    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: /cancel/i }).click();
    await page.getByLabel(/not using|not enough value/i).check();
    await page.getByRole("button", { name: /continue|next/i }).click();

    // COMEBACK30 save offer
    await expect(page.getByText(/30% off|comeback/i)).toBeVisible();
    await page.getByRole("button", { name: /no thanks|cancel anyway|confirm cancel/i }).click();

    await expect(page.getByTestId("current-plan-chip")).toContainText(/canceled|expires/i, {
      timeout: 10_000,
    });

    // Reactivate within grace window
    await page.getByRole("button", { name: /reactivate|resume/i }).click();
    await page.getByRole("button", { name: /confirm|resume/i }).click();

    // Coupon applied — surfaced on billing view
    await expect(page.getByText(/COMEBACK30|-30%/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("current-plan-chip")).toContainText(/active/i);
  });
});
