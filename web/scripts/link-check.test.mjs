// G17-P2B — the link checker core (scripts/lib/link-check-core.mjs) and the
// crawler (scripts/link-check.mjs) pinned against an in-memory fake site.
// Silent regressions this guards against:
//   - a `<link rel=preload>` / mailto: / javascript: href counted as a link;
//   - a trailing-slash or www. variant of an internal page reported as a
//     redirect chain or an external;
//   - a canonical link inside a 127.0.0.1:4099 page fetched from production;
//   - a bot-blocking 403/405/999 on an external host reported as broken;
//   - a gated /workspace path judged by the 200-only rule (it 307s to login);
//   - a missing `#fragment` on a crawled page passing silently;
//   - the sitemap "ok" count including a URL that redirects;
//   - --dry-run writing a report or exiting non-zero.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_FOLLOW_HOPS,
  MAX_REDIRECT_HOPS,
  QUERY_VARIANT_CAP,
  classify,
  decodeEntities,
  externalIsBroken,
  externalVerdict,
  extractIds,
  extractJsonLdLinks,
  extractLinks,
  extractMetaLinks,
  formatChangeAlert,
  formatSummary,
  internalIsBroken,
  isAssetPath,
  isEdgeInjectedPath,
  isNoCrawlPath,
  isTrackingOnlyQuery,
  makeSite,
  normalizeUrl,
  oldestOpenSince,
  parseArgs,
  parseRobots,
  parseSitemap,
  reconcileOpen,
  reportNameFor,
  robotsAllows,
  seedOpenFromHistory,
  shouldParseQueryPage,
  summarize,
  toFetchUrl,
  toSiteUrl,
} from "./lib/link-check-core.mjs";
import { crawl, main } from "./link-check.mjs";

const HOME = `<!doctype html><html lang="en"><head>
<link rel="stylesheet" href="/_next/static/css/app.css">
<link rel="preload" href="/_next/static/media/font.woff2" as="font">
<link rel="canonical" href="https://blockid.au/">
<link rel="alternate" hreflang="vi" href="https://blockid.au/vi">
<script src="/_next/static/chunks/main.js"></script>
</head><body>
<!-- <a href="/commented-out">no</a> -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html"></iframe><a href="/noscript-only">x</a></noscript>
<main id="main">
<h1>Score any Australian startup in 60 seconds.</h1>
<a href="/product">Product</a>
<a href="/pricing/">Pricing (trailing slash)</a>
<a href="https://www.blockid.au/samples?utm_source=x">Samples (www)</a>
<a href="/product#dimensions">Dimensions</a>
<a href="/product#nope">Missing anchor</a>
<a href="#main">Skip</a>
<a href="/missing-page">Broken</a>
<a href="/legacy">Legacy (308 → /product)</a>
<a href="/chain">Chain (3 hops)</a>
<a href="/workspace/score">Workspace (gated)</a>
<a href="/api/health">API (gated)</a>
<a href="/auth/login">Login (gated)</a>
<a href="mailto:hello@blockid.au">mail</a>
<a href="tel:+61400000000">tel</a>
<a href="javascript:void(0)">js</a>
<a href="https://linkedin.com/company/blockid">LinkedIn (999)</a>
<a href="https://blocked.example/x">Bot-blocked (403)</a>
<a href="https://gone.example/x">Gone (404)</a>
<a href="https://nxdomain.example/">DNS fail</a>
<img src="/og.png" alt="og" srcset="/og-2x.png 2x, /og-3x.png 3x">
<picture><source src="/hero.webp"></picture>
<a href="/docs/">Docs</a>
<a href="/cdn-cgi/l/email-protection#35464045455a47417557595a565e5c511b5440">[email protected]</a>
<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
</main></body></html>`;

