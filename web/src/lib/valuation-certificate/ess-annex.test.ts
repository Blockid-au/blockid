// Colocated suite for the ESS start-up concession annex (S27-A) — the pure
// checklist builder in ./types.ts:
//   - every s 83A-33 / s 83A-45 row is present, in order, with its reference;
//   - a fact that is not on file → "not confirmed" (never assumed either way);
//   - listed / age / turnover resolve from the stored facts; the age row is
//     conservative (≥ 10 years at issue is "not confirmed", not "not met");
//   - grant-level rows (discount, holding, ownership) are always not confirmed;
//   - the per-share comparison is the range ÷ issued shares, null without one;
//   - the approved copy: instrument name, the not-a-safe-harbour sentence,
//     no "PhD", AU English.

import { describe, expect, it } from "vitest";
import {
  ESS_APPROVAL_INSTRUMENT,
  ESS_APPROVED_METHODS,
  ESS_ANNEX_CLOSING_NOTES,
  ESS_NOT_SAFE_HARBOUR_SENTENCE,
  buildEssAnnex,
  buildEssChecklist,
  emptyEssFacts,
  essChecklistSummary,
  essIndicativePerShare,
  essYearsSinceIncorporation,
  formatAudPerShare,
} from "./types";
import { SAMPLE_CERTIFICATE, SAMPLE_ESS_FACTS } from "./fixtures";

const ISSUED = "2026-09-12T03:00:00.000Z";

describe("buildEssChecklist", () => {
  it("nothing on file → 7 rows in order, every one not confirmed, with the statutory references", () => {
    const rows = buildEssChecklist(emptyEssFacts(), ISSUED);
    expect(rows.map((r) => r.key)).toEqual(["unlisted", "age", "turnover", "resident", "discount", "holding", "ownership"]);
    expect(rows.map((r) => r.reference)).toEqual(["s 83A-33(2)", "s 83A-33(3)", "s 83A-33(4)", "s 83A-33(6)", "s 83A-33(5)", "s 83A-45(4)–(5)", "s 83A-45(6)"]);
    for (const r of rows) expect(r.status).toBe("not_confirmed");
    expect(rows[0].basis).toContain("not recorded in BlockID.au");
    expect(rows[1].basis).toContain("Incorporation date not recorded");
    expect(rows[2].basis).toContain("Turnover not recorded");
    expect(essChecklistSummary(rows)).toEqual({ met: 0, notMet: 0, notConfirmed: 7, total: 7 });
  });

  it("resolves listed / age / turnover from the stored facts; grant-level rows stay not confirmed", () => {
    const rows = buildEssChecklist({ ...SAMPLE_ESS_FACTS, yearsSinceIncorporation: null }, ISSUED);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.unlisted.status).toBe("met");
    expect(by.unlisted.basis).toContain("not listed");
    expect(by.age.status).toBe("met");
    expect(by.age.basis).toContain("Incorporated 2022-03-15 — 4 years at the issue date");
    expect(by.turnover.status).toBe("met");
    expect(by.turnover.basis).toContain("A$420,000");
    expect(by.turnover.basis).toContain("aggregated turnover also counts connected entities");
    expect(by.resident.status).toBe("not_confirmed");
    expect(by.resident.basis).toContain("tax residency is not recorded");
    expect(by.discount.status).toBe("not_confirmed");
    expect(by.holding.status).toBe("not_confirmed");
    expect(by.ownership.status).toBe("not_confirmed");
    expect(essChecklistSummary(rows)).toEqual({ met: 3, notMet: 0, notConfirmed: 4, total: 7 });
  });

  it("listed company → not met; turnover over A$50m → not met; ≥ 10 years old → not confirmed (test the prior income year), never not met", () => {
    const rows = buildEssChecklist({ ...emptyEssFacts(), listed: true, turnoverAud: 50_000_001, incorporatedAt: "2016-09-01" }, ISSUED);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.unlisted.status).toBe("not_met");
    expect(by.turnover.status).toBe("not_met");
    expect(by.age.status).toBe("not_confirmed");
    expect(by.age.basis).toContain("10 years at the issue date");
    // Exactly the cap is within it (s 83A-33(4): "does not exceed").
    expect(buildEssChecklist({ ...emptyEssFacts(), turnoverAud: 50_000_000 }, ISSUED)[2].status).toBe("met");
  });

  it("company age: whole years to the issue date, anniversary-aware; bad dates → null", () => {
    expect(essYearsSinceIncorporation("2022-03-15", ISSUED)).toBe(4);
    expect(essYearsSinceIncorporation("2016-09-13", "2026-09-12T00:00:00Z")).toBe(9);
    expect(essYearsSinceIncorporation("2016-09-12", "2026-09-12T00:00:00Z")).toBe(10);
    expect(essYearsSinceIncorporation(null, ISSUED)).toBeNull();
    expect(essYearsSinceIncorporation("garbage", ISSUED)).toBeNull();
    expect(essYearsSinceIncorporation("2030-01-01", ISSUED)).toBeNull();
  });
});

