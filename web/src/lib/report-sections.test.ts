// P9-report-sections-lib-test — colocated coverage for the canonical
// report-section fixture that drives the paywall on the SCN report page.
// Every credit-cost surface (unlock buttons, "unlock all" discount CTA,
// section-picker cost estimator, tier-grouped nav) reads from the pure
// exports here, so silent drift (a renamed id, a tier reshuffle, a
// creditCost bump) leaks straight into billing UI. The tests pin:
//   - REPORT_SECTIONS shape + per-row invariants (tier / creditCost /
//     word counts / required prompt slots)
//   - getSection lookup (hit / miss / first-match on the known
//     duplicate "competitive" entry that the source retains for
//     back-compat)
//   - getSectionCost hit / miss / zero-cost tier behaviour
//   - getUnlockAllCost math: filters creditCost > 0, sums, applies
//     the 30% bulk discount, rounds to cents, computes savings, and
//     idempotently reflects an already-unlocked list
//   - estimateSections credit + word totals over known / unknown /
//     mixed / duplicate ids
//   - getSectionsByTier partition (all 4 tier buckets present, every
//     row placed in exactly one bucket, counts add up to fixture size)
//   - calculateReportCost per-tier fixture (preview / standard /
//     premium) — the outer pricing badge on /pricing reads this
//
// All under test are pure functions over a static fixture; no I/O,
// no mocks needed.

import { describe, expect, it } from "vitest";
import {
  REPORT_SECTIONS,
  getSection,
  getSectionCost,
  getUnlockAllCost,
  estimateSections,
  getSectionsByTier,
  calculateReportCost,
  type ReportSectionDef,
} from "./report-sections";

const TIERS = ["free", "included", "paid", "premium"] as const;
type Tier = (typeof TIERS)[number];

// ---------------------------------------------------------------------------
// REPORT_SECTIONS — fixture shape
// ---------------------------------------------------------------------------

