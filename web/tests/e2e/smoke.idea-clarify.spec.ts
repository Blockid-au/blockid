/**
 * Smoke — /tools/idea-clarify two-step flow.
 *
 * 1. Paste an idea → click "Ask me the right questions" → expect ≥5 answer
 *    textareas.
 * 2. Fill 3 answers → click "Get my next step" → expect a recommendation
 *    card with a primary CTA link and ≥1 secondary link.
 */

import { test, expect } from "@playwright/test";

const ASSERT_TIMEOUT = 15_000;

test.describe("Smoke — idea clarify", () => {
  test.setTimeout(30_000);

  test("idea → questions → recommendation renders", async ({ page }) => {
    await page.goto("/tools/idea-clarify");

    const ideaBox = page.locator("#idea");
    await expect(ideaBox).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await ideaBox.fill(
      "A marketplace connecting Australian small business accountants with SMBs that need on-demand bookkeeping and BAS help.",
    );

    await page
      .getByRole("button", { name: /ask me the right questions/i })
      .click();

    // Step 2 — question textareas render (ids look like `q-<something>`).
    const questionTextareas = page.locator('textarea[id^="q-"]');
    await expect(questionTextareas.first()).toBeVisible({ timeout: ASSERT_TIMEOUT });
    const questionCount = await questionTextareas.count();
    expect(questionCount).toBeGreaterThanOrEqual(5);

    // Fill 3 to clear the "answer at least 3" gate.
    await questionTextareas.nth(0).fill("SMB owners doing their own books.");
    await questionTextareas.nth(1).fill("Speed to a compliant BAS submission.");
    await questionTextareas.nth(2).fill("Subscription per BAS submission.");

    await page.getByRole("button", { name: /get my next step/i }).click();

    // Step 3 — recommendation card.
    await expect(
      page.getByText(/recommended next step/i),
    ).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // Primary CTA: "Continue there" link.
    const primary = page.getByRole("link", { name: /continue there/i });
    await expect(primary).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(primary).toHaveAttribute("href", /.+/);

    // "Also worth exploring" secondary links — expect ≥1.
    const secondaryHeader = page.getByText(/also worth exploring/i);
    await expect(secondaryHeader).toBeVisible({ timeout: ASSERT_TIMEOUT });
    const secondaryLinks = page
      .locator('a', { has: page.locator("svg") })
      .filter({ hasNot: page.getByRole("link", { name: /continue there/i }) });
    // Loose count — at least one link after the "Also worth exploring" heading.
    const secondaryCount = await page
      .locator("text=Also worth exploring")
      .locator("xpath=following::a[1]")
      .count();
    expect(secondaryCount).toBeGreaterThanOrEqual(1);
    // Suppress unused-var lint on the helper locator above.
    void secondaryLinks;
  });
});
