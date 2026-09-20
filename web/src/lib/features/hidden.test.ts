// HIDDEN_FEATURES — the G20-F1 contract (docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F1.4):
//   • every hidden route is absent from every nav surface (hub tabs, sidebar
//     groups for every persona, admin group, reseller/mentor consoles, the
//     avatar menu, the mentor tab bar) and from the sitemap
//   • every hidden route still has a page (hidden, not deleted) and that
//     page mounts the shared card
//   • the resolvers behave (prefix + `[param]` matching, query/hash ignored)
//   • the list is well-formed (unique keys, rooted routes, dated)

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { HIDDEN_FEATURES, hiddenFeature, hiddenFeatureFor, hiddenRoutes, isHiddenNavKey, isHiddenRoute } from "./hidden";
import { HUBS, HUB_IDS, hubTabHref } from "@/lib/nav/hubs";
import { PERSONAS, PERSONA_KEYS } from "@/lib/nav/persona";
import { userMenuItems } from "@/lib/nav/user-menu";
import { ADMIN_NAV_GROUP, NAV_GROUPS, RESELLER_NAV_GROUPS, allNavLeaves, navGroupsForIds } from "@/components/workspace/nav-groups";
import { listAppRoutes, matchRoute, pathnameOf } from "@/lib/seo/app-routes";

const APP_DIR = resolve(__dirname, "../../app");
const ROUTES = listAppRoutes(APP_DIR);

/** `/reseller/mentor/[founderId]/goals` → `/reseller/mentor/abc/goals` (a concrete instance). */
function concrete(route: string): string {
  return route.replace(/\[[^\]]+\]/g, "abc");
}

describe("HIDDEN_FEATURES — shape", () => {
  it("has unique keys, rooted routes, a reason and the G20 date on every row", () => {
    const keys = new Set<string>();
    for (const f of HIDDEN_FEATURES) {
      expect(keys.has(f.key), `${f.key} duplicated`).toBe(false);
      keys.add(f.key);
      expect(f.key).toMatch(/^[a-z0-9_]+$/);
      expect(f.reason.length, f.key).toBeGreaterThan(20);
      expect(f.since).toBe("2026-09-20");
      expect(["public", "signed-in", "admin"]).toContain(f.visibility);
      for (const r of f.routes) {
        expect(r.startsWith("/"), `${f.key}: ${r}`).toBe(true);
        expect(r.endsWith("/"), `${f.key}: ${r} trailing slash`).toBe(false);
      }
    }
  });

  it("names the surfaces the G20 spec lists (§ 3 F1.2 / § 5 F-1..F-3)", () => {
    for (const key of [
      "sso", "white_label", "public_listing_submission", "advisor_weekly_digest", "innovator_console",
      "locale_es", "locale_ja", "admin_tokens", "connector_stripe_connect", "connector_xero",
    ]) {
      expect(hiddenFeature(key), key).toBeDefined();
    }
    expect(hiddenRoutes()).toEqual(expect.arrayContaining(["/workspace/score/listing", "/workspace/weekly-digest", "/innovator", "/es", "/ja", "/admin/tokens"]));
  });
});

describe("isHiddenRoute / hiddenFeatureFor", () => {
  it("matches the prefix, everything beneath it, and ignores query + hash + trailing slash", () => {
    expect(isHiddenRoute("/innovator")).toBe(true);
    expect(isHiddenRoute("/innovator/")).toBe(true);
    expect(isHiddenRoute("/innovator/watchlist")).toBe(true);
    expect(isHiddenRoute("/innovator/watchlist?x=1#top")).toBe(true);
    expect(isHiddenRoute("/es/tbr/abc123")).toBe(true);
    expect(isHiddenRoute("/ja/workspace/business-report")).toBe(true);
    expect(hiddenFeatureFor("/workspace/score/listing")?.key).toBe("public_listing_submission");
  });

  it("never over-matches a sibling that merely shares the prefix string", () => {
    expect(isHiddenRoute("/innovators")).toBe(false);
    expect(isHiddenRoute("/esop")).toBe(false);
    expect(isHiddenRoute("/workspace/score")).toBe(false);
    expect(isHiddenRoute("/workspace/score/history")).toBe(false);
    expect(isHiddenRoute("/workspace/investor")).toBe(false);
    expect(isHiddenRoute("/workspace/investors/access")).toBe(false);
    expect(isHiddenRoute("/reseller/mentor")).toBe(false);
    expect(isHiddenRoute("/reseller/mentor/abc/overview")).toBe(false);
    expect(isHiddenRoute("/")).toBe(false);
  });

  it("`[param]` in the middle matches one segment of any value", () => {
    expect(isHiddenRoute("/reseller/mentor/abc/goals")).toBe(true);
    expect(isHiddenRoute("/reseller/mentor/9f3c/notes")).toBe(true);
    expect(isHiddenRoute("/reseller/mentor/abc/checkins/extra")).toBe(true);
    expect(isHiddenRoute("/reseller/mentor/goals")).toBe(false);
    expect(hiddenFeatureFor("/reseller/mentor/abc/goals")?.key).toBe("mentor_founder_tools");
  });

  it("isHiddenNavKey answers the documented nav identifiers", () => {
    expect(isHiddenNavKey("hub:score:listing")).toBe(true);
    expect(isHiddenNavKey("nav:/workspace/weekly-digest")).toBe(true);
    expect(isHiddenNavKey("section:/workspace/settings/enterprise#sso")).toBe(true);
    expect(isHiddenNavKey("menu:score")).toBe(false);
  });
});

