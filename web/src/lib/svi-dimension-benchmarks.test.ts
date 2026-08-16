import { describe, it, expect } from "vitest";
import {
  DIMENSION_BENCHMARKS_BY_STAGE,
  computeDimensionPercentiles,
} from "./svi-dimension-benchmarks";

const DIMENSIONS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];
const STAGES = [0, 1, 2, 3, 4, 5, 6, 7];

describe("DIMENSION_BENCHMARKS_BY_STAGE", () => {
  it("contains all 8 dimensions", () => {
    for (const dim of DIMENSIONS) {
      expect(DIMENSION_BENCHMARKS_BY_STAGE).toHaveProperty(dim);
    }
  });

  it("contains all 8 stages (0-7) for each dimension", () => {
    for (const dim of DIMENSIONS) {
      for (const stage of STAGES) {
        expect(DIMENSION_BENCHMARKS_BY_STAGE[dim]).toHaveProperty(String(stage));
      }
    }
  });

  it("satisfies p25 < p50 < p75 for every cell", () => {
    for (const dim of DIMENSIONS) {
      for (const stage of STAGES) {
        const { p25, p50, p75 } = DIMENSION_BENCHMARKS_BY_STAGE[dim][stage];
        expect(p25).toBeLessThan(p50);
        expect(p50).toBeLessThan(p75);
      }
    }
  });

  it("medians increase monotonically from stage 0 to stage 7 for all dimensions", () => {
    for (const dim of DIMENSIONS) {
      for (let s = 1; s <= 7; s++) {
        const prev = DIMENSION_BENCHMARKS_BY_STAGE[dim][s - 1].p50;
        const curr = DIMENSION_BENCHMARKS_BY_STAGE[dim][s].p50;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });
});

describe("computeDimensionPercentiles", () => {
  const makeScores = (override: Partial<Record<string, number>> = {}) =>
    Object.fromEntries(DIMENSIONS.map((d) => [d, override[d] ?? 60]));

  it("returns 8 results when 8 scores are provided", () => {
    const result = computeDimensionPercentiles(makeScores(), 2);
    expect(result).toHaveLength(8);
  });

  it("band is top_quartile when TRE score equals p75", () => {
    const p75 = DIMENSION_BENCHMARKS_BY_STAGE["tre"][2].p75;
    const result = computeDimensionPercentiles({ tre: p75 }, 2);
    expect(result[0].band).toBe("top_quartile");
  });

  it("band is above_median when FTV score equals p50", () => {
    const p50 = DIMENSION_BENCHMARKS_BY_STAGE["ftv"][2].p50;
    const result = computeDimensionPercentiles({ ftv: p50 }, 2);
    expect(result[0].band).toBe("above_median");
  });

  it("band is bottom_quartile when score is below p25", () => {
    const p25 = DIMENSION_BENCHMARKS_BY_STAGE["mpc"][3].p25;
    const result = computeDimensionPercentiles({ mpc: p25 - 5 }, 3);
    expect(result[0].band).toBe("bottom_quartile");
  });

  it("vsMedianPts is positive when score is above p50", () => {
    const p50 = DIMENSION_BENCHMARKS_BY_STAGE["svm"][1].p50;
    const result = computeDimensionPercentiles({ svm: p50 + 10 }, 1);
    expect(result[0].vsMedianPts).toBeGreaterThan(0);
  });

  it("vsMedianPts is negative when score is below p50", () => {
    const p50 = DIMENSION_BENCHMARKS_BY_STAGE["iri"][4].p50;
    const result = computeDimensionPercentiles({ iri: p50 - 8 }, 4);
    expect(result[0].vsMedianPts).toBeLessThan(0);
  });

  it("percentileEstimate is always in 0-100 range", () => {
    const extremes = computeDimensionPercentiles(
      { ...makeScores(), tre: 0, ftv: 100 },
      5,
    );
    for (const r of extremes) {
      expect(r.percentileEstimate).toBeGreaterThanOrEqual(0);
      expect(r.percentileEstimate).toBeLessThanOrEqual(100);
    }
  });

  it("stage 8 (out of range) falls back to stage 7 benchmarks", () => {
    const stage7Benchmarks = DIMENSION_BENCHMARKS_BY_STAGE["ftv"][7];
    const result = computeDimensionPercentiles({ ftv: stage7Benchmarks.p50 }, 8);
    expect(result[0].cohortP50).toBe(stage7Benchmarks.p50);
  });

  it("score exactly at p75 yields percentileEstimate of 75", () => {
    const { p75, p50 } = DIMENSION_BENCHMARKS_BY_STAGE["cgh"][2];
    const result = computeDimensionPercentiles({ cgh: p75 }, 2);
    expect(result[0].percentileEstimate).toBeGreaterThanOrEqual(75);
    expect(result[0].score).toBe(p75);
    expect(result[0].vsMedianPts).toBe(p75 - p50);
  });

  it("each result contains required fields", () => {
    const result = computeDimensionPercentiles(makeScores(), 0);
    for (const r of result) {
      expect(r).toHaveProperty("dimension");
      expect(r).toHaveProperty("score");
      expect(r).toHaveProperty("cohortP25");
      expect(r).toHaveProperty("cohortP50");
      expect(r).toHaveProperty("cohortP75");
      expect(r).toHaveProperty("vsMedianPts");
      expect(r).toHaveProperty("percentileEstimate");
      expect(r).toHaveProperty("band");
    }
  });
});
