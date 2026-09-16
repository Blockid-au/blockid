/**
 * E2E — menu structure per role (ux-ia-startup-flow-v1 §P9).
 *
 * Pins the top-nav IA contracts stated in the goal doc:
 *   - Anonymous visitors on every public page (S-IA5: ONE header — NavV2 on
 *     /pricing, /docs, /auth/login, /tools/esic, /about/invest alike) see
 *     <=7 nav items (five since G11 T0238: Get my score · Get funding ·
 *     Free tools · Pricing · Demo), a "Get funding" dropdown, the "Do you
 *     need money?" CTA, AND a Demo link that points at
 *     /showcase/atlassian?step=1. The legacy site/navbar is deleted.
 *   - Logged-in founders on /workspace/plan get the JourneyStepLadder rendered
 *     (moved off /dashboard in G13-W3-IA3; /dashboard is the five-block landing).
 *   - Logged-in founders see the Demo link in the workspace top-bar.
 *   - /showcase/atlassian?step=1 resolves 200 (Demo target is real).
 *   - Nav v4 (G13-W1-IA1): the founder sidebar leads with Home, a phase-0
 *     founder sees ≤ 10 links, and an evaluator sees ≤ 3 groups with no
 *     Fundraise / Money / Company group.
 *
 * The tests skip role-scoped assertions when the QA seed accounts are not
 * present on the dev box (matches founder-one-startup-limit.spec.ts pattern).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const FOUNDER_EMAIL = process.env.QA_FOUNDER_LIMIT_EMAIL ?? "qa+founder@blockid.au";
const FOUNDER_P0_EMAIL = process.env.QA_FOUNDER_P0_EMAIL ?? "qa+founder@blockid.au";
const ANGEL_EMAIL = process.env.QA_INVESTOR_ANGEL_EMAIL ?? "qa+investor_angel@blockid.au";

const WORKSPACE_NAV = 'nav[aria-label="Workspace navigation"]';

/**
 * S-IA5 (G13-W5): the same assertions on every kind of public page —
 * marketing shell, docs, a free tool, the auth page (light skin) and the
 * renamed invest pitch. One header means one contract; the loop keeps the
 * per-page assertions identical (≤ 7 top items, Demo reachable, funding
 * dropdown, money CTA).
 */
const PUBLIC_HEADER_PAGES: ReadonlyArray<{ path: string; variant: "dark" | "light" }> = [
  { path: "/pricing", variant: "dark" },
  { path: "/docs", variant: "dark" },
  { path: "/tools/esic", variant: "dark" },
  { path: "/about/invest", variant: "dark" },
  { path: "/auth/login", variant: "light" },
];

test.describe("Menu structure — anonymous visitor (NavV2, the one header)", () => {
  test.setTimeout(30_000);

  for (const { path, variant } of PUBLIC_HEADER_PAGES) {
    test(`${path} top-nav: ≤ 7 items, Demo + Get funding dropdowns, money CTA (${variant} skin)`, async ({
      page,
    }) => {
      await page.goto(path);

      // Exactly one header on the page (S-IA5) and the primary nav is
      // aria-labelled "Primary".
      await expect(page.locator("header")).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator("header")).toHaveAttribute("data-nav-variant", variant);
      const primary = page.locator('nav[aria-label="Primary"]').first();
      await expect(primary).toBeVisible({ timeout: 15_000 });

      // Count top-level items — expect <=7. NavV2 uses <ul><li>* structure.
      const topLevel = primary.locator(":scope > ul > li");
      const count = await topLevel.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(7);

      // A Demo trigger exists (as a dropdown BUTTON). We look for its
      // visible label rather than the sublink, because dropdowns collapse.
      const demoTrigger = primary.getByRole("button", { name: /^demo$/i });
      await expect(demoTrigger).toBeVisible();

      // G11 T0238 — the money rail is a dropdown button too, and the
      // primary CTA is "Do you need money?" → /funding?intent=money (the
      // old "Start free" bounced anonymous visitors to login). The CTA lives
      // in the desktop CTA row, so it is scoped to the nav, not the <ul>.
      const fundingTrigger = primary.getByRole("button", { name: /^get funding$/i });
      await expect(fundingTrigger).toBeVisible();
      const moneyCta = primary.getByRole("link", { name: /^do you need money\?$/i });
      await expect(moneyCta).toBeVisible({ timeout: 15_000 });
      expect(await moneyCta.getAttribute("href")).toBe("/funding?intent=money");
      await expect(primary.getByRole("link", { name: /^start free$/i })).toHaveCount(0);
    });

    test(`${path}: Get funding dropdown lists the grant and program directories`, async ({
      page,
    }) => {
      await page.goto(path);
      const primary = page.locator('nav[aria-label="Primary"]').first();
      const fundingTrigger = primary.getByRole("button", { name: /^get funding$/i });
      await expect(fundingTrigger).toBeVisible({ timeout: 15_000 });
      await fundingTrigger.click();
      const grants = primary.getByRole("menuitem", { name: /grants for my startup/i });
      await expect(grants).toBeVisible({ timeout: 5_000 });
      expect(await grants.getAttribute("href")).toBe("/funding/grants");
      const programs = primary.getByRole("menuitem", { name: /startup programs by city/i });
      expect(await programs.getAttribute("href")).toBe("/funding/programs");
    });
  }

  test("/investors is a permanent redirect to /about/invest (F2); /investor stays the persona landing", async ({
    request,
  }) => {
    const res = await request.get("/investors", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers().location).toMatch(/\/about\/invest$/);
    const forInvestors = await request.get("/investor", { maxRedirects: 0 });
    expect(forInvestors.status()).toBe(200);
  });

  test("Atlassian walkthrough URL is reachable (Demo target 200s)", async ({
    page,
  }) => {
    const res = await page.goto("/showcase/atlassian?step=1");
    expect(res?.status(), "walkthrough page must 200").toBeLessThan(400);
    // The page banner + interactive walkthrough provider render something
    // recognisable; assert on the H1 or the walkthrough wrapper.
    await expect(page.locator("body")).toContainText(/atlassian/i, {
      timeout: 15_000,
    });
  });
});

