// Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P2
// gap ("IBISWorld link-out surface"). Pure helpers exercised without
// touching the network — the underlying seed lives in au-market-lookup.ts.

import { describe, it, expect } from "vitest";
import {
  extractIbisworldReportId,
  findIbisworldDeeplinks,
  IBISWORLD_DEEPLINKS_DISCLAIMER,
  IBISWORLD_INDEX_URL,
  listAllIbisworldDeeplinks,
} from "./ibisworld-deeplinks";

describe("listAllIbisworldDeeplinks", () => {
  it("returns a non-empty set and every entry carries an ibisworld.com URL", () => {
    const all = listAllIbisworldDeeplinks();
    expect(all.length).toBeGreaterThan(0);
    for (const link of all) {
      expect(link.ibisworldUrl).toMatch(/^https:\/\/www\.ibisworld\.com\/au\/industry\//);
      expect(link.reportTitle.trim().length).toBeGreaterThan(0);
      expect(link.publishedYear).toBeGreaterThanOrEqual(2020);
      expect(link.anzsicCode).toMatch(/^[A-Z]\d{4}$/);
      expect(link.divisionLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("findIbisworldDeeplinks", () => {
  it("finds fintech deep-links via keyword and orders freshest first at same score", () => {
    const result = findIbisworldDeeplinks({ sector: "fintech" });
    expect(result.sector).toBe("fintech");
    expect(result.count).toBeGreaterThan(0);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThanOrEqual(5);
    // Every returned link must actually be an IBISWorld URL.
    for (const link of result.matches) {
      expect(link.ibisworldUrl).toMatch(/ibisworld\.com/);
    }
    // Same-score matches sort by publishedYear DESC.
    for (let i = 1; i < result.matches.length; i += 1) {
      expect(result.matches[i - 1].publishedYear).toBeGreaterThanOrEqual(
        result.matches[i].publishedYear,
      );
    }
  });

  it("resolves ANZSIC code exactly (case + whitespace insensitive)", () => {
    const canonical = findIbisworldDeeplinks({ anzsicCode: "J5810" });
    const messy = findIbisworldDeeplinks({ anzsicCode: "  j 5810  " });
    expect(canonical.count).toBeGreaterThan(0);
    expect(messy.count).toBe(canonical.count);
    expect(messy.anzsicCode).toBe("J5810");
    for (const link of canonical.matches) {
      expect(link.anzsicCode).toBe("J5810");
    }
  });

  it("normalises sector casing + whitespace and returns stable shape", () => {
    const a = findIbisworldDeeplinks({ sector: "SaaS" });
    const b = findIbisworldDeeplinks({ sector: "  saas  " });
    expect(a.sector).toBe("saas");
    expect(b.sector).toBe("saas");
    expect(a.count).toBe(b.count);
  });

  it("honours the limit parameter (matches capped, count reflects full total)", () => {
    const all = findIbisworldDeeplinks({ sector: "software", limit: 100 });
    const capped = findIbisworldDeeplinks({ sector: "software", limit: 1 });
    expect(capped.count).toBe(all.count);
    expect(capped.matches.length).toBeLessThanOrEqual(1);
  });

  it("unknown sector returns stable zero-payload shape", () => {
    const r = findIbisworldDeeplinks({ sector: "definitely-not-a-real-vertical-xyz" });
    expect(r.count).toBe(0);
    expect(r.matches).toEqual([]);
    expect(r.disclaimer).toBe(IBISWORLD_DEEPLINKS_DISCLAIMER);
    expect(r.index_url).toBe(IBISWORLD_INDEX_URL);
  });

  it("unknown ANZSIC code returns stable zero-payload shape", () => {
    const r = findIbisworldDeeplinks({ anzsicCode: "Z9999" });
    expect(r.count).toBe(0);
    expect(r.matches).toEqual([]);
    expect(r.anzsicCode).toBe("Z9999");
  });

  it("empty sector + empty anzsic returns empty matches (no accidental firehose)", () => {
    const r = findIbisworldDeeplinks({});
    expect(r.count).toBe(0);
    expect(r.matches).toEqual([]);
    expect(r.disclaimer).toBe(IBISWORLD_DEEPLINKS_DISCLAIMER);
  });
});

describe("extractIbisworldReportId", () => {
  it("parses the numeric report id from a canonical AU industry URL", () => {
    expect(
      extractIbisworldReportId("https://www.ibisworld.com/au/industry/software-publishing/1979/"),
    ).toBe("1979");
    expect(
      extractIbisworldReportId(
        "https://www.ibisworld.com/au/industry/financial-technology-services/5568/",
      ),
    ).toBe("5568");
  });

  it("returns null for URLs from other publishers", () => {
    expect(extractIbisworldReportId("https://www.abs.gov.au/statistics/industry/")).toBeNull();
    expect(extractIbisworldReportId("https://business.gov.au/grants/")).toBeNull();
  });

  it("returns null for malformed / non-URL inputs", () => {
    expect(extractIbisworldReportId("")).toBeNull();
    expect(extractIbisworldReportId("not a url")).toBeNull();
    expect(extractIbisworldReportId("https://www.ibisworld.com/au/")).toBeNull();
    expect(extractIbisworldReportId("https://www.ibisworld.com/au/industry/only-slug/")).toBeNull();
  });
});

describe("IBISWORLD_DEEPLINKS_DISCLAIMER", () => {
  it("is non-empty and cites the s766B Corps Act boundary", () => {
    expect(IBISWORLD_DEEPLINKS_DISCLAIMER.length).toBeGreaterThan(80);
    expect(IBISWORLD_DEEPLINKS_DISCLAIMER).toContain("s766B");
    expect(IBISWORLD_DEEPLINKS_DISCLAIMER).toContain("Corporations Act 2001");
    // Founder needs to know the link resolves to a paywalled resource.
    expect(IBISWORLD_DEEPLINKS_DISCLAIMER.toLowerCase()).toContain("paywalled");
  });
});
