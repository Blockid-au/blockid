/**
 * S31-D — public pages under the hash-mode CSP, hydrated (Playwright).
 *
 * Run against a server built AND started with `CSP_PUBLIC_HASH_MODE=1`
 * (locally: `CSP_PUBLIC_HASH_MODE=1 npm run build && CSP_PUBLIC_HASH_MODE=1
 * PORT=4120 node .next/standalone/server.js`, then
 * `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4120 npx playwright test
 * tests/e2e/smoke/public-hash-csp.spec.ts`). Against a server without the
 * flag every test is skipped (the first response says `x-blockid-csp:
 * nonce`), so this spec is safe in the post-deploy suite before the flag
 * is turned on.
 *
 * What a hash-mode page must prove, per route:
 *   • the response carries `x-blockid-csp: hash`, a `Content-Security-Policy`
 *     with `'sha256-…'` sources and no `'nonce-…'`, no `'unsafe-inline'`
 *     in script-src, and a `public, s-maxage=…` cache-control;
 *   • the browser reports ZERO CSP violations (`securitypolicyviolation`
 *     events + console) — every inline script (Next flight data, theme,
 *     consent, GA bootstraps) was allowed by hash;
 *   • React actually hydrated: a client-only interaction works.
 *
 * Analytics: with GA / GTM configured, the gtag.js request is observed
 * (allowed by host) — the consent-default snippet must have run first so
 * `window.dataLayer` already holds a `consent` entry.
 */

import { test, expect, type Page, type Response } from "@playwright/test";

const PAGE_TIMEOUT = 15_000;

interface CspProbe {
  violations: string[];
  consoleCsp: string[];
}

