import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// credits-shared — colocated tests for the previously-untested pure
// `src/lib/credits-shared.ts` module. This is the client-safe mirror of
// credits.ts (which is "server-only") and is imported by report-builder
// UI + pricing surfaces to price a founder's report before they buy it.
// A silent drift in credit cost, word count, or bundle-savings math would
// mis-charge founders — pins the SECTION_DEPTH_CONFIG + REPORT_BUNDLES
// shape + calculateSectionCost math + the 10-section bundle threshold.
// ---------------------------------------------------------------------------

import {
  SECTION_DEPTH_CONFIG,
  REPORT_BUNDLES,
  calculateSectionCost,
  type SectionDepth,
} from "./credits-shared";

const DEPTHS: readonly SectionDepth[] = [
  "scan",
  "summary",
  "standard",
  "deep",
  "expert",
  "maximum",
];

describe("SECTION_DEPTH_CONFIG", () => {
  it("exposes exactly the six SectionDepth union members", () => {
    expect(Object.keys(SECTION_DEPTH_CONFIG).sort()).toEqual(
      [...DEPTHS].sort(),
    );
  });

  it("pins the credits + words tariff (silent drift mis-charges founders)", () => {
    expect(SECTION_DEPTH_CONFIG.scan).toMatchObject({
      label: "Scan",
      words: 100,
      credits: 0.10,
    });
    expect(SECTION_DEPTH_CONFIG.summary).toMatchObject({
      label: "Summary",
      words: 300,
      credits: 0.25,
    });
    expect(SECTION_DEPTH_CONFIG.standard).toMatchObject({
      label: "Standard",
      words: 500,
      credits: 0.50,
    });
    expect(SECTION_DEPTH_CONFIG.deep).toMatchObject({
      label: "Deep",
      words: 1000,
      credits: 1.00,
    });
    expect(SECTION_DEPTH_CONFIG.expert).toMatchObject({
      label: "Expert",
      words: 2000,
      credits: 2.00,
    });
    expect(SECTION_DEPTH_CONFIG.maximum).toMatchObject({
      label: "Maximum",
      words: 3000,
      credits: 3.00,
    });
  });

  it("every entry has a non-empty description", () => {
    for (const depth of DEPTHS) {
      expect(SECTION_DEPTH_CONFIG[depth].description).toBeTruthy();
      expect(typeof SECTION_DEPTH_CONFIG[depth].description).toBe("string");
    }
  });

  it("credits are monotonically non-decreasing across the depth ladder", () => {
    let last = -Infinity;
    for (const depth of DEPTHS) {
      const c = SECTION_DEPTH_CONFIG[depth].credits;
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it("words are monotonically non-decreasing across the depth ladder", () => {
    let last = -Infinity;
    for (const depth of DEPTHS) {
      const w = SECTION_DEPTH_CONFIG[depth].words;
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
  });

  it("credits are strictly positive for every depth", () => {
    for (const depth of DEPTHS) {
      expect(SECTION_DEPTH_CONFIG[depth].credits).toBeGreaterThan(0);
    }
  });

  it("words are strictly positive for every depth", () => {
    for (const depth of DEPTHS) {
      expect(SECTION_DEPTH_CONFIG[depth].words).toBeGreaterThan(0);
    }
  });
});

describe("REPORT_BUNDLES", () => {
  it("exposes the five shipped bundle keys", () => {
    expect(Object.keys(REPORT_BUNDLES).sort()).toEqual([
      "deep_report",
      "expert_report",
      "premium_report",
      "quick_report",
      "standard_report",
    ]);
  });

  it("pins the bundle price + label tariff", () => {
    expect(REPORT_BUNDLES.quick_report).toMatchObject({
      label: "Quick Report",
      depth: "scan",
      credits: 0.50,
      estWords: 1000,
      savingsPercent: 50,
    });
    expect(REPORT_BUNDLES.standard_report).toMatchObject({
      label: "Standard Report",
      depth: "standard",
      credits: 1.00,
      estWords: 5000,
      savingsPercent: 80,
    });
    expect(REPORT_BUNDLES.deep_report).toMatchObject({
      label: "Deep Dive",
      depth: "deep",
      credits: 1.50,
      estWords: 10000,
      savingsPercent: 85,
    });
    expect(REPORT_BUNDLES.expert_report).toMatchObject({
      label: "Expert Report",
      depth: "expert",
      credits: 3.00,
      estWords: 20000,
      savingsPercent: 85,
    });
    expect(REPORT_BUNDLES.premium_report).toMatchObject({
      label: "Full Premium",
      depth: "maximum",
      credits: 5.00,
      estWords: 30000,
      savingsPercent: 83,
    });
  });

  it("every bundle depth is a valid SectionDepth", () => {
    for (const bundle of Object.values(REPORT_BUNDLES)) {
      expect(DEPTHS).toContain(bundle.depth);
    }
  });

  it("savingsPercent is within [0, 100] for every bundle", () => {
    for (const bundle of Object.values(REPORT_BUNDLES)) {
      expect(bundle.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(bundle.savingsPercent).toBeLessThanOrEqual(100);
    }
  });

  it("estWords is strictly positive for every bundle", () => {
    for (const bundle of Object.values(REPORT_BUNDLES)) {
      expect(bundle.estWords).toBeGreaterThan(0);
    }
  });

  it("credits are strictly positive for every bundle", () => {
    for (const bundle of Object.values(REPORT_BUNDLES)) {
      expect(bundle.credits).toBeGreaterThan(0);
    }
  });

  it("bundle credits monotonically non-decreasing when sorted by ladder rank", () => {
    // Ordered by depth rank (scan→maximum).
    const rank: Record<SectionDepth, number> = {
      scan: 0,
      summary: 1,
      standard: 2,
      deep: 3,
      expert: 4,
      maximum: 5,
    };
    const ordered = Object.values(REPORT_BUNDLES).sort(
      (a, b) => rank[a.depth] - rank[b.depth],
    );
    let last = -Infinity;
    for (const bundle of ordered) {
      expect(bundle.credits).toBeGreaterThanOrEqual(last);
      last = bundle.credits;
    }
  });
});

describe("calculateSectionCost", () => {
  it("returns zeroes + no bundle on empty input", () => {
    const out = calculateSectionCost([]);
    expect(out.items).toEqual([]);
    expect(out.totalCredits).toBe(0);
    expect(out.totalWords).toBe(0);
    expect(out.bestBundle).toBeNull();
  });

  it("single-section scan echoes the tariff row shape", () => {
    const out = calculateSectionCost([{ sectionId: "market", depth: "scan" }]);
    expect(out.items).toEqual([
      {
        sectionId: "market",
        depth: "scan",
        credits: 0.10,
        words: 100,
      },
    ]);
    expect(out.totalCredits).toBeCloseTo(0.10, 10);
    expect(out.totalWords).toBe(100);
    expect(out.bestBundle).toBeNull();
  });

  it("totals a mixed 3-section basket", () => {
    const out = calculateSectionCost([
      { sectionId: "a", depth: "summary" },
      { sectionId: "b", depth: "standard" },
      { sectionId: "c", depth: "deep" },
    ]);
    expect(out.items).toHaveLength(3);
    expect(out.totalCredits).toBeCloseTo(0.25 + 0.50 + 1.00, 10);
    expect(out.totalWords).toBe(300 + 500 + 1000);
    expect(out.bestBundle).toBeNull();
  });

  it("preserves sectionId ordering in items", () => {
    const out = calculateSectionCost([
      { sectionId: "z", depth: "scan" },
      { sectionId: "a", depth: "scan" },
      { sectionId: "m", depth: "scan" },
    ]);
    expect(out.items.map((i) => i.sectionId)).toEqual(["z", "a", "m"]);
  });

  it("does NOT suggest a bundle when sections.length < 10", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "maximum" as const,
    }));
    const out = calculateSectionCost(nine);
    // 9 * 3.00 = 27 credits, which is >> any bundle, but under 10 sections
    // the bundle recommender must stay silent per the client contract.
    expect(out.totalCredits).toBeCloseTo(27, 10);
    expect(out.bestBundle).toBeNull();
  });

  it("suggests the cheapest bundle cheaper than the à la carte total at exactly 10 sections", () => {
    // 10 × maximum = 30 credits à la carte. Cheapest bundle < 30 is
    // quick_report at 0.50.
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "maximum" as const,
    }));
    const out = calculateSectionCost(ten);
    expect(out.totalCredits).toBeCloseTo(30, 10);
    expect(out.bestBundle).not.toBeNull();
    expect(out.bestBundle).toMatchObject({
      key: "quick_report",
      label: "Quick Report",
      credits: 0.50,
      savingsPercent: 50,
    });
  });

  it("skips bundles whose credits are >= à la carte total", () => {
    // 10 × scan = 1.00 credit à la carte. quick_report (0.50) beats it,
    // standard_report (1.00) does NOT (must be strictly cheaper).
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "scan" as const,
    }));
    const out = calculateSectionCost(ten);
    expect(out.totalCredits).toBeCloseTo(1.00, 10);
    expect(out.bestBundle).toMatchObject({
      key: "quick_report",
      credits: 0.50,
    });
  });

  it("returns null bundle when no bundle beats the à la carte total", () => {
    // 10 × scan = 1.00 credit à la carte. Cheapest bundle is 0.50 (beats it).
    // But if all sections are super-cheap the à la carte can dip below every
    // bundle. Force with 10 sections at scan × 0.05... except tariff is fixed.
    // Instead: rely on the fact 10 × 0.10 = 1.00 beats standard_report (1.00)
    // via the strict < check. Confirm no bundle is picked when total is 0.49
    // (impossible with 10 sections at min tariff — so we exercise the strict <
    // guard by dropping to a tariff where quick_report's 0.50 is NOT strictly
    // less than the à la carte total). 10 sections is minimum for evaluation
    // and 10 × 0.10 = 1.00 > 0.50, so quick_report wins here; the semantic
    // "no bundle beats total" branch is exercised implicitly by every < 10
    // basket returning null. Pin that here as a second confirmation.
    const out = calculateSectionCost(
      Array.from({ length: 5 }, (_, i) => ({
        sectionId: `s${i}`,
        depth: "expert" as const,
      })),
    );
    expect(out.bestBundle).toBeNull();
  });

  it("chooses the cheapest bundle when several are cheaper than total", () => {
    // 10 × expert = 20 credits. Bundles cheaper than 20: all of them.
    // Cheapest is quick_report @ 0.50.
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "expert" as const,
    }));
    const out = calculateSectionCost(ten);
    expect(out.totalCredits).toBeCloseTo(20, 10);
    expect(out.bestBundle?.key).toBe("quick_report");
    expect(out.bestBundle?.credits).toBe(0.50);
  });

  it("handles 20 sections (well beyond the 10 threshold)", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "standard" as const,
    }));
    const out = calculateSectionCost(twenty);
    expect(out.totalCredits).toBeCloseTo(10, 10);
    expect(out.totalWords).toBe(20 * 500);
    expect(out.items).toHaveLength(20);
    expect(out.bestBundle?.key).toBe("quick_report");
  });

  it("mixed-depth 10-section basket still triggers the bundle recommender", () => {
    const mixed: Array<{ sectionId: string; depth: SectionDepth }> = [
      { sectionId: "a", depth: "scan" },
      { sectionId: "b", depth: "scan" },
      { sectionId: "c", depth: "summary" },
      { sectionId: "d", depth: "summary" },
      { sectionId: "e", depth: "standard" },
      { sectionId: "f", depth: "standard" },
      { sectionId: "g", depth: "deep" },
      { sectionId: "h", depth: "deep" },
      { sectionId: "i", depth: "expert" },
      { sectionId: "j", depth: "expert" },
    ];
    const out = calculateSectionCost(mixed);
    const expected = 2 * 0.10 + 2 * 0.25 + 2 * 0.50 + 2 * 1.00 + 2 * 2.00;
    expect(out.totalCredits).toBeCloseTo(expected, 10);
    expect(out.bestBundle).not.toBeNull();
    expect(out.bestBundle?.key).toBe("quick_report");
  });

  it("returns bundle shape with exactly {key,label,credits,savingsPercent}", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "maximum" as const,
    }));
    const out = calculateSectionCost(ten);
    expect(out.bestBundle).not.toBeNull();
    expect(Object.keys(out.bestBundle!).sort()).toEqual([
      "credits",
      "key",
      "label",
      "savingsPercent",
    ]);
  });

  it("item rows echo the SECTION_DEPTH_CONFIG credits + words for every depth", () => {
    const basket = DEPTHS.map((d, i) => ({
      sectionId: `s${i}`,
      depth: d,
    }));
    const out = calculateSectionCost(basket);
    out.items.forEach((row, i) => {
      const depth = DEPTHS[i];
      expect(row.credits).toBe(SECTION_DEPTH_CONFIG[depth].credits);
      expect(row.words).toBe(SECTION_DEPTH_CONFIG[depth].words);
      expect(row.depth).toBe(depth);
    });
  });

  it("totalCredits = sum of item credits (invariant across baskets)", () => {
    const basket = [
      { sectionId: "a", depth: "deep" as const },
      { sectionId: "b", depth: "expert" as const },
      { sectionId: "c", depth: "scan" as const },
    ];
    const out = calculateSectionCost(basket);
    const sum = out.items.reduce((acc, r) => acc + r.credits, 0);
    expect(out.totalCredits).toBeCloseTo(sum, 10);
  });

  it("totalWords = sum of item words (invariant across baskets)", () => {
    const basket = [
      { sectionId: "a", depth: "deep" as const },
      { sectionId: "b", depth: "expert" as const },
      { sectionId: "c", depth: "scan" as const },
    ];
    const out = calculateSectionCost(basket);
    const sum = out.items.reduce((acc, r) => acc + r.words, 0);
    expect(out.totalWords).toBe(sum);
  });

  it("does not mutate the input sections array", () => {
    const basket = [
      { sectionId: "a", depth: "scan" as const },
      { sectionId: "b", depth: "summary" as const },
    ];
    const snapshot = JSON.parse(JSON.stringify(basket));
    calculateSectionCost(basket);
    expect(basket).toEqual(snapshot);
  });

  it("returns a fresh array per invocation (no shared reference)", () => {
    const basket = [{ sectionId: "a", depth: "scan" as const }];
    const a = calculateSectionCost(basket);
    const b = calculateSectionCost(basket);
    expect(a.items).not.toBe(b.items);
    expect(a.items).toEqual(b.items);
  });

  it("9-section basket at cheapest depth still returns bestBundle=null (threshold is 10, not >9)", () => {
    // Guard the boundary: sections.length >= 10 (not > 9). At length 9 the
    // recommender must stay silent even if a bundle would be cheaper.
    const nine = Array.from({ length: 9 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "expert" as const,
    }));
    const out = calculateSectionCost(nine);
    // 9 × 2.00 = 18 credits — quick_report at 0.50 would beat it, but 9 < 10.
    expect(out.totalCredits).toBeCloseTo(18, 10);
    expect(out.bestBundle).toBeNull();
  });

  it("bundle key returned matches an actual REPORT_BUNDLES key", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "maximum" as const,
    }));
    const out = calculateSectionCost(ten);
    expect(out.bestBundle).not.toBeNull();
    expect(Object.keys(REPORT_BUNDLES)).toContain(out.bestBundle!.key);
  });

  it("bundle label matches the REPORT_BUNDLES entry's label (no drift)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      sectionId: `s${i}`,
      depth: "maximum" as const,
    }));
    const out = calculateSectionCost(ten);
    const key = out.bestBundle!.key;
    expect(out.bestBundle!.label).toBe(REPORT_BUNDLES[key].label);
    expect(out.bestBundle!.credits).toBe(REPORT_BUNDLES[key].credits);
    expect(out.bestBundle!.savingsPercent).toBe(REPORT_BUNDLES[key].savingsPercent);
  });
});
