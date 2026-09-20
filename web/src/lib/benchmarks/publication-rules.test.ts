import { describe, expect, it } from "vitest";
import {
  BENCHMARK_BASIC_N,
  BENCHMARK_MIN_N,
  BENCHMARK_N_RULES,
  BENCHMARK_SEGMENTED_N,
  benchmarkBand,
  benchmarkLabel,
  benchmarkNLabel,
  benchmarkTier,
  formatBenchmarkLine,
  formatPercentileLine,
  mayShowPercentile,
  noBenchmarkYetLine,
  notEnoughLine,
  publishedFromCohort,
  publishBenchmark,
  publishPercentile,
} from "./publication-rules";

describe("benchmarkBand — score-governance § 7 table", () => {
  it.each([
    [-1, "none"],
    [0, "none"],
    [9, "none"],
    [9.9, "none"],
    [10, "indicative"],
    [29, "indicative"],
    [29.9, "indicative"],
    [30, "benchmark"],
    [99, "benchmark"],
    [100, "segmented"],
    [10_000, "segmented"],
    [Number.NaN, "none"],
    [Number.POSITIVE_INFINITY, "none"],
  ] as const)("n = %s → %s", (n, band) => {
    expect(benchmarkBand(n)).toBe(band);
  });

  it("the constants agree with the table", () => {
    expect(BENCHMARK_MIN_N).toBe(10);
    expect(BENCHMARK_BASIC_N).toBe(30);
    expect(BENCHMARK_SEGMENTED_N).toBe(100);
    expect(BENCHMARK_N_RULES[0].minN).toBe(0);
    for (let i = 1; i < BENCHMARK_N_RULES.length; i++) {
      expect(BENCHMARK_N_RULES[i].minN).toBe((BENCHMARK_N_RULES[i - 1].maxN ?? -1) + 1);
    }
    expect(BENCHMARK_N_RULES[BENCHMARK_N_RULES.length - 1].maxN).toBeNull();
    expect(BENCHMARK_N_RULES.map((r) => r.band)).toEqual(["none", "indicative", "benchmark", "segmented"]);
    expect(BENCHMARK_N_RULES.map((r) => r.tier)).toEqual(["none", "indicative", "basic", "segmented"]);
  });

  it("benchmarkTier keeps the P0-D names for the governance page", () => {
    expect(benchmarkTier(5)).toBe("none");
    expect(benchmarkTier(15)).toBe("indicative");
    expect(benchmarkTier(50)).toBe("basic");
    expect(benchmarkTier(150)).toBe("segmented");
    expect(mayShowPercentile(9)).toBe(false);
    expect(mayShowPercentile(10)).toBe(true);
  });
});

describe("labels always carry n", () => {
  it.each([
    [4, "not enough comparable companies (n = 4)"],
    [14, "indicative (n = 14)"],
    [47, "benchmark (n = 47)"],
    [130, "segmented benchmark (n = 130)"],
    [Number.NaN, "not enough comparable companies (n = 0)"],
  ])("benchmarkLabel(%s)", (n, label) => {
    expect(benchmarkLabel(n)).toBe(label);
    expect(benchmarkLabel(n)).toContain("n = ");
  });

  it("benchmarkNLabel floors and clamps", () => {
    expect(benchmarkNLabel(34)).toBe("n = 34");
    expect(benchmarkNLabel(34.7)).toBe("n = 34");
    expect(benchmarkNLabel(-2)).toBe("n = 0");
  });

  it("notEnoughLine names the floor and the segment", () => {
    expect(notEnoughLine(4, "Seed")).toBe("Not enough comparable companies at Seed yet (n = 4) — a benchmark appears from n = 10.");
    expect(notEnoughLine(0)).toBe("Not enough comparable companies yet (n = 0) — a benchmark appears from n = 10.");
  });
});