test.describe("Menu structure — Demo reachable from docs + login (S-IA5: same NavV2)", () => {
  test.setTimeout(30_000);

  for (const path of ["/docs", "/auth/login"]) {
    test(`${path} header exposes the Demo dropdown with the Atlassian journey`, async ({ page }) => {
      await page.goto(path);
      // Look for the "Demo" button trigger — dropdowns are rendered as
      // <button> so we anchor on that.
      const demo = page.getByRole("button", { name: /^demo$/i }).first();
      await expect(demo).toBeVisible({ timeout: 15_000 });
      // Open the dropdown; assert the Atlassian sub-link appears.
      await demo.click();
      // Dropdown entries carry role="menuitem" (G7-P7 a11y contract:
      // aria-haspopup="menu" trigger + menuitem children), so query by that
      // role rather than "link". Same NavV2 markup as the homepage.
      const atlassianLink = page.getByRole("menuitem", {
        name: /atlassian journey/i,
      });
      await expect(atlassianLink.first()).toBeVisible({ timeout: 5_000 });
      const href = await atlassianLink.first().getAttribute("href");
      expect(href).toContain("/showcase/atlassian");
    });
  }
});

test.describe("Menu structure — founder logged-in dashboard", () => {
  test.setTimeout(45_000);

  // G13-W3-IA3 (spec §B.2): the JourneyStepLadder moved from /dashboard to
  // /workspace/plan (the Action plan hub root) — the landing is five blocks.
  test("/workspace/plan renders the 12-phase journey step ladder + Demo link", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    await page.goto("/workspace/plan");

    // The ladder has data-testid="journey-step-ladder" and always renders
    // 12 nodes.
    const ladder = page.locator('[data-testid="journey-step-ladder"]');
    await expect(ladder).toBeVisible({ timeout: 15_000 });

    // Assert phase 1 and phase 12 nodes both exist — that's the full
    // canonical range from PHASE_LABELS.
    await expect(page.locator('[data-testid="journey-step-node-1"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="journey-step-node-12"]').first()).toBeVisible();

    // The workspace topbar exposes the persistent Demo link on desktop.
    // NB: viewport in Playwright default is 1280x720 (>= sm breakpoint).
    const demoLink = page.getByRole("link", { name: /^demo$/i });
    await expect(demoLink.first()).toBeVisible({ timeout: 10_000 });
    const href = await demoLink.first().getAttribute("href");
    expect(href).toContain("/showcase/atlassian");
  });

  test("/dashboard is the five-block landing — no ladder, block 2 CTA present", async ({ page }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(!loginOk, `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`);

    await page.goto("/dashboard");
    test.skip(/\/dashboard\/onboarding/.test(page.url()), "seed founder has no analysis yet — bounced to the wizard");
    await expect(page.locator("[data-landing-grid]")).toBeVisible({ timeout: 15_000 });
    const names = await page.locator("[data-landing-block]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
    expect(names).toEqual(["where-you-stand", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"]);
    await expect(page.locator('[data-testid="journey-step-ladder"]')).toHaveCount(0);
    await expect(page.getByTestId("landing-next-best-action-cta")).toBeVisible();
  });

  // G13-W1-IA1 nav v4 (spec §A.1): the founder sidebar leads with Home.
  // (The pre-v4 assertion looked for /overview/i, which already mismatched
  // the live "Home" label.)
  test("founder sidebar leads with the Home group (persona.ts founder groups)", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    await page.goto("/dashboard");
    const nav = page.locator(WORKSPACE_NAV);
    await expect(nav).toBeVisible({ timeout: 15_000 });
    const firstGroupHeader = nav.locator("span.uppercase").first();
    await expect(firstGroupHeader).toHaveText(/home/i);
    // Account is no longer a group — Settings is a single footer link.
    await expect(nav.locator("[data-group-label='Account']")).toHaveCount(0);
    await expect(page.locator('[data-testid="sidebar-footer"] a[href="/workspace/settings"]')).toBeVisible();
  });

  // Spec §E S-IA1: "founder phase-0 sidebar has ≤ 10 links".
  test("phase-0 founder sidebar has ≤ 10 links across Home · Prove · Money", async ({ page }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_P0_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(!loginOk, `QA founder ${FOUNDER_P0_EMAIL} not seeded — run scripts/seed-test-users.mjs`);

    await page.goto("/dashboard");
    const nav = page.locator(WORKSPACE_NAV);
    await expect(nav).toBeVisible({ timeout: 15_000 });
    const phase = Number((await nav.getAttribute("data-nav-phase")) ?? "0");
    test.skip(phase > 0, `fixture founder is at nav phase ${phase}, not 0`);
    const links = nav.locator("a[href]");
    expect(await links.count()).toBeLessThanOrEqual(10);
    const groups = await nav.locator("[data-group-label]").evaluateAll((els) => els.map((el) => el.getAttribute("data-group-label")));
    expect(groups).toEqual(["Home", "Prove", "Money"]);
    // Company folds under the Later-phases disclosure below band 2.
    await expect(nav.getByRole("button", { name: /later phases/i })).toBeVisible();
  });
});

// G13-W1-IA1 (spec §A.2): evaluators get their own 3-group sidebar and the
// founder Fundraise leak stops.
test.describe("Menu structure — evaluator sidebar (persona.ts)", () => {
  test.setTimeout(45_000);

  test("investor_angel sees ≤ 3 groups (Home · Deal flow · Reports) and no Fundraise / Money / Company", async ({ page }) => {
    let loginOk = false;
    try {
      await loginAs(page, ANGEL_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(!loginOk, `QA angel ${ANGEL_EMAIL} not seeded — run scripts/seed-test-users.mjs`);

    await page.goto("/workspace/investor");
    const nav = page.locator(WORKSPACE_NAV);
    await expect(nav).toBeVisible({ timeout: 15_000 });
    await expect(nav).toHaveAttribute("data-persona", /investor_(angel|vc)/);
    const groups = await nav.locator("[data-group-label]").evaluateAll((els) => els.map((el) => el.getAttribute("data-group-label")));
    expect(groups.length).toBeLessThanOrEqual(3);
    expect(groups).toEqual(["Home", "Deal flow", "Reports"]);
    for (const leak of [/fundraise/i, /^money$/i, /^company$/i, /^prove$/i, /^raise$/i]) {
      await expect(nav.locator("[data-group-label]").filter({ hasText: leak })).toHaveCount(0);
    }
    await expect(nav.locator('a[href="/workspace/evaluations"]')).toBeVisible();
    await expect(nav.locator('a[href="/workspace/investor/mandate"]')).toBeVisible();
    await expect(nav.locator('a[href="/workspace/raise"]')).toHaveCount(0);
  });
});

// S7-A (G8 follow-up) — the sidebar must not change shape between founder
// pages. /dashboard passes `currentPhase` explicitly; /workspace/equity
// passes nothing and relies on the `(founder)` layout's
// FounderNavContextProvider. Same founder → same visible group headers.
test.describe("Menu structure — consistent phase gating across founder pages", () => {
  test.setTimeout(45_000);

  test("/workspace/equity shows the same sidebar groups as /dashboard for the same founder", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    const groupLabels = async (path: string): Promise<string[]> => {
      await page.goto(path);
      const nav = page.locator('nav[aria-label="Workspace navigation"]');
      await expect(nav).toBeVisible({ timeout: 15_000 });
      // Rendered (near-phase, not hidden) groups carry data-group-label;
      // the later-phases panel is collapsed by default so it never leaks in.
      return nav.locator("[data-group-label]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-group-label") ?? ""),
      );
    };

    const onDashboard = await groupLabels("/dashboard");
    const onEquity = await groupLabels("/workspace/equity");
    expect(onDashboard.length).toBeGreaterThan(0);
    expect(onEquity).toEqual(onDashboard);
  });
});

