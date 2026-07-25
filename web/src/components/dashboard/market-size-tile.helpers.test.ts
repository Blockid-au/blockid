// Pure helper tests for <MarketSizeTile />.
//
// The tile itself is an RSC that projects the estimateTamSamSom() result
// into static markup, so branch coverage lives on these helpers.

import { describe, it, expect } from "vitest";
import {
  formatAudCompact,
  formatBusinessCount,
  formatCagrPct,
  formatFractionPct,
  normaliseIndustryKeyword,
  pickPrimarySource,
  sortIbisworldDeeplinksForTile,
} from "./market-size-tile.helpers";
import type { AuIndustrySnapshot } from "@/lib/market/au-market-lookup";
import type { IbisworldDeeplink } from "@/lib/market/ibisworld-deeplinks";

const seed: AuIndustrySnapshot = {
  anzsicCode: "J5810",
  division: "J",
  label: "Software Publishing (SaaS)",
  keywords: ["saas", "software"],
  tamAud: 6_500_000_000,
  cagr: 0.108,
  businessCount: 8_400,
  sources: [
    {
      publisher: "IBISWorld",
      title: "Software Publishing in Australia",
      url: "https://www.ibisworld.com/au/industry/software-publishing/1979/",
      publishedYear: 2025,
    },
    {
      publisher: "ABS",
      title: "8155.0 Australian Industry",
      url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release",
      publishedYear: 2024,
    },
  ],
  notes: "SaaS anchor",
};

