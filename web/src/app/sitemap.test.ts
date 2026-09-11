// Pins the static funding URLs in the sitemap — in particular the public
// sample report /funding/report/demo (S7-B), which is the one funding page
// that must be discoverable without a DB row behind it. Every data source
// is mocked; the test never touches disk content or Supabase.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insights", () => ({ getAllArticles: () => [], invalidateCache: () => {} }));
vi.mock("@/lib/business-id/list-public-slugs", () => ({ listPublicSlugsForSitemap: async () => [] }));
vi.mock("@/lib/listings/listings-db", () => ({ getPublicListings: async () => [] }));
vi.mock("@/lib/publish/store", () => ({ listPublishedForSitemap: async () => [] }));
vi.mock("@/lib/funding/data", () => ({ listGrants: async () => [], listPrograms: async () => [] }));

describe("sitemap — funding surfaces", () => {
  it("lists /funding, the free directories and the public sample report", async () => {
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of ["/funding", "/funding/grants", "/funding/programs", "/funding/report/demo"]) {
      expect(urls, path).toContain(`https://blockid.au${path}`);
    }
    // The paid report is per-viewer and noindex — never enumerated.
    expect(urls.some((u) => /\/funding\/report\/(?!demo$)/.test(u))).toBe(false);
  });
});