describe("REPORT_SECTIONS fixture", () => {
  it("ships a non-empty array of section defs", () => {
    expect(Array.isArray(REPORT_SECTIONS)).toBe(true);
    expect(REPORT_SECTIONS.length).toBeGreaterThan(0);
  });

  it("pins the current section count so silent removals/additions surface", () => {
    // Locked to 28 rows (27 unique ids + one intentional duplicate
    // "competitive" retained for back-compat — see §13 comment in
    // report-sections.ts).
    expect(REPORT_SECTIONS.length).toBe(28);
  });

  it("every row carries the required string fields", () => {
    for (const s of REPORT_SECTIONS) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe("string");
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.subtitle).toBe("string");
      expect(typeof s.icon).toBe("string");
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  it("every row's tier is one of the 4 known enum values", () => {
    for (const s of REPORT_SECTIONS) {
      expect(TIERS).toContain(s.tier);
    }
  });

  it("every row has non-negative creditCost / summaryWords / fullWords", () => {
    for (const s of REPORT_SECTIONS) {
      expect(s.creditCost).toBeGreaterThanOrEqual(0);
      expect(s.summaryWords).toBeGreaterThanOrEqual(0);
      expect(s.fullWords).toBeGreaterThan(0); // full is always generated when unlocked
    }
  });

  it("every row's fullPrompt is a non-empty string", () => {
    for (const s of REPORT_SECTIONS) {
      expect(typeof s.fullPrompt).toBe("string");
      expect(s.fullPrompt.length).toBeGreaterThan(0);
    }
  });

  it("free/included rows carry a summaryPrompt (paid/premium may be blank)", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "free" || s.tier === "included") {
        expect(s.summaryPrompt.length).toBeGreaterThan(0);
      }
      // paid/premium: source uses "" for locked-summary rows — allowed.
      expect(typeof s.summaryPrompt).toBe("string");
    }
  });

  it("optional arrays (supportingAgents / criteriaKeys) are arrays when present", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.supportingAgents !== undefined) {
        expect(Array.isArray(s.supportingAgents)).toBe(true);
      }
      if (s.criteriaKeys !== undefined) {
        expect(Array.isArray(s.criteriaKeys)).toBe(true);
      }
    }
  });

  it("agentOwner (when present) is a lowercase-alphanumeric slug", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.agentOwner !== undefined) {
        expect(typeof s.agentOwner).toBe("string");
        expect(s.agentOwner).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it("free tier is used by exactly one section (the hook)", () => {
    const free = REPORT_SECTIONS.filter((s) => s.tier === "free");
    expect(free).toHaveLength(1);
    expect(free[0].id).toBe("hook_problem");
    expect(free[0].creditCost).toBe(0);
  });

  it("free-tier row never charges credits", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "free") {
        expect(s.creditCost).toBe(0);
      }
    }
  });

  it("paid tier rows always have creditCost > 0", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "paid") {
        expect(s.creditCost).toBeGreaterThan(0);
      }
    }
  });

  it("premium tier rows are the priciest (>= 1.0 credit)", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "premium") {
        expect(s.creditCost).toBeGreaterThanOrEqual(1.0);
      }
    }
  });

  it("paid/premium rows carry a zero summaryWords quota (summary is locked)", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "paid" || s.tier === "premium") {
        expect(s.summaryWords).toBe(0);
      }
    }
  });

  it("free/included rows publish a non-zero summaryWords quota", () => {
    for (const s of REPORT_SECTIONS) {
      if (s.tier === "free" || s.tier === "included") {
        expect(s.summaryWords).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Known-duplicate: "competitive" ships twice (retained for back-compat).
// If someone dedupes it, several tests below need updating.
// ---------------------------------------------------------------------------

describe("known-duplicate id: competitive", () => {
  it("appears exactly twice in the fixture (documented back-compat)", () => {
    const dupes = REPORT_SECTIONS.filter((s) => s.id === "competitive");
    expect(dupes).toHaveLength(2);
  });

  it("both entries are byte-for-byte identical on the pricing surface", () => {
    const [a, b] = REPORT_SECTIONS.filter((s) => s.id === "competitive");
    expect(a.tier).toBe(b.tier);
    expect(a.creditCost).toBe(b.creditCost);
    expect(a.fullWords).toBe(b.fullWords);
    expect(a.summaryWords).toBe(b.summaryWords);
    expect(a.title).toBe(b.title);
  });
});

// ---------------------------------------------------------------------------
// getSection
// ---------------------------------------------------------------------------

describe("getSection", () => {
  it("returns the section def for a known id", () => {
    const s = getSection("hook_problem");
    expect(s).toBeDefined();
    expect(s?.id).toBe("hook_problem");
    expect(s?.tier).toBe("free");
  });

  it("returns undefined for an unknown id", () => {
    expect(getSection("not_a_section")).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(getSection("")).toBeUndefined();
  });

  it("is case-sensitive (no accidental fuzzy match)", () => {
    expect(getSection("HOOK_PROBLEM")).toBeUndefined();
    expect(getSection("Hook_Problem")).toBeUndefined();
  });

  it("returns the first occurrence for the duplicated 'competitive' id", () => {
    const s = getSection("competitive");
    expect(s).toBeDefined();
    // The first "competitive" is at REPORT_SECTIONS index 6 (0-based)
    // per source ordering (SCN block, before the legacy-order block).
    const firstIdx = REPORT_SECTIONS.findIndex((x) => x.id === "competitive");
    expect(REPORT_SECTIONS.indexOf(s as ReportSectionDef)).toBe(firstIdx);
  });

  it("resolves every id that appears in the fixture (round-trip)", () => {
    for (const s of REPORT_SECTIONS) {
      const hit = getSection(s.id);
      expect(hit).toBeDefined();
      expect(hit?.id).toBe(s.id);
    }
  });
});

// ---------------------------------------------------------------------------
// getSectionCost
// ---------------------------------------------------------------------------

describe("getSectionCost", () => {
  it("returns creditCost for a known paid section", () => {
    expect(getSectionCost("market")).toBe(0.75);
  });

  it("returns creditCost for a known premium section", () => {
    expect(getSectionCost("board_summary")).toBe(1.0);
  });

  it("returns 0 for the free hook", () => {
    expect(getSectionCost("hook_problem")).toBe(0);
  });

  it("returns 0 for a zero-cost included section", () => {
    expect(getSectionCost("executive")).toBe(0);
  });

  it("returns 0 for an unknown id (no throw)", () => {
    expect(getSectionCost("does_not_exist")).toBe(0);
  });

  it("returns 0 for the empty string (no throw)", () => {
    expect(getSectionCost("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getUnlockAllCost
// ---------------------------------------------------------------------------

describe("getUnlockAllCost", () => {
  const sumNonZero = REPORT_SECTIONS
    .filter((s) => s.creditCost > 0)
    .reduce((sum, s) => sum + s.creditCost, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it("with no already-unlocked, totals every creditCost > 0 row", () => {
    const r = getUnlockAllCost([]);
    expect(r.total).toBeCloseTo(sumNonZero, 10);
    // Pinned expected total so silent creditCost drift surfaces here.
    expect(r.total).toBe(14.5);
  });

  it("applies a 30% bulk discount rounded to cents", () => {
    const r = getUnlockAllCost([]);
    expect(r.discounted).toBe(round2(sumNonZero * 0.7));
    expect(r.discounted).toBe(10.15);
  });

  it("savings = total - discounted, rounded to cents", () => {
    const r = getUnlockAllCost([]);
    expect(r.savings).toBe(round2(sumNonZero - r.discounted));
    expect(r.savings).toBe(4.35);
  });

  it("lists every non-free section in the sections array", () => {
    const r = getUnlockAllCost([]);
    const paidRows = REPORT_SECTIONS.filter((s) => s.creditCost > 0);
    expect(r.sections).toHaveLength(paidRows.length);
    // Each returned row projects (id, title, creditCost) only.
    for (const row of r.sections) {
      expect(Object.keys(row).sort()).toEqual(["creditCost", "id", "title"]);
    }
  });

  it("excludes free-tier rows (creditCost === 0) from the sections list", () => {
    const r = getUnlockAllCost([]);
    for (const row of r.sections) {
      expect(row.creditCost).toBeGreaterThan(0);
    }
    expect(r.sections.map((row) => row.id)).not.toContain("hook_problem");
    expect(r.sections.map((row) => row.id)).not.toContain("executive");
  });

  it("excludes any id passed in already-unlocked", () => {
    const r = getUnlockAllCost(["market", "board_summary"]);
    const ids = r.sections.map((row) => row.id);
    expect(ids).not.toContain("market");
    expect(ids).not.toContain("board_summary");
    // Duplicate "competitive" — both entries drop through together only if
    // the caller passed "competitive"; they're not passed here, so both
    // survive the filter.
    expect(ids.filter((id) => id === "competitive")).toHaveLength(2);
  });

  it("passing 'competitive' filters BOTH duplicate rows", () => {
    const r = getUnlockAllCost(["competitive"]);
    expect(r.sections.map((row) => row.id)).not.toContain("competitive");
  });

  it("total drops by 0.75 for each 'market' already unlocked (single-count)", () => {
    const base = getUnlockAllCost([]);
    const after = getUnlockAllCost(["market"]);
    expect(base.total - after.total).toBeCloseTo(0.75, 10);
  });

  it("with all non-free ids already unlocked, everything zeros out", () => {
    const allPaidIds = Array.from(
      new Set(
        REPORT_SECTIONS.filter((s) => s.creditCost > 0).map((s) => s.id),
      ),
    );
    const r = getUnlockAllCost(allPaidIds);
    expect(r.total).toBe(0);
    expect(r.discounted).toBe(0);
    expect(r.savings).toBe(0);
    expect(r.sections).toHaveLength(0);
  });

  it("ignores unknown ids in already-unlocked (no throw, no side-effect)", () => {
    const base = getUnlockAllCost([]);
    const withGarbage = getUnlockAllCost(["not_a_section", "", "🚀"]);
    expect(withGarbage.total).toBe(base.total);
    expect(withGarbage.sections).toHaveLength(base.sections.length);
  });

  it("returns a plain object with the documented 4 keys", () => {
    const r = getUnlockAllCost([]);
    expect(Object.keys(r).sort()).toEqual([
      "discounted",
      "savings",
      "sections",
      "total",
    ]);
  });
});

// ---------------------------------------------------------------------------
// estimateSections
// ---------------------------------------------------------------------------

describe("estimateSections", () => {
  it("returns empty totals for an empty id list", () => {
    const r = estimateSections([]);
    expect(r.sections).toHaveLength(0);
    expect(r.totalCredits).toBe(0);
    expect(r.totalWords).toBe(0);
  });

  it("returns the single-section row for a known id", () => {
    const r = estimateSections(["market"]);
    expect(r.sections).toHaveLength(1);
    const row = r.sections[0];
    expect(row.id).toBe("market");
    expect(row.title).toBe("Market Opportunity & Growth Potential");
    expect(row.creditCost).toBe(0.75);
    expect(row.estWords).toBe(1500);
    expect(row.tier).toBe("included");
    expect(r.totalCredits).toBe(0.75);
    expect(r.totalWords).toBe(1500);
  });

  it("sums credits and words across multiple sections", () => {
    const r = estimateSections(["market", "board_summary", "executive"]);
    expect(r.sections).toHaveLength(3);
    // market 0.75 + board_summary 1.00 + executive 0 = 1.75 credits
    expect(r.totalCredits).toBeCloseTo(1.75, 10);
    // market 1500 + board_summary 1000 + executive 1200 = 3700 words
    expect(r.totalWords).toBe(3700);
  });

  it("filters out unknown ids silently (no throw, no NaN)", () => {
    const r = estimateSections(["market", "does_not_exist", "board_summary"]);
    expect(r.sections).toHaveLength(2);
    expect(r.sections.map((s) => s.id)).toEqual(["market", "board_summary"]);
    expect(r.totalCredits).toBeCloseTo(1.75, 10);
  });

  it("returns empty when every id is unknown", () => {
    const r = estimateSections(["nope", "also_nope"]);
    expect(r.sections).toHaveLength(0);
    expect(r.totalCredits).toBe(0);
    expect(r.totalWords).toBe(0);
  });

  it("counts duplicate ids twice (no dedupe — caller controls uniqueness)", () => {
    const r = estimateSections(["market", "market"]);
    expect(r.sections).toHaveLength(2);
    expect(r.totalCredits).toBeCloseTo(1.5, 10);
    expect(r.totalWords).toBe(3000);
  });

  it("preserves caller order in the returned sections array", () => {
    const r = estimateSections(["board_summary", "market", "hook_problem"]);
    expect(r.sections.map((s) => s.id)).toEqual([
      "board_summary",
      "market",
      "hook_problem",
    ]);
  });

  it("includes free/zero-cost rows in words but leaves credits at 0 for them", () => {
    const r = estimateSections(["hook_problem"]);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].tier).toBe("free");
    expect(r.totalCredits).toBe(0);
    expect(r.totalWords).toBe(800);
  });

  it("row projection carries only the 5 documented keys", () => {
    const r = estimateSections(["market"]);
    expect(Object.keys(r.sections[0]).sort()).toEqual([
      "creditCost",
      "estWords",
      "id",
      "tier",
      "title",
    ]);
  });
});

// ---------------------------------------------------------------------------
// getSectionsByTier
// ---------------------------------------------------------------------------

describe("getSectionsByTier", () => {
  it("returns an object with the 4 tier keys", () => {
    const g = getSectionsByTier();
    expect(Object.keys(g).sort()).toEqual([
      "free",
      "included",
      "paid",
      "premium",
    ]);
  });

  it("places every section in exactly one tier bucket (partition, incl. duplicate)", () => {
    const g = getSectionsByTier();
    const totalPlaced =
      g.free.length + g.included.length + g.paid.length + g.premium.length;
    expect(totalPlaced).toBe(REPORT_SECTIONS.length);
  });

  it("free bucket holds the single hook section", () => {
    const g = getSectionsByTier();
    expect(g.free).toHaveLength(1);
    expect(g.free[0].id).toBe("hook_problem");
  });

  it("paid bucket includes both 'competitive' duplicate rows", () => {
    const g = getSectionsByTier();
    const dupes = g.paid.filter((s) => s.id === "competitive");
    expect(dupes).toHaveLength(2);
  });

  it("counts per tier match a direct filter over the fixture", () => {
    const g = getSectionsByTier();
    for (const tier of TIERS) {
      const expected = REPORT_SECTIONS.filter((s) => s.tier === tier).length;
      expect(g[tier as Tier].length).toBe(expected);
    }
  });

  it("every row inside a bucket carries that bucket's tier", () => {
    const g = getSectionsByTier();
    for (const tier of TIERS) {
      for (const row of g[tier as Tier]) {
        expect(row.tier).toBe(tier);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// calculateReportCost
// ---------------------------------------------------------------------------

describe("calculateReportCost", () => {
  it("preview is free with a copy blurb", () => {
    const r = calculateReportCost("preview");
    expect(r.totalCredits).toBe(0);
    expect(r.pricingAUD).toBe(0);
    expect(r.description).toMatch(/free preview/i);
  });

  it("standard costs 5 credits at A$29", () => {
    const r = calculateReportCost("standard");
    expect(r.totalCredits).toBe(5);
    expect(r.pricingAUD).toBe(29);
    expect(r.description).toMatch(/full scn report/i);
  });

  it("premium costs 10 credits at A$79", () => {
    const r = calculateReportCost("premium");
    expect(r.totalCredits).toBe(10);
    expect(r.pricingAUD).toBe(79);
    expect(r.description).toMatch(/premium/i);
  });

  it("returns a plain object with the documented 3 keys per tier", () => {
    for (const tier of ["preview", "standard", "premium"] as const) {
      const r = calculateReportCost(tier);
      expect(Object.keys(r).sort()).toEqual([
        "description",
        "pricingAUD",
        "totalCredits",
      ]);
    }
  });

  it("pricingAUD scales monotonically with tier (preview < standard < premium)", () => {
    const preview = calculateReportCost("preview");
    const standard = calculateReportCost("standard");
    const premium = calculateReportCost("premium");
    expect(preview.pricingAUD).toBeLessThan(standard.pricingAUD);
    expect(standard.pricingAUD).toBeLessThan(premium.pricingAUD);
    expect(preview.totalCredits).toBeLessThan(standard.totalCredits);
    expect(standard.totalCredits).toBeLessThan(premium.totalCredits);
  });
});
