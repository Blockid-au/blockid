import { describe, expect, it } from "vitest";
import { FEATURE_COSTS } from "@/lib/credits";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import {
  TRUST_REPORT_AMOUNT_CENTS,
  TRUST_REPORT_PRICE_AUD,
  TRUST_REPORT_SKU_ID,
  reportPriceLabelFor,
  reportPriceLabelLongFor,
  trustReportPriceLabel,
  trustReportPriceLabelLong,
} from "./trust-report-price";

describe("trust-report-price (G16-B copy truth)", () => {
  it("reads the amount off the v3 SKU the checkout route books", () => {
    expect(TRUST_REPORT_SKU_ID).toBe(TRUST_REPORT_5AUD.id);
    expect(TRUST_REPORT_AMOUNT_CENTS).toBe(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents);
    expect(TRUST_REPORT_PRICE_AUD).toBe(TRUST_REPORT_AMOUNT_CENTS / 100);
  });

  it("agrees with the SKU display label", () => {
    expect(TRUST_REPORT_5AUD.display_price_label).toContain(trustReportPriceLabel());
  });

  // G35 P1 (D27, founder 2026-10-20): credits are decoupled from the A$ price —
  // "1 credit = A$1" is no longer a rule, so FEATURE_COSTS.trust_report is NOT
  // forced to equal TRUST_REPORT_PRICE_AUD any more. Pricing v5 tiers carry
  // their own credit costs (lib/pricing/v5-payg.ts creditCost).
  it("does not couple the credit cost to the A$ price (D27)", () => {
    expect(typeof FEATURE_COSTS.trust_report).toBe("number");
    expect(FEATURE_COSTS.report_snapshot).toBe(19);
    expect(FEATURE_COSTS.report_full).toBe(49);
  });

  it("formats through plans-v2 formatAud (no literal in the helper)", () => {
    expect(trustReportPriceLabel()).toBe(`A$${TRUST_REPORT_PRICE_AUD.toLocaleString("en-AU")}`);
    expect(trustReportPriceLabelLong()).toBe(`${trustReportPriceLabel()} inc. GST`);
  });
});

describe("reportPriceLabelFor (G35 P5 payg switch)", () => {
  it("flag OFF renders exactly the legacy label", () => {
    expect(reportPriceLabelFor(PAYG_OFF_VIEW)).toBe(trustReportPriceLabel());
    expect(reportPriceLabelLongFor(PAYG_OFF_VIEW)).toBe(trustReportPriceLabelLong());
  });

  it("flag ON names the Full tier at the view's display price", () => {
    expect(reportPriceLabelFor(PAYG_ON_VIEW)).toBe(`Full ${PAYG_ON_VIEW.full}`);
    expect(reportPriceLabelLongFor(PAYG_ON_VIEW)).toBe(`Full ${PAYG_ON_VIEW.full} inc. GST`);
    expect(reportPriceLabelFor({ enabled: true, full: "A$55" })).toBe("Full A$55");
  });
});
