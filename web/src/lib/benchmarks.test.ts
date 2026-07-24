import { describe, it, expect } from "vitest";
import {
  getSVIBenchmark,
  getSVIPercentile,
  SVI_STAGE_BENCHMARKS,
} from "./benchmarks";

describe("getSVIBenchmark", () => {
  it("returns the exact stage benchmark for a valid stage", () => {
    const b = getSVIBenchmark(2);
    expect(b.stage).toBe(2);
    expect(b.label).toBe("Building");
  });

  it("clamps stages above the max to the last benchmark", () => {
    expect(getSVIBenchmark(99).stage).toBe(SVI_STAGE_BENCHMARKS.length - 1);
  });

  it("clamps negative stages to the first benchmark", () => {
    expect(getSVIBenchmark(-3).stage).toBe(0);
  });

  it("falls back to stage 0 for NaN", () => {
    expect(getSVIBenchmark(Number.NaN).stage).toBe(0);
  });

  it("floors fractional stages", () => {
    expect(getSVIBenchmark(2.9).stage).toBe(2);
  });
});

describe("getSVIPercentile", () => {
  it("caps at 95 when svi is at or above the top decile", () => {
    const b = getSVIBenchmark(0);
    expect(getSVIPercentile(b.topDecile, 0)).toBe(95);
    expect(getSVIPercentile(b.topDecile + 50, 0)).toBe(95);
  });

  it("interpolates between p75 and topDecile", () => {
    const b = getSVIBenchmark(2);
    // Midpoint between p75 (130) and topDecile (160) → ~85.
    const mid = (b.p75 + b.topDecile) / 2;
    const result = getSVIPercentile(mid, 2);
    expect(result).toBeGreaterThanOrEqual(84);
    expect(result).toBeLessThanOrEqual(86);
  });

  it("returns 50 exactly at the stage median", () => {
    const b = getSVIBenchmark(3);
    expect(getSVIPercentile(b.medianSVI, 3)).toBe(50);
  });

  it("returns 25 exactly at p25", () => {
    const b = getSVIBenchmark(1);
    expect(getSVIPercentile(b.p25, 1)).toBe(25);
  });

  it("floors low scores at 5", () => {
    expect(getSVIPercentile(0, 0)).toBe(5);
    expect(getSVIPercentile(-10, 0)).toBe(5);
  });

  it("returns integers across the full range (no fractional display bug)", () => {
    for (const b of SVI_STAGE_BENCHMARKS) {
      for (const svi of [b.p25 - 5, b.p25, b.medianSVI, b.p75, b.topDecile - 1]) {
        const p = getSVIPercentile(svi, b.stage);
        expect(Number.isInteger(p)).toBe(true);
      }
    }
  });

  it("does not throw for out-of-range or NaN stage inputs", () => {
    expect(() => getSVIPercentile(120, -1)).not.toThrow();
    expect(() => getSVIPercentile(120, 999)).not.toThrow();
    expect(() => getSVIPercentile(120, Number.NaN)).not.toThrow();
  });

  it("returns 5 for NaN svi", () => {
    expect(getSVIPercentile(Number.NaN, 2)).toBe(5);
  });

  it("monotonically increases with svi at a fixed stage", () => {
    const stage = 2;
    let prev = -Infinity;
    for (const svi of [10, 50, 90, 120, 150, 180, 220]) {
      const p = getSVIPercentile(svi, stage);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});
