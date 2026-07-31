import { describe, it, expect, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// SVI Market Index — colocated tests for the previously-untested pure
// `src/lib/svi-index.ts` module. This module produces the Nikkei/Dow-style
// unbounded index surfaced on the founder dashboard + investor reports, so
// a silent widening of the tier bands (Unicorn 500 / Exceptional 350 / …),
// a re-tuning of the richness bonuses (evidence 0.5 cap, metrics 0.3 cap,
// history 0.2 cap, source weights), or a regression on the base-period
// null-fallback + zero-denominator guard would corrupt every founder-facing
// index number without any type error. These tests pin the shape + math.
// ---------------------------------------------------------------------------

import { computeDataRichness, computeSVIIndex } from "./svi-index";

afterEach(() => {
  vi.useRealTimers();
});

describe("computeDataRichness", () => {
  it("returns totalFactor=1.0 baseline when every signal is empty (no bonuses fire)", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(r.evidenceBonus).toBe(0);
    expect(r.metricsBonus).toBe(0);
    expect(r.sourcesBonus).toBe(0);
    expect(r.historyBonus).toBe(0);
    expect(r.totalFactor).toBe(1.0);
    expect(r.historyMonths).toBe(0);
  });

  it("caps evidenceBonus at 0.5 — 100 evidence items would raw-total 1.0 but clamps", () => {
    const r = computeDataRichness({
      evidenceCount: 100,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(r.evidenceBonus).toBe(0.5);
    expect(r.evidenceCount).toBe(100);
  });

  it("accumulates evidenceBonus below the cap (30 items × 0.01 = 0.3)", () => {
    const r = computeDataRichness({
      evidenceCount: 30,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(r.evidenceBonus).toBe(0.3);
  });

  it("caps metricsBonus at 0.3 — 30 months would raw-total 0.6 but clamps", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 30,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(r.metricsBonus).toBe(0.3);
    expect(r.metricsMonths).toBe(30);
  });

  it("accumulates metricsBonus below the cap (10 months × 0.02 = 0.2)", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 10,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(r.metricsBonus).toBe(0.2);
  });

  it("weights sources by type — stripe 0.15 + github 0.10 + xero 0.12 = 0.37", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: ["stripe", "github", "xero"],
      firstSnapshotDate: null,
    });
    expect(r.sourcesBonus).toBe(0.37);
  });

  it("falls back to 0.03 default weight for unrecognised sources", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: ["unknown_source", "another_unknown"],
      firstSnapshotDate: null,
    });
    expect(r.sourcesBonus).toBe(0.06);
  });

  it("normalises source names to lowercase for weight lookup (STRIPE → stripe)", () => {
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: ["STRIPE", "GitHub"],
      firstSnapshotDate: null,
    });
    expect(r.sourcesBonus).toBe(0.25);
  });

  it("caps historyBonus at 0.2 — 30 months would raw-total 0.3 but clamps", () => {
    // Freeze "now" so the month-diff math is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: "2020-01-30T00:00:00Z", // ~78 months earlier
    });
    expect(r.historyBonus).toBe(0.2);
    expect(r.historyMonths).toBeGreaterThan(20);
  });

  it("clamps negative history to 0 when firstSnapshotDate is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: "2027-01-01T00:00:00Z",
    });
    expect(r.historyMonths).toBe(0);
    expect(r.historyBonus).toBe(0);
  });

  it("computes fractional history — 5 months × 0.01 = 0.05", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    const r = computeDataRichness({
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: "2026-02-15T00:00:00Z", // 5 months before July
    });
    expect(r.historyMonths).toBe(5);
    expect(r.historyBonus).toBe(0.05);
  });

  it("composes all four bonuses into totalFactor = 1 + sum(bonuses)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    const r = computeDataRichness({
      evidenceCount: 10, // 0.10
      metricsMonths: 5, // 0.10
      connectedSources: ["stripe"], // 0.15
      firstSnapshotDate: "2026-02-15T00:00:00Z", // 5 months → 0.05
    });
    expect(r.evidenceBonus).toBe(0.1);
    expect(r.metricsBonus).toBe(0.1);
    expect(r.sourcesBonus).toBe(0.15);
    expect(r.historyBonus).toBe(0.05);
    expect(r.totalFactor).toBe(1.4);
  });

  it("rounds each bonus + totalFactor to 3 decimal places", () => {
    const r = computeDataRichness({
      evidenceCount: 7, // 0.07 exact
      metricsMonths: 0,
      connectedSources: ["pitch_deck"], // 0.08
      firstSnapshotDate: null,
    });
    // Guard: 0.07 + 0.08 + 1.0 = 1.15 exact when rounded to 3 dp
    expect(r.totalFactor).toBe(1.15);
  });

  it("echoes evidenceCount + metricsMonths + connectedSources verbatim in the breakdown", () => {
    const sources = ["stripe", "github"];
    const r = computeDataRichness({
      evidenceCount: 12,
      metricsMonths: 4,
      connectedSources: sources,
      firstSnapshotDate: null,
    });
    expect(r.evidenceCount).toBe(12);
    expect(r.metricsMonths).toBe(4);
    expect(r.connectedSources).toBe(sources);
  });
});

