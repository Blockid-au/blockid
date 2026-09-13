// Colocated suite for the pure resolution builders (S26-B).
//
//   share-issue  class / number / price / allottee / consideration in the
//                RESOLVED THAT text; s 254X 28-day reminder; price unknown →
//                "not recorded", never an invented figure
//   dividend     s 254T three-limb statement; amount, per share, franking,
//                payment date; null paid_at → "a date to be fixed"
//   esop         pool size + %, vesting defaults only when stored
//   directors    de-duplicated + trimmed; one → soleDirector + s 248B basis;
//                none → blank blocks, s 248A basis
//   payload      version br-v1, company block verbatim, never BlockID's entity

import { describe, expect, it } from "vitest";
import { buildDividendResolution, buildEsopResolution, buildShareIssueResolution, isResolutionKind, longDate, periodLabel, resolutionCostLabel, resolutionSummary } from "./build";
import { FIXTURE_COMPANY, FIXTURE_DIRECTORS, FIXTURE_DIVIDEND, FIXTURE_ESOP, FIXTURE_SHARE_ISSUE } from "./fixtures";

const NOW = new Date("2026-09-13T01:00:00Z");

describe("buildShareIssueResolution", () => {
  it("references class, number, price, allottee and consideration; reminds of s 254X within 28 days", () => {
    const p = buildShareIssueResolution({ company: FIXTURE_COMPANY, record: FIXTURE_SHARE_ISSUE, directors: FIXTURE_DIRECTORS, now: NOW });
    expect(p.version).toBe("br-v1");
    expect(p.kind).toBe("share-issue");
    expect(p.recordId).toBe(FIXTURE_SHARE_ISSUE.id);
    expect(p.company).toEqual(FIXTURE_COMPANY);
    expect(p.title).toContain("issue of shares");
    expect(p.basis).toContain("s 248A");
    expect(p.basis).toContain("Passed when signed by all directors entitled to vote");
    expect(p.soleDirector).toBe(false);
    expect(p.directors).toEqual(FIXTURE_DIRECTORS);
    expect(p.facts).toEqual(
      expect.arrayContaining([
        { label: "Allottee", value: "Seed Investor Pty Ltd (investor)" },
        { label: "Share class", value: "Ordinary" },
        { label: "Number of shares", value: "400,000" },
        { label: "Issue price", value: "A$0.2500 per share" },
        { label: "Consideration", value: "A$100,000.00" },
        { label: "Effective date", value: "1 August 2026" },
        { label: "Round", value: "Seed" },
      ]),
    );
    expect(p.resolutions[0]).toMatch(/^RESOLVED THAT the Company issue and allot 400,000 fully paid Ordinary shares .* to Seed Investor Pty Ltd at A\$0\.2500 per share, for a consideration of A\$100,000\.00 in cash, with effect from 1 August 2026\.$/);
    for (const r of p.resolutions) expect(r).toMatch(/^RESOLVED THAT /);
    expect(p.notes.join(" ")).toContain("Form 484");
    expect(p.notes.join(" ")).toContain("within 28 days");
    expect(p.notes.join(" ")).toContain("s 254X");
    expect(JSON.stringify(p)).not.toMatch(/Auschain|659 615 111|BlockID/);
  });

  it("price not recorded → consideration 'as recorded in the share register', no invented number; total derived from price × shares when only the price is known", () => {
    const noPrice = buildShareIssueResolution({ company: FIXTURE_COMPANY, record: { ...FIXTURE_SHARE_ISSUE, pricePerShareAud: null, totalValueAud: null, roundName: null, effectiveDate: null }, directors: [], now: NOW });
    expect(noPrice.facts).toEqual(expect.arrayContaining([{ label: "Issue price", value: "not recorded" }, { label: "Consideration", value: "not recorded" }]));
    expect(noPrice.facts.find((f) => f.label === "Round")).toBeUndefined();
    expect(noPrice.resolutions[0]).toContain("at not recorded, for a consideration of as recorded in the share register (price per share not recorded on the issue), with effect from the date of this resolution");
    expect(noPrice.directors).toEqual([]);
    expect(noPrice.soleDirector).toBe(false);

    const derived = buildShareIssueResolution({ company: FIXTURE_COMPANY, record: { ...FIXTURE_SHARE_ISSUE, totalValueAud: null }, directors: [], now: NOW });
    expect(derived.facts).toEqual(expect.arrayContaining([{ label: "Consideration", value: "A$100,000.00" }]));
  });
});

