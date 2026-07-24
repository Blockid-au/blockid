/**
 * Atlassian showcase walkthrough — anonymous 9-step visitor journey.
 *
 * Complements the SSR curl gates in scripts/deploy-live.sh by asserting
 * the hydrated visitor experience of the /showcase/atlassian/* mirror
 * family:
 *   - shell renders the correct "Step N of 9" heading on every step,
 *   - Next → advances the URL and shell in lockstep,
 *   - deep-links (?step=N) work directly without traversing all prior
 *     steps,
 *   - Escape returns to the landing page,
 *   - none of the 9 URLs redirect an anonymous visitor to /auth/login.
 *
 * Timing note: the visitor journey assumes sibling mirror pages
 * (/dashboard, /svi-report, /growth-phases, /agents/**, /data-room,
 * /valuation) have shipped. If this spec runs BEFORE Round 2 fully
 * lands, the click-through test will fail with a 404 on the missing
 * step — QA orchestrator (agent D) re-runs after the full round.
 *
 * Constraints:
 *   - Reuses playwright.config.ts baseURL (PLAYWRIGHT_BASE_URL env).
 *   - Chromium only (matches sibling post-deploy.spec.ts style).
 *   - Wall time target < 90s.
 */

import { test, expect } from "@playwright/test";

import {
  ATLASSIAN_WALKTHROUGH,
  ATLASSIAN_WALKTHROUGH_TOTAL,
} from "../../../src/lib/showcase/atlassian/steps";

const PAGE_TIMEOUT = 15_000;

test.describe("Atlassian showcase walkthrough — anonymous", () => {
  test.setTimeout(90_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Test 1 — landing loads with walkthrough shell at Step 1 of 9", async ({
    page,
  }) => {
    const resp = await page.goto("/showcase/atlassian?step=1", {
      waitUntil: "domcontentloaded",
    });
    expect(resp, "no response for /showcase/atlassian?step=1").not.toBeNull();
    expect(resp!.status()).toBe(200);
    await expect(
      page.getByText(new RegExp(`Step 1 of ${ATLASSIAN_WALKTHROUGH_TOTAL}`)),
    ).toBeVisible({ timeout: PAGE_TIMEOUT });
    // The landing hero CTA that starts the walkthrough must be visible.
    await expect(page.getByTestId("start-walkthrough-cta")).toBeVisible({
      timeout: PAGE_TIMEOUT,
    });
  });

  test("Test 2 — full 9-step walkthrough via Next button", async ({ page }) => {
    // Start at step 1.
    await page.goto("/showcase/atlassian?step=1", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Step 1 of 9/)).toBeVisible({
      timeout: PAGE_TIMEOUT,
    });

    // Click Next 8 times, asserting URL + shell heading after each click.
    for (let i = 1; i < ATLASSIAN_WALKTHROUGH_TOTAL; i++) {
      const next = page.getByTestId("walkthrough-next");
      await expect(next).toBeEnabled({ timeout: PAGE_TIMEOUT });
      await next.click();
      const expectedStep = ATLASSIAN_WALKTHROUGH[i]!;
      // URL must match the target path (allow trailing query params).
      await page.waitForURL(
        new RegExp(`${escapeRegex(expectedStep.path)}(\\?|$)`),
        { timeout: PAGE_TIMEOUT },
      );
      await expect(
        page.getByText(new RegExp(`Step ${expectedStep.n} of 9`)),
      ).toBeVisible({ timeout: PAGE_TIMEOUT });
    }

    // At step 9, Next must be disabled (last step).
    await expect(page.getByTestId("walkthrough-next")).toBeDisabled({
      timeout: PAGE_TIMEOUT,
    });
  });

  test("Test 3 — deep-link ?step=7 renders valuation at Step 7 of 9", async ({
    page,
  }) => {
    const resp = await page.goto("/showcase/atlassian/valuation?step=7", {
      waitUntil: "domcontentloaded",
    });
    expect(resp, "no response for valuation deep-link").not.toBeNull();
    expect(resp!.status()).toBe(200);
    await expect(page.getByText(/Step 7 of 9/)).toBeVisible({
      timeout: PAGE_TIMEOUT,
    });
  });

  test("Test 4 — Escape from a middle step returns to landing", async ({
    page,
  }) => {
    // Jump into the middle of the walkthrough (step 4 — growth-phases).
    await page.goto("/showcase/atlassian/growth-phases?step=4", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Step 4 of 9/)).toBeVisible({
      timeout: PAGE_TIMEOUT,
    });

    // Escape should route back to /showcase/atlassian (exit path).
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/showcase\/atlassian(\?|$)/, {
      timeout: PAGE_TIMEOUT,
    });
    // The landing shell is Step 1.
    await expect(page.getByText(/Step 1 of 9/)).toBeVisible({
      timeout: PAGE_TIMEOUT,
    });
  });

  test("Test 5 — no /auth/login redirect on any of the 9 steps", async ({
    page,
    context,
  }) => {
    // Belt-and-braces: clear any cookies that may have leaked from prior
    // test runs in the same worker.
    await context.clearCookies();
    for (const step of ATLASSIAN_WALKTHROUGH) {
      const url = `${step.path}?step=${step.n}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      expect(resp, `no response for ${url}`).not.toBeNull();
      // 200 (rendered) or 3xx to a non-login target both count. Anything
      // that lands us on /auth/login is the regression this test catches.
      expect(page.url(), `${url} redirected to auth`).not.toMatch(
        /\/auth\/login/,
      );
    }
  });
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