describe("computeSVIIndex", () => {
  it("returns index=100 baseline when rawSVI = basePeriodSVI and no richness signals", () => {
    const out = computeSVIIndex({
      rawSVI: 100,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(out.indexValue).toBe(100);
    expect(out.growthFromBase).toBe(0);
    expect(out.tier).toBe("Baseline");
    expect(out.rawSVI).toBe(100);
    expect(out.basePeriodSVI).toBe(100);
    expect(out.basePeriodDate).toBe("2026-01-01");
    expect(out.dataRichnessFactor).toBe(1.0);
  });

  it("scales index linearly with rawSVI/basePeriodSVI ratio (150/100 × 100 = 150)", () => {
    const out = computeSVIIndex({
      rawSVI: 150,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(out.indexValue).toBe(150);
    expect(out.growthFromBase).toBe(50);
    expect(out.tier).toBe("Strong");
  });

  it("multiplies the ratio by the data-richness factor (150 × 1.5 = 225)", () => {
    // stripe (0.15) + xero (0.12) + evidence 23×0.01 = 0.23 → totalFactor ≈ 1.5
    const out = computeSVIIndex({
      rawSVI: 150,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 23,
      metricsMonths: 0,
      connectedSources: ["stripe", "xero"],
      firstSnapshotDate: null,
    });
    expect(out.dataRichnessFactor).toBe(1.5);
    expect(out.indexValue).toBe(225);
  });

  it("falls back to rawSVI when basePeriodSVI is null (so first snapshot lands at baseline)", () => {
    const out = computeSVIIndex({
      rawSVI: 175,
      basePeriodSVI: null,
      basePeriodDate: null,
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(out.basePeriodSVI).toBe(175);
    expect(out.indexValue).toBe(100);
    expect(out.growthFromBase).toBe(0);
  });

  it("stamps today's date when basePeriodDate is null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00Z"));
    const out = computeSVIIndex({
      rawSVI: 100,
      basePeriodSVI: 100,
      basePeriodDate: null,
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(out.basePeriodDate).toBe("2026-07-30");
  });

  it("guards divide-by-zero with Math.max(1, baseSVI) — baseSVI=0 does not throw or produce Infinity", () => {
    const out = computeSVIIndex({
      rawSVI: 50,
      basePeriodSVI: 0,
      basePeriodDate: "2026-01-01",
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(Number.isFinite(out.indexValue)).toBe(true);
    // (50 / 1) * 100 * 1.0 = 5000
    expect(out.indexValue).toBe(5000);
  });

  it("rounds indexValue to 1 decimal place", () => {
    // rawSVI=123, base=100, richness=1.0 → 123.0 exact
    // Confirm the 1-dp step by tickling a fractional multiplier: richness=1.05
    const out = computeSVIIndex({
      rawSVI: 111,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 5, // 0.05
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    // 111/100 * 100 * 1.05 = 116.55 → rounds to 116.6
    expect(out.indexValue).toBe(116.6);
  });

  it("rounds growthFromBase to 1 decimal place", () => {
    const out = computeSVIIndex({
      rawSVI: 111,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    // index = 111, growth = (111 - 100) / 100 * 100 = 11.0
    expect(out.growthFromBase).toBe(11.0);
  });

  it("returns negative growthFromBase when rawSVI < basePeriodSVI", () => {
    const out = computeSVIIndex({
      rawSVI: 80,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 0,
      metricsMonths: 0,
      connectedSources: [],
      firstSnapshotDate: null,
    });
    expect(out.indexValue).toBe(80);
    expect(out.growthFromBase).toBe(-20);
    expect(out.tier).toBe("Developing");
  });

  describe("tier band matrix", () => {
    // Table-drive the 8 tier bands + pin each boundary condition
    const cases: Array<[number, string]> = [
      [999.9, "Unicorn Track"], // above 500
      [500, "Unicorn Track"], // at 500 boundary (>= gate)
      [499.9, "Exceptional"], // one step below 500
      [350, "Exceptional"], // at 350 boundary
      [349.9, "Elite"],
      [250, "Elite"], // at 250 boundary
      [249.9, "Outstanding"],
      [180, "Outstanding"], // at 180 boundary
      [179.9, "Strong"],
      [130, "Strong"], // at 130 boundary
      [129.9, "Baseline"],
      [100, "Baseline"], // at 100 boundary
      [99.9, "Developing"],
      [70, "Developing"], // at 70 boundary
      [69.9, "Early Stage"],
      [0, "Early Stage"], // at 0 boundary
    ];

    it.each(cases)("indexValue=%s → tier %s", (idx, tier) => {
      // Craft input so indexValue lands exactly on idx:
      //   rawSVI / basePeriodSVI = idx / 100, richness = 1.0
      //   Use basePeriodSVI = 100, rawSVI = idx.
      const out = computeSVIIndex({
        rawSVI: idx,
        basePeriodSVI: 100,
        basePeriodDate: "2026-01-01",
        evidenceCount: 0,
        metricsMonths: 0,
        connectedSources: [],
        firstSnapshotDate: null,
      });
      expect(out.indexValue).toBe(idx);
      expect(out.tier).toBe(tier);
    });
  });

  it("exposes the DataRichnessBreakdown verbatim in the result envelope", () => {
    const out = computeSVIIndex({
      rawSVI: 100,
      basePeriodSVI: 100,
      basePeriodDate: "2026-01-01",
      evidenceCount: 5,
      metricsMonths: 3,
      connectedSources: ["stripe"],
      firstSnapshotDate: null,
    });
    expect(out.dataRichness.evidenceCount).toBe(5);
    expect(out.dataRichness.metricsMonths).toBe(3);
    expect(out.dataRichness.connectedSources).toEqual(["stripe"]);
    expect(out.dataRichness.sourcesBonus).toBe(0.15);
    expect(out.dataRichness.totalFactor).toBe(out.dataRichnessFactor);
  });
});
