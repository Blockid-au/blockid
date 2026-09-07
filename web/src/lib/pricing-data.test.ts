// P9-pricing-data-lib-test — colocated coverage for the retired legacy
// pricing fixture.
//
// PRICING_TIERS + discountablePrices were retired 2026-09-07 as part of
// Workstream B3 (Universal 3-rung ladder consolidation). The DB-backed
// catalogue in `src/lib/plans-v2.ts` + `src/config/pricing/plans.csv`
// is the new source of truth — its coverage lives in `plans-v2.test.ts`
// and `src/config/pricing/plans.test.ts`.
//
// This suite now pins:
//   • the retirement itself (empty array + empty derived map) so a future
//     rewrite that silently re-populates the legacy path is caught, and
//   • the surfaces that survived the retirement (NEW_SIGNUP_TIER_IDS
//     allow-list, tiersForNewSignup filter, CREDIT_PACKS re-export,
//     COMPARISON_ROWS, FAQ_ITEMS) which still power the register-with-card
//     API and the legacy /pricing FAQ block.

import { describe, expect, it } from "vitest";
import {
  NEW_SIGNUP_TIER_IDS,
  tiersForNewSignup,
  buildPricingTiers,
  PRICING_TIERS,
  CREDIT_PACKS,
  COMPARISON_ROWS,
  FAQ_ITEMS,
  discountablePrices,
} from "./pricing-data";
import { TRIAL_DAYS } from "./plans/trial-copy";

const BASE_CFG = {
  founding_plan_name: "Founding 100",
  founding_spots_total: 100,
  founding_price_cents: 500,
  founding_credits: 100,
  free_credits_on_signup: 5,
  growth_price_monthly_cents: 9900,
  growth_price_yearly_cents: 95000,
} as const;

describe("PRICING_TIERS — retired 2026-09-07 (Workstream B3)", () => {
  it("is an empty array (retired stub)", () => {
    expect(PRICING_TIERS).toEqual([]);
  });

  it("stays an array (type contract for downstream .filter/.map callers)", () => {
    expect(Array.isArray(PRICING_TIERS)).toBe(true);
  });
});

describe("discountablePrices — derived from retired PRICING_TIERS", () => {
  it("collapses to an empty map now that PRICING_TIERS is [] ", () => {
    expect(discountablePrices).toEqual({});
  });
});

describe("buildPricingTiers() — stub after retirement", () => {
  it("returns [] because PRICING_TIERS is now [] ", () => {
    expect(buildPricingTiers(BASE_CFG)).toEqual([]);
  });
});

describe("NEW_SIGNUP_TIER_IDS — legacy allow-list still consumed by register-with-card API", () => {
  it("pins the exact 2-id allow-list (Growth monthly + annual)", () => {
    expect(NEW_SIGNUP_TIER_IDS).toEqual([
      "growth",
      "growth_annual",
    ]);
  });

  it("excludes the legacy free tier", () => {
    expect(NEW_SIGNUP_TIER_IDS).not.toContain("free");
  });

  it("excludes founding50 after the 2026-09-01 promo sunset (Phase 3b)", () => {
    expect(NEW_SIGNUP_TIER_IDS).not.toContain("founding50");
  });
});

describe("tiersForNewSignup() — pure filter, still works on empty PRICING_TIERS", () => {
  it("returns [] for an empty input", () => {
    expect(tiersForNewSignup([])).toEqual([]);
  });

  it("returns [] for the retired PRICING_TIERS stub", () => {
    expect(tiersForNewSignup(PRICING_TIERS)).toEqual([]);
  });
});

describe("CREDIT_PACKS re-export — still surfaces the isomorphic ladder", () => {
  it("re-exports a non-empty ladder from ./credit-packs", () => {
    expect(CREDIT_PACKS.length).toBeGreaterThan(0);
  });
});

describe("COMPARISON_ROWS — legacy /pricing feature comparison table", () => {
  it("has non-empty rows with feature + free + founding + growth columns", () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThan(0);
    for (const row of COMPARISON_ROWS) {
      expect(row.feature.length).toBeGreaterThan(0);
      expect(row.free.length).toBeGreaterThan(0);
      expect(row.founding.length).toBeGreaterThan(0);
      expect(row.growth.length).toBeGreaterThan(0);
    }
  });
});

describe("FAQ_ITEMS — legacy /pricing FAQ block", () => {
  it("has non-empty q/a pairs and every q ends with '?'", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(0);
    for (const item of FAQ_ITEMS) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
      expect(item.q.endsWith("?")).toBe(true);
    }
  });

  it("free-trial FAQ interpolates TRIAL_DAYS from the trial-copy module", () => {
    const trial = FAQ_ITEMS.find((f) => f.q === "Is there a free trial?");
    expect(trial).toBeDefined();
    expect(trial!.a).toContain(`${TRIAL_DAYS}-day free trial`);
  });
});
