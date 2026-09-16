/**
 * Evaluator landing — G13-W4-IA4 (spec §C.1 + §E "S-IA4" tests).
 *
 * Login as the seeded QA angel (scripts/seed-test-users.mjs) →
 *   • /dashboard bounces to /workspace/investor (persona redirect)
 *   • the landing renders its blocks: evaluating · (dealflow | mandate) ·
 *     quota, plus mandate when < 3 sections are set — every block has a CTA
 *   • sidebar ≤ 3 groups (Home · Deal flow · Reports), no Fundraise / Money
 *   • /workspace/advisor and /workspace/accelerator render their variants
 *
 * Skips (never fails) when the seed account is missing on this box, matching
 * menu-structure.spec.ts.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ANGEL_EMAIL = process.env.QA_INVESTOR_ANGEL_EMAIL ?? "qa+investor_angel@blockid.au";
const WORKSPACE_NAV = 'nav[aria-label="Workspace navigation"]';
const BLOCKS = ["evaluating", "dealflow", "quota", "mandate"] as const;

async function loginOrSkip(page: Page) {
  let ok = false;
  try {
    await loginAs(page, ANGEL_EMAIL);
    ok = true;
  } catch {
    /* fixture missing on this box */
  }
  test.skip(!ok, `QA angel ${ANGEL_EMAIL} not seeded — run scripts/seed-test-users.mjs`);
}

test.describe("Evaluator landing (S-IA4)", () => {
  test.setTimeout(60_000);

  test("angel: /dashboard → /workspace/investor, four-block landing with CTAs, ≤ 3 sidebar groups, no Fundraise", async ({ page }) => {
    await loginOrSkip(page);

    // Persona redirect — /dashboard is the universal post-login URL.
    await page.goto("/dashboard");
    await page.waitForURL(/\/(workspace\/investor|onboarding)(\?|$)/, { timeout: 20_000 });
    test.skip(/\/onboarding/.test(page.url()), "seed angel has not completed onboarding — the wizard owns this session");

    const landing = page.locator("[data-investor-landing]");
    await expect(landing).toBeVisible({ timeout: 20_000 });
    await expect(landing).toHaveAttribute("data-landing-persona", /investor_(angel|vc)/);
    await expect(landing).toHaveAttribute("data-landing-variant", "investor");

    const names = await landing.locator("[data-landing-block]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(names.length).toBeLessThanOrEqual(4);
    for (const n of names) expect(BLOCKS as readonly string[]).toContain(n);
    expect(names[0]).toBe("evaluating");
    // Block 2 is deal flow, or block 4 (mandate) when the mandate is empty — never a blank card.
    expect(["dealflow", "mandate"]).toContain(names[1]);
    expect(names).toContain("quota");
    // Every rendered block has exactly one primary CTA.
    for (const n of names) {
      await expect(landing.locator(`[data-landing-block="${n}"] [data-landing-cta="${n}"]`).first()).toBeVisible();
    }

    // Evaluator sidebar — ≤ 3 groups, no founder money / raise leak.
    const nav = page.locator(WORKSPACE_NAV);
    await expect(nav).toBeVisible();
    const groups = await nav.locator("[data-group-label]").evaluateAll((els) => els.map((el) => el.getAttribute("data-group-label")));
    expect(groups.length).toBeLessThanOrEqual(3);
    for (const leak of [/fundraise/i, /^money$/i, /^company$/i, /^raise$/i]) {
      await expect(nav.locator("[data-group-label]").filter({ hasText: leak })).toHaveCount(0);
    }
    await expect(nav.locator('a[href="/workspace/raise"]')).toHaveCount(0);
  });

  test("block CTAs resolve to evaluator surfaces (evaluations / dealflow / mandate / pricing)", async ({ page }) => {
    await loginOrSkip(page);
    await page.goto("/workspace/investor");
    const landing = page.locator("[data-investor-landing]");
    await expect(landing).toBeVisible({ timeout: 20_000 });
    const hrefs = await landing.locator("[data-landing-cta]").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(h).toMatch(/^\/(workspace\/(evaluations|investor\/(dealflow|mandate)|accelerator\/quarterly-report)|pricing\?segment=evaluator)/);
    }
  });

  test("advisor + accelerator hub roots render their variants for the same account", async ({ page }) => {
    await loginOrSkip(page);
    await page.goto("/workspace/advisor");
    await expect(page.locator('[data-investor-landing][data-landing-variant="advisor"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Clients$/ })).toBeVisible();
    await page.goto("/workspace/accelerator");
    await expect(page.locator('[data-investor-landing][data-landing-variant="accelerator"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Cohort$/ })).toBeVisible();
    await expect(page.locator("[data-landing-lp-report]")).toBeVisible();
  });
});
