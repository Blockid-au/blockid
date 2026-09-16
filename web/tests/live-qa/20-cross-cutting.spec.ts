/**
 * 20 — Cross-cutting (lane 1 #48–#52): nav leaves per growth phase,
 * logged-out 307s, console errors / failed requests per page (only the
 * documented Cloudflare tag-gateway CSP error is tolerated, and only while
 * the served HTML still carries its signature), keyboard focus reaches the
 * primary buttons.
 */
import { request, type Locator, type Page } from "@playwright/test";
import { test, expect, WORKSPACE_PAGES, GROWTH_GATED_PAGES, SWEEP_PAGES } from "./fixtures";
import { evidence } from "./lib/api";
import { env } from "./lib/env";



// Nav v4 (G13-W1-IA1): phase-gated leaves live inside Money (band 2 / 4)
// and the Company group (band 2, folded under "Later phases" below it).
// Expenses / Listing readiness / Clean room became hub tabs (S-IA2) — the
// sidebar rows that gate on phase are now Valuation, Finance, Documents, Exit.
const NAV_LEAVES: Array<{ href: string; label: string; pillar: string; phase: number }> = [
  { href: "/workspace/valuation", label: "Valuation", pillar: "Money", phase: 2 },
  { href: "/workspace/finance", label: "Finance", pillar: "Money", phase: 4 },
  { href: "/workspace/documents", label: "Documents", pillar: "Company", phase: 3 },
  { href: "/workspace/exit", label: "Exit", pillar: "Company", phase: 5 },
];

async function navLink(page: Page, href: string, pillarLabel: string): Promise<Locator> {
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  const link = nav.locator(`a[href="${href}"]`);
  if ((await link.count()) === 0) {
    // A collapsed pillar renders no items — expand it once and look again.
    const toggle = nav.locator(`[data-group-label="${pillarLabel}"] button[aria-expanded="false"]`).first();
    if (await toggle.count()) {
      await toggle.click();
      await nav.locator(`[data-group-label="${pillarLabel}"] button[aria-expanded="true"]`).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    }
  }
  return link;
}

test.describe("Navigation by growth phase", () => {
  test("Valuation / Finance / Documents / Exit sit under Money / Company once the phase allows", async ({ page, visit, qa }, testInfo) => {
    await visit("/workspace/investors");
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible({ timeout: 30_000 });
    const seen: Record<string, { count: number; pillar: string | null }> = {};
    for (const leaf of NAV_LEAVES) {
      const link = await navLink(page, leaf.href, leaf.pillar);
      const count = await link.count();
      const pillar = count ? await link.first().locator("xpath=ancestor::*[@data-group-label][1]").getAttribute("data-group-label") : null;
      seen[leaf.href] = { count, pillar };
    }
    await evidence(testInfo, "nav leaves", { elevated: qa.elevated, seen });
    for (const leaf of NAV_LEAVES) {
      if (qa.elevated) {
        expect(seen[leaf.href].count, `${leaf.label} visible at phase 'funding'`).toBeGreaterThan(0);
        expect(seen[leaf.href].pillar ?? "", `${leaf.label} pillar`).toBe(leaf.pillar);
      } else {
        // Phase 0 founder: hidden by design (menu-by-growth-phase, lane-1 F14).
        expect(seen[leaf.href].count, `${leaf.label} hidden at phase 0`).toBe(0);
      }
    }
  });
});