describe("hidden routes are absent from every nav surface", () => {
  it("no hub tab links to a hidden route (Score › Public listing is gone)", () => {
    for (const id of HUB_IDS) {
      for (const tab of HUBS[id].tabs) {
        const href = hubTabHref(HUBS[id], tab);
        expect(isHiddenRoute(href), `${id}/${tab.segment} → ${href}`).toBe(false);
      }
    }
    expect(HUBS.score.tabs.map((t) => t.segment)).not.toContain("listing");
    expect(HUBS.score.tabs.map((t) => t.segment)).toEqual(["", "history", "trend", "benchmark", "criteria"]);
  });

  it("no sidebar leaf, for any persona, admin or console group, links to a hidden route", () => {
    const groups = [...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS];
    for (const leaf of allNavLeaves(groups)) {
      expect(isHiddenRoute(leaf.href), leaf.href).toBe(false);
    }
    for (const key of PERSONA_KEYS) {
      for (const leaf of allNavLeaves(navGroupsForIds(PERSONAS[key].navGroups))) {
        expect(isHiddenRoute(leaf.href), `${key}: ${leaf.href}`).toBe(false);
      }
    }
    const hrefs = allNavLeaves(groups).map((l) => l.href);
    expect(hrefs).not.toContain("/workspace/weekly-digest");
    expect(hrefs).not.toContain("/workspace/investor/digest");
    expect(hrefs).not.toContain("/workspace/investor/portfolio");
  });

  it("no avatar-menu row, for any persona, links to a hidden route", () => {
    for (const key of [null, ...PERSONA_KEYS] as const) {
      for (const item of userMenuItems(key)) expect(isHiddenRoute(item.href), `${key}: ${item.href}`).toBe(false);
    }
  });

  it("no persona lands on, or bridges to, a hidden route (innovator → founder dashboard)", () => {
    for (const key of PERSONA_KEYS) {
      const p = PERSONAS[key];
      expect(isHiddenRoute(p.landingHref), `${key} lands on hidden ${p.landingHref}`).toBe(false);
      if (p.console) expect(isHiddenRoute(p.console.href), `${key} console → hidden`).toBe(false);
    }
    expect(PERSONAS.innovator.landingHref).toBe("/dashboard");
    expect(PERSONAS.innovator.console).toBeUndefined();
  });
});

describe("hidden routes are absent from the sitemap", () => {
  it("sitemap() never lists a hidden public path", async () => {
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/insights", () => ({ getAllArticles: () => [], invalidateCache: () => {} }));
    vi.doMock("@/lib/business-id/list-public-slugs", () => ({ listPublicSlugsForSitemap: async () => [] }));
    vi.doMock("@/lib/listings/listings-db", () => ({ getPublicListings: async () => [] }));
    vi.doMock("@/lib/publish/store", () => ({ listPublishedForSitemap: async () => [] }));
    vi.doMock("@/lib/funding/data", () => ({ listGrants: async () => [], listPrograms: async () => [] }));
    const { default: sitemap } = await import("@/app/sitemap");
    const paths = (await sitemap()).map((e) => pathnameOf(e.url));
    expect(paths.length).toBeGreaterThan(50);
    const listed = paths.filter((p) => isHiddenRoute(p));
    expect(listed, "hidden routes advertised in the sitemap").toEqual([]);
    expect(paths).not.toContain("/submit");
  });
});

