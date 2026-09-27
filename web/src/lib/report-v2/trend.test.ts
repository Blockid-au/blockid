// G34 F02/S3 — scorecard trend rules: same method → per-dimension delta;
// different method → null with "method_changed"; first revision → null;
// history not loaded → null; unstamped (pre-SV2) → "method_unknown"; pending
// chapters never produce a delta. Deterministic (UTC date label).

import { describe, expect, it } from "vitest";
import { demoReportV2 } from "./fixtures";
import { withMethodMeta } from "./method-meta";
import type { ReportV2 } from "./schema";
import { assessedScores, computeDimensionTrends, sameTrendMethod, signedDelta, trendBaselineFrom, trendDate, trendMethodOf } from "./trend";

function stamped(sviVersion = "2.2.0"): ReportV2 {
  const { methodMeta: _drop, ...rest } = demoReportV2() as ReportV2;
  return withMethodMeta(rest as ReportV2, sviVersion);
}

function withScores(report: ReportV2, scores: Partial<Record<string, number>>): ReportV2 {
  return { ...report, dimensions: report.dimensions.map((d) => (d.dim in scores ? { ...d, score: scores[d.dim]! } : d)) };
}

describe("computeDimensionTrends", () => {
  it("same method → delta = current − previous for every dimension assessed in both", () => {
    const prev = stamped();
    const cur = withScores(stamped(), { tre: prev.dimensions.find((d) => d.dim === "tre")!.score + 4, mpc: prev.dimensions.find((d) => d.dim === "mpc")!.score - 3 });
    const out = computeDimensionTrends(cur, trendBaselineFrom(prev, "rev-1", "2026-08-12T23:30:00Z"));
    expect(out.status).toEqual({ state: "compared", revisionId: "rev-1", since: "2026-08-12T23:30:00Z" });
    expect(out.deltas.tre).toBe(4);
    expect(out.deltas.mpc).toBe(-3);
    expect(out.deltas.ftv).toBe(0);
    expect(Object.keys(out.deltas)).toHaveLength(8);
  });

  it("rounds fractional deltas and is deterministic", () => {
    const prev = withScores(stamped(), { tre: 60.4 });
    const cur = withScores(stamped(), { tre: 62.1 });
    const base = trendBaselineFrom(prev, "rev-1", "2026-08-12T00:00:00Z");
    expect(computeDimensionTrends(cur, base).deltas.tre).toBe(2);
    expect(computeDimensionTrends(cur, base)).toEqual(computeDimensionTrends(cur, base));
  });

  it("different method (svi version, rubric or profile hash) → no delta, reason method_changed", () => {
    const prev = stamped("2.1.0");
    const out = computeDimensionTrends(stamped("2.2.0"), trendBaselineFrom(prev, "rev-1", "2026-08-12T00:00:00Z"));
    expect(out).toEqual({ status: { state: "unavailable", reason: "method_changed" }, deltas: {} });
    const rubric = { ...stamped(), methodMeta: { ...stamped().methodMeta!, rubric_version: "rubric@v2" } };
    expect(computeDimensionTrends(rubric, trendBaselineFrom(stamped(), "r", "2026-08-12T00:00:00Z")).status).toEqual({ state: "unavailable", reason: "method_changed" });
    const profile = { ...stamped(), methodMeta: { ...stamped().methodMeta!, profile_sha256: "0".repeat(64) } };
    expect(computeDimensionTrends(profile, trendBaselineFrom(stamped(), "r", "2026-08-12T00:00:00Z")).status.state).toBe("unavailable");
  });

  it("knowledge_cutoff / contribution ledger differences are per-run facts, not the method", () => {
    const prev = { ...stamped(), methodMeta: { ...stamped().methodMeta!, knowledge_cutoff: "2026-01-01T00:00:00Z", contribution_ledger: { q1: { x: 1 } } } };
    expect(computeDimensionTrends(stamped(), trendBaselineFrom(prev, "r", "2026-08-12T00:00:00Z")).status.state).toBe("compared");
  });

  it("first revision (baseline null) → no delta, reason first_revision; history not loaded → not_loaded", () => {
    expect(computeDimensionTrends(stamped(), null)).toEqual({ status: { state: "unavailable", reason: "first_revision" }, deltas: {} });
    expect(computeDimensionTrends(stamped(), undefined)).toEqual({ status: { state: "unavailable", reason: "not_loaded" }, deltas: {} });
  });

  it("either document without methodMeta (pre-SV2) → method_unknown, never compared", () => {
    const { methodMeta: _m, ...bare } = stamped();
    expect(computeDimensionTrends(bare as ReportV2, trendBaselineFrom(stamped(), "r", "2026-08-12T00:00:00Z")).status).toEqual({ state: "unavailable", reason: "method_unknown" });
    expect(computeDimensionTrends(stamped(), trendBaselineFrom(bare as ReportV2, "r", "2026-08-12T00:00:00Z")).status).toEqual({ state: "unavailable", reason: "method_unknown" });
  });

  it("a dimension pending in either revision gets no delta (pending is not 0)", () => {
    const prev = stamped();
    const pendingNow = { ...stamped(), dimensions: stamped().dimensions.map((d) => (d.dim === "lco" ? { ...d, band: "pending" as const, scoreBreakdown: d.scoreBreakdown ? { ...d.scoreBreakdown, assessed: false } : d.scoreBreakdown } : d)) };
    const out = computeDimensionTrends(pendingNow, trendBaselineFrom(prev, "r", "2026-08-12T00:00:00Z"));
    expect(out.status.state).toBe("compared");
    expect(out.deltas.lco).toBeUndefined();
    expect(assessedScores(pendingNow).lco).toBeNull();
    const pendingBefore = trendBaselineFrom(pendingNow, "r", "2026-08-12T00:00:00Z");
    expect(computeDimensionTrends(prev, pendingBefore).deltas.lco).toBeUndefined();
  });
});

describe("trend helpers", () => {
  it("method comparison needs both stamps", () => {
    expect(sameTrendMethod(trendMethodOf(stamped()), trendMethodOf(stamped()))).toBe(true);
    expect(sameTrendMethod(null, trendMethodOf(stamped()))).toBe(false);
  });
  it("signed delta and UTC dd/mm/yyyy date", () => {
    expect([signedDelta(4), signedDelta(-3), signedDelta(0)]).toEqual(["+4", "−3", "±0"]);
    expect(trendDate("2026-08-12T23:30:00Z")).toBe("12/08/2026");
    expect(trendDate("not a date")).toBe("");
  });
});