async function armCspProbe(page: Page): Promise<CspProbe> {
  const probe: CspProbe = { violations: [], consoleCsp: [] };
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${e.violatedDirective} blocked ${e.blockedURI || "inline"} @ ${e.sourceFile || "document"}:${e.lineNumber}`,
      );
    });
  });
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(msg.text())) probe.consoleCsp.push(msg.text());
  });
  return probe;
}

async function collectViolations(page: Page, probe: CspProbe): Promise<string[]> {
  const fromDom = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
  return [...fromDom, ...probe.violations, ...probe.consoleCsp];
}

function expectHashModeHeaders(res: Response, path: string): void {
  const csp = res.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
  expect(res.headers()["x-blockid-csp"], `${path} served in hash mode`).toBe("hash");
  expect(scriptSrc, `${path} script-src has hashes`).toMatch(/'sha256-[A-Za-z0-9+/]+=*'/);
  expect(scriptSrc, `${path} script-src has no nonce`).not.toMatch(/'nonce-/);
  expect(scriptSrc, `${path} script-src has no unsafe-inline`).not.toContain("'unsafe-inline'");
  expect(scriptSrc, `${path} script-src has no unsafe-eval`).not.toContain("'unsafe-eval'");
  expect(res.headers()["cache-control"], `${path} is shared-cacheable`).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
}

test.describe("S31-D public pages — hash CSP, hydrated, zero violations", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ request, baseURL }) => {
    const probe = await request.get(`${baseURL}/pricing`, { maxRedirects: 0 });
    test.skip(probe.headers()["x-blockid-csp"] !== "hash", "server is not running with CSP_PUBLIC_HASH_MODE=1");
  });

  test("/ — hash headers, no CSP violations, hydrated (router live, consent banner responds)", async ({ page }) => {
    const probe = await armCspProbe(page);
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expectHashModeHeaders(res!, "/");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: PAGE_TIMEOUT });
    // Hydration proof: the Next app router is live (`window.next.router`
    // is only set by the client runtime after the hashed inline flight
    // scripts ran) and a client component responded to a click.
    await page.waitForFunction(() => typeof (window as unknown as { next?: { router?: unknown } }).next?.router !== "undefined", null, { timeout: PAGE_TIMEOUT });
    // Consent banner is a client component mounted by the root layout.
    const consentButton = page.getByRole("button", { name: /accept|allow|agree|got it|decline|reject/i }).first();
    if (await consentButton.isVisible().catch(() => false)) {
      await consentButton.click();
      await expect(consentButton).toBeHidden({ timeout: PAGE_TIMEOUT });
    }
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("/pricing — hash headers, hydrated: the Founder | Evaluator switch swaps ladders client-side", async ({ page }) => {
    const probe = await armCspProbe(page);
    const res = await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    expectHashModeHeaders(res!, "/pricing");
    for (const id of ["tier-free", "tier-growth", "tier-pro"]) {
      await expect(page.locator(`#${id}`)).toBeVisible({ timeout: PAGE_TIMEOUT });
    }
    // Client interaction = hydration proof.
    await page.getByRole("tab", { name: /evaluator/i }).click();
    await expect(page.locator("#tier-scout")).toBeVisible({ timeout: PAGE_TIMEOUT });
    await expect(page.locator('[data-testid="pricing-segment-switch"]')).toHaveAttribute("data-active-tab", "evaluator");
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("/pricing?segment=evaluator — the deep link resolves client-side on the cached document", async ({ page }) => {
    const probe = await armCspProbe(page);
    const res = await page.goto("/pricing?segment=evaluator", { waitUntil: "domcontentloaded" });
    expectHashModeHeaders(res!, "/pricing?segment=evaluator");
    for (const id of ["tier-scout", "tier-firm", "tier-program"]) {
      await expect(page.locator(`#${id}`)).toBeVisible({ timeout: PAGE_TIMEOUT });
    }
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("/funding/grants — hash headers, no violations, hydrated; ?state=NSW rewrite serves the static state page", async ({ page }) => {
    const probe = await armCspProbe(page);
    const res = await page.goto("/funding/grants", { waitUntil: "domcontentloaded" });
    expectHashModeHeaders(res!, "/funding/grants");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Australian startup grants/i, { timeout: PAGE_TIMEOUT });
    await page.waitForFunction(() => typeof (window as unknown as { next?: { router?: unknown } }).next?.router !== "undefined", null, { timeout: PAGE_TIMEOUT });
    expect(await collectViolations(page, probe)).toEqual([]);

    const state = await page.goto("/funding/grants?state=NSW", { waitUntil: "domcontentloaded" });
    expectHashModeHeaders(state!, "/funding/grants?state=NSW");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/NSW startup grants/i, { timeout: PAGE_TIMEOUT });
    expect(page.url()).toContain("/funding/grants?state=NSW"); // URL contract unchanged
    // Canonical still points at the query URL.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://blockid.au/funding/grants?state=NSW");
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("G36 internal routes: the dynamic grants view (nonce) and a demo band (hash) render under the public URL, hydrated, zero violations", async ({ page }) => {
    const probe = await armCspProbe(page);
    // Served in-process by the next.config beforeFiles rewrite (no HTTP
    // self-proxy): no internal path may leak into headers or the URL.
    const view = await page.goto("/funding/grants?type=tax_deduction&stage=idea", { waitUntil: "domcontentloaded" });
    expect(view!.status()).toBe(200);
    expect(view!.headers()["x-blockid-csp"]).toBe("nonce");
    expect(view!.headers()["x-middleware-rewrite"]).toBeUndefined();
    expect(view!.headers()["cache-control"]).toMatch(/^private/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://blockid.au/funding/grants");
    await page.waitForFunction(() => typeof (window as unknown as { next?: { router?: unknown } }).next?.router !== "undefined", null, { timeout: PAGE_TIMEOUT });
    expect(page.url()).toContain("/funding/grants?type=tax_deduction&stage=idea");
    expect(page.url()).not.toContain("/view");

    const band = await page.goto("/tbr/demo?band=A", { waitUntil: "domcontentloaded" });
    expect(band!.status()).toBe(200);
    expect(band!.headers()["x-blockid-csp"]).toBe("hash");
    expect(band!.headers()["x-middleware-rewrite"]).toBeUndefined();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://blockid.au/tbr/demo?band=A");
    await page.waitForFunction(() => typeof (window as unknown as { next?: { router?: unknown } }).next?.router !== "undefined", null, { timeout: PAGE_TIMEOUT });
    expect(page.url()).toContain("/tbr/demo?band=A");
    expect(page.url()).not.toContain("/band/");
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("G36 tick 3 clicks: filter chip, state link and band link show the filtered content (full page load), zero violations", async ({ page }) => {
    const probe = await armCspProbe(page);
    // The in-page probe resets on every document load; keep what each page saw.
    const seen: string[] = [];
    // A full page load drops this window property; a client-side navigation keeps it.
    const markDocument = () => page.evaluate(() => ((window as unknown as { __g36Doc?: number }).__g36Doc = 1));
    const wasDocumentLoad = () => page.evaluate(() => (window as unknown as { __g36Doc?: number }).__g36Doc === undefined);
    const routerLive = () =>
      page.waitForFunction(() => typeof (window as unknown as { next?: { router?: unknown } }).next?.router !== "undefined", null, { timeout: PAGE_TIMEOUT });
    const keepViolations = async () => {
      seen.push(...(await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])));
    };
    const listHeading = page.locator("#grants-list-heading");

    await page.goto("/funding/grants", { waitUntil: "domcontentloaded" });
    await routerLive();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Australian startup grants/i, { timeout: PAGE_TIMEOUT });
    const baseCount = (await listHeading.innerText()).trim();

    // 1. State chip → the static NSW landing page (own H1, NSW scope line).
    await keepViolations();
    await markDocument();
    await page.locator("[data-filter-chips] a", { hasText: /^NSW\d/ }).first().click();
    await page.waitForURL(/\/funding\/grants\?state=NSW$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/NSW startup grants/i, { timeout: PAGE_TIMEOUT });
    await expect(listHeading).toContainText(/New South Wales/, { timeout: PAGE_TIMEOUT });
    expect(await wasDocumentLoad(), "state chip = document load").toBe(true);
    await routerLive();

    // 2. "Also see" state link → another state's page.
    const other = page.locator('nav[aria-label="Other states"] a').filter({ hasNotText: /Federal/ }).first();
    const otherHref = (await other.getAttribute("href")) ?? "";
    const otherState = new URL(otherHref, "http://x").searchParams.get("state") ?? "";
    const otherName = (await other.innerText()).replace(/ grants$/, "");
    expect(otherState).toMatch(/^[A-Z]{2,3}$/);
    await keepViolations();
    await markDocument();
    await other.click();
    await page.waitForURL(new RegExp(`/funding/grants\\?state=${otherState}$`));
    await expect(listHeading).toContainText(otherName, { timeout: PAGE_TIMEOUT });
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(/NSW/);
    expect(await wasDocumentLoad(), "state link = document load").toBe(true);
    await routerLive();

    // 3. Type chip (state + type) → the dynamic view, filtered rows.
    await keepViolations();
    await markDocument();
    await page.locator("[data-filter-chips] a", { hasText: /^Grant\d/ }).first().click();
    await page.waitForURL(new RegExp(`/funding/grants\\?state=${otherState}&type=grant$`));
    await expect(listHeading).toContainText(`${otherName} · Grant`, { timeout: PAGE_TIMEOUT });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(await wasDocumentLoad(), "type chip = document load").toBe(true);
    await routerLive();

    // 4. "Clear all filters" (a next/link to the base URL) → base content again.
    await keepViolations();
    await page.getByRole("link", { name: "Clear all filters" }).click();
    await page.waitForURL(/\/funding\/grants$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Australian startup grants, open right now/i, { timeout: PAGE_TIMEOUT });
    await expect(listHeading).toHaveText(baseCount, { timeout: PAGE_TIMEOUT });

    // 5. Band switcher on the demo → band C, then back to band A.
    await keepViolations();
    await page.goto("/tbr/demo", { waitUntil: "domcontentloaded" });
    await routerLive();
    const bands = page.locator('[data-testid="tbr-demo-bands"]');
    await expect(bands).toContainText("This page shows band B", { timeout: PAGE_TIMEOUT });
    await keepViolations();
    await markDocument();
    await page.locator('[data-tbr-demo-band="C"]').click();
    await page.waitForURL(/\/tbr\/demo\?band=C$/);
    await expect(bands).toContainText("This page shows band C", { timeout: PAGE_TIMEOUT });
    await expect(page.locator('[data-tbr-demo-band="C"]')).toHaveAttribute("aria-current", "page");
    expect(await wasDocumentLoad(), "band link = document load").toBe(true);
    await routerLive();
    await keepViolations();
    await markDocument();
    await page.locator('[data-tbr-demo-band="A"]').click();
    await page.waitForURL(/\/tbr\/demo\?band=A$/);
    await expect(bands).toContainText("This page shows band A", { timeout: PAGE_TIMEOUT });
    expect(await wasDocumentLoad(), "band link = document load").toBe(true);
    await routerLive();

    await keepViolations();
    expect([...seen, ...probe.violations, ...probe.consoleCsp]).toEqual([]);
  });

  test("analytics keeps working on a hashed page: consent default ran before gtag.js loaded", async ({ page }) => {
    const gaConfigured = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GTM_ID);
    const probe = await armCspProbe(page);
    const tagRequests: string[] = [];
    page.on("request", (r) => {
      if (/googletagmanager\.com\/(gtag\/js|gtm\.js)/.test(r.url())) tagRequests.push(r.url());
    });
    await page.goto("/pricing", { waitUntil: "load" });
    const consent = await page.evaluate(() => {
      const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
      return dl.some((entry) => {
        const args = Array.from(entry as ArrayLike<unknown>);
        return args[0] === "consent" && args[1] === "default";
      });
    });
    // The consent snippet is an inline <head> script allowed by hash — if
    // it were blocked, dataLayer would have no consent entry.
    expect(consent, "consent default pushed to dataLayer").toBe(true);
    if (gaConfigured) {
      await expect.poll(() => tagRequests.length, { timeout: PAGE_TIMEOUT }).toBeGreaterThan(0);
    }
    expect(await collectViolations(page, probe)).toEqual([]);
  });

  test("a signed-in-looking visitor never gets a shared-cacheable response", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/pricing`, {
      headers: { cookie: "blockid_session=not-a-real-session" },
      maxRedirects: 0,
    });
    expect(res.headers()["cache-control"]).toMatch(/^private/);
  });
});
