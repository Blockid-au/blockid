import { describe, expect, it } from "vitest";
import {
  averageRanks,
  bootstrapSpearmanCI,
  median,
  mulberry32,
  quantile,
  rankBuckets,
  spearman,
} from "./spearman";

describe("averageRanks", () => {
  it("ranks distinct values 1..n in value order", () => {
    expect(averageRanks([30, 10, 20])).toEqual([3, 1, 2]);
  });
  it("gives tied values the mean of the ranks they span", () => {
    // 10,10 occupy ranks 1–2 → 1.5 each; 20 is rank 3; 30,30,30 span 4–6 → 5.
    expect(averageRanks([10, 20, 10, 30, 30, 30])).toEqual([1.5, 3, 1.5, 5, 5, 5]);
  });
});

describe("spearman", () => {
  it("is +1 for a monotone increasing pair and −1 for a reversed one", () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1, 12);
  });

  it("matches the textbook fixture (Wikipedia IQ vs TV hours: ρ = −29/165)", () => {
    const iq = [106, 100, 86, 101, 99, 103, 97, 113, 112, 110];
    const tv = [7, 27, 2, 50, 28, 29, 20, 12, 6, 17];
    expect(spearman(iq, tv)).toBeCloseTo(-29 / 165, 10);
  });

  it("handles ties with average ranks (equals Pearson on the ranks)", () => {
    // x has a tie; ranks x = [1, 2.5, 2.5, 4], y = [1, 2, 3, 4] → Pearson of the ranks.
    const rho = spearman([1, 2, 2, 3], [1, 2, 3, 4]);
    // Pearson([1,2.5,2.5,4],[1,2,3,4]) = 0.9486832980505138
    expect(rho).toBeCloseTo(0.9486832980505138, 10);
  });

  it("is null for n < 3, mismatched lengths, constants and non-finite values", () => {
    expect(spearman([1, 2], [2, 3])).toBeNull();
    expect(spearman([1, 2, 3], [1, 2])).toBeNull();
    expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2, Number.NaN], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2, 3], [1, Number.POSITIVE_INFINITY, 3])).toBeNull();
  });

  it("is invariant to a monotone transform of either side (log round size)", () => {
    const x = [110, 120, 125, 140, 160, 130];
    const y = [1e6, 3e6, 2e6, 8e6, 2e7, 5e6];
    expect(spearman(x, y)).toBeCloseTo(spearman(x, y.map((v) => Math.log(v))) as number, 12);
  });
});

describe("mulberry32 + bootstrapSpearmanCI", () => {
  it("the PRNG is deterministic for a seed and in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const seqA = Array.from({ length: 5 }, a);
    const seqB = Array.from({ length: 5 }, b);
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Array.from({ length: 5 }, mulberry32(8))).not.toEqual(seqA);
  });

  it("returns a reproducible CI that brackets the point estimate", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = [2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11];
    const rho = spearman(x, y) as number;
    const ci1 = bootstrapSpearmanCI(x, y, { resamples: 300, seed: 1 });
    const ci2 = bootstrapSpearmanCI(x, y, { resamples: 300, seed: 1 });
    expect(ci1).not.toBeNull();
    expect(ci1).toEqual(ci2);
    expect(ci1!.low).toBeLessThanOrEqual(rho);
    expect(ci1!.high).toBeGreaterThanOrEqual(rho);
    expect(ci1!.low).toBeGreaterThanOrEqual(-1);
    expect(ci1!.high).toBeLessThanOrEqual(1);
    expect(ci1!.resamples).toBe(300);
    expect(ci1!.effective).toBeGreaterThan(150);
  });

  it("is null when the point estimate is undefined", () => {
    expect(bootstrapSpearmanCI([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(bootstrapSpearmanCI([1, 2], [1, 2])).toBeNull();
  });
});

describe("quantile / median / rankBuckets", () => {
  it("quantile interpolates linearly; median is the 0.5 quantile", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([3, 1, 2], 0)).toBe(1);
    expect(quantile([3, 1, 2], 1)).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("rankBuckets splits into k rank buckets (quartiles); tied values share a bucket", () => {
    expect(rankBuckets([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(rankBuckets([10, 10, 10, 10], 4)).toEqual([3, 3, 3, 3]);
    expect(rankBuckets([], 4)).toEqual([]);
  });
});