describe("buildDividendResolution", () => {
  it("carries the s 254T solvency statement and the dividend terms", () => {
    const p = buildDividendResolution({ company: FIXTURE_COMPANY, record: FIXTURE_DIVIDEND, directors: FIXTURE_DIRECTORS, now: NOW });
    expect(p.kind).toBe("dividend");
    expect(p.title).toContain("declaration of dividend");
    const r0 = p.resolutions[0];
    expect(r0).toContain("assets exceed its liabilities and the excess is sufficient for the payment of the dividend");
    expect(r0).toContain("fair and reasonable to the Company's shareholders as a whole");
    expect(r0).toContain("does not materially prejudice the Company's ability to pay its creditors");
    expect(r0).toContain("s 254T");
    expect(p.resolutions[1]).toContain("fully franked dividend of A$0.050000 per share, totalling A$50,000.00");
    expect(p.resolutions[1]).toContain("June 2026");
    expect(p.resolutions[1]).toContain("paid on 15 July 2026");
    expect(p.resolutions[2]).toContain("franked at 100% at the corporate tax rate for imputation of 25%");
    expect(p.resolutions[2]).toContain("s 202-80");
    expect(p.facts).toEqual(expect.arrayContaining([{ label: "Total dividend", value: "A$50,000.00" }, { label: "Paying shareholders", value: "2" }, { label: "Franking", value: "100% (fully franked)" }]));
  });

  it("partial franking and no payment date", () => {
    const p = buildDividendResolution({ company: FIXTURE_COMPANY, record: { ...FIXTURE_DIVIDEND, frankingPct: 50, paidAt: null, companyTaxRate: 0.3 }, directors: [{ name: " Jane Founder " }], now: NOW });
    expect(p.resolutions[1]).toContain("franked to 50% dividend");
    expect(p.resolutions[1]).toContain("paid on a date to be fixed by the directors");
    expect(p.facts).toEqual(expect.arrayContaining([{ label: "Corporate tax rate for imputation", value: "30%" }, { label: "Payment date", value: "a date to be fixed by the directors" }]));
    expect(p.directors).toEqual([{ name: "Jane Founder" }]);
    expect(p.soleDirector).toBe(true);
    expect(p.basis).toContain("s 248B");
  });
});

describe("buildEsopResolution", () => {
  it("pool size, pool % and stored vesting defaults", () => {
    const p = buildEsopResolution({ company: FIXTURE_COMPANY, record: FIXTURE_ESOP, directors: FIXTURE_DIRECTORS, now: NOW });
    expect(p.kind).toBe("esop");
    expect(p.title).toContain("employee share option plan");
    expect(p.resolutions[0]).toBe("RESOLVED THAT the Company adopt the Acme Robotics Pty Ltd Employee Share Option Plan (the Plan) on the terms of the Plan rules tabled with this resolution.");
    expect(p.resolutions[1]).toContain("1,000,000 shares");
    expect(p.resolutions[1]).toContain("approximately 10%");
    expect(p.resolutions[2]).toContain("48 months with a 12-month cliff");
    expect(p.facts).toEqual(expect.arrayContaining([{ label: "Pool size", value: "1,000,000 shares (10% of the fully diluted capital)" }, { label: "Already allocated", value: "150,000" }]));
    expect(p.notes.join(" ")).toContain("Div 83A");
  });

  it("no stored vesting → 'as set out in each offer letter' (no invented default); pool % derived from fully diluted when missing", () => {
    const p = buildEsopResolution({ company: FIXTURE_COMPANY, record: { ...FIXTURE_ESOP, vestingMonths: null, cliffMonths: null, poolPct: null, fullyDilutedShares: 8_000_000 }, directors: [], now: NOW });
    expect(p.resolutions[2]).toContain("vest over as set out in each offer letter made under the Plan");
    expect(p.facts).toEqual(expect.arrayContaining([{ label: "Default vesting", value: "as set out in each offer letter made under the Plan" }, { label: "Pool size", value: "1,000,000 shares (12.5% of the fully diluted capital)" }]));
    expect(JSON.stringify(p)).not.toMatch(/48 months|12-month/);
    const noPct = buildEsopResolution({ company: FIXTURE_COMPANY, record: { ...FIXTURE_ESOP, poolPct: null, fullyDilutedShares: null }, directors: [], now: NOW });
    expect(noPct.facts).toEqual(expect.arrayContaining([{ label: "Pool size", value: "1,000,000 shares" }]));
  });
});

describe("helpers", () => {
  it("directors are de-duplicated case-insensitively and blanks dropped", () => {
    const p = buildEsopResolution({ company: FIXTURE_COMPANY, record: FIXTURE_ESOP, directors: [{ name: "Jane Founder" }, { name: "jane founder" }, { name: "  " }, { name: "Raj" }], now: NOW });
    expect(p.directors).toEqual([{ name: "Jane Founder" }, { name: "Raj" }]);
  });
  it("kind guard, dates, labels, summary", () => {
    expect(isResolutionKind("share-issue")).toBe(true);
    expect(isResolutionKind("minutes")).toBe(false);
    expect(longDate("2026-08-01")).toBe("1 August 2026");
    expect(periodLabel("2026-06")).toBe("June 2026");
    expect(periodLabel("FY26")).toBe("FY26");
    expect(resolutionCostLabel(1, false)).toBe("1 credit");
    expect(resolutionCostLabel(2, false)).toBe("2 credits");
    expect(resolutionCostLabel(1, true)).toBe("included in your plan");
    expect(resolutionSummary("dividend", "r-1", { id: "x", contentHash: "h", issuedAt: "t", creditsCharged: 1 }).pdfUrl).toBe("/api/board-resolutions/dividend/r-1/pdf");
  });
});
