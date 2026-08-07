/**
 * Founding-promo cutover smoke — Playwright.
 *
 * The Founding 100 promo ends at 2026-09-01T00:00:00Z. The cutover is
 * enforced server-side in three places (see lib/founding-promo.ts):
 *   - /founding-50 page redirects to /pricing after cutover
 *   - /pricing hides the founding50 tier after cutover
 *   - Checkout API refuses new Founding 100 subscriptions after cutover
 *
 * This spec locks in the /founding-50 behaviour on both sides of the
 * cutover so a silent clock/logic regression can't accidentally re-open
 * (or prematurely close) the promo window.
 *
 * Mirrors post-deploy.spec.ts style: chromium only, tight timeout, no
 * fixture dependencies. Runs against PLAYWRIGHT_BASE_URL (defaults to
 * localhost:3000 via playwright.config.ts).
 *
 * NOTE on Date mocking:
 *   `isFoundingPromoActive()` runs on the server (Node runtime, App
 *   Router RSC). `page.addInitScript` only mocks Date inside the browser
 *   context — it does NOT reach the server. So the two tests below can
 *   only verify a) the render path for `active` promo works (default,
 *   under current wall clock while pre-cutover), and b) the redirect path
 *   for `expired` promo (once the wall clock crosses cutover, or by
 *   overriding the server env — future work).
 *
 *   To keep both assertions meaningful today (2026-08-07), the test
 *   detects which side of cutover we're on and asserts the correct
 *   observable behaviour. Once the wall clock passes 2026-09-01 the
 *   "before cutover" test auto-flips into a skip and the "after cutover"
 *   test becomes the live assertion — no re-plumbing required.
 */

import { test, expect } from "@playwright/test";

const PAGE_TIMEOUT = 15_000;
const CUTOVER_MS = Date.parse("2026-09-01T00:00:00Z");

test.describe("Founding 100 promo cutover", () => {
  test.setTimeout(30_000);

  test("before cutover — /founding-50 renders the Founding 100 page", async ({
    page,
  }) => {
    test.skip(
      Date.now() >= CUTOVER_MS,
      "Promo cutover has passed; before-cutover assertion no longer applicable",
    );

    // addInitScript is retained even though the server ignores it — it
    // hard-pins client-side Date checks (e.g. countdown timer) to a
    // known pre-cutover instant so a flake from a browser wall-clock
    // drift can't false-fail the visible assertions.
    await page.addInitScript(() => {
      const RealDate = Date;
      const fixed = new RealDate("2026-08-30T12:00:00Z").getTime();
      // Preserve constructor + methods; only Date.now() is redirected.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Date as unknown as { now: () => number }).now = () => fixed;
    });

    const resp = await page.goto("/founding-50", {
      waitUntil: "domcontentloaded",
    });
    expect(resp, "no response for /founding-50").not.toBeNull();
    expect(resp!.status(), "unexpected status").toBe(200);
    // The heading uses cfg.founding_plan_name which defaults to
    // "Founding 100" (platform-config.ts). If a config edit renames the
    // plan the fallback ("Claim Your … Account") still matches.
    await expect(
      page
        .getByRole("heading", { level: 1 })
        .filter({ hasText: /founding\s*100|claim your/i })
        .first(),
    ).toBeVisible({ timeout: PAGE_TIMEOUT });
  });

  test("after cutover — /founding-50 redirects to /pricing", async ({
    page,
  }) => {
    test.skip(
      Date.now() < CUTOVER_MS,
      "Promo still active; after-cutover assertion runs post 2026-09-01",
    );

    await page.addInitScript(() => {
      const RealDate = Date;
      const fixed = new RealDate("2026-09-05T12:00:00Z").getTime();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Date as unknown as { now: () => number }).now = () => fixed;
    });

    await page.goto("/founding-50", { waitUntil: "domcontentloaded" });
    // isFoundingPromoActive() → false triggers redirect("/pricing").
    // Whether it lands as an SSR 307 or a client-side navigation, the
    // final URL is the source-of-truth assertion.
    await page.waitForURL(/\/pricing($|\?)/, { timeout: PAGE_TIMEOUT });
    expect(page.url()).toMatch(/\/pricing($|\?)/);
  });
});
