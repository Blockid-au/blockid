import { describe, expect, it } from "vitest";
import {
  AU_COMPARABLES,
  AU_MULTIPLES_BY_INDUSTRY,
  AU_MULTIPLES_BY_STAGE,
  buildComparablesBenchmark,
  getMultiplesBenchmark,
  getTopComparables,
  mapSectorToAUIndustry,
  mapStageToAUStage,
  type AUIndustry,
  type AUStage,
} from "./au-comparables";

const ALL_STAGES: AUStage[] = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "growth",
  "unicorn",
];

const ALL_INDUSTRIES: AUIndustry[] = [
  "SaaS",
  "FinTech",
  "HealthTech",
  "PropTech",
  "AgriTech",
  "EdTech",
  "MarketPlace",
  "DeepTech",
  "CleanTech",
  "eCommerce",
];

describe("AU_MULTIPLES_BY_STAGE", () => {
  it("covers every AUStage exactly once", () => {
    expect(Object.keys(AU_MULTIPLES_BY_STAGE).sort()).toEqual(
      [...ALL_STAGES].sort(),
    );
  });

  it("holds low ≤ median ≤ high for every stage", () => {
    for (const s of ALL_STAGES) {
      const m = AU_MULTIPLES_BY_STAGE[s];
      expect(m.low).toBeLessThanOrEqual(m.median);
      expect(m.median).toBeLessThanOrEqual(m.high);
    }
  });

  it("pins pre-seed shipped anchor 8/12/20", () => {
    expect(AU_MULTIPLES_BY_STAGE["pre-seed"]).toEqual({
      low: 8,
      median: 12,
      high: 20,
    });
  });

  it("pins series-a shipped anchor 5/9/15", () => {
    expect(AU_MULTIPLES_BY_STAGE["series-a"]).toEqual({
      low: 5,
      median: 9,
      high: 15,
    });
  });

  it("pins unicorn shipped anchor 5/12/30 (wider band than growth)", () => {
    expect(AU_MULTIPLES_BY_STAGE.unicorn).toEqual({
      low: 5,
      median: 12,
      high: 30,
    });
    // unicorn high must exceed growth high (Canva-tail carve-out)
    expect(AU_MULTIPLES_BY_STAGE.unicorn.high).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE.growth.high,
    );
  });

  it("shows a broadly monotone compression from pre-seed → growth median", () => {
    // Later stages compress the median multiple (except the unicorn tail).
    expect(AU_MULTIPLES_BY_STAGE["pre-seed"].median).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE.seed.median,
    );
    expect(AU_MULTIPLES_BY_STAGE.seed.median).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE["series-a"].median,
    );
    expect(AU_MULTIPLES_BY_STAGE["series-a"].median).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE["series-b"].median,
    );
    expect(AU_MULTIPLES_BY_STAGE["series-b"].median).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE["series-c"].median,
    );
    expect(AU_MULTIPLES_BY_STAGE["series-c"].median).toBeGreaterThan(
      AU_MULTIPLES_BY_STAGE.growth.median,
    );
  });
});

describe("AU_MULTIPLES_BY_INDUSTRY", () => {
  it("covers every AUIndustry exactly once", () => {
    expect(Object.keys(AU_MULTIPLES_BY_INDUSTRY).sort()).toEqual(
      [...ALL_INDUSTRIES].sort(),
    );
  });

  it("keeps every industry factor in the sane 0.5..1.5 band", () => {
    for (const k of ALL_INDUSTRIES) {
      const f = AU_MULTIPLES_BY_INDUSTRY[k];
      expect(f).toBeGreaterThan(0.5);
      expect(f).toBeLessThanOrEqual(1.5);
    }
  });

  it("pins SaaS at 1.20 (premium recurring) and eCommerce at 0.70 (thin margin)", () => {
    expect(AU_MULTIPLES_BY_INDUSTRY.SaaS).toBe(1.2);
    expect(AU_MULTIPLES_BY_INDUSTRY.eCommerce).toBe(0.7);
  });

  it("keeps SaaS strictly above every non-deep-tech industry factor", () => {
    for (const k of ALL_INDUSTRIES) {
      if (k === "SaaS" || k === "DeepTech") continue;
      expect(AU_MULTIPLES_BY_INDUSTRY.SaaS).toBeGreaterThan(
        AU_MULTIPLES_BY_INDUSTRY[k],
      );
    }
  });
});

