import { describe, expect, it } from "vitest";
import { autoCite, itemHasNumber, numericTokens } from "./auto-cite";

const match = (source: string, claim: string) => itemHasNumber(source, numericTokens(claim)[0]!);

describe("G30 citation numeric scale and currency", () => {
  it.each([
    ["SAM A$310M", "A$310 SAM"],
    ["Price A$310", "A$310M price"],
    ["MRR USD100000", "A$100k MRR"],
    ["mrr_aud = 100000", "US$100k MRR"],
    ["Revenue $100000", "A$100k revenue"],
    ["1,200 sessions", "A$1,200 revenue"],
    ["Churn count: 20 customers", "20% churn"],
    ["0 active subscriptions", "A$0 revenue"],
    ["mrr_aud = -100", "A$100 MRR"],
    ["Revenue A$100", "-A$100 revenue"],
    ["mrr_aud = 100%", "A$100 MRR"],
    ["Revenue 100x AUD", "A$100 revenue"],
    ["Churn .5%", "5% churn"],
  ])("rejects incompatible numeric evidence: %s -> %s", (source, claim) => {
    expect(match(source, claim)).toBe(false);
  });

  it.each([
    ["SAM A$310M", "A$310 million SAM"],
    ["mrr_aud = 100000", "A$100k MRR"],
    ["MRR USD100000", "US$100k MRR"],
    ["Revenue 100000 AUD", "A$100k revenue"],
    ["3,302 weekly snapshots", "3302 snapshots"],
    ["churn_90d_pct = 2.1", "2.1% churn"],
    ["ltv_cac = 3.4", "3.4x LTV/CAC"],
    ["mrr_aud = 0", "A$0 MRR"],
    ["mrr_aud = -100", "-A$100 MRR"],
    ["Revenue A$-100", "-A$100 revenue"],
    ["Revenue A$ 100", "A$100 revenue"],
    ["Churn 20 pct", "20% churn"],
    ["Churn .5%", "0.5% churn"],
  ])("preserves compatible numeric evidence: %s -> %s", (source, claim) => {
    expect(match(source, claim)).toBe(true);
  });

  it("does not add a fabricated monetary citation through the real auto-cite consumer", () => {
    const result = autoCite("SAM is A$310.", [{ id: "allowed", label: "Market report", text: "SAM A$310M" }]);
    expect(result.added).toBe(0);
    expect(result.text).not.toContain("[ev:");
  });
});