test.describe("Logged-out redirects", () => {
  test("every workspace route and /workspace/valuation answers 307 → /auth/login?next=<route> without a session", async ({}, testInfo) => {
    // Inside a test, request.newContext() inherits the project's `use`
    // (including the founder storageState) — pass an empty jar explicitly.
    const anon = await request.newContext({ baseURL: env.baseURL, storageState: { cookies: [], origins: [] } });
    const rows: Array<{ path: string; status: number; location: string | null }> = [];
    try {
      for (const path of WORKSPACE_PAGES) {
        const res = await anon.get(path, { maxRedirects: 0, headers: { accept: "text/html" } });
        rows.push({ path, status: res.status(), location: res.headers()["location"] ?? null });
      }
    } finally {
      await anon.dispose();
    }
    await evidence(testInfo, "redirects", rows);
    for (const r of rows) {
      expect(r.status, `${r.path} status`).toBe(307);
      expect(r.location ?? "", `${r.path} location`).toMatch(new RegExp(`^(https?://[^/]+)?/auth/login\\?next=${encodeURIComponent(r.path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });
});

test.describe("Console + network hygiene per page", () => {
  // S30-B widened the sweep to the money / third-party-data surfaces
  // (SWEEP_EXTRA_PAGES in fixtures.ts): /funding, /funding/grants, /pricing,
  // /compare, /solutions/advisor, /workspace/{integrations,data-room,audit-log,settings}.
  for (const path of SWEEP_PAGES) {
    test(`${path} — no console errors / failed requests (Cloudflare tag-gateway CSP error allow-listed by signature)`, async ({ page, visit, guard, qa }, testInfo) => {
      test.skip(!qa.elevated && GROWTH_GATED_PAGES.has(path), "Growth-gated page redirects to /pricing on Free — not swept");
      const allowRequest = [
        // Every workspace page GETs /api/svi/phase-progress (product tour); a
        // full run loads ~100 pages in a few minutes and trips its per-user
        // limiter (429) — suite-induced, so tolerated and annotated. Any
        // other status on that route still fails the page.
        { method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 },
        ...(path === "/workspace/finance/revenue" && !qa.elevated ? [{ method: "POST", pathRe: /^\/api\/dividends$/, status: 400 }] : []),
      ];
      const g = guard(page, { allowRequest });
      const started = Date.now();
      // `load` not `networkidle`: a duplicated footer prefetch of /legal/privacy
      // can hold one connection open ~30 s (P3, 2026-09-15) while the page is
      // interactive at 0.5 s.
      await visit(path, { waitUntil: "load" });
      const loadMs = Date.now() - started;
      const report = g.report(path);
      await evidence(testInfo, "guard report", { ...report, loadMs });
      const gtm = report.allowed.filter((e) => /inline script/.test(e.text)).length;
      const cfEmail = report.allowed.length - gtm;
      if (gtm) {
        testInfo.annotations.push({ type: "allow-listed", description: `${gtm}× Cloudflare-injected GTM bootstrap refused by CSP (docs/ops/analytics.md §4) — served HTML still carries the signature` });
      }
      if (cfEmail) {
        testInfo.annotations.push({ type: "known-issue", description: `${cfEmail}× Cloudflare Email Obfuscation on this page: email-decode.min.js refused by CSP + React #418 hydration mismatch (S24 founder follow-up: Scrape Shield → Email Obfuscation OFF) — tolerated only while the HTML carries __cf_email__` });
      }
      const f10 = report.allowedRequests.filter((r) => /\/api\/dividends$/.test(r.url));
      const limited = report.allowedRequests.filter((r) => /phase-progress/.test(r.url));
      if (f10.length) testInfo.annotations.push({ type: "known-issue", description: `lane-1 F10 (P3): POST /api/dividends 400 on load without shareholders ×${f10.length}` });
      if (limited.length) testInfo.annotations.push({ type: "suite-induced", description: `GET /api/svi/phase-progress 429 ×${limited.length} — the run's page volume tripped the per-user limiter` });
      expect(report.errors, "unexpected console errors").toEqual([]);
      expect(report.failedRequests, "unexpected failed requests (≥400)").toEqual([]);
      expect(loadMs, "page load under 15 s").toBeLessThan(15_000);
    });
  }
});

test.describe("Keyboard reachability", () => {
  const TARGETS: Array<{ path: string; growth: boolean; name: string; find: (page: Page) => Locator }> = [
    { path: "/workspace/raise/round", growth: false, name: "Calculate Share Price", find: (p) => p.getByRole("button", { name: /Calculate Share Price/ }) },
    { path: "/workspace/investors/pipeline", growth: false, name: "Add contact", find: (p) => p.getByTestId("crm-add") },
    { path: "/workspace/finance/dividends", growth: true, name: "DRIP add election", find: (p) => p.getByTestId("drip-add") },
    { path: "/workspace/exit", growth: true, name: "Calculate Exit", find: (p) => p.getByRole("button", { name: /Calculate Exit/ }) },
    { path: "/workspace/equity/cap-table", growth: true, name: "Add Shareholder", find: (p) => p.getByRole("button", { name: /Add Shareholder/ }).first() },
    { path: "/workspace/exit/listing", growth: true, name: "Export PDF", find: (p) => p.getByTestId("listing-export") },
    { path: "/workspace/exit/clean-room", growth: true, name: "clean-room tick", find: (p) => p.getByTestId("clean-room-tick").first() },
  ];
  for (const t of TARGETS) {
    test(`${t.path} — Tab reaches "${t.name}"`, async ({ page, visit, qa }, testInfo) => {
      test.skip(t.growth && !qa.elevated, "Growth-gated page");
      await visit(t.path);
      const target = t.find(page);
      await expect(target).toBeVisible({ timeout: 30_000 });
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      let reached = false;
      let stops = 0;
      for (; stops < 150; stops++) {
        await page.keyboard.press("Tab");
        const same = await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
        if (same) {
          reached = true;
          break;
        }
      }
      await evidence(testInfo, "tab stops", { path: t.path, target: t.name, reached, stops: stops + 1 });
      expect(reached, `"${t.name}" reachable within 150 tab stops`).toBe(true);
    });
  }
});

// G13-W3-IA3 — the founder landing is five fixed blocks in benefit order
// (spec §B.1), each rendering either data or its §B.4 empty state, never a
// blank card. Block 2's CTA is the time-to-first-action marker.
test.describe("Founder landing — five blocks (G13-W3-IA3)", () => {
  const BLOCKS = ["where-you-stand", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"] as const;

  test("/dashboard renders the five blocks in order, each with a CTA; block 2's CTA navigates", async ({ page, visit }, testInfo) => {
    await visit("/dashboard");
    // A fresh owner with nothing scored is sent to the wizard — not a landing bug.
    test.skip(/\/onboarding/.test(page.url()), "fresh account bounced to /onboarding (no analysis yet)");
    const grid = page.locator("[data-landing-grid]");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    const names = await grid.locator("[data-landing-block]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
    const empty = await grid.locator("[data-landing-block][data-landing-empty]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
    const ctas: Record<string, string | null> = {};
    for (const b of BLOCKS) {
      const cta = grid.locator(`[data-landing-cta="${b}"]`).first();
      await expect(cta, `${b} CTA`).toBeVisible();
      ctas[b] = await cta.getAttribute("href");
    }
    await evidence(testInfo, "landing blocks", { names, empty, ctas, phase: await page.locator("[data-founder-landing]").getAttribute("data-landing-phase") });
    expect(names).toEqual([...BLOCKS]);
    // Block 2 — one recommendation, clickable, lands on a real page.
    const next = page.getByTestId("landing-next-best-action-cta");
    const href = (await next.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/(workspace|analyze)/);
    await next.click();
    const target = href.split("?")[0];
    await page.waitForURL((u) => u.pathname.startsWith(target), { timeout: 30_000 });
    expect(new URL(page.url()).pathname.startsWith(target)).toBe(true);
  });

  test("/workspace/plan carries the 12-phase ladder moved off the landing", async ({ page, visit }, testInfo) => {
    await visit("/workspace/plan");
    const ladder = page.locator('[data-testid="journey-step-ladder"]');
    await expect(ladder).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="journey-step-node-1"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="journey-step-node-12"]').first()).toBeVisible();
    await evidence(testInfo, "plan ladder", { url: page.url() });
  });
});
