import { describe, expect, it } from "vitest";
import { submittedFinancialContext } from "./submitted-financial-context";
const scope = { ownerUserId: "owner", projectId: "project", businessName: "Acme", locale: "en" as const };
describe("submitted financial context is reported evidence, never a valuation admission", () => {
  it("preserves exact quote offsets, hash, currency, period and report scope without converting amounts", () => {
    const text = "Business deck\r\nAcme: MRR AUD 12,000 as of 2026-08-31\r\nOther context";
    const out = submittedFinancialContext({ ...scope, text });
    expect(out).toMatchObject({ valuationEligible: false, verification: "reported_not_independently_verified", scope: { ownerUserId: "owner", projectId: "project", businessName: "Acme" } });
    const o = out.observations[0];
    expect(text.slice(o.start, o.end)).toBe(o.quote);
    expect(o).toMatchObject({ metric: "mrr", currencyMarkers: ["AUD"], periodMarker: "as of 2026-08-31", businessNamedOnLine: true, projected: false, unit: "as_reported_no_conversion" });
    expect(o).not.toHaveProperty("amountAud");
    expect(out.sourceId).toMatch(/^submitted-input:sha256:[a-f0-9]{64}$/);
    expect(out.explanation).toContain(o.quote);
    expect(out.missingInputs).toContain("independent_financial_validation");
  });
  it("does not turn URL digits, competitor values or generic nearby money into this business's revenue", () => {
    const out = submittedFinancialContext({ ...scope, text: "https://example.com/12000\nCompetitor: MRR AUD 9000 as of 2026-08-31\nIndustry revenue AUD 40 billion\nOur funding ask is AUD 2m\nMRR https://example.com/12000" });
    expect(out.observations).toEqual([]);
    expect(out.explanation).toContain("missing information is not zero revenue");
  });
  it("retains zero, foreign currency, unit text and forecasts as unverified without annualising or treating GMV as revenue", () => {
    const out = submittedFinancialContext({ ...scope, text: "MRR $0\nARR USD 1.2m target for 2027-12\nGMV AUD 12m FY2025" });
    expect(out.observations.map(o => o.metric)).toEqual(["mrr", "arr", "gmv"]);
    expect(out.observations[1].projected).toBe(true);
    expect(out.valuationEligible).toBe(false);
    expect(out.missingInputs).toEqual(expect.arrayContaining(["explicit_currency_and_unit", "actual_reporting_period", "financial_source_business_binding"]));
    expect(out.explanation).toContain("Forecasts, GMV and one-off sales");
  });
  it("binds full input hashes and handles literal business punctuation without regex injection", () => {
    const first = submittedFinancialContext({ ...scope, businessName: "A(cme)+", text: "A(cme)+: revenue AUD 10 for 2026-08" });
    const other = submittedFinancialContext({ ...scope, text: "A(cme)+: revenue AUD 10 for 2026-08 changed" });
    expect(first.observations[0].businessNamedOnLine).toBe(true);
    expect(other.observations).toEqual([]);
    expect(first.sourceId).not.toBe(other.sourceId);
  });
  it("provides Vietnamese limits while preserving original source language and text", () => {
    const out = submittedFinancialContext({ ...scope, locale: "vi", text: "MRR AUD 1000" });
    expect(out.explanation).toContain("chưa được kiểm chứng độc lập");
    expect(out.explanation).toContain("MRR AUD 1000");
    expect(out.explanation).toContain("kỳ đo thực tế");
  });
});
