// Colocated vitest for lib/digest/why-score-moved.ts (G14-S36 F-6 leftover).

import { describe, expect, it } from "vitest";
import { whyScoreMoved, type ScoreVersionSnapshot } from "./why-score-moved";

const withVerification = (
  version: string,
  level: number,
  multiplier: number,
): ScoreVersionSnapshot => ({ version, meta: { verification: { level, multiplier } } });

describe("whyScoreMoved", () => {
  it("returns null when there is no next snapshot", () => {
    expect(whyScoreMoved(null, null)).toBeNull();
    expect(whyScoreMoved(withVerification("2.2.0", 2, 1.0), null)).toBeNull();
  });

  it("returns null when the next snapshot carries no verification meta (pre-S36 row)", () => {
    expect(whyScoreMoved({ version: "2.1.0" }, { version: "2.2.0" })).toBeNull();
  });

  it("returns null when there is no previous snapshot to compare against", () => {
    expect(whyScoreMoved(null, withVerification("2.2.0", 2, 1.0))).toBeNull();
    expect(whyScoreMoved(undefined, withVerification("2.2.0", 2, 1.0))).toBeNull();
  });

  it("returns null when nothing changed (same version, same level, same multiplier)", () => {
    const prev = withVerification("2.2.0", 2, 1.0);
    const next = withVerification("2.2.0", 2, 1.0);
    expect(whyScoreMoved(prev, next)).toBeNull();
  });

  it("returns the sentence on a SVI_VERSION bump (2.1.0 -> 2.2.0)", () => {
    const prev = withVerification("2.1.0", 2, 1.0);
    const next = withVerification("2.2.0", 2, 1.0);
    const result = whyScoreMoved(prev, next);
    expect(result).not.toBeNull();
    expect(result).toMatch(/Why it moved/);
    expect(result).toContain("L2");
  });

  it("returns the sentence with the new level when only the verification level/multiplier changed", () => {
    const prev = withVerification("2.2.0", 0, 0.85);
    const next = withVerification("2.2.0", 3, 1.05);
    const result = whyScoreMoved(prev, next);
    expect(result).not.toBeNull();
    expect(result).toContain("L3");
  });

  it("returns null when the level is unchanged but everything else is identical", () => {
    const prev = withVerification("2.2.0", 3, 1.05);
    const next = withVerification("2.2.0", 3, 1.05);
    expect(whyScoreMoved(prev, next)).toBeNull();
  });

  it("renders the Vietnamese sentence for locale='vi', with the same level token", () => {
    const prev = withVerification("2.1.0", 2, 1.0);
    const next = withVerification("2.2.0", 2, 1.0);
    const result = whyScoreMoved(prev, next, "vi");
    expect(result).not.toBeNull();
    expect(result).toContain("L2");
    expect(result).not.toMatch(/Why it moved/);
  });
});
