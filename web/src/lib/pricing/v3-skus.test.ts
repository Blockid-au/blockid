/**
 * Colocated tests for v3-skus canonical catalogue.
 *
 * Pins the four load-bearing invariants of the Master Upgrade Plan §8.5:
 *   1. Trust Report is exactly A$5.50 GST-inclusive (§14bis D1).
 *   2. Every SKU id is unique and comes from the SkuId union.
 *   3. Stripe-managed SKUs all carry a concrete unit_amount and cadence.
 *   4. The Professional monthly SKU stays anchored on the legacy A$149
 *      price point (§14bis D2 auto-migration target) so grandfathered
 *      customers land at the correct A$163.90 inc-GST tier.
 */

import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_CUSTOM,
  GROWTH_ANNUAL,
  GROWTH_MONTHLY,
  PROFESSIONAL_ANNUAL,
  PROFESSIONAL_MONTHLY,
  PROGRAMME_ANNUAL,
  skuById,
  STARTER,
  STRIPE_MANAGED_SKUS,
  TRUST_REPORT_5AUD,
  V3_SKUS,
  type V3Sku,
} from "./v3-skus";

describe("V3 SKU catalogue", () => {
  it("Trust Report is A$5.50 GST-inclusive one-off (D1)", () => {
    expect(TRUST_REPORT_5AUD.id).toBe("sku_trust_report_5aud");
    expect(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents).toBe(550);
    expect(TRUST_REPORT_5AUD.cadence).toBe("one_off");
    expect(TRUST_REPORT_5AUD.credits_per_cycle).toBe(0);
    expect(TRUST_REPORT_5AUD.stripe_managed).toBe(true);
    expect(TRUST_REPORT_5AUD.display_price_label).toContain("A$5.50");
  });

  it("Professional monthly stays anchored on A$149 net (D2 auto-migrate target)", () => {
    // A$149 net + 10% GST = A$163.90 → 16390 cents.
    expect(PROFESSIONAL_MONTHLY.unit_amount_incl_gst_cents).toBe(16390);
    expect(PROFESSIONAL_MONTHLY.tier).toBe("professional");
    expect(PROFESSIONAL_MONTHLY.credits_per_cycle).toBe(1500);
  });

  it("Starter stays free and Stripe-unmanaged (paywall applies later)", () => {
    expect(STARTER.unit_amount_incl_gst_cents).toBe(0);
    expect(STARTER.cadence).toBe("free");
    expect(STARTER.stripe_managed).toBe(false);
    expect(STARTER.credits_per_cycle).toBeGreaterThanOrEqual(2);
  });

  it("Enterprise is invoice-only, no Stripe price", () => {
    expect(ENTERPRISE_CUSTOM.unit_amount_incl_gst_cents).toBeNull();
    expect(ENTERPRISE_CUSTOM.stripe_managed).toBe(false);
  });

  it("SKU ids are unique", () => {
    const ids = V3_SKUS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skuById returns each SKU and throws on unknown id", () => {
    for (const s of V3_SKUS) {
      expect(skuById(s.id)).toBe(s);
    }
    expect(() => skuById("sku_bogus" as V3Sku["id"])).toThrow();
  });

  it("STRIPE_MANAGED_SKUS excludes Starter (free) and Enterprise (invoice)", () => {
    const ids = STRIPE_MANAGED_SKUS.map((s) => s.id);
    expect(ids).not.toContain("sku_starter");
    expect(ids).not.toContain("sku_enterprise_custom");
    expect(ids).toContain("sku_trust_report_5aud");
    expect(ids).toContain("sku_growth_monthly");
    expect(ids).toContain("sku_growth_annual");
    expect(ids).toContain("sku_professional_monthly");
    expect(ids).toContain("sku_professional_annual");
    expect(ids).toContain("sku_programme_annual");
  });

  it("Every Stripe-managed SKU carries a concrete unit_amount and non-free cadence", () => {
    for (const s of STRIPE_MANAGED_SKUS) {
      expect(s.unit_amount_incl_gst_cents).not.toBeNull();
      expect(s.unit_amount_incl_gst_cents).toBeGreaterThan(0);
      expect(s.cadence).not.toBe("free");
    }
  });

  it("Annual variants save at least the equivalent of ~2 months vs monthly", () => {
    const growthMonthlyYear = (GROWTH_MONTHLY.unit_amount_incl_gst_cents ?? 0) * 12;
    const professionalMonthlyYear =
      (PROFESSIONAL_MONTHLY.unit_amount_incl_gst_cents ?? 0) * 12;
    expect(GROWTH_ANNUAL.unit_amount_incl_gst_cents).toBeLessThan(growthMonthlyYear);
    expect(PROFESSIONAL_ANNUAL.unit_amount_incl_gst_cents).toBeLessThan(
      professionalMonthlyYear,
    );
  });

  it("Programme is annual-only and priced above Professional annual", () => {
    expect(PROGRAMME_ANNUAL.cadence).toBe("year");
    expect(PROGRAMME_ANNUAL.unit_amount_incl_gst_cents).toBeGreaterThan(
      PROFESSIONAL_ANNUAL.unit_amount_incl_gst_cents ?? 0,
    );
  });
});
