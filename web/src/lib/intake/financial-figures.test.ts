// Colocated suite for the shared financial-figure parser (S32-D).
//
// Pins the live sentence from analysis bc9de1ac-… (2026-09-15) and its
// Vietnamese variants: revenue over a period becomes MRR = amount / months,
// the ask and the SAFE cap are read separately, paid pilots are traction and
// never the revenue figure, and nothing is ever inferred from a bare
// "we have revenue".

import { describe, expect, it } from "vitest";

import { formatFigureAud, parseFinancialFigures, parseMoney, parseNumber } from "./financial-figures";

const LIVE_INPUT =
  "Brisbane agri-robotics pre-seed, 3 founders. Traction: 2 paid pilots (A$18,000 each), 14 orchards waitlist, LOIs from 2 co-ops. " +
  "Revenue: A$36,000 in the last 6 months. Raising A$1.2M seed on a SAFE at A$6M cap.";

describe("parseNumber / parseMoney", () => {
  it("reads EN and VI separators the way a founder writes them", () => {
    expect(parseNumber("36,000")).toBe(36_000);
    expect(parseNumber("36.000")).toBe(36_000);
    expect(parseNumber("1.2")).toBe(1.2);
    expect(parseNumber("1,2")).toBe(1.2);
    expect(parseNumber("1.200.000")).toBe(1_200_000);
    expect(parseNumber("1,234,567.89")).toBe(1_234_567.89);
    expect(parseNumber("abc")).toBeNull();
  });

  it("applies scale words in both languages", () => {
    expect(parseMoney("A$1.2M seed")).toBe(1_200_000);
    expect(parseMoney("$250k")).toBe(250_000);
    expect(parseMoney("AUD 36,000")).toBe(36_000);
    expect(parseMoney("36.000 AUD")).toBe(36_000);
    expect(parseMoney("1,2 triệu AUD")).toBe(1_200_000);
    expect(parseMoney("6 triệu đô")).toBe(6_000_000);
    expect(parseMoney("2 tỷ")).toBe(2_000_000_000);
    // A bare number is never money.
    expect(parseMoney("6 months")).toBeNull();
  });
});

describe("parseFinancialFigures — the live input", () => {
  const f = parseFinancialFigures(LIVE_INPUT);

  it("reads 'Revenue: A$36,000 in the last 6 months' as MRR A$6,000 / ARR A$72,000", () => {
    expect(f.revenue).toMatchObject({ mrrAud: 6_000, arrAud: 72_000, kind: "period", periodMonths: 6 });
    expect(f.revenue?.quote).toBe("Revenue: A$36,000 in the last 6 months");
  });

  it("reads the ask and the SAFE cap as two different figures", () => {
    expect(f.ask).toMatchObject({ amountAud: 1_200_000 });
    expect(f.ask?.quote).toBe("Raising A$1.2M");
    expect(f.cap).toMatchObject({ amountAud: 6_000_000, kind: "cap" });
    expect(f.cap?.quote).toBe("A$6M cap");
  });

  it("treats 'paid pilots (A$18,000 each)' as traction, not the revenue figure", () => {
    expect(f.pilots).toMatchObject({ count: 2, amountEachAud: 18_000 });
    expect(f.revenue?.mrrAud).not.toBe(18_000);
  });
});

