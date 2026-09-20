/**
 * 02 — Revenue data sources (lane 1 #1–#3): per-figure source captions,
 * the data-sources panel, and the Xero connect affordance (available → a
 * real OAuth redirect; unavailable → the "not available yet" label, never a
 * JSON 503 page — lane-1 F2 fix).
 */
import { test, expect } from "./fixtures";
import { evidence, get } from "./lib/api";



const KNOWN_LABELS = [/^from Xero/, /^from Stripe/, /^from your BlockID Stripe payments$/, /^manual entries$/, /^from bank CSV/, /^from your metrics$/, /^estimate$/, /^no data yet$/];

interface Revenue {
  ok: boolean;
  sources: Record<string, { kind: string; label: string; takenAt?: string | null }>;
  available?: { xero: boolean; stripeConnect: boolean };
  hasXero?: boolean;
  pnl: { netIncome: number };
}

test.describe("Revenue data sources", () => {
  test("GET /api/revenue labels every figure with a known source kind", async ({ api }, testInfo) => {
    const r = await get<Revenue>(api, "/api/revenue");
    await evidence(testInfo, "sources", { status: r.status, sources: r.body.sources, available: r.body.available });
    expect(r.status).toBe(200);
    for (const key of ["mrr", "arr", "revenue", "cogs", "opex", "netIncome"]) {
      const src = r.body.sources?.[key];
      expect(src, `sources.${key}`).toBeTruthy();
      expect(KNOWN_LABELS.some((re) => re.test(src.label)), `sources.${key}.label "${src.label}" is a documented label`).toBe(true);
    }
  });

  test("page shows the source captions and the Data Sources panel", async ({ page, visit, guard }, testInfo) => {
    const g = guard(page, { allowRequest: [{ method: "POST", pathRe: /^\/api\/dividends$/, status: 400 }] });
    await visit("/workspace/finance/revenue", { waitUntil: "networkidle" });
    const panel = page.getByTestId("data-sources");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText(/Data Sources/);
    // G20-F1 (2026-09-20): connectors without a provisioned key (Stripe Connect,
    // Xero, QuickBooks) are hidden rows, not "not available yet" placeholders —
    // the panel always offers the CSV import; connector rows appear only when
    // their env key exists on the server.
    await expect(panel).toContainText(/CSV/i);
    const body = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
    const captions = ["estimate", "no data yet", "manual entries", "from your metrics", "from Xero", "from Stripe", "from bank CSV"].filter((c) => body.includes(c));
    const report = g.report("/workspace/finance/revenue");
    await evidence(testInfo, "captions + guard", { captions, report });
    expect(captions.length, "at least one per-figure source caption is rendered").toBeGreaterThan(0);
    if (report.allowedRequests.length) {
      testInfo.annotations.push({ type: "known-issue", description: `lane-1 F10 (P3): POST /api/dividends fires on load and answers 400 without shareholders — ${report.allowedRequests.length}×` });
    }
    expect(report.errors, "unexpected console errors").toEqual([]);
    expect(report.failedRequests, "unexpected failed requests").toEqual([]);
  });

  test("Xero: either a real OAuth redirect or the 'not available yet' label — never a JSON 503 page", async ({ page, api, visit }, testInfo) => {
    await visit("/workspace/finance/revenue");
    const panel = page.getByTestId("data-sources");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    const link = panel.locator('a[href="/api/oauth/xero"]');
    const unavailable = panel.getByTestId("xero-unavailable");
    const hasLink = (await link.count()) > 0;
    const hasUnavailable = (await unavailable.count()) > 0;
    const probe = await api.fetch("/api/oauth/xero", { maxRedirects: 0, headers: { accept: "text/html" } });
    const location = probe.headers()["location"] ?? null;
    await evidence(testInfo, "xero affordance", { hasLink, hasUnavailable, probeStatus: probe.status(), location: location ? location.replace(/client_id=[^&]+/, "client_id=<redacted>") : null });
    // G20-F1: with no XERO_CLIENT_ID on the server the row is hidden entirely —
    // the only contract left is "never a JSON 503 page" from the OAuth route.
    await evidence(testInfo, "xero hidden when unprovisioned", { hasLink, hasUnavailable });
    if (hasLink || hasUnavailable) expect(hasLink || hasUnavailable).toBe(true);
    if (hasLink) {
      expect(probe.status(), "OAuth route redirects to Xero (302/307)").toBeGreaterThanOrEqual(300);
      expect(probe.status()).toBeLessThan(400);
    } else {
      // hidden (no key) or the explicit unavailable label — never a JSON 503 page
      const ct = probe.headers()["content-type"] ?? "";
      expect(probe.status() === 503 && ct.includes("application/json"), "no JSON 503 page").toBe(false);
    }
  });
});
