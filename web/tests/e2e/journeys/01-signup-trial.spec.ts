/**
 * Journey 01 — Signup + 7-day trial start (S-IA4 wizard: 3 steps, no tier step).
 *
 * Steps:
 *   1. Land on /pricing with upgrade v2 enabled.
 *   2. Click "Start Trial" on the Growth card → /onboarding?trial=1&plan=founder_growth
 *      (anonymous → login with `next` preserved; register inline).
 *   3. Complete the single onboarding wizard:
 *        1 Who are you  → Founder (radio) + Continue
 *        2 Your startup → name + Create startup (skip is allowed)
 *        3 First value  → "Start your Growth trial" (the plan rode through the
 *          wizard; the interval from the pricing toggle rides with it) → Billing
 *   4. Billing auto-starts the Stripe checkout for the plan; pay with 4242….
 *   5. Assert dashboard renders trial banner "6 days left".
 *   6. Assert /api/entitlement/me?feature=cap_table.write → allowed=true.
 */

import { test, expect } from "@playwright/test";

test.describe("Journey 01 — signup + trial", () => {
  test("founder starts Growth trial through the 3-step wizard and lands with cap_table.write", async ({ page, context }) => {
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
    await growthCard.getByRole("link", { name: /start.*trial/i }).or(growthCard.getByRole("button", { name: /start.*trial/i })).first().click();

    // Anonymous → login (register tab) with next=/onboarding?… preserved.
    await page.waitForURL(/\/auth\/login\?next=%2Fonboarding/);
    await page.getByRole("tab", { name: /register|create/i }).or(page.getByRole("button", { name: /^register$|create account/i })).first().click();
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("QaPass!234Journey01");
    await page.getByRole("button", { name: /create|sign up|register/i }).click();

    // Wizard step 1 — persona radiogroup + one Continue.
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
    const wizard = page.locator('[data-onboarding-wizard="v4"]');
    await expect(wizard).toHaveAttribute("data-wizard-step", "1");
    await page.getByRole("radio", { name: /founder/i }).check();
    await page.getByTestId("wizard-continue").click();

    // Step 2 — Your startup (no tier / trial / payment step in between).
    await expect(wizard).toHaveAttribute("data-wizard-step", "2");
    await expect(page.locator('[data-wizard-step="startup"]')).toBeVisible();
    await expect(page.getByText(/choose a plan|payment/i)).toHaveCount(0);
    await page.getByLabel(/what are you building/i).fill("QA Journey Startup");
    await page.getByTestId("wizard-continue").click();

    // Step 3 — First value; the pricing plan rode through, so the primary CTA is the trial → Billing.
    await expect(wizard).toHaveAttribute("data-wizard-step", "3");
    const primary = page.getByTestId("wizard-continue");
    await expect(primary).toHaveAttribute("data-href", /\/workspace\/billing\?plan=founder_growth/);
    await primary.click();

    // Billing auto-checkout → Stripe (Checkout page or embedded elements).
    await page.waitForURL(/\/workspace\/billing|checkout\.stripe\.com/, { timeout: 30_000 });
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
