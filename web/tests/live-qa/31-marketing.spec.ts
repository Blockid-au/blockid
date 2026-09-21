/**
 * 31 — Marketing surface lane (G17-P2B, 2026-09-19):
 *
 *   • ANONYMOUS `/`, `/product`, `/samples`, `/solutions/investor`, `/pricing`,
 *     `/vi/pilot`, `/docs/api/institutional` (G22-C)
 *     answer 200 with exactly one <h1> each (the template contract, D5);
 *   • `/showcase/blockid/report` body carries no raw `[ev:` / `[unevidenced]`
 *     citation marker (G24-A; footnote presence asserted fail-soft);
 *   • `/sitemap.xml` parses and a random 10-URL sample answers 200 on the
 *     first hop (the sitemap must never list a redirect or a 404);
 *   • the link-check core (scripts/lib/link-check-core.mjs) run over the
 *     fetched home HTML: the first 50 internal links resolve to 200 (or, for
 *     the gated prefixes, anything but a 5xx) — the same rules the nightly
 *     `scripts/link-check.mjs` cron applies to the whole site.
 *
 * Read-only: every request is a GET/HEAD from an empty cookie jar. Nothing
 * here touches the QA account.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence } from "./lib/api";
import {
  NO_CRAWL_PREFIXES,
  classify,
  extractLinks,
  isAssetPath,
  isEdgeInjectedPath,
  isNoCrawlPath,
  makeSite,
  normalizeUrl,
  parseSitemap,
  toSiteUrl,
} from "../../scripts/lib/link-check-core.mjs";

// G22-C: the VI pilot mirror + the in-app Institutional API contract join the sweep.
const PAGES = ["/", "/product", "/samples", "/solutions/investor", "/pricing", "/vi/pilot", "/docs/api/institutional"] as const;
const SAMPLE = 10;
const FIRST_N_LINKS = 50;

/** Deterministic-enough shuffle seeded from the run's minute so re-runs vary. */
function sample<T>(arr: readonly T[], n: number): T[] {
  const out = [...arr];
  let seed = Math.floor(Date.now() / 60_000) % 2_147_483_647;
  const rnd = () => (seed = (seed * 48_271) % 2_147_483_647) / 2_147_483_647;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

test.describe("Marketing lane — template pages", () => {
  for (const path of PAGES) {
    test(`anonymous ${path} → 200 with exactly one h1`, async ({ browser, qa }, testInfo) => {
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await ctx.newPage();
        const res = await page.goto(`${qa.baseURL}${path}`, { waitUntil: "domcontentloaded" });
        const status = res?.status();
        const h1s = await page.locator("h1").count();
        const h1 = (await page.locator("h1").first().textContent())?.trim() ?? "";
        await evidence(testInfo, path, { status, h1s, h1, title: await page.title() });
        expect(status).toBe(200);
        expect(h1s, `${path} must render exactly one h1`).toBe(1);
        expect(h1.length).toBeGreaterThan(0);
        // The one header + the four-column footer on every marketing page (D4/D5).
        await expect(page.locator("header[data-nav-variant]")).toHaveCount(1);
        await expect(page.locator("footer[aria-labelledby='marketing-footer-heading']")).toHaveCount(1);
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe("Marketing lane — sitemap", () => {
  test("/sitemap.xml parses; a 10-URL random sample answers 200 on the first hop", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.get("/sitemap.xml");
      expect(res.status()).toBe(200);
      const { urls, isIndex } = parseSitemap(await res.text());
      expect(isIndex).toBe(false);
      expect(urls.length).toBeGreaterThan(50);
      const site = makeSite(qa.baseURL);
      const bad = urls.filter((u) => classify(u, site) !== "internal");
      expect(bad, "every sitemap <loc> is same-origin").toEqual([]);

      const picked = sample(urls, SAMPLE);
      const results: Array<{ url: string; status: number }> = [];
      for (const u of picked) {
        const path = new URL(u).pathname;
        const r = await anon.get(path, { maxRedirects: 0 });
        results.push({ url: u, status: r.status() });
      }
      await evidence(testInfo, "sitemap sample", { total: urls.length, sample: results });
      expect(results.filter((r) => r.status !== 200), "sitemap URLs must answer 200 without a redirect").toEqual([]);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Marketing lane — link-check core on the home HTML", () => {
  test(`first ${FIRST_N_LINKS} internal links on / resolve (0 broken)`, async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const home = await anon.get("/");
      expect(home.status()).toBe(200);
      const html = await home.text();
      const site = makeSite(qa.baseURL);
      const pageUrl = `${site.site}/`;
      const seen = new Set<string>();
      const targets: Array<{ url: string; kind: string; gated: boolean }> = [];
      for (const { raw, kind } of extractLinks(html)) {
        const n = normalizeUrl(raw, pageUrl);
        if (!n) continue;
        const target = toSiteUrl(n.href, site);
        if (classify(target, site) !== "internal") continue;
        const pathname = new URL(target).pathname;
        if (isEdgeInjectedPath(pathname) || isAssetPath(pathname) || target === pageUrl) continue;
        if (seen.has(target)) continue;
        seen.add(target);
        targets.push({ url: target, kind, gated: isNoCrawlPath(pathname, NO_CRAWL_PREFIXES) });
        if (targets.length >= FIRST_N_LINKS) break;
      }
      expect(targets.length, "the home links at least a dozen internal pages").toBeGreaterThanOrEqual(12);

      const broken: Array<{ url: string; kind: string; status: number }> = [];
      const checked: Array<{ url: string; status: number; gated: boolean }> = [];
      for (const t of targets) {
        const path = new URL(t.url).pathname + new URL(t.url).search;
        const r = t.gated ? await anon.head(path, { maxRedirects: 5 }) : await anon.get(path, { maxRedirects: 5 });
        const status = r.status();
        checked.push({ url: t.url, status, gated: t.gated });
        const ok = t.gated ? status < 500 && status !== 404 : status === 200;
        if (!ok) broken.push({ url: t.url, kind: t.kind, status });
      }
      await evidence(testInfo, "home internal links", { checked: checked.length, broken, sample: checked.slice(0, 15) });
      expect(broken, "broken internal links on /").toEqual([]);
    } finally {
      await anon.dispose();
    }
  });
});

// G24-A: the public showcase report renders evidence citations as footnotes.
// The raw markers must never reach the page body; the footnote links and the
// "Evidence cited" section are asserted fail-soft (the persisted showcase
// report may predate the citation pipeline and carry no marker at all).
test.describe("Marketing lane — showcase report citations (G24-A)", () => {
  test("/showcase/blockid/report body carries no raw [ev:] / [unevidenced] marker", async ({ browser, qa }, testInfo) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await ctx.newPage();
      const res = await page.goto(`${qa.baseURL}/showcase/blockid/report`, { waitUntil: "domcontentloaded" });
      const status = res?.status();
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const footnoteLinks = await page.locator('sup a[href^="#ev-"]').count();
      const evidenceCited = await page.locator("#tbr-evidence-cited").count();
      const published = await page.locator("[data-tbr-version]").count();
      await evidence(testInfo, "/showcase/blockid/report citations", { status, published, footnoteLinks, evidenceCited, rawEv: (body.match(/\[ev:/g) ?? []).length, rawUnevidenced: (body.match(/\[unevidenced\]/gi) ?? []).length });
      expect(status).toBe(200);
      expect(body, "no raw [ev:<id>] marker in the showcase body").not.toContain("[ev:");
      expect(body, "no raw [unevidenced] marker in the showcase body").not.toMatch(/\[unevidenced\]/i);
      // Fail-soft: footnotes only exist when the stored report cites something.
      if (published > 0 && footnoteLinks > 0) {
        expect(evidenceCited, "footnote links imply the Evidence cited section").toBe(1);
        expect(await page.locator("#ev-1").count()).toBe(1);
      }
    } finally {
      await ctx.close();
    }
  });
});
