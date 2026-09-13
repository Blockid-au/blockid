// S28-C — shared bank CSV parser: bank detection, AU dates, dedupe hash.

import { describe, it, expect } from "vitest";
import { analyzeTransactions, detectAndParse, normaliseTransactions, parseAuDate, parseCSV, statementRef, transactionHash } from "./bank-csv";

describe("parseCSV + detectAndParse", () => {
  it("ANZ: Date, Details, Debit, Credit, Balance → signed amounts", () => {
    const rows = parseCSV(["Date,Details,Debit,Credit,Balance", "01/06/2026,AWS EMEA,320.50,,4679.50", "02/06/2026,Stripe payout,,\"1,500.00\",6179.50"].join("\n"));
    const parsed = detectAndParse(rows)!;
    expect(parsed.bankName).toBe("ANZ");
    expect(parsed.txs).toEqual([
      { date: "01/06/2026", amount: -320.5, description: "AWS EMEA" },
      { date: "02/06/2026", amount: 1500, description: "Stripe payout" },
    ]);
  });

  it("CBA: Date, Amount, Description, Balance", () => {
    const parsed = detectAndParse(parseCSV("Date,Amount,Description,Balance\n05/06/2026,-88.00,GOOGLE CLOUD,100"))!;
    expect(parsed.bankName).toBe("CBA");
    expect(parsed.txs[0]).toEqual({ date: "05/06/2026", amount: -88, description: "GOOGLE CLOUD" });
  });

  it("generic Date + Amount", () => {
    const parsed = detectAndParse(parseCSV("Transaction Date,Narrative,Amount\n2026-06-05,Xero,-70"))!;
    expect(parsed.bankName).toBe("Generic");
    expect(parsed.txs[0]).toEqual({ date: "2026-06-05", amount: -70, description: "Xero" });
  });

  it("returns null without a header row it understands", () => {
    expect(detectAndParse(parseCSV("foo,bar\n1,2"))).toBeNull();
    expect(detectAndParse(parseCSV("Date,Amount"))).toBeNull();
  });
});

describe("parseAuDate", () => {
  it.each([
    ["01/06/2026", "2026-06-01"],
    ["1/6/26", "2026-06-01"],
    ["31-12-2025", "2025-12-31"],
    ["2026-06-05", "2026-06-05"],
    ["2026/06/05", "2026-06-05"],
    ["2026-06-05T10:00:00Z", "2026-06-05"],
    ["3 Jun 2026", "2026-06-03"],
    ["3 September 26", "2026-09-03"],
  ])("%s → %s", (raw, iso) => {
    expect(parseAuDate(raw)).toBe(iso);
  });

  it("reads day-first (13/06 is 13 June, never an invalid month)", () => {
    expect(parseAuDate("13/06/2026")).toBe("2026-06-13");
  });

  it("rejects impossible dates and junk", () => {
    expect(parseAuDate("31/02/2026")).toBeNull();
    expect(parseAuDate("00/06/2026")).toBeNull();
    expect(parseAuDate("06/13/2026")).toBeNull();
    expect(parseAuDate("yesterday")).toBeNull();
    expect(parseAuDate("")).toBeNull();
  });
});

describe("transactionHash — dedupe key", () => {
  it("is identical for the same day, cents and narration regardless of whitespace / case", () => {
    const a = transactionHash("2026-06-01", -320.5, "AWS  EMEA ");
    const b = transactionHash("2026-06-01", -320.5, "aws emea");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs on date, amount (to the cent) or narration", () => {
    const base = transactionHash("2026-06-01", -320.5, "AWS");
    expect(transactionHash("2026-06-02", -320.5, "AWS")).not.toBe(base);
    expect(transactionHash("2026-06-01", -320.51, "AWS")).not.toBe(base);
    expect(transactionHash("2026-06-01", 320.5, "AWS")).not.toBe(base);
    expect(transactionHash("2026-06-01", -320.5, "AWS 2")).not.toBe(base);
  });
});

describe("normaliseTransactions", () => {
  it("drops lines without a real date, amount or narration and counts them", () => {
    const { rows, skipped } = normaliseTransactions([
      { date: "01/06/2026", amount: -10, description: "AWS" },
      { date: "junk", amount: -10, description: "X" },
      { date: "01/06/2026", amount: 0, description: "Zero" },
      { date: "01/06/2026", amount: -5, description: "   " },
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
    expect(rows[0]).toMatchObject({ occurredOn: "2026-06-01", amountAud: -10, description: "AWS" });
    expect(rows[0].hash).toBe(transactionHash("2026-06-01", -10, "AWS"));
  });

  it("rounds to cents and trims narration to 500 chars", () => {
    const { rows } = normaliseTransactions([{ date: "01/06/2026", amount: -10.005, description: "x".repeat(600) }]);
    expect(rows[0].amountAud).toBe(-10.01);
    expect(rows[0].description).toHaveLength(500);
  });
});

describe("analyzeTransactions (evidence route contract)", () => {
  it("computes debits, credits, months (day-first dates) and burn", () => {
    const r = analyzeTransactions([
      { date: "01/06/2026", amount: 1500, description: "Stripe" },
      { date: "05/06/2026", amount: -320.5, description: "AWS" },
      { date: "09/08/2026", amount: -2400, description: "Payroll" },
    ]);
    expect(r.totalDebits).toBe(2720.5);
    expect(r.totalCredits).toBe(1500);
    expect(r.months).toBe(2);
    expect(r.avgMonthlyBurn).toBe(1360);
    expect(r.sviImpact).toBe(5);
  });
});

describe("statementRef", () => {
  it("is stable for the same file bytes and distinct across content", () => {
    expect(statementRef("ANZ", "june.csv", "a,b")).toBe(statementRef("ANZ", "june.csv", "a,b"));
    expect(statementRef("ANZ", "june.csv", "a,b")).not.toBe(statementRef("ANZ", "june.csv", "a,c"));
    expect(statementRef("ANZ", "june.csv", "a,b")).toMatch(/^ANZ:june\.csv:[0-9a-f]{16}$/);
  });
});
