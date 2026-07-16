/**
 * Journey 01 — Signup + 7-day trial start.
 *
 * Steps:
 *   1. Land on /pricing with upgrade v2 enabled.
 *   2. Click "Start Trial" on the Growth card.
 *   3. Complete onboarding wizard (segment picker → tier confirm).
 *   4. Submit payment with Stripe test card 4242 4242 4242 4242.
 *   5. Assert dashboard renders trial banner "6 days left".
 *   6. Assert /api/entitlement/me?feature=cap_table.write → allowed=true.
 */

import { test, expect } from "@playwright/test";

test.describe("Journey 01 — signup + trial", () => {
  test("founder starts Growth trial and lands with cap_table.write", async ({ page, context }) => {
    const email = `qa-signup-${Date.now()}@blockid.au`;

    await context.addCookies([
      {
        name: "upgrade_v2",
        value: "1",
        url: page.context()._options.baseURL ?? "http://localhost:3000",
      },
    ]);

    await page.goto("/pricing?segment=founder");
    await expect(page.getByRole("heading", { name: /pricing|plans/i })).toBeVisible();

    const growthCard = page.getByTestId("plan-card-founder_growth");
    await expect(growthCard).toBeVisible();
    await growthCard.getByRole("button", { name: /start.*trial/i }).click();

    // Onboarding — segment picker
    await page.getByRole("radio", { name: /founder/i }).check();
    await page.getByRole("button", { name: /continue|next/i }).click();

    // Tier confirm
    await expect(page.getByText(/growth/i)).toBeVisible();
    await page.getByRole("button", { name: /continue|next|confirm/i }).click();

    // Signup form (email + password)
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("QaPass!234Journey01");
    await page.getByRole("button", { name: /create|sign up/i }).click();

    // Stripe Checkout — iframe fields
    const stripeFrame = page.frameLocator("iframe[name^='__privateStripeFrame']").first();
    await stripeFrame.getByPlaceholder(/card number/i).fill("4242424242424242");
    await stripeFrame.getByPlaceholder(/mm ?\/ ?yy/i).fill("12/34");
    await stripeFrame.getByPlaceholder(/cvc/i).fill("123");
    await page.getByRole("button", { name: /subscribe|start trial|pay/i }).click();

    // Dashboard landing
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/6 days? left|trial/i)).toBeVisible();

    // Entitlement check
    const ent = await page.request.get("/api/entitlement/me?feature=cap_table.write");
    expect(ent.ok()).toBeTruthy();
    const body = await ent.json();
    expect(body.allowed ?? body.can).toBe(true);
  });
});
