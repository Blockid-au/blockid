/**
 * 20 — Cross-cutting (lane 1 #48–#52): nav leaves per growth phase,
 * logged-out 307s, console errors / failed requests per page (only the
 * documented Cloudflare tag-gateway CSP error is tolerated, and only while
 * the served HTML still carries its signature), keyboard focus reaches the
 * primary buttons.
 */
import { request, type Locator, type Page } from "@playwright/test";
import { test, expect, WORKSPACE_PAGES, GROWTH_GATED_PAGES } from "./fixtures";
import { evidence } from "./lib/api";
import { env } from "./lib/env";

test.describe.configure({ mode: "serial" });

const NAV_LEAVES: Array<{ href: string; label: string; pillar: RegExp; phase: number }> = [
  { href: "/workspace/investors", label: "Investor CRM", pillar: /^Fundraise$/i, phase: 3 },
  { href: "/workspace/expenses", label: "Expenses", pillar: /^Scale & Exit$/i, phase: 4 },
  { href: "/workspace/listing-readiness", label: "Listing Readiness", pillar: /^Scale & Exit$/i, phase: 5 },
  { href: "/workspace/clean-room", label: "Clean-Room Prep", pillar: /^Scale & Exit$/i, phase: 5 },
];

async function navLink(page: Page, href: string, pillar: RegExp): Promise<Locator> {
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  const link = nav.locator(`a[href="${href}"]`);
  if ((await link.count()) === 0) {
    // Pillar may be collapsed — expand it once and look again.
    const toggle = nav.getByRole("button", { name: pillar }).first();
    if ((await toggle.count()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  }
  return link;
}

test.describe("Navigation by growth phase", () => {
  test("Investor CRM / Expenses / Listing Readiness / Clean-Room Prep sit under their pillars once the phase allows", async ({ page, visit, qa }, testInfo) => {
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
        expect(seen[leaf.href].pillar ?? "", `${leaf.label} pillar`).toMatch(leaf.pillar);
      } else {
        // Phase 0 founder: hidden by design (menu-by-growth-phase, lane-1 F14).
        expect(seen[leaf.href].count, `${leaf.label} hidden at phase 0`).toBe(0);
      }
    }
  });
});

test.describe("Logged-out redirects", () => {
  test("every workspace route and /dashboard/valuation answers 307 → /auth/login?next=<route> without a session", async ({}, testInfo) => {
    const anon = await request.newContext({ baseURL: env.baseURL });
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
  for (const path of WORKSPACE_PAGES) {
    test(`${path} — no console errors / failed requests (Cloudflare tag-gateway CSP error allow-listed by signature)`, async ({ page, visit, guard, qa }, testInfo) => {
      test.skip(!qa.elevated && GROWTH_GATED_PAGES.has(path), "Growth-gated page redirects to /pricing on Free — not swept");
      const allowRequest = path === "/workspace/revenue" && !qa.elevated ? [{ method: "POST", pathRe: /^\/api\/dividends$/, status: 400 }] : [];
      const g = guard(page, { allowRequest });
      const started = Date.now();
      await visit(path, { waitUntil: "networkidle" });
      const loadMs = Date.now() - started;
      const report = g.report(path);
      await evidence(testInfo, "guard report", { ...report, loadMs });
      if (report.allowed.length) {
        testInfo.annotations.push({ type: "allow-listed", description: `${report.allowed.length}× Cloudflare-injected GTM bootstrap refused by CSP (docs/ops/analytics.md §4) — served HTML still carries the signature` });
      }
      if (report.allowedRequests.length) {
        testInfo.annotations.push({ type: "known-issue", description: `lane-1 F10 (P3): POST /api/dividends 400 on load without shareholders ×${report.allowedRequests.length}` });
      }
      expect(report.errors, "unexpected console errors").toEqual([]);
      expect(report.failedRequests, "unexpected failed requests (≥400)").toEqual([]);
      expect(loadMs, "page load under 15 s").toBeLessThan(15_000);
    });
  }
});

test.describe("Keyboard reachability", () => {
  const TARGETS: Array<{ path: string; growth: boolean; name: string; find: (page: Page) => Locator }> = [
    { path: "/workspace/fundraise", growth: false, name: "Calculate Share Price", find: (p) => p.getByRole("button", { name: /Calculate Share Price/ }) },
    { path: "/workspace/investors", growth: false, name: "Add contact", find: (p) => p.getByTestId("crm-add") },
    { path: "/workspace/dividends", growth: false, name: "DRIP add election", find: (p) => p.getByTestId("drip-add") },
    { path: "/workspace/exit", growth: true, name: "Calculate Exit", find: (p) => p.getByRole("button", { name: /Calculate Exit/ }) },
    { path: "/workspace/cap-table", growth: true, name: "Add Shareholder", find: (p) => p.getByRole("button", { name: /Add Shareholder/ }).first() },
    { path: "/workspace/listing-readiness", growth: true, name: "Export PDF", find: (p) => p.getByTestId("listing-export") },
    { path: "/workspace/clean-room", growth: true, name: "clean-room tick", find: (p) => p.getByTestId("clean-room-tick").first() },
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
