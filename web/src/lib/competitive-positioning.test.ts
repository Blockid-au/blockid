import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Competitive Positioning — colocated tests for the pure SVI-boost helpers
// in `src/lib/competitive-positioning.ts`. These two functions feed the MPC
// (Market Clarity) and SVM (Strategic Moat) sub-scores that appear on every
// founder dashboard + investor pack, so any silent re-tuning of the boost
// tiers, caps, or rounding must break these tests before it can drift a
// public score.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

import {
  computeMpcBoostFromCompetitiveAnalysis,
  computeSvmBoostFromCompetitiveDifferentiation,
} from "./competitive-positioning";

describe("computeMpcBoostFromCompetitiveAnalysis", () => {
  it("returns 0 when no analysis has been done", () => {
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 0, false)).toBe(0);
  });

  it("adds 1.5 points per competitor analyzed (rounded)", () => {
    // 1 competitor = 1.5 pts → rounds to 2
    expect(computeMpcBoostFromCompetitiveAnalysis(1, 0, false)).toBe(2);
    // 2 competitors = 3 pts
    expect(computeMpcBoostFromCompetitiveAnalysis(2, 0, false)).toBe(3);
  });

  it("caps competitor boost at 6 points (4 competitors)", () => {
    expect(computeMpcBoostFromCompetitiveAnalysis(4, 0, false)).toBe(6);
    // Extra competitors beyond 4 should not increase the competitor-derived boost.
    expect(computeMpcBoostFromCompetitiveAnalysis(10, 0, false)).toBe(6);
  });

  it("adds 0.3 points per feature extracted (rounded)", () => {
    // 10 features = 3 pts
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 10, false)).toBe(3);
    // 20 features = 6 pts
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 20, false)).toBe(6);
  });

  it("caps feature boost at 13 points", () => {
    // 43+ features hits the cap of 13
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 43, false)).toBe(13);
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 200, false)).toBe(13);
  });

  it("adds 5-point bonus when a positioning statement exists", () => {
    expect(computeMpcBoostFromCompetitiveAnalysis(0, 0, true)).toBe(5);
  });

  it("combines all three signals (competitors + features + statement)", () => {
    // 4 competitors (6) + 43 features (12.9 → capped 13) + statement (5) = 24
    expect(computeMpcBoostFromCompetitiveAnalysis(4, 43, true)).toBe(24);
  });

  it("never exceeds the aggregate ceiling (6 + 13 + 5 = 24)", () => {
    expect(
      computeMpcBoostFromCompetitiveAnalysis(1000, 10_000, true),
    ).toBeLessThanOrEqual(24);
  });

  it("returns an integer (always rounded)", () => {
    const result = computeMpcBoostFromCompetitiveAnalysis(1, 7, false);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("computeSvmBoostFromCompetitiveDifferentiation", () => {
  it("returns 1 point baseline when differentiation is low and no unique features", () => {
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 0)).toBe(1);
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 30)).toBe(1);
  });

  it("adds 4 points when differentiation score is in the mid tier (>30 to ≤50)", () => {
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 31)).toBe(4);
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 50)).toBe(4);
  });

  it("adds 8 points when differentiation score is high (>50)", () => {
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 51)).toBe(8);
    expect(computeSvmBoostFromCompetitiveDifferentiation(0, 100)).toBe(8);
  });

  it("adds 2 points per unique founder feature", () => {
    // 3 unique features = 6 pts + baseline 1 = 7
    expect(computeSvmBoostFromCompetitiveDifferentiation(3, 0)).toBe(7);
  });

  it("caps unique-feature boost at 15 points (7.5+ features)", () => {
    // 8 features = 16 → capped 15; +1 baseline = 16
    expect(computeSvmBoostFromCompetitiveDifferentiation(8, 0)).toBe(16);
    // 100 features cannot exceed cap
    expect(computeSvmBoostFromCompetitiveDifferentiation(100, 0)).toBe(16);
  });

  it("combines differentiation + unique features signals", () => {
    // 5 unique (10) + high diff (8) = 18
    expect(computeSvmBoostFromCompetitiveDifferentiation(5, 75)).toBe(18);
  });

  it("never exceeds the aggregate ceiling (15 + 8 = 23)", () => {
    expect(
      computeSvmBoostFromCompetitiveDifferentiation(1000, 100),
    ).toBeLessThanOrEqual(23);
  });

  it("returns an integer (always rounded)", () => {
    const result = computeSvmBoostFromCompetitiveDifferentiation(2, 55);
    expect(Number.isInteger(result)).toBe(true);
  });
});
