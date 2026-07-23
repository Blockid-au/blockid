// Portfolio derivation helpers — pure-function coverage.
//
// Anchors the /dashboard/portfolio surface and /api/projects/portfolio
// route against the canonical 8-stage vocabulary and the single-project
// dashboard's next-action ladder.

import { describe, it, expect } from "vitest";
import { deriveCanonicalStage, deriveNextAction, startOfMonthIso } from "./portfolio";
import { CANONICAL_STAGES } from "./journey-vocabulary";

describe("portfolio — deriveCanonicalStage", () => {
  it("uses SVI stage index (0-7) when provided", () => {
    expect(deriveCanonicalStage(0, null)).toBe("idea");
    expect(deriveCanonicalStage(1, null)).toBe("validation");
    expect(deriveCanonicalStage(3, null)).toBe("seed");
    expect(deriveCanonicalStage(7, null)).toBe("public_exit");
  });

  it("falls back to totalSvi bands when stage is missing", () => {
    expect(deriveCanonicalStage(null, 0)).toBe("idea");
    expect(deriveCanonicalStage(null, 29)).toBe("idea");
    expect(deriveCanonicalStage(null, 30)).toBe("validation");
    expect(deriveCanonicalStage(null, 50)).toBe("validation");
    expect(deriveCanonicalStage(null, 51)).toBe("mvp_early_revenue");
    expect(deriveCanonicalStage(null, 70)).toBe("mvp_early_revenue");
    expect(deriveCanonicalStage(null, 71)).toBe("seed");
    expect(deriveCanonicalStage(null, 85)).toBe("seed");
    expect(deriveCanonicalStage(null, 86)).toBe("series_a");
    expect(deriveCanonicalStage(null, 120)).toBe("series_a");
    expect(deriveCanonicalStage(null, 121)).toBe("series_b_c");
    expect(deriveCanonicalStage(null, 160)).toBe("series_b_c");
    expect(deriveCanonicalStage(null, 161)).toBe("late_stage");
    expect(deriveCanonicalStage(null, 200)).toBe("late_stage");
    expect(deriveCanonicalStage(null, 500)).toBe("public_exit");
  });

  it("defaults to idea when both inputs missing", () => {
    expect(deriveCanonicalStage(null, null)).toBe("idea");
    expect(deriveCanonicalStage(undefined, undefined)).toBe("idea");
  });

  it("SVI-stage precedence wins over totalSvi band", () => {
    // stage index 3 → seed, even though SVI 20 would fall back to idea
    expect(deriveCanonicalStage(3, 20)).toBe("seed");
  });

  it("always returns a valid canonical stage", () => {
    for (const s of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 99]) {
      const stage = deriveCanonicalStage(s, null);
      expect(CANONICAL_STAGES).toContain(stage);
    }
  });
});

describe("portfolio — deriveNextAction", () => {
  it("prompts an SVI score when totalSvi is missing", () => {
    expect(deriveNextAction(null).label).toMatch(/first SVI score/i);
    expect(deriveNextAction(null).url).toBe("/");
    expect(deriveNextAction(undefined).url).toBe("/");
  });

  it("mirrors the single-project dashboard ladder", () => {
    expect(deriveNextAction(10).label).toMatch(/refine/i);
    expect(deriveNextAction(40).url).toBe("/workspace/evidence");
    expect(deriveNextAction(65).url).toBe("/workspace/equity-setup");
    expect(deriveNextAction(80).url).toBe("/workspace/data-room");
    expect(deriveNextAction(95).url).toBe("/workspace/fundraise");
  });

  it("boundary values pick the higher band consistently", () => {
    // 30 = start of validation band → "strengthen profile"
    expect(deriveNextAction(30).url).toBe("/workspace/evidence");
    // 50 = end of validation band → still "strengthen profile"
    expect(deriveNextAction(50).url).toBe("/workspace/evidence");
    // 51 = build band starts
    expect(deriveNextAction(51).url).toBe("/workspace/equity-setup");
  });
});

describe("portfolio — startOfMonthIso", () => {
  it("returns the first of the given UTC month at 00:00:00.000Z", () => {
    const mid = new Date(Date.UTC(2026, 6, 15, 12, 34, 56)); // 2026-07-15
    expect(startOfMonthIso(mid)).toBe("2026-07-01T00:00:00.000Z");
  });

  it("handles January (month=0) correctly", () => {
    const jan = new Date(Date.UTC(2026, 0, 31, 23, 59, 59));
    expect(startOfMonthIso(jan)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns an ISO string parsable back to the same UTC instant", () => {
    const iso = startOfMonthIso(new Date(Date.UTC(2026, 11, 31)));
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});