describe("hidden routes are hidden, not deleted — each still has a page that mounts the card", () => {
  const CARD_MARKERS = ["<NotOfferedCard", "<HiddenWorkspacePage", "<HiddenInnovatorConsole", "<HiddenMentorTab", "<NotAvailableYet"];

  for (const f of HIDDEN_FEATURES) {
    for (const route of f.routes) {
      it(`${f.key}: ${route} resolves to a page.tsx that renders the card`, () => {
        // A prefix like `/es` covers `/es/tbr/[token]` and `/es/workspace/business-report`;
        // assert on every app route the prefix covers, and that there is at least one.
        const covered = ROUTES.filter((r) => isHiddenRoute(concrete(r.route)) && hiddenFeatureFor(concrete(r.route))?.key === f.key && (r.route === route || r.route.startsWith(`${route}/`) || concrete(r.route) === concrete(route) || concrete(r.route).startsWith(`${concrete(route)}/`)));
        expect(covered.length, `${route} has no page.tsx — hidden pages keep their route`).toBeGreaterThan(0);
        for (const r of covered) {
          expect(existsSync(r.file)).toBe(true);
          const src = readFileSync(r.file, "utf8");
          expect(CARD_MARKERS.some((m) => src.includes(m)), `${r.file} does not mount the not-offered card`).toBe(true);
          expect(src.includes(`feature="${f.key}"`) || src.includes(`"${f.key}"`) || src.includes("HiddenInnovatorConsole") || src.includes("HiddenMentorTab") || src.includes("NotAvailableYet"), `${r.file} carries the feature key`).toBe(true);
        }
      });
    }
  }

  it("matchRoute agrees: a concrete hidden path still routes to a page (no 404)", () => {
    for (const p of ["/workspace/weekly-digest", "/innovator/watchlist", "/es/tbr/abc", "/ja/workspace/business-report", "/submit", "/admin/tokens", "/reseller/mentor/abc/goals"]) {
      expect(matchRoute(ROUTES, p), p).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// G20 review (2026-09-20): a hidden route must never be linked from a live
// surface — six CTAs, a tour step and an insights article still pointed at
// hidden pages after F1. This greps every href literal in the trees that
// render to customers. The hidden pages themselves (they link their own
// path in the card) and the registry are the only allowed sources.
// ---------------------------------------------------------------------------
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const LINK_TREES = ["src/app", "src/components", "src/lib/product-tour", "src/lib/nav", "content/insights"];
const LINK_SKIP = [/\.test\.[tj]sx?$/, /\/hidden\.ts$/, /hidden-feature-page\.tsx$/, /not-offered-card\.tsx$/];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mdx?)$/.test(name)) out.push(p);
  }
}

describe("no live surface links a hidden route", () => {
  it("every href literal under app/components/tours/nav/insights avoids hiddenRoutes()", () => {
    const routes = hiddenRoutes().map((r) => r.replace(/\/\*$/, ""));
    const files: string[] = [];
    for (const tree of LINK_TREES) {
      try {
        walk(join(ROOT, tree), files);
      } catch {
        /* tree absent in this checkout */
      }
    }
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (LINK_SKIP.some((re) => re.test(rel))) continue;
      const src = readFileSync(file, "utf8");
      // Catalogues that filter themselves through the registry may keep the
      // rows (they never render): nav-groups, admin layout, feature tours.
      if (/\b(isHiddenRoute|withoutHidden)\b/.test(src)) continue;
      // the hidden pages render their own path in the card — skip files whose
      // own route is hidden
      const ownRoute = rel.startsWith("src/app/") ? "/" + rel.replace(/^src\/app\//, "").replace(/\/page\.tsx$/, "").replace(/\([^)]+\)\//g, "") : null;
      if (ownRoute && routes.some((r) => ownRoute === r || ownRoute.startsWith(`${r}/`))) continue;
      for (const m of src.matchAll(/href[=:]\s*[{"'`]+\s*"?([^"'`}\s)]+)/g)) {
        const href = m[1].split("?")[0].split("#")[0];
        if (routes.some((r) => href === r || href.startsWith(`${r}/`))) hits.push(`${rel}: ${m[1]}`);
      }
      for (const m of src.matchAll(/\]\((\/[^)\s]+)\)/g)) {
        const href = m[1].split("?")[0].split("#")[0];
        if (routes.some((r) => href === r || href.startsWith(`${r}/`))) hits.push(`${rel}: ${m[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
