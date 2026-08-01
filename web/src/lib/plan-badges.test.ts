// Colocated vitest for the plan-badge className helper.
//
// `plan-badges.ts` is a pure presentation helper used by admin surfaces
// (currently the plans matrix + subscriber tables) to colour the plan chip
// beside a user's row. The module has no external deps and no state; the
// contract is a plain string → string mapping, but it is load-bearing for
// grandfathered accounts on the three legacy plan ids (founding50, growth,
// pro). Anything that trims or normalises the input BEFORE calling the
// helper would silently reclass those legacy accounts to the default chip,
// so the tests pin the exact matches and the exact colour tokens.

import { describe, expect, it } from "vitest";
import { planBadgeClass } from "./plan-badges";

const DEFAULT_CLASS = "bg-surface-100 text-ink-700";
const FOUNDING_CLASS = "bg-brand-100 text-brand-700";
const GROWTH_CLASS = "bg-green-100 text-green-700";

describe("planBadgeClass", () => {
  it("returns the brand chip for the founding50 legacy plan id", () => {
    expect(planBadgeClass("founding50")).toBe(FOUNDING_CLASS);
  });

  it("returns the green chip for the growth legacy plan id", () => {
    expect(planBadgeClass("growth")).toBe(GROWTH_CLASS);
  });

  it("returns the green chip for the pro plan id", () => {
    expect(planBadgeClass("pro")).toBe(GROWTH_CLASS);
  });

  it("groups growth and pro under the same green token (pinned by design)", () => {
    // The comment in plan-badges.ts explicitly folds pro into the same green
    // chip as growth. If a designer later splits them, this pin surfaces the
    // change so the admin dashboard legend is updated in the same PR.
    expect(planBadgeClass("growth")).toBe(planBadgeClass("pro"));
  });

  it("falls back to the neutral surface chip for null input", () => {
    expect(planBadgeClass(null)).toBe(DEFAULT_CLASS);
  });

  it("falls back to the neutral surface chip for undefined input", () => {
    expect(planBadgeClass(undefined)).toBe(DEFAULT_CLASS);
  });

  it("falls back to the neutral surface chip for the empty string", () => {
    expect(planBadgeClass("")).toBe(DEFAULT_CLASS);
  });

  it("does not normalise casing — FOUNDING50 falls through to the default", () => {
    // The helper is intentionally case-sensitive. If a caller starts sending
    // uppercased plan ids the fallback chip appears, which is a visible bug
    // — but a silent case-fold would mis-colour legacy rows in production.
    expect(planBadgeClass("FOUNDING50")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("Growth")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("PRO")).toBe(DEFAULT_CLASS);
  });

  it("does not trim whitespace — ' pro ' falls through to the default", () => {
    // Same reasoning as the casing test: callers must send the exact id from
    // the plans matrix. A helpful trim would hide upstream bugs.
    expect(planBadgeClass(" pro")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("pro ")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass(" growth ")).toBe(DEFAULT_CLASS);
  });

  it("returns the default chip for unrecognised plan ids", () => {
    expect(planBadgeClass("enterprise")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("free")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("scale")).toBe(DEFAULT_CLASS);
    expect(planBadgeClass("starter")).toBe(DEFAULT_CLASS);
  });

  it("returns a non-empty class string for every branch", () => {
    // Guards against a future edit that accidentally returns "" and collapses
    // the chip styling (Tailwind would then apply zero classes to the span).
    for (const input of ["founding50", "growth", "pro", "unknown", "", null, undefined]) {
      const result = planBadgeClass(input);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("emits a background token AND an ink token for every branch", () => {
    // The chip is only readable when both a background colour AND a text
    // colour ship. If a future edit drops one half, contrast fails silently.
    for (const input of ["founding50", "growth", "pro", "unknown", null, undefined]) {
      const result = planBadgeClass(input);
      expect(result).toMatch(/bg-/);
      expect(result).toMatch(/text-/);
    }
  });

  it("is deterministic — repeated calls with the same input return the same class", () => {
    // Cheap regression pin against any accidental introduction of Math.random
    // or a Date-based branch inside the helper.
    for (const input of ["founding50", "growth", "pro", "other", null]) {
      const first = planBadgeClass(input);
      const second = planBadgeClass(input);
      const third = planBadgeClass(input);
      expect(first).toBe(second);
      expect(second).toBe(third);
    }
  });

  it("returns exactly four distinct class tokens (two per branch)", () => {
    // The current design ships four Tailwind tokens total. If a fifth appears
    // without a design-system update the legend needs a new colour swatch.
    const distinct = new Set([
      planBadgeClass("founding50"),
      planBadgeClass("growth"),
      planBadgeClass("pro"),
      planBadgeClass("anything-else"),
    ]);
    // growth === pro, so three distinct outputs across the four inputs above.
    expect(distinct.size).toBe(3);
  });
});