describe("formatAudCompact", () => {
  it("collapses null / undefined / NaN / infinity to em-dash", () => {
    expect(formatAudCompact(null)).toBe("—");
    expect(formatAudCompact(undefined)).toBe("—");
    expect(formatAudCompact(Number.NaN)).toBe("—");
    expect(formatAudCompact(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("renders billions with one-digit precision", () => {
    expect(formatAudCompact(6_500_000_000)).toBe("A$6.5B");
    expect(formatAudCompact(68_000_000_000)).toBe("A$68.0B");
  });

  it("renders millions as whole A$M", () => {
    expect(formatAudCompact(400_000_000)).toBe("A$400M");
    expect(formatAudCompact(1_000_000)).toBe("A$1M");
  });

  it("renders sub-A$M values as A$k or raw integers", () => {
    expect(formatAudCompact(50_000)).toBe("A$50k");
    expect(formatAudCompact(950)).toBe("A$950");
    expect(formatAudCompact(0)).toBe("A$0");
  });
});

describe("formatCagrPct", () => {
  it("null / non-finite → em-dash", () => {
    expect(formatCagrPct(null)).toBe("—");
    expect(formatCagrPct(undefined)).toBe("—");
    expect(formatCagrPct(Number.NaN)).toBe("—");
  });

  it("renders decimal fraction as one-decimal percent", () => {
    expect(formatCagrPct(0.108)).toBe("10.8%");
    expect(formatCagrPct(0.058)).toBe("5.8%");
    expect(formatCagrPct(0)).toBe("0.0%");
  });
});

describe("formatBusinessCount", () => {
  it("null / non-finite → em-dash", () => {
    expect(formatBusinessCount(null)).toBe("—");
    expect(formatBusinessCount(Number.NaN)).toBe("—");
  });

  it("thousands-separates AU locale", () => {
    // en-AU uses "," as the thousands separator (matches en-US here).
    expect(formatBusinessCount(8_400)).toBe("8,400");
    expect(formatBusinessCount(24_600)).toBe("24,600");
    expect(formatBusinessCount(0)).toBe("0");
  });

  it("rounds decimals to whole businesses", () => {
    expect(formatBusinessCount(1234.7)).toBe("1,235");
  });
});

describe("formatFractionPct", () => {
  it("null / non-finite → em-dash", () => {
    expect(formatFractionPct(null)).toBe("—");
    expect(formatFractionPct(Number.NaN)).toBe("—");
  });

  it("renders whole-percent for 0..1 fractions", () => {
    expect(formatFractionPct(0.2)).toBe("20%");
    expect(formatFractionPct(0.01)).toBe("1%");
    expect(formatFractionPct(1)).toBe("100%");
    expect(formatFractionPct(0)).toBe("0%");
  });

  it("clamps overshoot / undershoot", () => {
    expect(formatFractionPct(5)).toBe("100%");
    expect(formatFractionPct(-2)).toBe("0%");
  });
});

describe("normaliseIndustryKeyword", () => {
  it("returns null for blank / null / undefined", () => {
    expect(normaliseIndustryKeyword(null)).toBeNull();
    expect(normaliseIndustryKeyword(undefined)).toBeNull();
    expect(normaliseIndustryKeyword("")).toBeNull();
    expect(normaliseIndustryKeyword("   ")).toBeNull();
  });

  it("lowercases and trims", () => {
    expect(normaliseIndustryKeyword("  SaaS  ")).toBe("saas");
    expect(normaliseIndustryKeyword("FinTech")).toBe("fintech");
  });
});

describe("pickPrimarySource", () => {
  it("prefers ABS over IBISWorld when both present", () => {
    const pick = pickPrimarySource(seed);
    expect(pick?.url).toContain("abs.gov.au");
    expect(pick?.label).toMatch(/^ABS · /);
  });

  it("falls back to IBISWorld when no ABS source", () => {
    const ibisOnly: AuIndustrySnapshot = {
      ...seed,
      sources: [seed.sources[0]],
    };
    const pick = pickPrimarySource(ibisOnly);
    expect(pick?.url).toContain("ibisworld.com");
    expect(pick?.label).toMatch(/^IBISWorld · /);
  });

  it("falls back to first source when neither ABS nor IBISWorld present", () => {
    const rbaOnly: AuIndustrySnapshot = {
      ...seed,
      sources: [
        {
          publisher: "RBA",
          title: "Payments System Board 2024",
          url: "https://www.rba.gov.au/psb",
          publishedYear: 2024,
        },
      ],
    };
    const pick = pickPrimarySource(rbaOnly);
    expect(pick?.url).toBe("https://www.rba.gov.au/psb");
    expect(pick?.label).toMatch(/^RBA · /);
  });

  it("returns null when no sources at all", () => {
    const bare: AuIndustrySnapshot = { ...seed, sources: [] };
    expect(pickPrimarySource(bare)).toBeNull();
  });
});

describe("sortIbisworldDeeplinksForTile", () => {
  const mk = (
    anzsicCode: string,
    publishedYear: number,
    reportTitle: string,
  ): IbisworldDeeplink => ({
    anzsicCode,
    division: "J",
    divisionLabel: "Information Media and Telecommunications",
    industryLabel: `${anzsicCode} industry`,
    keywords: [],
    ibisworldUrl: `https://www.ibisworld.com/au/industry/slug-${anzsicCode.toLowerCase()}/${publishedYear}/`,
    ibisworldReportId: String(publishedYear),
    reportTitle,
    publishedYear,
  });

  it("returns empty on empty input regardless of cap", () => {
    expect(sortIbisworldDeeplinksForTile([], 5)).toEqual([]);
    expect(sortIbisworldDeeplinksForTile([], 0)).toEqual([]);
  });

  it("returns empty when cap is zero, negative, or non-finite", () => {
    const links = [mk("J5810", 2025, "SaaS")];
    expect(sortIbisworldDeeplinksForTile(links, 0)).toEqual([]);
    expect(sortIbisworldDeeplinksForTile(links, -3)).toEqual([]);
    expect(sortIbisworldDeeplinksForTile(links, Number.NaN)).toEqual([]);
  });

  it("sorts by publishedYear desc and caps to the requested slice", () => {
    const links = [
      mk("J5810", 2024, "Older SaaS"),
      mk("K6419", 2026, "Fresh Fintech"),
      mk("Q8511", 2025, "Healthtech mid"),
    ];
    const out = sortIbisworldDeeplinksForTile(links, 2);
    expect(out.map((l) => l.reportTitle)).toEqual([
      "Fresh Fintech",
      "Healthtech mid",
    ]);
  });

  it("tie-breaks equal publishedYear by anzsicCode alphabetical", () => {
    const links = [
      mk("K6419", 2025, "K report"),
      mk("A0169", 2025, "A report"),
      mk("J5810", 2025, "J report"),
    ];
    const out = sortIbisworldDeeplinksForTile(links, 3);
    expect(out.map((l) => l.anzsicCode)).toEqual(["A0169", "J5810", "K6419"]);
  });

  it("does not mutate the input array", () => {
    const links = [
      mk("K6419", 2024, "old"),
      mk("J5810", 2026, "new"),
    ];
    const snapshot = links.map((l) => l.anzsicCode);
    sortIbisworldDeeplinksForTile(links, 2);
    expect(links.map((l) => l.anzsicCode)).toEqual(snapshot);
  });
});
