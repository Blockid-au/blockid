// Pins the runtime shape of `PACKAGE_FEATURE_COST_DEFAULTS` — the client-safe
// mirror of `FEATURE_COSTS` in `lib/credits.ts` (which is `"server-only"` and
// therefore cannot be imported into `components/startup-package/phase-card.tsx`
// et al.). Silent drift between the two maps would show a different pre-flight
// credit total on the Package pre-flight card than the server actually charges,
// which is the exact "no charge without confirmation" invariant memorised in
// [[feedback_transparent_pricing]].

import { describe, expect, it } from "vitest";
import {
  PACKAGE_FEATURE_COST_DEFAULTS,
  type FeatureCostKey,
} from "./deliverable-registry-types";
import { FEATURE_COSTS } from "../credits";

const CANONICAL_KEYS: readonly FeatureCostKey[] = [
  "pitch_deck",
  "svi_report",
  "valuation_detailed",
  "term_sheet",
  "full_report_standard",
  "full_report_premium",
  "financial_projection",
  "gtm_doc",
  "accelerator_apply",
] as const;

describe("PACKAGE_FEATURE_COST_DEFAULTS", () => {
  it("exposes exactly the nine documented FeatureCostKey members", () => {
    expect(new Set(Object.keys(PACKAGE_FEATURE_COST_DEFAULTS))).toEqual(
      new Set(CANONICAL_KEYS),
    );
  });

  it("has no extra keys beyond the FeatureCostKey union", () => {
    for (const key of Object.keys(PACKAGE_FEATURE_COST_DEFAULTS)) {
      expect(CANONICAL_KEYS).toContain(key as FeatureCostKey);
    }
  });

  it("pins the shipped per-feature default cost values", () => {
    expect(PACKAGE_FEATURE_COST_DEFAULTS).toEqual({
      pitch_deck: 1.0,
      svi_report: 0.5,
      valuation_detailed: 0.5,
      term_sheet: 1.0,
      full_report_standard: 2.0,
      full_report_premium: 5.0,
      financial_projection: 1.5,
      gtm_doc: 1.5,
      accelerator_apply: 1.0,
    });
  });

  it("stores every value as a finite positive number", () => {
    for (const [key, value] of Object.entries(PACKAGE_FEATURE_COST_DEFAULTS)) {
      expect(typeof value, `${key} type`).toBe("number");
      expect(Number.isFinite(value), `${key} finite`).toBe(true);
      expect(value, `${key} > 0`).toBeGreaterThan(0);
    }
  });

  it("keeps every value at ≤ 2dp so the UI Intl.NumberFormat renders cleanly", () => {
    for (const [key, value] of Object.entries(PACKAGE_FEATURE_COST_DEFAULTS)) {
      // Rounding to 2dp must equal the original — no 0.499999… floats.
      const rounded = Math.round(value * 100) / 100;
      expect(rounded, `${key}`).toBe(value);
    }
  });

  it("mirrors the canonical FEATURE_COSTS values in lib/credits.ts", () => {
    // The whole point of this file is to keep the client bundle free of the
    // server-only credits module while still displaying the same numbers on
    // the pre-flight card. If a canonical price shifts, both maps must move
    // together — otherwise the founder sees one number and gets charged
    // another. That would break [[feedback_transparent_pricing]].
    for (const key of CANONICAL_KEYS) {
      expect(FEATURE_COSTS[key], `${key} canonical mirror`).toBe(
        PACKAGE_FEATURE_COST_DEFAULTS[key],
      );
    }
  });

  it("premium report costs more than standard (paywall ordering invariant)", () => {
    expect(PACKAGE_FEATURE_COST_DEFAULTS.full_report_premium).toBeGreaterThan(
      PACKAGE_FEATURE_COST_DEFAULTS.full_report_standard,
    );
  });

  it("full reports cost more than any single-deliverable feature", () => {
    const singles: FeatureCostKey[] = [
      "pitch_deck",
      "svi_report",
      "valuation_detailed",
      "term_sheet",
    ];
    const maxSingle = Math.max(
      ...singles.map((k) => PACKAGE_FEATURE_COST_DEFAULTS[k]),
    );
    expect(PACKAGE_FEATURE_COST_DEFAULTS.full_report_standard).toBeGreaterThanOrEqual(
      maxSingle,
    );
    expect(PACKAGE_FEATURE_COST_DEFAULTS.full_report_premium).toBeGreaterThan(
      maxSingle,
    );
  });

  it("summed default cost matches the shipped baseline (14.0 credits after Phase 3.1)", () => {
    // 1.0 + 0.5 + 0.5 + 1.0 + 2.0 + 5.0 + 1.5 + 1.5 + 1.0 = 14.0 — the total
    // the phase-card renders when a founder unchecks nothing. Guards against
    // a silent bump that would raise the sticker price without a matching PR.
    const total = Object.values(PACKAGE_FEATURE_COST_DEFAULTS).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(14.0, 10);
  });

  it("is a plain object literal, not a Map or class instance", () => {
    expect(Object.getPrototypeOf(PACKAGE_FEATURE_COST_DEFAULTS)).toBe(
      Object.prototype,
    );
  });
});
