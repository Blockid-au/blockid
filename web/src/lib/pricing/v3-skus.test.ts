/**
 * Colocated tests for the report SKU catalogue (v3-skus).
 *
 * Pins the load-bearing invariants:
 *   1. Trusted Business Report is exactly A$3.00 GST-inclusive (§14bis D1,
 *      re-priced in place 2026-09-10 per founder decision D3 — id frozen).
 *   2. Every SKU id is unique and comes from the SkuId union.
 *   3. Every SKU is Stripe-managed with a concrete unit_amount and a one-off
 *      cadence.
 *   4. Pricing v4 (2026-09-16): the dead §8.5 subscription ladder and its
 *      "1 credit ≈ A$0.025" rule are gone — the module exports the three
 *      A$3 report SKUs and nothing else.
 */

import { describe, expect, it } from "vitest";
import {
  FUNDING_REPORT_3AUD,
  ONE_CLICK_REPORT_3AUD,
  REPORT_SKUS,
  skuById,
  TRUST_REPORT_5AUD,
  type V3Sku,
} from "./v3-skus";
import * as mod from "./v3-skus";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("report SKU catalogue", () => {
  it("Trusted Business Report is A$3.00 GST-inclusive one-off (D1 → D3 re-price, id frozen)", () => {
    // The id is a historical identifier shared with revenue_events.kind and
    // the report_orders.product_sku CHECK — the re-price must never touch it.
    expect(TRUST_REPORT_5AUD.id).toBe("sku_trust_report_5aud");
    expect(TRUST_REPORT_5AUD.name).toBe("Trusted Business Report");
    expect(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents).toBe(300);
    expect(TRUST_REPORT_5AUD.cadence).toBe("one_off");
    expect(TRUST_REPORT_5AUD.credits_per_cycle).toBe(0);
    expect(TRUST_REPORT_5AUD.stripe_managed).toBe(true);
    expect(TRUST_REPORT_5AUD.display_price_label).toBe("A$3.00 inc. GST");
    expect(TRUST_REPORT_5AUD.display_price_label).not.toContain("5.50");
    expect(TRUST_REPORT_5AUD.description).toMatch(/13-area/);
    expect(TRUST_REPORT_5AUD.description).toMatch(/valid 90 days/);
  });

  it("One-Click Investor Analysis is A$3.00 GST-inclusive, guest, its own tier", () => {
    expect(ONE_CLICK_REPORT_3AUD.id).toBe("sku_one_click_report_3aud");
    expect(ONE_CLICK_REPORT_3AUD.tier).toBe("one_click_report");
    expect(ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents).toBe(300);
    expect(ONE_CLICK_REPORT_3AUD.cadence).toBe("one_off");
    expect(ONE_CLICK_REPORT_3AUD.display_price_label).toBe("A$3.00 inc. GST");
  });

  it("Money Finder report is a A$3.00 GST-inclusive one-off, Stripe-managed, its own tier (T0242)", () => {
    expect(FUNDING_REPORT_3AUD.id).toBe("sku_funding_report_3aud");
    expect(FUNDING_REPORT_3AUD.tier).toBe("funding_report");
    expect(FUNDING_REPORT_3AUD.unit_amount_incl_gst_cents).toBe(300);
    expect(FUNDING_REPORT_3AUD.cadence).toBe("one_off");
    expect(FUNDING_REPORT_3AUD.credits_per_cycle).toBe(0);
    expect(FUNDING_REPORT_3AUD.stripe_managed).toBe(true);
    expect(FUNDING_REPORT_3AUD.display_price_label).toBe("A$3.00 inc. GST");
    // §5a positioning: the description sells analysis, never the grant list.
    expect(FUNDING_REPORT_3AUD.description).toMatch(/eligibility checklist/i);
    expect(FUNDING_REPORT_3AUD.description).toMatch(/12-month timeline/i);
    expect(skuById("sku_funding_report_3aud")).toBe(FUNDING_REPORT_3AUD);
  });

  it("lists exactly the three A$3 report SKUs, ids unique", () => {
    expect(REPORT_SKUS.map((s) => s.id)).toEqual([
      "sku_trust_report_5aud",
      "sku_one_click_report_3aud",
      "sku_funding_report_3aud",
    ]);
    const ids = REPORT_SKUS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skuById returns each SKU and throws on unknown id", () => {
    for (const s of REPORT_SKUS) {
      expect(skuById(s.id)).toBe(s);
    }
    expect(() => skuById("sku_bogus" as V3Sku["id"])).toThrow();
    expect(() => skuById("sku_growth_monthly" as V3Sku["id"])).toThrow();
  });

  it("every SKU is Stripe-managed with a concrete unit_amount, one-off cadence, no credit grant", () => {
    for (const s of REPORT_SKUS) {
      expect(s.stripe_managed).toBe(true);
      expect(s.unit_amount_incl_gst_cents).toBe(300);
      expect(s.cadence).toBe("one_off");
      expect(s.credits_per_cycle).toBe(0);
      expect(s.display_price_label).toMatch(/inc. GST$/);
    }
  });

  // Pricing v4 (2026-09-16, plan §3.1): the §8.5 subscription ladder in this
  // file was never wired to Stripe or imported anywhere, and its credit
  // rule (A$0.025) contradicted lib/credits.ts (A$1 list). Gone for good.
  it("no longer exports the dead §8.5 subscription ladder or the A$0.025 credit rule", () => {
    const exported = Object.keys(mod).sort();
    expect(exported).toEqual(
      ["FUNDING_REPORT_3AUD", "ONE_CLICK_REPORT_3AUD", "REPORT_SKUS", "TRUST_REPORT_5AUD", "skuById"].sort(),
    );
    for (const dead of [
      "STARTER",
      "GROWTH_MONTHLY",
      "GROWTH_ANNUAL",
      "PROFESSIONAL_MONTHLY",
      "PROFESSIONAL_ANNUAL",
      "PROGRAMME_ANNUAL",
      "ENTERPRISE_CUSTOM",
      "V3_SKUS",
      "STRIPE_MANAGED_SKUS",
    ]) {
      expect((mod as Record<string, unknown>)[dead], dead).toBeUndefined();
    }
    const src = readFileSync(resolve(__dirname, "v3-skus.ts"), "utf8");
    expect(src).not.toMatch(/0\.025/);
    expect(src).not.toMatch(/53\.90|163\.90|5,389|sku_professional|sku_programme|sku_enterprise/);
  });
});