const PRODUCT = `<html><body><h1 id="product">Product</h1><section id="dimensions"></section><a href="/">Home</a><a href="/product">Self</a><a href="/slow">Slow</a></body></html>`;
const PRICING = `<html><body><a href="/product">p</a><a href="/samples">s</a></body></html>`;
const SAMPLES = `<html><body><a href="/">home</a></body></html>`;
const DOCS = `<html><body><a href="/product#product">product</a></body></html>`;
const SITEMAP = `<?xml version="1.0"?><urlset><url><loc>https://blockid.au/</loc></url><url><loc>https://blockid.au/product</loc></url><url><loc>https://blockid.au/legacy</loc></url><url><loc>https://blockid.au/missing-page</loc></url></urlset>`;
const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /secret$\nDisallow: /workspace/\n`;

/** In-memory site keyed by pathname; `fetchBase` is what the crawler dials. */
function fakeSite(fetchBase = "https://blockid.au") {
  const calls = [];
  const html = (body, status = 200, headers = {}) =>
    new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
  const redirect = (to, status = 308) => new Response("", { status, headers: { location: to } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: url.toString(), method: init.method ?? "GET" });
    if (u.hostname === "nxdomain.example") {
      const err = new TypeError("fetch failed");
      err.cause = { code: "ENOTFOUND" };
      throw err;
    }
    // Response() refuses a 999 status — hand back the shape the crawler reads.
    if (u.hostname === "linkedin.com") return { status: 999, url: url.toString(), headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
    if (u.hostname === "blocked.example") return new Response("", { status: 403 });
    if (u.hostname === "gone.example") return new Response("", { status: 404 });
    if (u.origin !== fetchBase) return new Response("", { status: 404 });
    switch (u.pathname) {
      case "/robots.txt":
        return new Response(ROBOTS, { status: 200, headers: { "content-type": "text/plain" } });
      case "/sitemap.xml":
        return new Response(SITEMAP, { status: 200, headers: { "content-type": "application/xml" } });
      case "/":
        return html(HOME);
      case "/product":
        return html(PRODUCT);
      case "/pricing":
        return html(PRICING);
      case "/samples":
        return html(SAMPLES);
      case "/docs":
        return html(DOCS);
      case "/legacy":
        return redirect("/product");
      case "/chain":
        return redirect("/chain-2", 307);
      case "/chain-2":
        return redirect("/chain-3", 307);
      case "/chain-3":
        return redirect("/product", 307);
      case "/slow":
        await new Promise((r) => setTimeout(r, 5));
        return html("<html><body>slow</body></html>");
      case "/workspace/score":
        return redirect("/auth/login?next=/workspace/score", 307);
      case "/auth/login":
        return html("<html><body>login</body></html>");
      case "/api/health":
        return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
      case "/_next/static/css/app.css":
        return new Response("body{}", { status: 200, headers: { "content-type": "text/css" } });
      case "/_next/static/chunks/main.js":
        return new Response("//", { status: 200, headers: { "content-type": "text/javascript" } });
      case "/og.png":
      case "/og-2x.png":
      case "/hero.webp":
        return new Response(new Uint8Array([0]), { status: 200, headers: { "content-type": "image/png" } });
      case "/vi":
        return html("<html><body>vi</body></html>");
      default:
        return html("<html><body>not found</body></html>", 404);
    }
  };
  return { fetchImpl, calls };
}

describe("link-check-core — extraction + normalisation", () => {
  it("extractLinks picks a/link(stylesheet|canonical|alternate)/img/source/script and skips preload, comments, noscript", () => {
    const links = extractLinks(HOME);
    const raws = links.map((l) => l.raw);
    expect(raws).toContain("/_next/static/css/app.css");
    expect(raws).toContain("https://blockid.au/");
    expect(raws).toContain("https://blockid.au/vi");
    expect(raws).toContain("/_next/static/chunks/main.js");
    expect(raws).toContain("/og.png");
    expect(raws).toContain("/og-2x.png");
    expect(raws).toContain("/hero.webp");
    expect(raws).not.toContain("/_next/static/media/font.woff2");
    expect(raws).not.toContain("/commented-out");
    expect(raws).not.toContain("/noscript-only");
    expect(links.find((l) => l.raw === "/_next/static/css/app.css")?.kind).toBe("link:stylesheet");
    expect(links.find((l) => l.raw === "https://blockid.au/")?.kind).toBe("link:canonical");
    expect(links.find((l) => l.raw === "/og-2x.png")?.kind).toBe("img:srcset");
  });

  it("decodes the entities Next emits in hrefs", () => {
    expect(extractLinks(`<a href="/a?x=1&amp;y=2">`)[0].raw).toBe("/a?x=1&y=2");
    expect(decodeEntities("it&#x27;s &quot;q&quot;")).toBe(`it's "q"`);
  });

  it("extractIds collects id= on any element and name= only on <a> (meta/input names never satisfy a fragment)", () => {
    const ids = extractIds(PRODUCT);
    expect(ids.has("product")).toBe(true);
    expect(ids.has("dimensions")).toBe(true);
    expect(ids.has("nope")).toBe(false);
    const strict = extractIds('<meta name="description" content="x"><input name="email"><a name="legacy">old</a><div id="real"></div>');
    expect(strict.has("description")).toBe(false);
    expect(strict.has("email")).toBe(false);
    expect(strict.has("legacy")).toBe(true);
    expect(strict.has("real")).toBe(true);
  });

  it("isPrivateHost refuses loopback / RFC1918 / link-local / metadata hosts and resolved private addresses", async () => {
    const { isPrivateHost, isPrivateV4, isPrivateV6 } = await import("./link-check.mjs");
    expect(isPrivateV4("127.0.0.1")).toBe(true);
    expect(isPrivateV4("10.1.2.3")).toBe(true);
    expect(isPrivateV4("169.254.169.254")).toBe(true);
    expect(isPrivateV4("172.16.0.1")).toBe(true);
    expect(isPrivateV4("8.8.8.8")).toBe(false);
    expect(isPrivateV6("::1")).toBe(true);
    expect(isPrivateV6("fd00::1")).toBe(true);
    expect(isPrivateV6("2001:db8::1")).toBe(false);
    expect(await isPrivateHost("localhost")).toBe(true);
    expect(await isPrivateHost("metadata.google.internal")).toBe(true);
    const lookup = async (h) => (h === "evil.example" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
    expect(await isPrivateHost("evil.example", lookup)).toBe(true);
    expect(await isPrivateHost("good.example", lookup)).toBe(false);
  });

  it("normalizeUrl resolves relative hrefs, strips fragments + trailing slash, drops non-http schemes", () => {
    expect(normalizeUrl("/pricing/", "https://blockid.au/")).toEqual({ href: "https://blockid.au/pricing", fragment: "" });
    expect(normalizeUrl("product#dimensions", "https://blockid.au/x/")).toEqual({ href: "https://blockid.au/x/product", fragment: "dimensions" });
    expect(normalizeUrl("#main", "https://blockid.au/")).toEqual({ href: "https://blockid.au/", fragment: "main" });
    expect(normalizeUrl("/", "https://blockid.au/")).toEqual({ href: "https://blockid.au/", fragment: "" });
    for (const raw of ["mailto:a@b.c", "tel:+61", "javascript:void(0)", "data:text/plain,x", "", "   ", "ftp://x/y"]) {
      expect(normalizeUrl(raw, "https://blockid.au/"), raw).toBeNull();
    }
    expect(normalizeUrl("//cdn.example/x.js", "https://blockid.au/")?.href).toBe("https://cdn.example/x.js");
  });

  it("makeSite/classify treat base, canonical site and www. as internal; local base infers blockid.au", () => {
    const prod = makeSite("https://blockid.au");
    expect(classify("https://www.blockid.au/x", prod)).toBe("internal");
    expect(classify("https://blockid.au/x", prod)).toBe("internal");
    expect(classify("https://example.com/x", prod)).toBe("external");
    const local = makeSite("http://127.0.0.1:4099");
    expect(local.site).toBe("https://blockid.au");
    expect(classify("https://blockid.au/product", local)).toBe("internal");
    expect(toFetchUrl("https://blockid.au/product", local)).toBe("http://127.0.0.1:4099/product");
    expect(toSiteUrl("http://127.0.0.1:4099/product", local)).toBe("https://blockid.au/product");
    expect(toFetchUrl("https://example.com/x", local)).toBe("https://example.com/x");
    expect(makeSite("http://localhost:4001", "https://staging.example").site).toBe("https://staging.example");
  });

  it("scope rules: no-crawl prefixes and asset paths", () => {
    for (const p of ["/api/x", "/workspace", "/workspace/score", "/dashboard/", "/admin/pilots", "/auth/login", "/s/abc", "/apply/x"]) expect(isNoCrawlPath(p), p).toBe(true);
    for (const p of ["/", "/product", "/apply-now", "/solutions/investor", "/api-docs"]) expect(isNoCrawlPath(p), p).toBe(false);
    expect(isAssetPath("/_next/static/css/a.css")).toBe(true);
    expect(isAssetPath("/og.png")).toBe(true);
    expect(isAssetPath("/sitemap.xml")).toBe(true);
    expect(isAssetPath("/product")).toBe(false);
    expect(isEdgeInjectedPath("/cdn-cgi/l/email-protection")).toBe(true);
    expect(isEdgeInjectedPath("/cdn-cgi/challenge-platform/scripts/jsd/main.js")).toBe(true);
    expect(isEdgeInjectedPath("/cdn")).toBe(false);
  });

  it("parseRobots + robotsAllows honour Disallow for * with $ and * wildcards", () => {
    const rules = parseRobots(ROBOTS);
    expect(rules.disallow).toEqual(["/api/", "/admin/", "/secret$", "/workspace/"]);
    expect(robotsAllows("/product", rules)).toBe(true);
    expect(robotsAllows("/api/x", rules)).toBe(false);
    expect(robotsAllows("/secret", rules)).toBe(false);
    expect(robotsAllows("/secrets", rules)).toBe(true);
    expect(robotsAllows("/anything", null)).toBe(true);
    const specific = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: BlockID-LinkCheck\nDisallow: /private/\n");
    expect(specific.disallow).toEqual(["/private/"]);
    const star = parseRobots("User-agent: Googlebot\nDisallow: /g/\n\nUser-agent: *\nDisallow: /all/\n");
    expect(star.disallow).toEqual(["/all/"]);
  });

  it("parseSitemap reads <loc> from a urlset and flags an index", () => {
    expect(parseSitemap(SITEMAP)).toEqual({ urls: ["https://blockid.au/", "https://blockid.au/product", "https://blockid.au/legacy", "https://blockid.au/missing-page"], isIndex: false });
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://blockid.au/sitemap-1.xml</loc></sitemap></sitemapindex>").isIndex).toBe(true);
    expect(parseSitemap("").urls).toEqual([]);
  });

  it("status rules: external tolerates 403/405/429/999; internal needs 200/204 and ≤ 5 hops", () => {
    for (const s of [200, 301, 302, 403, 405, 429, 999]) expect(externalIsBroken(s), String(s)).toBe(false);
    for (const s of [404, 410, 500, 502, 503, null, 0]) expect(externalIsBroken(s), String(s)).toBe(true);
    expect(internalIsBroken(200, 0)).toBe(false);
    expect(internalIsBroken(200, 2)).toBe(false);
    expect(internalIsBroken(200, 6)).toBe(true);
    for (const s of [404, 500, 302, 401, null]) expect(internalIsBroken(s, 0), String(s)).toBe(true);
  });

  it("summarize splits broken / redirect_chains / slow and sorts internal first", () => {
    const s = summarize(
      [
        { url: "https://blockid.au/ok", from: "/", kind: "a", internal: true, status: 200, ms: 10, hops: 0 },
        { url: "https://blockid.au/gone", from: "/", kind: "a", internal: true, status: 404, ms: 10, hops: 0 },
        { url: "https://blockid.au/chain", from: "/", kind: "a", internal: true, status: 200, ms: 10, hops: 3, final_url: "https://blockid.au/ok", chain: [] },
        { url: "https://blockid.au/slow", from: "/", kind: "a", internal: true, status: 200, ms: 4000, hops: 0 },
        { url: "https://blockid.au/workspace/x", from: "/", kind: "a", internal: true, gated: true, status: 307, ms: 10 },
        { url: "https://blockid.au/workspace/down", from: "/", kind: "a", internal: true, gated: true, status: 503, ms: 10 },
        { url: "https://ext.example/404", from: "/", kind: "a", internal: false, status: 404, ms: 10 },
        { url: "https://ext.example/403", from: "/", kind: "a", internal: false, status: 403, ms: 10 },
        { url: "https://blockid.au/product#nope", from: "/", kind: "a", internal: true, status: 200, ms: 0, fragment_missing: "nope" },
      ],
      { ts: "2026-09-19T00:00:00.000Z", base: "https://blockid.au", pages: 3 },
    );
    expect(s.links).toBe(9);
    expect(s.broken.map((b) => b.url)).toEqual(["https://blockid.au/gone", "https://blockid.au/product#nope", "https://blockid.au/workspace/down", "https://ext.example/404"]);
    expect(s.broken_internal).toBe(3);
    expect(s.broken_external).toBe(1);
    expect(s.redirect_chains).toHaveLength(1);
    expect(s.redirect_chains[0].hops).toBeGreaterThan(MAX_REDIRECT_HOPS);
    expect(s.slow.map((x) => x.url)).toEqual(["https://blockid.au/slow"]);
    const text = formatSummary(s);
    expect(text).toContain("broken: 4 (3 internal, 1 external)");
    expect(text).toContain("missing #nope");
  });

  it("parseArgs defaults + overrides", () => {
    expect(parseArgs([])).toMatchObject({ base: "https://blockid.au", max: 400, concurrency: 6, json: false, includeSitemap: false, dryRun: false, alert: true, externals: true, timeoutMs: 10_000 });
    expect(parseArgs(["--base", "http://127.0.0.1:4099/", "--max", "50", "--concurrency", "3", "--json", "--include-sitemap", "--dry-run", "--no-alert", "--no-external", "--timeout", "2000"])).toMatchObject({
      base: "http://127.0.0.1:4099",
      max: 50,
      concurrency: 3,
      json: true,
      includeSitemap: true,
      dryRun: true,
      alert: false,
      externals: false,
      timeoutMs: 2000,
    });
  });
});

