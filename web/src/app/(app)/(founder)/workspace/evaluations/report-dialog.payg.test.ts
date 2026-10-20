// G35 Pricing v5 P3 — evaluator deal-flow: once the plan quota is used, a
// full report is offered as the pay-as-you-go Full report (49 credits) or a
// plan with more included reports; using the quota never charges; with PAYG
// on, credits are never converted to A$ (D27). Flag off → copy unchanged.

import { describe, expect, it } from "vitest";
import { describeCost, paygQuotaExhaustedOffer, type ReportCostPreview } from "./report-dialog";
import { reportCreditCosts, reportKindFeature } from "@/lib/evaluations/report-quota";

const base: ReportCostPreview = {
  via: "credits",
  credits: 49,
  list_credits: 49,
  balance: 100,
  remaining_quota: 0,
  quota: { limit: 10, used: 10, remaining: 0, unlimited: false },
  trial: null,
};
const PAYG = { enabled: true, full_price_label: "A$49", full_credits: 49 };

describe("paygQuotaExhaustedOffer", () => {
  it("quota used + PAYG on → PAYG Full (credits) or a plan change", () => {
    const offer = paygQuotaExhaustedOffer("full", { ...base, payg: PAYG });
    expect(offer?.title).toBe("Your included reports are used");
    expect(offer?.body).toContain("49 credits");
    expect(offer?.body).toContain("A$49 one-off, inc. GST");
    expect(offer?.body).toContain("never charged");
  });

  it("quota left, a re-score, or PAYG off → no offer", () => {
    expect(paygQuotaExhaustedOffer("full", { ...base, via: "quota", payg: PAYG })).toBeNull();
    expect(paygQuotaExhaustedOffer("rescore", { ...base, payg: PAYG })).toBeNull();
    expect(paygQuotaExhaustedOffer("full", base)).toBeNull();
    expect(paygQuotaExhaustedOffer("full", null)).toBeNull();
  });
});

describe("describeCost under PAYG", () => {
  it("PAYG on → credits without an A$ conversion (D27)", () => {
    expect(describeCost("full", { ...base, payg: PAYG })).not.toMatch(/A\$/);
    expect(describeCost("full", { ...base, via: "none", balance: 10, payg: PAYG })).not.toMatch(/A\$/);
  });

  it("PAYG off → today's copy (with the A$ figure)", () => {
    expect(describeCost("full", { ...base, credits: 3, list_credits: 3 })).toContain("(A$3.00)");
  });

  it("using the quota never charges", () => {
    expect(describeCost("full", { ...base, via: "quota", remaining_quota: 4, quota: { limit: 10, used: 5, remaining: 5, unlimited: false }, payg: PAYG })).toContain("No credits will be charged");
  });
});

describe("report-quota — PAYG feature + costs", () => {
  it("full beyond quota = report_full (49) when on; trust_report (3) when off; re-score unchanged", () => {
    expect(reportKindFeature("full", true)).toBe("report_full");
    expect(reportKindFeature("full", false)).toBe("trust_report");
    expect(reportKindFeature("rescore", true)).toBe("trust_report_rescore");
    expect(reportCreditCosts(true)).toEqual({ full: 49, rescore: 1 });
    expect(reportCreditCosts(false)).toEqual({ full: 3, rescore: 1 });
  });
});
