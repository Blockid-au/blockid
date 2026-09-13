import { describe, expect, it } from "vitest";
import { hasRealSviScore, realSviScore } from "./real-score";

describe("hasRealSviScore — the column default is not a score", () => {
  it("a fresh account (current_svi = 100 default, no evidence) has no score", () => {
    expect(hasRealSviScore({ hasAnalysis: false, hasSnapshot: false, indexBaseDate: null })).toBe(false);
    expect(realSviScore(100, { hasAnalysis: false, hasSnapshot: false, indexBaseDate: null })).toBeNull();
  });
  it("any analysis, snapshot or index base date makes the stored number real", () => {
    expect(realSviScore(100, { hasAnalysis: true, hasSnapshot: false })).toBe(100);
    expect(realSviScore(142, { hasAnalysis: false, hasSnapshot: true })).toBe(142);
    expect(realSviScore(97, { hasAnalysis: false, hasSnapshot: false, indexBaseDate: "2026-08-01" })).toBe(97);
  });
  it("non-numeric stored values stay null even with evidence", () => {
    expect(realSviScore(null, { hasAnalysis: true, hasSnapshot: false })).toBeNull();
    expect(realSviScore(Number.NaN, { hasAnalysis: true, hasSnapshot: false })).toBeNull();
  });
});