describe("link-check.mjs — crawl over the fake site", () => {
  const args = (over = {}) => ({ ...parseArgs(["--base", "https://blockid.au", "--concurrency", "4", "--timeout", "2000"]), ...over });

  it("finds exactly the broken links, judges gated + external by their own rules, reports chains and fragments", async () => {
    const site = fakeSite();
    const { summary, records } = await crawl(args(), { fetchImpl: site.fetchImpl, log: () => {} });
    const brokenUrls = summary.broken.map((b) => b.url).sort();
    expect(brokenUrls).toEqual(
      [
        "https://blockid.au/missing-page",
        "https://blockid.au/product#nope",
        "https://gone.example/x",
        "https://nxdomain.example/",
      ].sort(),
    );
    const missing = summary.broken.find((b) => b.url === "https://blockid.au/missing-page");
    expect(missing).toMatchObject({ status: 404, from: "https://blockid.au/", kind: "a", internal: true });
    expect(summary.broken.find((b) => b.url === "https://nxdomain.example/")?.error).toBe("ENOTFOUND");
    expect(summary.broken.find((b) => b.url === "https://blockid.au/product#nope")?.fragment_missing).toBe("nope");

    // Pages actually crawled: /, /product, /pricing, /samples, /docs, /vi (alternate is a <link>, not crawled) …
    expect(summary.pages).toBeGreaterThanOrEqual(5);
    const byUrl = Object.fromEntries(records.map((r) => [r.url, r]));
    // trailing slash + www. + utm collapse onto the canonical page, no chain
    expect(byUrl["https://blockid.au/pricing"]).toMatchObject({ status: 200, hops: 0 });
    expect(byUrl["https://blockid.au/samples?utm_source=x"]).toMatchObject({ status: 200, internal: true });
    // Query-string URLs are checked, never crawled (filter-combination guard).
    expect(byUrl["https://blockid.au/samples?utm_source=x"].crawled).toBeUndefined();
    expect(byUrl["https://blockid.au/samples"]).toMatchObject({ crawled: true });
    // 308 legacy: one hop, final 200, not broken, not a chain
    expect(byUrl["https://blockid.au/legacy"]).toMatchObject({ status: 200, hops: 1, final_url: "https://blockid.au/product" });
    expect(summary.redirect_chains.map((c) => c.url)).toEqual(["https://blockid.au/chain"]);
    expect(summary.redirect_chains[0].hops).toBe(3);
    // gated paths: HEAD once, redirect to login is healthy
    expect(byUrl["https://blockid.au/workspace/score"]).toMatchObject({ gated: true });
    expect(byUrl["https://blockid.au/api/health"]).toMatchObject({ gated: true, status: 200 });
    expect(site.calls.filter((c) => c.url.endsWith("/workspace/score")).map((c) => c.method)).toEqual(["HEAD"]);
    // externals: HEAD first, 403/999 tolerated
    expect(byUrl["https://blocked.example/x"]).toMatchObject({ internal: false, status: 403 });
    expect(byUrl["https://linkedin.com/company/blockid"]).toMatchObject({ internal: false, status: 999 });
    expect(site.calls.find((c) => c.url === "https://linkedin.com/company/blockid")?.method).toBe("HEAD");
    // resources are checked
    expect(byUrl["https://blockid.au/_next/static/css/app.css"]).toMatchObject({ status: 200, kind: "link:stylesheet" });
    expect(byUrl["https://blockid.au/og-2x.png"]).toMatchObject({ status: 200, kind: "img:srcset" });
    expect(byUrl["https://blockid.au/hero.webp"]).toMatchObject({ status: 200, kind: "source" });
    // mailto/tel/javascript never requested; Cloudflare-injected /cdn-cgi/ paths neither
    expect(site.calls.some((c) => /^(mailto|tel|javascript):/.test(c.url))).toBe(false);
    expect(site.calls.some((c) => c.url.includes("/cdn-cgi/"))).toBe(false);
    // /api/health is Disallowed for crawling but still status-checked; never parsed
    expect(byUrl["https://blockid.au/api/health"].crawled).toBeUndefined();
    // every request carried the UA
    expect(summary.gated_checked).toBe(3);
  });

  it("--include-sitemap seeds every <loc> and counts a redirecting URL as failed", async () => {
    const site = fakeSite();
    const { summary } = await crawl(args({ includeSitemap: true }), { fetchImpl: site.fetchImpl, log: () => {} });
    expect(summary.sitemap).toEqual({ urls: 4, ok: 2, failed: 2 }); // /legacy (308) + /missing-page (404)
    expect(summary.broken.some((b) => b.url === "https://blockid.au/missing-page")).toBe(true);
  });

  it("--no-external skips external hosts entirely", async () => {
    const site = fakeSite();
    const { summary } = await crawl(args({ externals: false }), { fetchImpl: site.fetchImpl, log: () => {} });
    expect(summary.external).toBe(0);
    expect(site.calls.some((c) => !c.url.startsWith("https://blockid.au"))).toBe(false);
    expect(summary.broken.map((b) => b.url).sort()).toEqual(["https://blockid.au/missing-page", "https://blockid.au/product#nope"]);
  });

  it("--max caps the pages crawled and flags it", async () => {
    const site = fakeSite();
    const { summary } = await crawl(args({ max: 2, externals: false }), { fetchImpl: site.fetchImpl, log: () => {} });
    expect(summary.pages).toBe(2);
    expect(summary.max_pages_hit).toBe(true);
  });

  it("--base http://127.0.0.1:4099 fetches every internal URL (incl. the canonical + sitemap locs) from the local port", async () => {
    const site = fakeSite("http://127.0.0.1:4099");
    const { summary } = await crawl(args({ base: "http://127.0.0.1:4099", includeSitemap: true, externals: false }), { fetchImpl: site.fetchImpl, log: () => {} });
    expect(site.calls.every((c) => c.url.startsWith("http://127.0.0.1:4099"))).toBe(true);
    expect(summary.base).toBe("http://127.0.0.1:4099");
    expect(summary.site).toBe("https://blockid.au");
    expect(summary.sitemap.urls).toBe(4);
    // Records are keyed on the canonical origin so reports compare across bases.
    expect(summary.broken.map((b) => b.url)).toContain("https://blockid.au/missing-page");
  });

  it("main(): writes jsonl + latest, alerts on broken, exit 1; --dry-run writes/sends nothing and exits 0", async () => {
    const site = fakeSite();
    const dir = mkdtempSync(join(tmpdir(), "link-check-"));
    const sent = [];
    const deps = { fetchImpl: site.fetchImpl, log: () => {}, skipLock: true, sendTelegram: async (text) => (sent.push(text), { sent: true }) };
    const dry = await main(["--base", "https://blockid.au", "--out-dir", dir, "--dry-run", "--timeout", "2000"], deps);
    expect(dry.exitCode).toBe(0);
    expect(dry.summary.broken.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, "link-check.jsonl"))).toBe(false);
    expect(sent).toHaveLength(0);

    const real = await main(["--base", "https://blockid.au", "--out-dir", dir, "--timeout", "2000"], deps);
    expect(real.exitCode).toBe(1);
    const rows = readFileSync(join(dir, "link-check.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base: "https://blockid.au", pages: real.summary.pages, links: real.summary.links });
    expect(Array.isArray(rows[0].broken) && Array.isArray(rows[0].redirect_chains) && Array.isArray(rows[0].slow)).toBe(true);
    const latest = JSON.parse(readFileSync(join(dir, "link-check-latest.json"), "utf8"));
    expect(latest.broken.length).toBe(real.summary.broken.length);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/link-check blockid\.au: \d+ open \(\+\d+ new/);
    expect(latest.open.every((o) => typeof o.open_since === "string")).toBe(true);

    const quiet = await main(["--base", "https://blockid.au", "--out-dir", dir, "--no-alert", "--timeout", "2000"], deps);
    expect(quiet.exitCode).toBe(1);
    expect(sent).toHaveLength(1);

    // W1: same broken set again → no alert (only a change alerts).
    const again = await main(["--base", "https://blockid.au", "--out-dir", dir, "--timeout", "2000"], deps);
    expect(again.exitCode).toBe(1);
    expect(sent).toHaveLength(1);
    expect(again.summary.changes).toEqual({ added: [], resolved: [], escalated: [] });
  });
});