describe("indicative per-share comparison", () => {
  it("range ÷ issued shares at 4 dp; null without a positive share count", () => {
    const per = essIndicativePerShare(SAMPLE_CERTIFICATE.valuation, 10_000_000);
    expect(per).toEqual({ lowAud: 0.125, midAud: 0.24, highAud: 0.39, basisShares: 10_000_000 });
    expect(essIndicativePerShare(SAMPLE_CERTIFICATE.valuation, null)).toBeNull();
    expect(essIndicativePerShare(SAMPLE_CERTIFICATE.valuation, 0)).toBeNull();
    expect(formatAudPerShare(0.125)).toBe("A$0.125");
    expect(formatAudPerShare(0.24)).toBe("A$0.24");
    expect(formatAudPerShare(1.2345)).toBe("A$1.2345");
    expect(formatAudPerShare(Number.NaN)).toBe("A$0.00");
  });

  it("buildEssAnnex stamps the years and carries the frozen facts", () => {
    const annex = buildEssAnnex(SAMPLE_ESS_FACTS, SAMPLE_CERTIFICATE.valuation, ISSUED);
    expect(annex.version).toBe("ess-1");
    expect(annex.facts.yearsSinceIncorporation).toBe(4);
    expect(annex.facts.issuedShares).toBe(10_000_000);
    expect(annex.checklist).toHaveLength(7);
    expect(annex.indicativePerShare?.basisShares).toBe(10_000_000);
  });
});

describe("approved copy", () => {
  it("names the 2015 approval instrument, keeps the not-a-safe-harbour sentence intact, AU English, no PhD", () => {
    expect(ESS_APPROVAL_INSTRUMENT).toBe("Income Tax Assessment (Methods for Valuing Unlisted Shares) Approval 2015");
    expect(ESS_NOT_SAFE_HARBOUR_SENTENCE).toContain("is not a market value determined under an ATO-approved method and is not an ATO safe-harbour valuation for ESS purposes");
    expect(ESS_NOT_SAFE_HARBOUR_SENTENCE).toContain("signed net tangible assets calculation or a valuation from a qualified valuer");
    const all = [ESS_NOT_SAFE_HARBOUR_SENTENCE, ...ESS_APPROVED_METHODS.map((m) => `${m.title} ${m.body}`), ...ESS_ANNEX_CLOSING_NOTES].join(" ");
    expect(all).toContain(ESS_APPROVAL_INSTRUMENT);
    expect(all).toContain("net tangible assets");
    expect(all).toContain("signed off by a director or the chief financial officer");
    expect(all).toContain("qualified independent valuer");
    expect(all).toContain("arm's-length");
    expect(all).toContain("not tax, legal or financial advice");
    expect(all).not.toMatch(/PhD/);
    expect(all).not.toMatch(/\bcapitali[z]e|organi[z]e|licen[s]e\b/);
  });
});
