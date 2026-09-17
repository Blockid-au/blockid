// G14-S36 F-6 — verification multiplier bounds.

import { describe, expect, it } from "vitest";
import {
  VERIFICATION_LEVEL_LABELS,
  VERIFICATION_MULTIPLIER,
  VERIFICATION_MULTIPLIER_MAX,
  VERIFICATION_MULTIPLIER_MIN,
  boundedVerificationConfidence,
  normaliseVerificationLevel,
  verificationBadgeLabel,
  verificationMeta,
  verificationMultiplier,
} from "./confidence-multiplier";

describe("verificationMultiplier", () => {
  it("maps L0..L5 to the F-6 table", () => {
    expect(VERIFICATION_MULTIPLIER).toEqual({ 0: 0.85, 1: 0.9, 2: 1.0, 3: 1.05, 4: 1.08, 5: 1.1 });
    for (const l of [0, 1, 2, 3, 4, 5] as const) expect(verificationMultiplier(l)).toBe(VERIFICATION_MULTIPLIER[l]);
  });

  it("is monotonic and stays inside 0.85–1.10", () => {
    let prev = 0;
    for (const l of [0, 1, 2, 3, 4, 5] as const) {
      const m = verificationMultiplier(l);
      expect(m).toBeGreaterThan(prev);
      expect(m).toBeGreaterThanOrEqual(VERIFICATION_MULTIPLIER_MIN);
      expect(m).toBeLessThanOrEqual(VERIFICATION_MULTIPLIER_MAX);
      prev = m;
    }
  });

  it("clamps junk to a legal rung (NaN / null / strings / out of range)", () => {
    expect(normaliseVerificationLevel(null)).toBe(0);
    expect(normaliseVerificationLevel(undefined)).toBe(0);
    expect(normaliseVerificationLevel("3")).toBe(3);
    expect(normaliseVerificationLevel(7)).toBe(5);
    expect(normaliseVerificationLevel(-2)).toBe(0);
    expect(normaliseVerificationLevel(2.6)).toBe(3);
    expect(verificationMultiplier("nope")).toBe(0.85);
  });
});

describe("verificationMeta / badge", () => {
  it("abnVerified flips at L2 (ABR Active) and the badge text follows", () => {
    expect(verificationMeta(1)).toMatchObject({ level: 1, multiplier: 0.9, abnVerified: false, label: "Self-declared" });
    expect(verificationMeta(2)).toMatchObject({ level: 2, multiplier: 1, abnVerified: true, label: "Evidence-checked" });
    expect(verificationBadgeLabel(0)).toBe("ABN not verified");
    expect(verificationBadgeLabel(1)).toBe("ABN not verified");
    expect(verificationBadgeLabel(2)).toBe("Verified ABN");
    expect(verificationBadgeLabel(5)).toBe("Verified ABN");
    expect(verificationBadgeLabel(null)).toBe("ABN not verified");
  });

  it("every rung has a label, short code and a requirement sentence", () => {
    for (const l of [0, 1, 2, 3, 4, 5] as const) {
      expect(VERIFICATION_LEVEL_LABELS[l].short).toBe(`L${l}`);
      expect(VERIFICATION_LEVEL_LABELS[l].label.length).toBeGreaterThan(3);
      expect(VERIFICATION_LEVEL_LABELS[l].requires.length).toBeGreaterThan(10);
    }
  });
});

describe("boundedVerificationConfidence", () => {
  it("scales down freely (L0 on self_declared 0.20 → 0.17)", () => {
    expect(boundedVerificationConfidence(0.2, 0, 0.35)).toBeCloseTo(0.17, 3);
    expect(boundedVerificationConfidence(0.5, 1, 0.75)).toBeCloseTo(0.45, 3);
  });

  it("scales up only to the next rung's ceiling", () => {
    // self_declared 0.20 × 1.10 = 0.22 < 0.35 → allowed
    expect(boundedVerificationConfidence(0.2, 5, 0.35)).toBeCloseTo(0.22, 3);
    // a synthetic tight ceiling stops the lift
    expect(boundedVerificationConfidence(0.5, 5, 0.52)).toBe(0.52);
    // ceiling below the current confidence never lowers a >1 multiplier below the input
    expect(boundedVerificationConfidence(0.5, 5, 0.1)).toBe(0.5);
  });

  it("never exceeds 1.0", () => {
    expect(boundedVerificationConfidence(1, 5, 1)).toBe(1);
    expect(boundedVerificationConfidence(0.9, 5, 1)).toBeCloseTo(0.99, 3);
  });
});