// G13-W2-IA2 — hub tabs (spec §A.1 "Implementation shape"). Every hub
// root renders a WAI-ARIA tablist of links; the pathname decides
// `aria-selected`, and ArrowRight / ArrowLeft move focus AND navigate
// (automatic activation), so the selected tab follows the URL.
test.describe("Menu structure — hub tabs keyboard nav", () => {
  test.setTimeout(45_000);

  test("/workspace/score: ArrowRight moves aria-selected to History, ArrowLeft back; Home/End jump", async ({ page }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(!loginOk, `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`);

    await page.goto("/workspace/score");
    const tablist = page.locator('nav[data-hub="score"] [role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });
    const tabs = tablist.getByRole("tab");
    expect(await tabs.count()).toBeGreaterThanOrEqual(5);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    // Roving tabindex: only the selected tab is in the tab order.
    await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");

    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(/\/workspace\/score\/history/, { timeout: 15_000 });
    await expect(tablist.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tablist.getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "false");

    await tablist.getByRole("tab").nth(1).focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL(/\/workspace\/score(\?|$)/, { timeout: 15_000 });
    await expect(tablist.getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");

    await tablist.getByRole("tab").nth(0).focus();
    await page.keyboard.press("End");
    const last = tablist.getByRole("tab").last();
    await expect(last).toBeFocused();
  });

  test("locked tab keeps its label, is aria-disabled and names the plan", async ({ page }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_P0_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(!loginOk, `QA founder ${FOUNDER_P0_EMAIL} not seeded — run scripts/seed-test-users.mjs`);
    await page.goto("/workspace/exit");
    // A founder below Growth may be bounced by the page gate itself; the
    // contract under test is the tab markup, so only assert when the hub
    // rendered.
    if (!/\/workspace\/exit/.test(page.url())) test.skip(true, "exit hub gated for this fixture");
    const locked = page.locator('nav[data-hub="exit"] [role="tab"][aria-disabled="true"]');
    if ((await locked.count()) === 0) test.skip(true, "fixture plan unlocks every Exit tab");
    await expect(locked.first()).toHaveAttribute("title", /plan unlocks this/);
    await expect(locked.first()).toHaveAttribute("href", /\/workspace\/billing/);
  });
});

// ux-ia-startup-flow-v1 §P7 — a11y contract for the workspace + marketing
// nav landmarks and disclosure buttons.
test.describe("Menu structure — a11y landmarks", () => {
  test.setTimeout(30_000);

  test("NavV2 dropdown triggers announce as menus (aria-haspopup=menu)", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const primary = page.locator('nav[aria-label="Primary"]').first();
    await expect(primary).toBeVisible({ timeout: 15_000 });
    // Every dropdown trigger (Get funding / Free tools / Demo) must have
    // aria-haspopup="menu" — the WAI-ARIA APG value for menu disclosures.
    const triggers = primary.locator('button[aria-haspopup]');
    const n = await triggers.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const v = await triggers.nth(i).getAttribute("aria-haspopup");
      expect(v).toBe("menu");
    }
  });

  test("workspace nav is a labelled landmark + later-phases collapse is a disclosure", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      /* fixture missing on this box */
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    await page.goto("/dashboard");
    const nav = page.locator('nav[aria-label="Workspace navigation"]');
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // The "Later phases" button renders only when the founder has groups
    // beyond currentPhase + 3. Tolerate absence; assert shape when present.
    const laterBtn = nav.getByRole("button", { name: /later phases/i });
    if ((await laterBtn.count()) > 0) {
      const expanded = await laterBtn.first().getAttribute("aria-expanded");
      expect(expanded === "true" || expanded === "false").toBe(true);
    }
  });
});