describe("AU_COMPARABLES dataset", () => {
  it("ships at least 30 curated comparable companies", () => {
    expect(AU_COMPARABLES.length).toBeGreaterThanOrEqual(30);
  });

  it("every row is well-formed (typed union values, sane numerics)", () => {
    for (const c of AU_COMPARABLES) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(ALL_INDUSTRIES).toContain(c.industry);
      expect(ALL_STAGES).toContain(c.stage);
      expect(c.arr_multiple).toBeGreaterThan(0);
      expect(c.founded_year).toBeGreaterThanOrEqual(2000);
      expect(c.founded_year).toBeLessThanOrEqual(new Date().getUTCFullYear());
      expect(typeof c.notable).toBe("boolean");
      if (c.ebitda_multiple !== null) {
        expect(c.ebitda_multiple).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate company names", () => {
    const names = AU_COMPARABLES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes the canonical AU unicorn anchors (Canva, Atlassian, Airwallex, Afterpay)", () => {
    const names = new Set(AU_COMPARABLES.map((c) => c.name));
    expect(names.has("Canva")).toBe(true);
    expect(names.has("Atlassian")).toBe(true);
    expect(names.has("Airwallex")).toBe(true);
    expect(names.has("Afterpay")).toBe(true);
  });

  it("marks every unicorn row as notable=true", () => {
    for (const c of AU_COMPARABLES) {
      if (c.stage === "unicorn") expect(c.notable).toBe(true);
    }
  });

  it("Atlassian row pins the shipped anchor (SaaS unicorn, EBITDA multiple=45)", () => {
    const atl = AU_COMPARABLES.find((c) => c.name === "Atlassian");
    expect(atl).toBeDefined();
    expect(atl?.industry).toBe("SaaS");
    expect(atl?.stage).toBe("unicorn");
    expect(atl?.ebitda_multiple).toBe(45);
    expect(atl?.founded_year).toBe(2002);
  });

  it("covers every stage bucket with at least one row", () => {
    const stagesUsed = new Set(AU_COMPARABLES.map((c) => c.stage));
    for (const s of ALL_STAGES) {
      expect(stagesUsed.has(s)).toBe(true);
    }
  });
});

describe("mapStageToAUStage()", () => {
  it("maps numeric 0 and 1 → pre-seed (n <= 0 and n === 1 branches)", () => {
    expect(mapStageToAUStage(0)).toBe("pre-seed");
    expect(mapStageToAUStage(1)).toBe("pre-seed");
    expect(mapStageToAUStage(-5)).toBe("pre-seed");
  });

  it("maps numeric 2..6 across the stage ladder", () => {
    expect(mapStageToAUStage(2)).toBe("seed");
    expect(mapStageToAUStage(3)).toBe("series-a");
    expect(mapStageToAUStage(4)).toBe("series-b");
    expect(mapStageToAUStage(5)).toBe("series-c");
    expect(mapStageToAUStage(6)).toBe("growth");
  });

  it("maps numeric 7+ → unicorn (default branch)", () => {
    expect(mapStageToAUStage(7)).toBe("unicorn");
    expect(mapStageToAUStage(99)).toBe("unicorn");
  });

  it("accepts numeric-in-string form via parseInt", () => {
    expect(mapStageToAUStage("2")).toBe("seed");
    expect(mapStageToAUStage("3")).toBe("series-a");
  });

  it("named branches: idea/concept/pre → pre-seed, mvp/proto → seed", () => {
    expect(mapStageToAUStage("Idea")).toBe("pre-seed");
    expect(mapStageToAUStage("concept")).toBe("pre-seed");
    expect(mapStageToAUStage("pre-seed")).toBe("pre-seed");
    expect(mapStageToAUStage("mvp")).toBe("seed");
    expect(mapStageToAUStage("prototype")).toBe("seed");
  });

  it("named branches: series-a / series-b / series-c anchor exact", () => {
    expect(mapStageToAUStage("series-a")).toBe("series-a");
    expect(mapStageToAUStage("series-b")).toBe("series-b");
    expect(mapStageToAUStage("series-c")).toBe("series-c");
  });

  it("named branches: growth/scale collapse to growth", () => {
    expect(mapStageToAUStage("Growth")).toBe("growth");
    expect(mapStageToAUStage("scale-up")).toBe("growth");
  });

  it("unknown string falls back to seed (default)", () => {
    expect(mapStageToAUStage("unknown-blob")).toBe("seed");
  });

  it("plain 'seed' resolves seed and does NOT match series branches", () => {
    expect(mapStageToAUStage("seed")).toBe("seed");
  });
});

describe("mapSectorToAUIndustry()", () => {
  it("returns SaaS on undefined and empty input", () => {
    expect(mapSectorToAUIndustry(undefined)).toBe("SaaS");
    expect(mapSectorToAUIndustry("")).toBe("SaaS");
  });

  it("keyword branches map to the shipped industry union", () => {
    expect(mapSectorToAUIndustry("SaaS platform")).toBe("SaaS");
    expect(mapSectorToAUIndustry("B2B software")).toBe("SaaS");
    expect(mapSectorToAUIndustry("fintech payments")).toBe("FinTech");
    expect(mapSectorToAUIndustry("insurance broker")).toBe("FinTech");
    expect(mapSectorToAUIndustry("healthcare AI")).toBe("HealthTech");
    expect(mapSectorToAUIndustry("clinic notes")).toBe("HealthTech");
    expect(mapSectorToAUIndustry("proptech")).toBe("PropTech");
    expect(mapSectorToAUIndustry("real estate")).toBe("PropTech");
    expect(mapSectorToAUIndustry("agritech farm")).toBe("AgriTech");
    expect(mapSectorToAUIndustry("edtech learning")).toBe("EdTech");
    expect(mapSectorToAUIndustry("marketplace")).toBe("MarketPlace");
    expect(mapSectorToAUIndustry("deep tech quantum")).toBe("DeepTech");
    expect(mapSectorToAUIndustry("cleantech solar")).toBe("CleanTech");
    // eCommerce keyword uses "ecomm"/"shop"/"d2c" — bare "commerce" would match
    // MarketPlace first via `.includes("commerce")` (documented quirk pinned below).
    expect(mapSectorToAUIndustry("ecomm store")).toBe("eCommerce");
    expect(mapSectorToAUIndustry("shopify d2c")).toBe("eCommerce");
  });

  it("**quirk pin** — 'commerce' substring shorts to MarketPlace, not eCommerce", () => {
    // Branch order in the shipped mapSectorToAUIndustry(): the MarketPlace
    // branch checks `.includes("commerce")` before the eCommerce branch runs,
    // so any input containing 'ecommerce' resolves to MarketPlace unless the
    // caller uses the 'ecomm' / 'shop' / 'd2c' keyword instead.
    expect(mapSectorToAUIndustry("ecommerce d2c")).toBe("MarketPlace");
  });

  it("is case-insensitive on the keyword scan", () => {
    expect(mapSectorToAUIndustry("HEALTH")).toBe("HealthTech");
    expect(mapSectorToAUIndustry("FinTech")).toBe("FinTech");
  });

  it("unknown sector defaults to SaaS (largest AU segment)", () => {
    expect(mapSectorToAUIndustry("blockchain widgets")).toBe("SaaS");
  });

  it("first-match-wins ordering: 'saas payments' resolves SaaS not FinTech", () => {
    // 'saas' is scanned before 'pay' in the shipped chain — pins the branch order.
    expect(mapSectorToAUIndustry("saas payments")).toBe("SaaS");
  });
});

describe("getMultiplesBenchmark()", () => {
  it("blends stage × industry factor and rounds to 1 decimal", () => {
    // SaaS × series-a: stage {5, 9, 15} × 1.20 → {6, 10.8, 18}
    expect(getMultiplesBenchmark("SaaS", "series-a")).toEqual({
      low: 6,
      median: 10.8,
      high: 18,
    });
  });

  it("eCommerce × seed applies the 0.70 industry factor", () => {
    // seed {6, 10, 18} × 0.70 → {4.2, 7, 12.6}
    expect(getMultiplesBenchmark("eCommerce", "seed")).toEqual({
      low: 4.2,
      median: 7,
      high: 12.6,
    });
  });

  it("preserves low ≤ median ≤ high across every (industry, stage) pair", () => {
    for (const s of ALL_STAGES) {
      for (const i of ALL_INDUSTRIES) {
        const m = getMultiplesBenchmark(i, s);
        expect(m.low).toBeLessThanOrEqual(m.median);
        expect(m.median).toBeLessThanOrEqual(m.high);
      }
    }
  });

  it("scales linearly with the industry factor (SaaS/eCommerce ratio ≈ 1.20/0.70)", () => {
    const saas = getMultiplesBenchmark("SaaS", "seed");
    const ecom = getMultiplesBenchmark("eCommerce", "seed");
    // Median: 12/7 ≈ 1.714 = 1.20/0.70
    expect(saas.median / ecom.median).toBeCloseTo(1.2 / 0.7, 1);
  });
});

describe("getTopComparables()", () => {
  it("returns exactly `limit` rows when the exact bucket has enough", () => {
    // FinTech / series-a currently has 3 exact rows (Block Earner, Parachute, PictureWealth).
    const rows = getTopComparables("FinTech", "series-a", 3);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.industry).toBe("FinTech");
      expect(r.stage).toBe("series-a");
    }
  });

  it("prefers notable companies first when the exact bucket is used", () => {
    // SaaS unicorn: many notable rows exist — head must be notable=true.
    const rows = getTopComparables("SaaS", "unicorn", 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].notable).toBe(true);
  });

  it("broadens to same-industry nearest-stage when exact bucket is thin", () => {
    // AgriTech series-b has zero rows — must broaden to nearest AgriTech stage.
    const rows = getTopComparables("AgriTech", "series-b", 3);
    expect(rows.length).toBeGreaterThan(0);
    // First returned row must still be AgriTech (same-industry broadening).
    expect(rows[0].industry).toBe("AgriTech");
  });

  it("fills remaining slots with notable cross-industry rows at nearest stage", () => {
    // eCommerce has no rows in the shipped dataset — every returned row must be
    // notable (cross-industry fallback) and near the requested stage.
    const rows = getTopComparables("eCommerce", "unicorn", 3);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.notable).toBe(true);
    }
  });

  it("respects limit=1 (short single-row lookups)", () => {
    const rows = getTopComparables("SaaS", "unicorn", 1);
    expect(rows).toHaveLength(1);
  });

  it("does not emit duplicate rows even under multi-stage broadening", () => {
    const rows = getTopComparables("DeepTech", "unicorn", 5);
    const names = rows.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("buildComparablesBenchmark()", () => {
  it("wires sector + stage into industry/stage resolution and returns the full envelope", () => {
    const b = buildComparablesBenchmark("SaaS platform", 3);
    expect(b.industry).toBe("SaaS");
    expect(b.stage).toBe("series-a");
    expect(b.multiples).toEqual({ low: 6, median: 10.8, high: 18 });
    expect(b.topComps.length).toBeGreaterThan(0);
    expect(b.topComps.length).toBeLessThanOrEqual(3);
    expect(b.medianArrMultiple).toBeGreaterThan(0);
  });

  it("uses stage=0 (pre-seed) when stage omitted (?? 0 fallback)", () => {
    const b = buildComparablesBenchmark("SaaS");
    expect(b.stage).toBe("pre-seed");
  });

  it("uses SaaS when sector omitted", () => {
    const b = buildComparablesBenchmark(undefined, 3);
    expect(b.industry).toBe("SaaS");
  });

  it("topComps.medianArrMultiple picks the middle sorted multiple", () => {
    // Force a well-populated FinTech series-a bucket (3 exact rows).
    const b = buildComparablesBenchmark("fintech", 3);
    const sortedMultiples = b.topComps
      .map((c) => c.arr_multiple)
      .sort((a, b) => a - b);
    const expectedMedian =
      sortedMultiples[Math.floor(sortedMultiples.length / 2)];
    expect(b.medianArrMultiple).toBe(expectedMedian);
  });

  it("topComps rows only expose the Pick<> shape (no ebitda_multiple, no founded_year)", () => {
    const b = buildComparablesBenchmark("SaaS", 6);
    for (const r of b.topComps) {
      expect(Object.keys(r).sort()).toEqual(
        ["arr_multiple", "industry", "name", "notable", "note", "stage"].sort(),
      );
    }
  });

  it("accepts named-stage strings via mapStageToAUStage", () => {
    const b = buildComparablesBenchmark("healthtech", "series-b");
    expect(b.industry).toBe("HealthTech");
    expect(b.stage).toBe("series-b");
  });

  it("returns non-zero medianArrMultiple even for empty-bucket sectors (falls back)", () => {
    // eCommerce/unicorn has no exact rows — cross-industry fill must still
    // produce a positive median from the notable fallback rows. Use 'shop' to
    // route through the eCommerce keyword (bare 'ecommerce' would short to
    // MarketPlace — see the quirk pin in mapSectorToAUIndustry() above).
    const b = buildComparablesBenchmark("shopify d2c", 7);
    expect(b.industry).toBe("eCommerce");
    expect(b.stage).toBe("unicorn");
    expect(b.medianArrMultiple).toBeGreaterThan(0);
  });
});
