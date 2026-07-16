/**
 * Journey 03 — Trial ends → auto-charge.
 *
 * Uses qa-founder-4 (trial_last_day). Fast-forwards the mock clock to T+7d,
 * fires subscription.updated (trialing→active) + invoice.paid, then asserts
 * first invoice appears and Telegram announce hook was called (mocked).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { advanceTrialClock } from "../fixtures/stripe";

test.describe("Journey 03 — trial-end auto-charge", () => {
  test("qa-founder-4 converts from trial to active with first invoice", async ({ page, request }) => {
    const account = await loginAs(page, "qa-founder-4@blockid.au");

    // Reset Telegram mock counter (best-effort).
    await request.post("/api/qa/mocks/telegram/reset", { failOnStatusCode: false });

    await advanceTrialClock({ userId: account.email, days: 7 });

    await page.goto("/workspace/billing");
    await expect(page.getByTestId("current-plan-chip")).toContainText(/active|paid/i, {
      timeout: 15_000,
    });

    // First invoice row
    await expect(page.locator("table tr", { hasText: /paid|A\$/i }).first()).toBeVisible();

    // Telegram mock — ensures conversion announcement was fired.
    const tg = await request.get("/api/qa/mocks/telegram/last");
    expect(tg.ok()).toBeTruthy();
    const body = await tg.json();
    expect(String(body.text ?? "")).toMatch(/converted|active|subscription/i);
  });
});