describe("parseFinancialFigures — revenue phrasings", () => {
  it.each([
    ["MRR is A$18,500 and growing", { mrrAud: 18_500, arrAud: 222_000, kind: "mrr" }],
    ["we do $4k a month in revenue", { mrrAud: 4_000, arrAud: 48_000, kind: "mrr" }],
    ["A$40k MRR, launched in 2024", { mrrAud: 40_000, kind: "mrr" }],
    ["ARR of A$1.2M", { arrAud: 1_200_000, mrrAud: 100_000, kind: "arr" }],
    ["$250k in annual revenue", { arrAud: 250_000, kind: "arr" }],
    ["A$300k in revenue last year", { arrAud: 300_000, kind: "arr" }],
    ["forty paying customers and A$680,000 ARR", { arrAud: 680_000, kind: "arr" }],
    ["Revenue of A$90k last quarter", { mrrAud: 30_000, arrAud: 360_000, kind: "period", periodMonths: 3 }],
    ["Revenue A$120,000 to date", { arrAud: 120_000, mrrAud: 10_000, kind: "unspecified" }],
    ["Doanh thu: 36.000 AUD trong 6 tháng qua", { mrrAud: 6_000, arrAud: 72_000, kind: "period", periodMonths: 6 }],
    ["Doanh thu hàng tháng 5.000 AUD", { mrrAud: 5_000, kind: "mrr" }],
    ["Doanh thu năm ngoái 300.000 AUD", { arrAud: 300_000, kind: "arr" }],
  ])("%s", (text, expected) => {
    expect(parseFinancialFigures(text).revenue).toMatchObject(expected);
  });

  it("never invents a figure from 'we have revenue' or from a denial", () => {
    expect(parseFinancialFigures("We have revenue and customers.").revenue).toBeNull();
    expect(parseFinancialFigures("We are pre-revenue and raising A$500k.").revenue).toBeNull();
    expect(parseFinancialFigures("Chưa có doanh thu, đang gọi vốn 500.000 AUD.").revenue).toBeNull();
    expect(parseFinancialFigures("").revenue).toBeNull();
    expect(parseFinancialFigures(null).revenue).toBeNull();
  });
});

describe("parseFinancialFigures — ask and cap", () => {
  it("reads EN asks with and without a currency mark", () => {
    expect(parseFinancialFigures("We are raising A$1.2M pre-seed to hire two engineers.").ask?.amountAud).toBe(1_200_000);
    expect(parseFinancialFigures("Raising A$750k seed to launch in Brisbane").ask?.amountAud).toBe(750_000);
    expect(parseFinancialFigures("raising 1.5M at a A$9M pre-money").ask?.amountAud).toBe(1_500_000);
  });

  it("reads VI asks (gọi vốn / huy động)", () => {
    expect(parseFinancialFigures("Gọi vốn 1,2 triệu AUD").ask?.amountAud).toBe(1_200_000);
    expect(parseFinancialFigures("Đang huy động 500.000 AUD vòng hạt giống").ask?.amountAud).toBe(500_000);
  });

  it("reads a cap / pre-money / post-money / VI định giá with its kind", () => {
    expect(parseFinancialFigures("SAFE at A$6M cap").cap).toMatchObject({ amountAud: 6_000_000, kind: "cap" });
    expect(parseFinancialFigures("raising 1.5M at a A$9M pre-money").cap).toMatchObject({ amountAud: 9_000_000, kind: "pre_money" });
    expect(parseFinancialFigures("Post-money valuation of A$12M").cap).toMatchObject({ amountAud: 12_000_000, kind: "post_money" });
    expect(parseFinancialFigures("định giá 6 triệu AUD").cap).toMatchObject({ amountAud: 6_000_000, kind: "valuation" });
    expect(parseFinancialFigures("mức định giá trước đầu tư 4 triệu đô").cap).toMatchObject({ amountAud: 4_000_000, kind: "pre_money" });
  });

  it("does not read a market-size sentence as a cap, nor a cap as the ask", () => {
    expect(parseFinancialFigures("TAM is a A$2B market valuation.").cap).toBeNull();
    const f = parseFinancialFigures("raising at a A$6M valuation");
    expect(f.cap?.amountAud).toBe(6_000_000);
    expect(f.ask).toBeNull();
  });
});

describe("formatFigureAud", () => {
  it("prints A$6,000 / A$1.2M / A$6M", () => {
    expect(formatFigureAud(6_000)).toBe("A$6,000");
    expect(formatFigureAud(1_200_000)).toBe("A$1.2M");
    expect(formatFigureAud(6_000_000)).toBe("A$6M");
  });
});