// ─── W1 (2026-10-20, docs/pricing-v5-plan.md § 5) ────────────────────────────
// Silent regressions this block guards against:
//   - a JSON-LD breadcrumb / og:image / hreflang pointing at a 404 going
//     unnoticed (/vi/solutions, /og/pricing.png, bare /checkout/review);
//   - a 403/429/999 external disappearing from the report instead of being
//     recorded as `unverifiable`;
//   - an external redirect loop / > 5 hops passing as OK, or a login wall that
//     only loops on HEAD (investmentcouncil.com.au) reported as broken;
//   - every nightly run re-alerting the same broken set (alert fatigue), or a
//     long-open link never escalating / escalating every night;
//   - a startupvalueindex.com run overwriting the BlockID report.

const W1_HOME = `<!doctype html><html><head>
<meta property="og:image" content="https://blockid.au/og/missing.png">
<meta name="twitter:image" content="/opengraph-image">
<meta property="og:url" content="https://blockid.au/">
<link rel="alternate" hreflang="vi" href="https://blockid.au/vi/missing">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"Home","item":"https://blockid.au/"},
  {"@type":"ListItem","position":2,"name":"Hub","item":{"@id":"https://blockid.au/hub-missing","name":"Hub"}}]}</script>
<script type="application/ld+json">{"@type":"Organization","@id":"https://blockid.au/#org","logo":"https://blockid.au/logo.png",
  "sameAs":["https://linkedin.com/company/blockid"],
  "potentialAction":{"@type":"SearchAction","target":"https://blockid.au/search?q={search_term_string}"}}</script>
<script type="application/ld+json">{ not json </script>
</head><body>
<a href="/directory">Directory</a>
<a href="https://loop.example/a">Loop</a>
<a href="https://hops.example/1">Seven hops</a>
<a href="https://headwall.example/">HEAD-only login wall</a>
<a href="https://ratelimited.example/">429</a>
<a href="https://chain.example/1">3-hop external chain</a>
</body></html>`;
const DIRECTORY = `<html><body><a href="/directory?state=ACT">ACT</a><a href="/directory?utm_source=x">utm</a></body></html>`;
const DIRECTORY_ACT = `<html><body><a href="/only-on-filtered-view">deep</a><a href="/directory?state=ACT&amp;stage=mvp">combo</a></body></html>`;
const DIRECTORY_COMBO = `<html><body><a href="/never-reached-from-combo">x</a></body></html>`;

