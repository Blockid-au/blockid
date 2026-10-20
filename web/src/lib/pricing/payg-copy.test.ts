import { describe, expect, it } from "vitest";
import {
  PAYG_OFF_VIEW,
  PAYG_ON_VIEW,
  audFromCents,
  creditsLabel,
  fundingPriceLine,
  paygRefundSentence,
  paygSingleReportSentence,
  paygView,
  reportFromLabel,
  rescoreLabel,
  tierPriceLabel,
} from "./payg-copy";

describe("payg-copy (G35 P5 switch)", () => {
  it("formats cents and credits", () => {
    expect(audFromCents(1900)).toBe("A$19");
    expect(audFromCents(150000)).toBe("A$1,500");
    expect(audFromCents(1950)).toBe("A$19.50");
    expect(creditsLabel(1)).toBe("1 credit");
    expect(creditsLabel(49)).toBe("49 credits");
  });

  it("flag OFF keeps today's legacy values", () => {
    expect(PAYG_OFF_VIEW.enabled).toBe(false);
    expect(PAYG_OFF_VIEW.reportEntry).toBe("A$3");
    expect(PAYG_OFF_VIEW.funding).toBe("A$3");
    expect(PAYG_OFF_VIEW.fundingCredits).toBe(3);
    expect(rescoreLabel(PAYG_OFF_VIEW)).toBe("A$1");
    expect(reportFromLabel(PAYG_OFF_VIEW)).toBe("A$3");
    expect(fundingPriceLine(PAYG_OFF_VIEW)).toBe("A$3 · or 3 credits");
    expect(paygRefundSentence(PAYG_OFF_VIEW)).toBe(
      "One-off A$3 reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund.",
    );
  });

  it("flag ON renders v5 (D25/D27)", () => {
    expect(PAYG_ON_VIEW.enabled).toBe(true);
    expect([PAYG_ON_VIEW.snapshot, PAYG_ON_VIEW.full, PAYG_ON_VIEW.verified]).toEqual(["A$19", "A$49", "A$149"]);
    expect(PAYG_ON_VIEW.funding).toBe("A$19");
    expect(PAYG_ON_VIEW.fundingCredits).toBe(19);
    expect(rescoreLabel(PAYG_ON_VIEW)).toBe("1 credit");
    expect(reportFromLabel(PAYG_ON_VIEW)).toBe("from A$19");
    expect(fundingPriceLine(PAYG_ON_VIEW)).toBe("A$19 · or 19 credits");
    expect(tierPriceLabel(PAYG_ON_VIEW, "verified")).toBe("A$149");
    expect(paygSingleReportSentence(PAYG_ON_VIEW)).toBe(
      "Without a subscription, buy a single report: Snapshot A$19, Full A$49 or Verified A$149 (all AUD, GST-inclusive).",
    );
    expect(paygRefundSentence(PAYG_ON_VIEW)).toContain("Verified report still in review is refunded in full on request");
  });

  it("display prices follow platform_config", () => {
    const v = paygView({ payg_enabled: true, payg_full_cents: 5900 });
    expect(v.full).toBe("A$59");
    expect(v.snapshot).toBe("A$19");
  });

  it("an invalid config value falls back to the catalogue, never A$0", () => {
    const v = paygView({ payg_enabled: true, payg_snapshot_cents: -5 as number });
    expect(v.snapshot).toBe("A$19");
  });
});