describe("publishBenchmark", () => {
  it("returns null below the floor — never a number", () => {
    expect(publishBenchmark({ median: 64, p25: 50, p75: 70, n: 9, segment: "SaaS / Pre-seed" })).toBeNull();
    expect(publishBenchmark({ median: 64, n: 0, segment: "x" })).toBeNull();
  });

  it("returns null for a non-finite median even with a large n", () => {
    expect(publishBenchmark({ median: Number.NaN, n: 80, segment: "x" })).toBeNull();
  });

  it.each([
    [10, "indicative", "indicative (n = 10)"],
    [29, "indicative", "indicative (n = 29)"],
    [30, "benchmark", "benchmark (n = 30)"],
    [99, "benchmark", "benchmark (n = 99)"],
    [100, "segmented", "segmented benchmark (n = 100)"],
  ] as const)("n = %s → band %s", (n, band, label) => {
    const b = publishBenchmark({ median: 64, p25: 50, p75: 70, n, segment: " SaaS / Pre-seed " });
    expect(b).toEqual({ median: 64, p25: 50, p75: 70, n, band, label, segment: "SaaS / Pre-seed" });
  });

  it("drops non-finite quartiles to null and floors fractional n", () => {
    const b = publishBenchmark({ median: 64, p25: Number.NaN, n: 47.9, segment: "x" });
    expect(b?.p25).toBeNull();
    expect(b?.p75).toBeNull();
    expect(b?.n).toBe(47);
  });
});

describe("publishPercentile", () => {
  it("null below the floor, clamped + rounded above it", () => {
    expect(publishPercentile({ percentile: 72, n: 9, segment: "AU pre-seed startups" })).toBeNull();
    expect(publishPercentile({ percentile: Number.NaN, n: 40, segment: "x" })).toBeNull();
    expect(publishPercentile({ percentile: 72.4, n: 14, segment: "AU pre-seed startups" })).toEqual({
      percentile: 72,
      n: 14,
      band: "indicative",
      label: "indicative (n = 14)",
      segment: "AU pre-seed startups",
    });
    expect(publishPercentile({ percentile: 140, n: 40, segment: "x" })?.percentile).toBe(100);
    expect(publishPercentile({ percentile: -3, n: 40, segment: "x" })?.percentile).toBe(0);
  });
});

describe("formatBenchmarkLine / formatPercentileLine", () => {
  it("benchmark line (n = 47)", () => {
    const b = publishBenchmark({ median: 64, n: 47, segment: "SaaS / Pre-seed" })!;
    expect(formatBenchmarkLine(b)).toBe("SaaS / Pre-seed benchmark — median 64 (n = 47)");
  });

  it("indicative line (n = 14), with quartiles when present", () => {
    const b = publishBenchmark({ median: 61.25, p25: 50, p75: 70.5, n: 14, segment: "SaaS / Pre-seed" })!;
    expect(formatBenchmarkLine(b)).toBe("SaaS / Pre-seed indicative — median 61.3, p25–p75 50–70.5 (n = 14)");
  });

  it("segmented line (n = 130)", () => {
    const b = publishBenchmark({ median: 66, n: 130, segment: "SaaS / Seed" })!;
    expect(formatBenchmarkLine(b)).toBe("SaaS / Seed segmented benchmark — median 66 (n = 130)");
  });

  it("percentile line", () => {
    const p = publishPercentile({ percentile: 77, n: 14, segment: "AU pre-seed startups" })!;
    expect(formatPercentileLine(p)).toBe("Top 23% of AU pre-seed startups — indicative (n = 14)");
    const top = publishPercentile({ percentile: 100, n: 40, segment: "AU seed startups" })!;
    expect(formatPercentileLine(top)).toBe("Top 1% of AU seed startups — benchmark (n = 40)");
  });
});

describe("publishedFromCohort — the stored cohort result (G21 P1 review)", () => {
  it("returns `published` verbatim when the row carries the key, null included", () => {
    const pub = publishPercentile({ percentile: 61, n: 33, segment: "AU cohort" })!;
    expect(publishedFromCohort({ percentile: 61, cohortSize: 33, source: "real_cohort", published: pub })).toBe(pub);
    expect(publishedFromCohort({ percentile: 55, cohortSize: 3, source: "benchmark_fallback", published: null })).toBeNull();
  });

  it("re-gates a pre-P1-C row from cohortSize; the static fallback never publishes", () => {
    expect(publishedFromCohort({ percentile: 61, cohortSize: 33, source: "real_cohort" })).toMatchObject({ percentile: 61, n: 33, band: "benchmark" });
    expect(publishedFromCohort({ percentile: 61, cohortSize: 4, source: "real_cohort" })).toBeNull();
    expect(publishedFromCohort({ percentile: 61, cohortSize: 500, source: "benchmark_fallback" })).toBeNull();
    expect(publishedFromCohort({ percentile: 61 })).toBeNull();
    expect(publishedFromCohort(null)).toBeNull();
  });

  it("noBenchmarkYetLine carries n", () => {
    expect(noBenchmarkYetLine(3)).toBe("No cohort benchmark yet (n = 3)");
  });
});
