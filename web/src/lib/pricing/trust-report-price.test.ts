import { describe, expect, it } from "vitest";
import { FEATURE_COSTS } from "@/lib/credits";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_PRICE_AUD, TRUST_REPORT_SKU_ID, trustReportPriceLabel, trustReportPriceLabelLong } from "./trust-report-price";

describe("trust-report-price (G16-B copy truth)", () => {
  it("reads the amount off the v3 SKU the checkout route books", () => {
    expect(TRUST_REPORT_SKU_ID).toBe(TRUST_REPORT_5AUD.id);
    expect(TRUST_REPORT_AMOUNT_CENTS).toBe(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents);
    expect(TRUST_REPORT_PRICE_AUD).toBe(TRUST_REPORT_AMOUNT_CENTS / 100);
  });

  it("agrees with the credit-side FEATURE_COSTS.trust_report and the SKU display label", () => {
    expect(FEATURE_COSTS.trust_report).toBe(TRUST_REPORT_PRICE_AUD);
    expect(TRUST_REPORT_5AUD.display_price_label).toContain(trustReportPriceLabel());
  });

  it("formats through plans-v2 formatAud (no literal in the helper)", () => {
    expect(trustReportPriceLabel()).toBe(`A$${TRUST_REPORT_PRICE_AUD.toLocaleString("en-AU")}`);
    expect(trustReportPriceLabelLong()).toBe(`${trustReportPriceLabel()} inc-GST`);
  });
});
