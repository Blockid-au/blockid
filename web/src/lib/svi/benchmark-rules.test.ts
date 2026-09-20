import { describe, expect, it } from "vitest";
import { BENCHMARK_N_RULES, benchmarkNLabel, benchmarkTier, mayShowPercentile } from "./benchmark-rules";

describe("benchmark publication rules (score-governance § 7)", () => {
  it("tiers are contiguous from 0 and end open-ended at 100+", () => {
    expect(BENCHMARK_N_RULES[0].minN).toBe(0);
    for (let i = 1; i < BENCHMARK_N_RULES.length; i++) {
      expect(BENCHMARK_N_RULES[i].minN).toBe((BENCHMARK_N_RULES[i - 1].maxN ?? -1) + 1);
    }
    expect(BENCHMARK_N_RULES[BENCHMARK_N_RULES.length - 1].maxN).toBeNull();
    expect(BENCHMARK_N_RULES.map((r) => r.tier)).toEqual(["none", "indicative", "basic", "segmented"]);
  });

  it("n < 10 → none · 10–29 indicative · 30–99 basic · 100+ segmented", () => {
    expect(benchmarkTier(0)).toBe("none");
    expect(benchmarkTier(9)).toBe("none");
    expect(benchmarkTier(10)).toBe("indicative");
    expect(benchmarkTier(29)).toBe("indicative");
    expect(benchmarkTier(30)).toBe("basic");
    expect(benchmarkTier(99)).toBe("basic");
    expect(benchmarkTier(100)).toBe("segmented");
    expect(benchmarkTier(10_000)).toBe("segmented");
    expect(benchmarkTier(29.9)).toBe("indicative");
    expect(benchmarkTier(Number.NaN)).toBe("none");
    expect(benchmarkTier(-3)).toBe("none");
  });

  it("mayShowPercentile is false below 10 and the n label is always present", () => {
    expect(mayShowPercentile(9)).toBe(false);
    expect(mayShowPercentile(10)).toBe(true);
    expect(benchmarkNLabel(34)).toBe("n = 34");
    expect(benchmarkNLabel(Number.NaN)).toBe("n = 0");
  });
});
