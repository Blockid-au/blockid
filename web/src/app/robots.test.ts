/**
 * Colocated tests for `src/app/robots.ts` — the Next.js MetadataRoute.Robots
 * generator that emits `/robots.txt`. Previously untested despite being a
 * blast-radius-1 file: any accidental widening of the disallow list would
 * silently deindex a marketing surface (D3 explicitly pins `/id/[slug]` as
 * public-by-default), and any accidental drop from the disallow list would
 * expose /dashboard, /checkout, or /admin to indexers. These tests pin the
 * exact allow/disallow membership + ordering + sitemap URL contract from the
 * module's own header, so a copy-paste edit in a future SEO pass cannot
 * regress either direction without a red gate.
 */

import { describe, expect, it } from "vitest";

import robots from "./robots";

const SITE_URL = "https://blockid.au";

const ALLOW_EXPECTED = [
  "/",
  "/score",
  "/index",
  "/solutions/",
  "/business-id",
  "/id/",
  "/insights",
  "/insights/",
  "/sample-business-report",
];
const DISALLOW_EXPECTED = [
  "/api/",
  "/workspace/",
  "/tbr/",
  "/vi/tbr/",
  "/es/tbr/",
  "/ja/tbr/",
  "/vi/workspace/",
  "/es/workspace/",
  "/ja/workspace/",
  "/dashboard",
  "/dashboard/",
  "/checkout",
  "/checkout/",
  "/admin",
  "/admin/",
];

function firstRule() {
  const out = robots();
  const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
  return rules[0] as { userAgent: string; allow: string[]; disallow: string[] };
}

describe("robots() — shape", () => {
  it("returns an object with `rules` and `sitemap`", () => {
    const out = robots();
    expect(out).toHaveProperty("rules");
    expect(out).toHaveProperty("sitemap");
  });

  it("exposes exactly one rule group (single userAgent policy)", () => {
    const out = robots();
    const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
    expect(rules).toHaveLength(1);
  });

  it("targets all crawlers via userAgent '*'", () => {
    expect(firstRule().userAgent).toBe("*");
  });

  it("is deterministic — two calls return structurally equal output", () => {
    expect(robots()).toEqual(robots());
  });

  it("does not share the same allow array instance between calls (each call is fresh)", () => {
    const a = firstRule().allow;
    const b = firstRule().allow;
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("robots() — allow list", () => {
  it("allows exactly the whitelisted marketing surfaces (order + membership)", () => {
    expect(firstRule().allow).toEqual(ALLOW_EXPECTED);
  });

  it("allows the site root '/' as the first entry", () => {
    expect(firstRule().allow[0]).toBe("/");
  });

  it("allows the /solutions/ folder (Master Upgrade Plan §7.5)", () => {
    expect(firstRule().allow).toContain("/solutions/");
  });

  it("allows /business-id (public marketing surface)", () => {
    expect(firstRule().allow).toContain("/business-id");
  });

  it("allows /id/ (D3 — public-by-default indexable slug surface)", () => {
    expect(firstRule().allow).toContain("/id/");
  });

  it("every allow entry is a non-empty absolute path starting with '/'", () => {
    for (const path of firstRule().allow) {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
      expect(path.startsWith("/")).toBe(true);
    }
  });
});

describe("robots() — disallow list", () => {
  it("disallows exactly the app surfaces that must never index (order + membership)", () => {
    expect(firstRule().disallow).toEqual(DISALLOW_EXPECTED);
  });

  it("disallows both bare and trailing-slash variants of /dashboard", () => {
    const dis = firstRule().disallow;
    expect(dis).toContain("/dashboard");
    expect(dis).toContain("/dashboard/");
  });

  it("disallows both bare and trailing-slash variants of /checkout", () => {
    const dis = firstRule().disallow;
    expect(dis).toContain("/checkout");
    expect(dis).toContain("/checkout/");
  });

  it("disallows both bare and trailing-slash variants of /admin", () => {
    const dis = firstRule().disallow;
    expect(dis).toContain("/admin");
    expect(dis).toContain("/admin/");
  });

  it("every disallow entry is a non-empty absolute path starting with '/'", () => {
    for (const path of firstRule().disallow) {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
      expect(path.startsWith("/")).toBe(true);
    }
  });
});

describe("robots() — allow/disallow separation", () => {
  it("no path appears in both allow and disallow (rule ambiguity guard)", () => {
    const { allow, disallow } = firstRule();
    const overlap = allow.filter((p) => disallow.includes(p));
    expect(overlap).toEqual([]);
  });

  it("does not accidentally disallow the whitelisted marketing surfaces", () => {
    const dis = firstRule().disallow;
    for (const allowed of ALLOW_EXPECTED) {
      expect(dis).not.toContain(allowed);
    }
  });

  it("does not accidentally allow the app surfaces (no /dashboard, /checkout, /admin in allow)", () => {
    const allow = firstRule().allow;
    for (const blocked of DISALLOW_EXPECTED) {
      expect(allow).not.toContain(blocked);
    }
  });
});

describe("robots() — sitemap", () => {
  it("points at the canonical https sitemap URL", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("uses an https absolute URL (no http, no protocol-relative, no relative path)", () => {
    const sitemap = robots().sitemap as string;
    expect(typeof sitemap).toBe("string");
    expect(sitemap.startsWith("https://")).toBe(true);
    expect(sitemap.startsWith("http://")).toBe(false);
  });

  it("hosts the sitemap on blockid.au and ends with /sitemap.xml", () => {
    const sitemap = robots().sitemap as string;
    const url = new URL(sitemap);
    expect(url.host).toBe("blockid.au");
    expect(url.pathname).toBe("/sitemap.xml");
  });
});
