// Pins the funding URLs in the sitemap (S7-B, S8-A). `listGrants` /
// `listPrograms` are mocked with the real seed files mapped through
// `seed-map.ts`, so the counts below are the counts Google will see once
// the tables are seeded: 53 indexable grants (56 in the seed, 3
// `exclude_from_matching`), 199 programs, 9 capitals, 9 state views, and
// the static funding pages. Every other data source is mocked empty.

import { describe, expect, it, vi } from "vitest";
import grantsSeed from "../../content/data/grants-au.seed.json";
import programsSeed from "../../content/data/programs-au.seed.json";
import { mapGrantSeeds, mapProgramSeeds } from "@/lib/funding/seed-map";

const GRANTS = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
const PROGRAMS = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insights", () => ({ getAllArticles: () => [], invalidateCache: () => {} }));
vi.mock("@/lib/business-id/list-public-slugs", () => ({ listPublicSlugsForSitemap: async () => [] }));
vi.mock("@/lib/listings/listings-db", () => ({ getPublicListings: async () => [] }));
vi.mock("@/lib/publish/store", () => ({ listPublishedForSitemap: async () => [] }));
vi.mock("@/lib/funding/data", () => ({ listGrants: async () => GRANTS, listPrograms: async () => PROGRAMS }));

const SITE = "https://blockid.au";

async function entries() {
  const { default: sitemap } = await import("./sitemap");
  return sitemap();
}

describe("sitemap — funding surfaces", () => {
  it("lists /funding (+ VI twin with hreflang), the free directories and the public sample report", async () => {
    const all = await entries();
    const urls = all.map((e) => e.url);
    for (const path of ["/funding", "/vi/funding", "/funding/grants", "/funding/programs", "/funding/report/demo"]) {
      expect(urls, path).toContain(`${SITE}${path}`);
    }
    const funding = all.find((e) => e.url === `${SITE}/funding`)!;
    expect(funding.alternates?.languages).toEqual({ en: `${SITE}/funding`, vi: `${SITE}/vi/funding`, "x-default": `${SITE}/funding` });
    // The paid report is per-viewer and noindex — never enumerated.
    expect(urls.some((u) => /\/funding\/report\/(?!demo$)/.test(u))).toBe(false);
  });

  it("enumerates every grant (53 = 56 − 3 excluded), every program (199), 9 capitals and 9 state views", async () => {
    const urls = (await entries()).map((e) => e.url);
    const grantDetails = urls.filter((u) => /\/funding\/grants\/[^?/]+$/.test(u));
    const programDetails = urls.filter((u) => /\/funding\/programs\/[a-z]+\/[^/]+$/.test(u));
    const capitals = urls.filter((u) => /\/funding\/programs\/[a-z]+$/.test(u));
    const states = urls.filter((u) => /\/funding\/grants\?state=[A-Za-z]+$/.test(u));
    expect(grantDetails).toHaveLength(53);
    expect(programDetails).toHaveLength(199);
    expect(capitals).toHaveLength(9);
    expect(states).toHaveLength(9);
    expect(states).toContain(`${SITE}/funding/grants?state=NSW`);
    expect(states).toContain(`${SITE}/funding/grants?state=national`);
    expect(capitals).toContain(`${SITE}/funding/programs/brisbane`);
    expect(capitals).toContain(`${SITE}/funding/programs/remote`);
    // 53 + 199 + 9 + 9 + /funding + /vi/funding + /funding/grants + /funding/programs + demo
    expect(urls.filter((u) => /blockid\.au\/(vi\/)?funding(\/|\?|$)/.test(u)).length).toBe(53 + 199 + 9 + 9 + 5);
    // Excluded rows (incl. the `__data_sources__` registry row) never surface.
    expect(urls.some((u) => u.endsWith("/funding/grants/data-sources-registry"))).toBe(false);
    // Every program sits under its own capital slug.
    for (const p of PROGRAMS) expect(urls).toContain(`${SITE}/funding/programs/${p.capital.toLowerCase()}/${p.id}`);
  });

  it("detail lastModified comes from last_verified_at; parents inherit the newest child date; no duplicate URLs", async () => {
    const all = await entries();
    const byUrl = new Map(all.map((e) => [e.url, e]));
    for (const g of GRANTS) {
      const e = byUrl.get(`${SITE}/funding/grants/${encodeURIComponent(g.id)}`)!;
      expect(e, g.id).toBeDefined();
      expect((e.lastModified as Date).toISOString().slice(0, 10)).toBe(g.last_verified_at ?? "");
    }
    for (const p of PROGRAMS) {
      const e = byUrl.get(`${SITE}/funding/programs/${p.capital.toLowerCase()}/${encodeURIComponent(p.id)}`)!;
      expect((e.lastModified as Date).toISOString().slice(0, 10)).toBe(p.last_verified_at ?? "");
    }
    const newestGrant = [...GRANTS].map((g) => g.last_verified_at ?? "").sort().at(-1)!;
    expect((byUrl.get(`${SITE}/funding/grants`)!.lastModified as Date).toISOString().slice(0, 10)).toBe(newestGrant);
    const urls = all.map((e) => e.url);
    expect(new Set(urls).size, "duplicate sitemap URLs").toBe(urls.length);
  });

  it("carries the other S8-A audited static pages", async () => {
    const urls = (await entries()).map((e) => e.url);
    for (const path of ["/docs/unlocks", "/compare", "/compare/chatgpt", "/compare/valuers", "/solutions/advisor", "/solutions/investor", "/solutions/accelerator"]) {
      expect(urls, path).toContain(`${SITE}${path}`);
    }
  });
});

