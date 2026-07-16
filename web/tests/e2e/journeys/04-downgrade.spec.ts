/**
 * Journey 04 — Cancel Scale + accept downgrade to Starter.
 *
 * Uses qa-founder-2 (staggered as founder_scale active paid). Cancels,
 * accepts the exit-survey downgrade offer, verifies churn_events row is
 * written with plan_from='founder_scale' plan_to='founder_starter'.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

test.describe("Journey 04 — downgrade Scale → Starter", () => {
  test("qa-founder-2 downgrades via exit survey", async ({ page, request }) => {
    const account = await loginAs(page, "qa-founder-2@blockid.au");

    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: /cancel/i }).click();

    // Exit survey opens
    await expect(page.getByRole("heading", { name: /before you go|why/i })).toBeVisible();
    await page.getByLabel(/too expensive|price/i).check();

    // Accept downgrade offer instead of full cancel
    await page.getByRole("button", { name: /downgrade.*starter|switch to starter/i }).click();
    await page.getByRole("button", { name: /confirm|yes/i }).click();

    await expect(page.getByTestId("current-plan-chip")).toContainText(/starter/i, {
      timeout: 10_000,
    });

    // Verify churn_events row via QA introspection endpoint.
    const rows = await request.get(
      `/api/qa/churn-events?email=${encodeURIComponent(account.email)}`,
    );
    expect(rows.ok()).toBeTruthy();
    const list = (await rows.json()) as Array<{ plan_from: string; plan_to: string }>;
    const match = list.find(
      (r) => r.plan_from === "founder_scale" && r.plan_to === "founder_starter",
    );
    expect(match).toBeDefined();
  });
});