function fakeSiteW1() {
  const calls = [];
  const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  const redirect = (to, status = 302) => new Response("", { status, headers: { location: to } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    calls.push({ url: url.toString(), method });
    if (u.hostname === "loop.example") return redirect(u.pathname === "/a" ? "/b" : "/a");
    if (u.hostname === "hops.example") return redirect(`/${Number(u.pathname.slice(1)) + 1}`);
    if (u.hostname === "headwall.example") {
      if (method === "HEAD") return redirect(`/login?ReturnUrl=${encodeURIComponent(u.pathname + u.search)}`);
      return html("<html>ok</html>");
    }
    if (u.hostname === "ratelimited.example") return new Response("", { status: 429 });
    if (u.hostname === "linkedin.com") return { status: 999, url: url.toString(), headers: new Headers(), text: async () => "" };
    if (u.hostname === "chain.example") {
      const n = Number(u.pathname.slice(1));
      return n < 4 ? redirect(`/${n + 1}`, 301) : html("<html>end</html>");
    }
    if (u.origin !== "https://blockid.au") return new Response("", { status: 404 });
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://blockid.au/sitemap-extra.xml\n", { status: 200 });
    if (u.pathname === "/sitemap.xml") return new Response("<urlset><url><loc>https://blockid.au/</loc></url></urlset>", { status: 200 });
    if (u.pathname === "/sitemap-extra.xml") return new Response("<urlset><url><loc>https://blockid.au/from-robots-sitemap</loc></url></urlset>", { status: 200 });
    if (u.pathname === "/") return html(W1_HOME);
    if (u.pathname === "/directory") {
      if (u.searchParams.get("stage")) return html(DIRECTORY_COMBO);
      if (u.searchParams.get("state")) return html(DIRECTORY_ACT);
      return html(DIRECTORY);
    }
    if (u.pathname === "/opengraph-image" || u.pathname === "/logo.png") return new Response(new Uint8Array([0]), { status: 200, headers: { "content-type": "image/png" } });
    if (u.pathname === "/only-on-filtered-view" || u.pathname === "/from-robots-sitemap") return html("<html>ok</html>");
    return html("<html>404</html>", 404);
  };
  return { fetchImpl, calls };
}

describe("W1 — extraction of meta, JSON-LD and hreflang links", () => {
  it("extractLinks adds og:image / twitter:image / og:url, JSON-LD url properties and labels hreflang", () => {
    const links = extractLinks(W1_HOME);
    const byRaw = {};
    for (const l of links) byRaw[l.raw] ??= l.kind; // first occurrence
    expect(byRaw["https://blockid.au/og/missing.png"]).toBe("meta:og:image");
    expect(byRaw["/opengraph-image"]).toBe("meta:twitter:image");
    expect(byRaw["https://blockid.au/"]).toBe("meta:og:url");
    expect(byRaw["https://blockid.au/vi/missing"]).toBe("link:hreflang");
    expect(byRaw["https://blockid.au/hub-missing"]).toBe("jsonld:item");
    expect(byRaw["https://blockid.au/logo.png"]).toBe("jsonld:logo");
    expect(byRaw["https://linkedin.com/company/blockid"]).toBe("jsonld:sameAs");
    // identifiers and URL templates are not links; malformed JSON is skipped
    expect(Object.keys(byRaw)).not.toContain("https://blockid.au/#org");
    expect(Object.keys(byRaw).some((r) => r.includes("{search_term_string}"))).toBe(false);
    // meta + JSON-LD links come after every tag link (the live-qa lane samples the first N)
    const firstExtra = links.findIndex((l) => /^(meta|jsonld):/.test(l.kind));
    expect(links.slice(firstExtra).every((l) => /^(meta|jsonld):/.test(l.kind))).toBe(true);
    expect(links.findIndex((l) => l.raw === "/directory")).toBeLessThan(firstExtra);
  });

  it("extractMetaLinks / extractJsonLdLinks handle attribute order, arrays and object forms", () => {
    expect(extractMetaLinks(`<meta content="/a.png" property="og:image"><meta name="description" content="/x">`)).toEqual([{ raw: "/a.png", kind: "meta:og:image" }]);
    const ld = extractJsonLdLinks(`<script type="application/ld+json">[{"url":"/u","image":[{"@type":"ImageObject","url":"/i.png"}],"mainEntityOfPage":{"@type":"WebPage","@id":"https://blockid.au/p"}}]</script>`);
    expect(ld).toEqual([
      { raw: "/u", kind: "jsonld:url" },
      { raw: "/i.png", kind: "jsonld:image" },
      { raw: "https://blockid.au/p", kind: "jsonld:mainEntityOfPage" },
    ]);
    expect(extractJsonLdLinks(`<script type="application/ld+json">{oops</script>`)).toEqual([]);
  });

  it("parseRobots returns Sitemap: lines regardless of group", () => {
    expect(parseRobots("Sitemap: https://x.example/s.xml\nUser-agent: *\nDisallow: /api/\n").sitemaps).toEqual(["https://x.example/s.xml"]);
  });
});

describe("W1 — verdicts, query pages, reconciliation", () => {
  it("externalVerdict: broken vs unverifiable vs ok", () => {
    for (const s of [404, 410, 500, 502, 503, null, 0]) expect(externalVerdict(s), String(s)).toBe("broken");
    for (const s of [401, 403, 405, 429, 451, 999, 400]) expect(externalVerdict(s), String(s)).toBe("unverifiable");
    for (const s of [200, 204, 301, 304]) expect(externalVerdict(s), String(s)).toBe("ok");
    expect(externalVerdict(null, "redirect_loop")).toBe("broken");
    expect(externalVerdict(null, "too_many_redirects")).toBe("broken");
    expect(externalVerdict(null, "timeout")).toBe("broken");
    expect(externalVerdict(null, "skipped_private")).toBe("unverifiable");
    expect(MAX_FOLLOW_HOPS).toBe(5);
  });

  it("shouldParseQueryPage: one level deep, tracking-only = bare page, capped per pathname", () => {
    const base = { url: "https://blockid.au/d?state=ACT", from: "https://blockid.au/d" };
    expect(shouldParseQueryPage({ url: "https://blockid.au/d", from: "x" })).toBe(true);
    expect(shouldParseQueryPage(base)).toBe(true);
    expect(shouldParseQueryPage({ ...base, from: "https://blockid.au/d?state=NSW" })).toBe(false);
    expect(shouldParseQueryPage({ ...base, from: "https://blockid.au/d?utm_source=x" })).toBe(true);
    expect(shouldParseQueryPage({ ...base, variantsSeen: QUERY_VARIANT_CAP })).toBe(false);
    expect(shouldParseQueryPage({ ...base, from: "(sitemap)", isSeed: true, variantsSeen: 999 })).toBe(true);
    expect(shouldParseQueryPage({ url: "https://blockid.au/d?utm_source=x&gclid=1", from: "https://blockid.au/" })).toBe(false);
    expect(isTrackingOnlyQuery("?utm_source=a&utm_medium=b")).toBe(true);
    expect(isTrackingOnlyQuery("?state=ACT&utm_source=a")).toBe(false);
  });

  it("reconcileOpen keeps open_since, reports added/resolved, escalates once after 48 h", () => {
    const t0 = new Date("2026-10-01T03:40:00Z");
    const b = (url) => ({ url, from: "https://blockid.au/", status: 404, kind: "a", internal: true });
    const r1 = reconcileOpen([], [b("https://blockid.au/x"), b("https://blockid.au/y")], { now: t0 });
    expect(r1.added.map((o) => o.url)).toEqual(["https://blockid.au/x", "https://blockid.au/y"]);
    expect(r1.open.every((o) => o.open_since === t0.toISOString() && o.escalated_at === null)).toBe(true);

    const t1 = new Date("2026-10-02T03:40:00Z"); // 24 h — no escalation yet
    const r2 = reconcileOpen(r1.open, [b("https://blockid.au/x")], { now: t1 });
    expect(r2.added).toEqual([]);
    expect(r2.resolved.map((o) => o.url)).toEqual(["https://blockid.au/y"]);
    expect(r2.escalated).toEqual([]);
    expect(r2.open[0]).toMatchObject({ open_since: t0.toISOString(), last_seen: t1.toISOString() });

    const t2 = new Date("2026-10-03T04:00:00Z"); // > 48 h
    const r3 = reconcileOpen(r2.open, [b("https://blockid.au/x")], { now: t2 });
    expect(r3.escalated.map((o) => o.url)).toEqual(["https://blockid.au/x"]);
    expect(r3.open[0].escalated_at).toBe(t2.toISOString());

    const r4 = reconcileOpen(r3.open, [b("https://blockid.au/x")], { now: new Date("2026-10-04T04:00:00Z") });
    expect(r4.escalated).toEqual([]); // once
    expect(formatChangeAlert({ base: "https://blockid.au", broken: [b("x")], open_count: 1 }, r4)).toBeNull();
    const text = formatChangeAlert({ base: "https://blockid.au", site: "https://blockid.au", broken: [], open_count: 1 }, r3);
    expect(text).toContain("1 open > 48 h");
    expect(text).toContain("OPEN since 2026-10-01T03:40:00.000Z");
    expect(oldestOpenSince(r3.open)).toBe(t0.toISOString());
  });

  it("seedOpenFromHistory backdates open_since over the unbroken run of history rows", () => {
    const row = (ts, urls, extra = {}) => ({ ts, broken: urls.map((url) => ({ url, from: "/", status: 404, kind: "a", internal: false })), ...extra });
    const open = seedOpenFromHistory([
      row("2026-10-15T03:40:00.000Z", ["https://a.example/"]),
      row("2026-10-16T03:40:00.000Z", []),
      row("2026-10-17T03:40:00.000Z", ["https://a.example/", "https://b.example/"]),
      row("2026-10-18T03:40:00.000Z", ["https://a.example/", "https://b.example/"], { dry_run: true }),
      row("2026-10-19T03:40:00.000Z", ["https://a.example/", "https://b.example/"]),
      row("2026-10-20T03:40:00.000Z", ["https://a.example/"]),
    ]);
    expect(open.map((o) => [o.url, o.open_since])).toEqual([["https://a.example/", "2026-10-17T03:40:00.000Z"]]);
    expect(seedOpenFromHistory([])).toEqual([]);
  });

  it("reportNameFor + --report-name: blockid.au keeps link-check, other sites get their own stem", () => {
    expect(reportNameFor("https://blockid.au")).toBe("link-check");
    expect(reportNameFor("https://www.blockid.au")).toBe("link-check");
    expect(reportNameFor("https://startupvalueindex.com")).toBe("link-check-startupvalueindex-com");
    expect(parseArgs(["--report-name", "svi nightly"]).reportName).toBe("svi-nightly");
  });
});

describe("W1 — crawl + main over the W1 fake site", () => {
  const args = (over = {}) => ({ ...parseArgs(["--base", "https://blockid.au", "--concurrency", "4", "--timeout", "2000"]), ...over });

  it("flags JSON-LD / og:image / hreflang 404s, loops and > 5 hops; records 403/429/999 as unverifiable; follows one query level", async () => {
    const site = fakeSiteW1();
    const { summary, records } = await crawl(args({ includeSitemap: true }), { fetchImpl: site.fetchImpl, log: () => {} });
    const byUrl = Object.fromEntries(records.map((r) => [r.url, r]));
    const broken = Object.fromEntries(summary.broken.map((b) => [b.url, b]));
    expect(broken["https://blockid.au/og/missing.png"]).toMatchObject({ kind: "meta:og:image", status: 404, internal: true });
    expect(broken["https://blockid.au/vi/missing"]).toMatchObject({ kind: "link:hreflang", status: 404 });
    expect(broken["https://blockid.au/hub-missing"]).toMatchObject({ kind: "jsonld:item", status: 404 });
    expect(broken["https://loop.example/a"]).toMatchObject({ internal: false, error: "redirect_loop" });
    expect(broken["https://hops.example/1"]).toMatchObject({ internal: false, error: "too_many_redirects" });
    // HEAD bounces through a login wall, GET answers 200 → ok, not broken
    expect(broken["https://headwall.example/"]).toBeUndefined();
    expect(byUrl["https://headwall.example/"]).toMatchObject({ status: 200 });
    // bot refusals are recorded, not dropped and not broken
    expect(summary.unverifiable.map((u) => u.url).sort()).toEqual(["https://linkedin.com/company/blockid", "https://ratelimited.example/"]);
    expect(summary.unverifiable_count).toBe(2);
    // an external 3-hop chain is reported (internal:false) — the href should be updated
    expect(summary.redirect_chains.find((c) => c.url === "https://chain.example/1")).toMatchObject({ hops: 3, internal: false });
    // query pages: /directory?state=ACT (linked from /directory) is parsed …
    expect(byUrl["https://blockid.au/directory?state=ACT"]).toMatchObject({ crawled: true });
    expect(byUrl["https://blockid.au/only-on-filtered-view"]).toMatchObject({ status: 200 });
    // … the combination linked from it is only status-checked
    expect(byUrl["https://blockid.au/directory?state=ACT&stage=mvp"]).toMatchObject({ status: 200 });
    expect(byUrl["https://blockid.au/directory?state=ACT&stage=mvp"].crawled).toBeUndefined();
    expect(byUrl["https://blockid.au/never-reached-from-combo"]).toBeUndefined();
    // robots.txt Sitemap: lines are seeds too
    expect(byUrl["https://blockid.au/from-robots-sitemap"]).toMatchObject({ status: 200 });
    // JSON-LD @id fragments are not fragment-checked
    expect(summary.broken.some((b) => b.fragment_missing === "org")).toBe(false);
  });

  it("main(): open_since persists, alerts on change only, escalates once after 48 h, resolved alerts; exit ignores external chains", async () => {
    const dir = mkdtempSync(join(tmpdir(), "link-check-w1-"));
    const sent = [];
    let clock = new Date("2026-10-01T03:40:00Z");
    let broken = true;
    const base = fakeSiteW1();
    // Toggle: once "fixed", the og:image answers 200.
    const fetchImpl = async (url, init) => (!broken && String(url).endsWith("/og/missing.png") ? new Response(new Uint8Array([0]), { status: 200, headers: { "content-type": "image/png" } }) : base.fetchImpl(url, init));
    const deps = { fetchImpl, log: () => {}, skipLock: true, now: () => clock, sendTelegram: async (text) => (sent.push(text), { sent: true }) };
    const argv = ["--base", "https://blockid.au", "--out-dir", dir, "--timeout", "2000"];

    const r1 = await main(argv, deps);
    expect(r1.exitCode).toBe(1);
    expect(sent).toHaveLength(1);
    const first = JSON.parse(readFileSync(join(dir, "link-check-latest.json"), "utf8"));
    const og = first.open.find((o) => o.url === "https://blockid.au/og/missing.png");
    expect(og.open_since).toBe("2026-10-01T03:40:00.000Z");
    expect(first.open_count).toBe(first.broken.length);

    clock = new Date("2026-10-02T03:40:00Z");
    await main(argv, deps);
    expect(sent).toHaveLength(1); // unchanged → quiet

    clock = new Date("2026-10-03T03:41:00Z");
    const r3 = await main(argv, deps);
    expect(sent).toHaveLength(2); // escalation
    expect(sent[1]).toContain("open > 48 h");
    expect(r3.summary.changes.escalated.length).toBe(r3.summary.open_count);

    clock = new Date("2026-10-04T03:40:00Z");
    await main(argv, deps);
    expect(sent).toHaveLength(2); // escalated once only

    broken = false;
    clock = new Date("2026-10-05T03:40:00Z");
    const r5 = await main(argv, deps);
    expect(sent).toHaveLength(3);
    expect(sent[2]).toContain("✓ resolved https://blockid.au/og/missing.png");
    expect(r5.summary.changes.resolved).toEqual(["https://blockid.au/og/missing.png"]);
    const latest = JSON.parse(readFileSync(join(dir, "link-check-latest.json"), "utf8"));
    expect(latest.open.find((o) => o.url === "https://blockid.au/vi/missing").open_since).toBe("2026-10-01T03:40:00.000Z");
  });

  it("main(): a pre-W1 latest file (no `open`) is seeded from the jsonl history", async () => {
    const dir = mkdtempSync(join(tmpdir(), "link-check-w1-seed-"));
    const old = (ts) => ({ ts, base: "https://blockid.au", broken: [{ url: "https://blockid.au/vi/missing", from: "https://blockid.au/", status: 404, kind: "link:alternate", internal: true }] });
    writeFileSync(join(dir, "link-check.jsonl"), `${JSON.stringify(old("2026-09-28T03:40:00.000Z"))}\n${JSON.stringify(old("2026-09-29T03:40:00.000Z"))}\n`);
    writeFileSync(join(dir, "link-check-latest.json"), JSON.stringify(old("2026-09-29T03:40:00.000Z")));
    const sent = [];
    const site = fakeSiteW1();
    const r = await main(["--base", "https://blockid.au", "--out-dir", dir, "--no-external", "--timeout", "2000"], {
      fetchImpl: site.fetchImpl,
      log: () => {},
      skipLock: true,
      now: () => new Date("2026-10-01T03:40:00Z"),
      sendTelegram: async (text) => (sent.push(text), { sent: true }),
    });
    const vi = r.summary.open.find((o) => o.url === "https://blockid.au/vi/missing");
    expect(vi.open_since).toBe("2026-09-28T03:40:00.000Z");
    expect(vi.escalated_at).toBe("2026-10-01T03:40:00.000Z"); // > 48 h on the first W1 run
    expect(r.summary.changes.added).not.toContain("https://blockid.au/vi/missing");
  });

  it("main(): a startupvalueindex.com run writes its own files and never touches link-check-latest.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "link-check-svi-"));
    const fetchImpl = async (url) => {
      const u = new URL(url);
      if (u.origin !== "https://startupvalueindex.com") return new Response("", { status: 404 });
      if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\nSitemap: https://startupvalueindex.com/sitemap.xml\n", { status: 200 });
      if (u.pathname === "/sitemap.xml") return new Response("<urlset><url><loc>https://startupvalueindex.com/about</loc></url></urlset>", { status: 200 });
      return new Response(`<html><body><a href="https://www.startupvalueindex.com/about">about</a></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    };
    const r = await main(["--base", "https://startupvalueindex.com", "--include-sitemap", "--no-external", "--out-dir", dir, "--no-alert", "--timeout", "2000"], { fetchImpl, log: () => {}, skipLock: true });
    expect(r.exitCode).toBe(0);
    expect(r.summary.report_name).toBe("link-check-startupvalueindex-com");
    expect(r.summary.sitemap).toEqual({ urls: 1, ok: 1, failed: 0 });
    expect(existsSync(join(dir, "link-check-startupvalueindex-com-latest.json"))).toBe(true);
    expect(existsSync(join(dir, "link-check-startupvalueindex-com.jsonl"))).toBe(true);
    expect(existsSync(join(dir, "link-check-latest.json"))).toBe(false);
    // www. is the same site (internal), not an external
    expect(r.summary.external).toBe(0);
  });
});
