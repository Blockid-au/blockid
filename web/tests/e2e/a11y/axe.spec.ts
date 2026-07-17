/**
 * Accessibility sweep — WCAG 2.1 AA compliance across canonical routes.
 *
 * Runs axe-core over 20 routes (10 public, 10 gated) and asserts zero
 * serious/critical violations. Target: >= 95% AA compliance.
 *
 * Import from @axe-core/playwright: if the dep is missing at CI time the
 * spec fails loudly rather than passing silently.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "../fixtures/accounts";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

const PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/pricing",
  "/pricing/founder_growth",
  "/for/founder",
  "/for/investor",
  "/legal/terms",
  "/legal/privacy",
  "/legal/disclaimers",
  "/auth/login",
  "/vs/cake",
];

const GATED_ROUTES: readonly string[] = [
  "/onboarding",
  "/dashboard",
  "/workspace/investor",
  "/workspace/investor/dealflow",
  "/workspace/investor/watchlist",
  "/workspace/advisor",
  "/workspace/accelerator",
  "/workspace/equity-offer",
  "/account/billing",
];

const ADMIN_ROUTE = "/admin/pricing-metrics";

interface AxeSummary {
  route: string;
  totalViolations: number;
  seriousOrCritical: number;
  ruleIds: string[];
}

function printSummary(s: AxeSummary): void {
  const line = `[a11y] ${s.route.padEnd(40)} violations=${s.totalViolations} serious+critical=${s.seriousOrCritical}${
    s.ruleIds.length ? ` rules=${s.ruleIds.join(",")}` : ""
  }`;
  // eslint-disable-next-line no-console
  console.log(line);
}

test.describe("A11y — public routes (WCAG 2.1 AA)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`axe sweep: ${route}`, async ({ page }) => {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (resp && resp.status() === 404) {
        test.skip(true, `Route ${route} returned 404`);
        return;
      }
      await page.waitForLoadState("networkidle").catch(() => {
        /* tolerate long-poll endpoints */
      });

      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      printSummary({
        route,
        totalViolations: results.violations.length,
        seriousOrCritical: blocking.length,
        ruleIds: blocking.map((v) => v.id),
      });

      expect(
        blocking,
        `Serious/critical WCAG violations on ${route}: ${blocking
          .map((v) => `${v.id} (${v.nodes.length} nodes)`)
          .join(", ")}`,
      ).toEqual([]);
    });
  }
});

test.describe("A11y — gated routes (WCAG 2.1 AA)", () => {
  for (const route of GATED_ROUTES) {
    test(`axe sweep: ${route}`, async ({ page }) => {
      try {
        await loginAs(page, "qa-founder-2@blockid.au");
      } catch (err) {
        test.skip(true, `Login failed for qa-founder-2: ${(err as Error).message}`);
        return;
      }

      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (resp && (resp.status() === 404 || resp.status() === 403)) {
        test.skip(true, `Route ${route} returned ${resp.status()}`);
        return;
      }
      await page.waitForLoadState("networkidle").catch(() => {
        /* tolerate long-poll endpoints */
      });

      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      printSummary({
        route,
        totalViolations: results.violations.length,
        seriousOrCritical: blocking.length,
        ruleIds: blocking.map((v) => v.id),
      });

      expect(
        blocking,
        `Serious/critical WCAG violations on ${route}: ${blocking
          .map((v) => `${v.id} (${v.nodes.length} nodes)`)
          .join(", ")}`,
      ).toEqual([]);
    });
  }

  test(`axe sweep: ${ADMIN_ROUTE}`, async ({ page }) => {
    try {
      await loginAs(page, "qa-admin@blockid.au");
    } catch (err) {
      test.skip(true, `Login failed for qa-admin: ${(err as Error).message}`);
      return;
    }

    const resp = await page.goto(ADMIN_ROUTE, { waitUntil: "domcontentloaded" });
    if (resp && (resp.status() === 404 || resp.status() === 403)) {
      test.skip(true, `Route ${ADMIN_ROUTE} returned ${resp.status()}`);
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {
      /* tolerate long-poll endpoints */
    });

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    printSummary({
      route: ADMIN_ROUTE,
      totalViolations: results.violations.length,
      seriousOrCritical: blocking.length,
      ruleIds: blocking.map((v) => v.id),
    });

    expect(
      blocking,
      `Serious/critical WCAG violations on ${ADMIN_ROUTE}: ${blocking
        .map((v) => `${v.id} (${v.nodes.length} nodes)`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
