/**
 * Startup Package — Playwright smoke.
 *
 * Anonymous surface checks only. We deliberately do NOT drive the
 * authenticated interview flow here because that requires a seeded demo
 * account, which is unavailable on the deploy target per
 * memory:reference_tour_capture_pipeline. Authenticated paths are covered
 * by vitest integration tests + the manual QA checklist.
 *
 * Kept intentionally short (4 tests, <45s wall time) so it can slot into
 * the post-deploy smoke pack.
 */

import { test, expect } from "@playwright/test";

const PAGE_TIMEOUT = 15_000;

test.describe("Startup Package — anonymous smoke", () => {
  test.setTimeout(45_000);

  test("/startup-package returns 200 + hero copy visible", async ({ page }) => {
    const response = await page.goto("/startup-package", {
      waitUntil: "domcontentloaded",
    });
    // Handles undefined for baseURL/relative resolution edge cases.
    expect(response?.status(), "startup-package should return 200").toBe(200);
    // Hero copy is the "Startup Package" wordmark. Kept loose (case-insensitive)
    // so a subtitle tweak doesn't break the smoke.
    await expect(
      page.getByRole("heading", { name: /startup package/i }).first(),
    ).toBeVisible({ timeout: PAGE_TIMEOUT });
  });

  test("/startup-package/interview redirects anonymous → /auth/login", async ({
    page,
  }) => {
    await page.goto("/startup-package/interview", {
      waitUntil: "domcontentloaded",
    });
    // Auth-required routes should bounce anonymous visitors to the sign-in
    // page. We assert on the URL rather than the response status because the
    // Next middleware may 302 or 307 depending on the config.
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: PAGE_TIMEOUT });
  });

  test("/startup/nonexistent returns 404", async ({ page }) => {
    const response = await page.goto("/startup/nonexistent-slug-abc123", {
      waitUntil: "domcontentloaded",
    });
    expect(
      response?.status(),
      "unknown startup slug should 404",
    ).toBe(404);
  });

  test("/docs/startup-package returns 200 + h1 visible", async ({ page }) => {
    const response = await page.goto("/docs/startup-package", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), "docs page should return 200").toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: /startup package guide/i }),
    ).toBeVisible({ timeout: PAGE_TIMEOUT });
  });
});