// ─── Release QA-1 #3 / #5 / #12 / #13 (2026-09-12) ───────────────────────────
// The release crawl found four sitemap URLs that 404'd (/api-pricing,
// /company, /founding-50, /live — never had a page.tsx), a noindex page
// (/showcase/sprocketbay) and a canonical loop on /index. Every static entry
// must now resolve to a real App Router page, must not be a redirect source
// in next.config.ts, and must not be a noindex page.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import nextConfig from "../../next.config";
import { listAppRoutes, matchRoute, pathnameOf } from "@/lib/seo/app-routes";

const APP_DIR = resolve(__dirname);
const ROUTES = listAppRoutes(APP_DIR);

type Redirect = { source: string; destination: string };
async function redirectSources(): Promise<string[]> {
  const list = (await nextConfig.redirects!()) as Redirect[];
  return list.map((r) => r.source);
}

/** Entries the dynamic data sources contribute (mocked above), so only the hand-written static list is checked. */
function isStaticEntry(url: string): boolean {
  const p = pathnameOf(url);
  return !/^\/(funding\/(grants|programs)\/|insights\/|reports\/|listings\/|id\/|vi\/id\/)/.test(p) && !/\?/.test(url);
}

describe("sitemap — every static entry is a real page (release QA-1)", () => {
  it("resolves every static entry to an existing page.tsx", async () => {
    const urls = (await entries()).map((e) => e.url).filter(isStaticEntry);
    expect(urls.length).toBeGreaterThan(60);
    const unresolved = urls.map(pathnameOf).filter((p) => !matchRoute(ROUTES, p));
    expect(unresolved, "sitemap URLs with no page.tsx").toEqual([]);
  });

  it("never lists the four routes the crawl found 404 (they 301 in next.config.ts)", async () => {
    const paths = (await entries()).map((e) => pathnameOf(e.url));
    for (const p of ["/api-pricing", "/company", "/founding-50", "/live", "/founding-100"]) {
      expect(paths, p).not.toContain(p);
    }
    const sources = await redirectSources();
    for (const p of ["/api-pricing", "/company", "/founding-50", "/live"]) expect(sources, `${p} 301`).toContain(p);
  });

  it("never lists a redirect source from next.config.ts (no /index, /score, /svi, /startup-index loop)", async () => {
    const paths = new Set((await entries()).map((e) => pathnameOf(e.url)));
    const sources = (await redirectSources()).filter((s) => !s.includes(":"));
    const listed = sources.filter((s) => paths.has(s));
    expect(listed, "redirect sources in the sitemap").toEqual([]);
    expect(paths.has("/startup-index"), "/startup-index is the one canonical index URL").toBe(true);
    expect(paths.has("/index")).toBe(false);
    expect(paths.has("/analyze"), "/score 301s to /analyze — the destination is listed").toBe(true);
  });

  it("never lists a noindex page (/showcase/sprocketbay is sample data)", async () => {
    const paths = (await entries()).map((e) => pathnameOf(e.url)).filter((p) => isStaticEntry(p));
    const noindex: string[] = [];
    for (const p of paths) {
      const r = matchRoute(ROUTES, p);
      if (!r || r.route.includes("[")) continue;
      const src = readFileSync(r.file, "utf8");
      if (/robots:\s*\{[^}]*index:\s*false/.test(src)) noindex.push(p);
    }
    expect(noindex, "noindex pages in the sitemap").toEqual([]);
    expect(paths).not.toContain("/showcase/sprocketbay");
  });

  it("the duplicate cap-table exit article is a 301 and not listed", async () => {
    const list = (await nextConfig.redirects!()) as Redirect[];
    const r = list.find((x) => x.source === "/insights/optimising-startup-cap-table-for-acquisition-exit");
    expect(r?.destination).toBe("/insights/optimise-startup-cap-table-for-acquisition-exit");
  });
});
