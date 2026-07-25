// Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P1
// gap ("au-comparable-raises benchmark exists conceptually in guide copy
// but no dedicated data source module"). Mirrors the au-market-lookup /
// abn / cohort-chart test posture — pure helpers exercised without
// touching Supabase or the network.

import { describe, it, expect } from "vitest";
import {
  benchmarkSectorRaises,
  SECTOR_RAISES_BENCHMARK_DISCLAIMER,
  SECTOR_RAISES_STAGES,
  type SectorRaisesStage,
} from "./sector-raises-benchmark";

// Fixed "now" so freshness assertions do not drift with the wall clock.
// The underlying dataset ranges 2018..2025; picking 2026 keeps the
// last-24-month window aligned with the most recent rows.
const NOW = new Date("2026-06-30T00:00:00Z");

describe("benchmarkSectorRaises", () => {
  it("returns a non-empty fintech benchmark with populated stage histogram", () => {
    const result = benchmarkSectorRaises({ sector: "fintech" }, NOW);
    expect(result.sector).toBe("fintech");
    expect(result.count).toBeGreaterThan(0);
    const histSum =
      result.byStage.preseed +
      result.byStage.seed +
      result.byStage.seriesA +
      result.byStage.seriesB;
    expect(histSum).toBe(result.count);
    expect(result.medianRoundAud).not.toBeNull();
    expect(result.top5.length).toBeGreaterThan(0);
    expect(result.top5.length).toBeLessThanOrEqual(5);
  });

  it("normalises sector casing + whitespace", () => {
    const a = benchmarkSectorRaises({ sector: "SaaS" }, NOW);
    const b = benchmarkSectorRaises({ sector: "  saas  " }, NOW);
    expect(a.count).toBe(b.count);
    expect(a.sector).toBe("saas");
    expect(b.sector).toBe("saas");
  });

  it("sinceYear filter excludes older rows", () => {
    const all = benchmarkSectorRaises({ sector: "saas" }, NOW);
    const recent = benchmarkSectorRaises(
      { sector: "saas", sinceYear: 2022 },
      NOW,
    );
    expect(recent.count).toBeLessThanOrEqual(all.count);
    expect(recent.top5.every((r) => r.year >= 2022)).toBe(true);
    expect(recent.windowSinceYear).toBe(2022);
  });

  it("stages filter restricts the histogram to the requested stages", () => {
    const seedOnly = benchmarkSectorRaises(
      { sector: "fintech", stages: ["seed"] as readonly SectorRaisesStage[] },
      NOW,
    );
    expect(seedOnly.byStage.preseed).toBe(0);
    expect(seedOnly.byStage.seriesA).toBe(0);
    expect(seedOnly.byStage.seriesB).toBe(0);
    expect(seedOnly.top5.every((r) => r.stage === "seed")).toBe(true);
  });

  it("unknown sector yields an empty benchmark with a stable shape", () => {
    const result = benchmarkSectorRaises(
      { sector: "no-such-sector" },
      NOW,
    );
    expect(result.count).toBe(0);
    expect(result.medianRoundAud).toBeNull();
    expect(result.medianValuationAud).toBeNull();
    expect(result.top5).toEqual([]);
    expect(result.freshnessBand).toBe("empty");
    for (const s of SECTOR_RAISES_STAGES) {
      expect(result.byStage[s]).toBe(0);
    }
  });

  it("top5 is sorted by year desc then roundAud desc", () => {
    const result = benchmarkSectorRaises({ sector: "fintech" }, NOW);
    for (let i = 0; i < result.top5.length - 1; i += 1) {
      const a = result.top5[i];
      const b = result.top5[i + 1];
      const aRank = a.year * 1_000_000_000_000 + a.roundAud;
      const bRank = b.year * 1_000_000_000_000 + b.roundAud;
      expect(aRank).toBeGreaterThanOrEqual(bRank);
    }
  });

  it("freshnessBand flips to 'older' when sinceYear pins ancient rows only", () => {
    // Force a window that excludes every row (dataset stops at 2025).
    const result = benchmarkSectorRaises(
      { sector: "fintech", sinceYear: 3000 },
      NOW,
    );
    expect(result.count).toBe(0);
    expect(result.freshnessBand).toBe("empty");
  });

  it("disclaimer is non-empty and references AFSL / s766B boundary", () => {
    expect(SECTOR_RAISES_BENCHMARK_DISCLAIMER.length).toBeGreaterThan(80);
    expect(SECTOR_RAISES_BENCHMARK_DISCLAIMER).toMatch(/s766B/);
    expect(SECTOR_RAISES_BENCHMARK_DISCLAIMER).toMatch(/not.*investment advice|not personal financial/i);
    const result = benchmarkSectorRaises({ sector: "fintech" }, NOW);
    expect(result.disclaimer).toBe(SECTOR_RAISES_BENCHMARK_DISCLAIMER);
  });
});
