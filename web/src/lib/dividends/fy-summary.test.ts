// FY aggregation (S28-A): FY parsing / defaults, the 30 June 23:59 AEST
// boundary, per-shareholder totals from live statements only (voided and
// out-of-year statements excluded), DRIP shares in the totals, the ATO /
// not-tax-advice wording, the statement number format.

import { describe, expect, it } from "vitest";
import {
  TAX_STATEMENT_ATO_NOTE,
  TAX_STATEMENT_GENERAL_NOTE,
  TAX_STATEMENT_NO_RE,
  buildShareholderTaxStatement,
  currentFy,
  fyLabel,
  fyOfDate,
  fyOptions,
  lastCompletedFy,
  parseFy,
  summariseFinancialYear,
  sydneyDate,
  taxStatementCostLabel,
  taxStatementNumber,
} from "./fy-summary";
import { SAMPLE_COMPANY, SAMPLE_RECORD, SAMPLE_STATEMENT, SAMPLE_STATEMENT_WITHHELD } from "./fixtures";
import { buildDividendStatement } from "./statement";

function stmt(no: string, paidAt: string, over: Partial<Parameters<typeof buildDividendStatement>[0]> = {}) {
  return {
    statementNo: no,
    voidedAt: null as string | null,
    payload: buildDividendStatement(
      {
        company: SAMPLE_COMPANY,
        record: { ...SAMPLE_RECORD, paidAt, period: paidAt.slice(0, 7) },
        payout: { name: "Jane Founder", role: "founder", shares: 600_000, ownershipPct: 60, grossDividend: 30_000, frankingCredit: 10_000 },
        shareholder: { id: "22222222-2222-4222-8222-222222222222", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, tfnOnFile: true },
        now: new Date("2026-07-16T02:00:00.000Z"),
        ...over,
      },
      no,
    ),
  };
}

describe("financial-year helpers", () => {
  it("parses and labels FYs; rejects malformed / non-consecutive labels", () => {
    expect(fyLabel(2025)).toBe("2025-26");
    expect(fyLabel(2099)).toBe("2099-00");
    expect(parseFy("2025-26")).toMatchObject({ startYear: 2025, endYear: 2026, start: "2025-07-01", end: "2026-06-30" });
    expect(parseFy("2025-27")).toBeNull();
    expect(parseFy("2025")).toBeNull();
    expect(parseFy("")).toBeNull();
    expect(parseFy(null)).toBeNull();
  });

  it("puts 30 Jun 23:59 AEST in the closing FY and 1 Jul 00:30 AEST in the next", () => {
    // 30 Jun 23:59 AEST = 13:59Z
    expect(sydneyDate("2026-06-30T13:59:00.000Z")).toBe("2026-06-30");
    expect(fyOfDate("2026-06-30T13:59:00.000Z")).toBe("2025-26");
    // 30 Jun 14:30Z = 1 Jul 00:30 AEST
    expect(sydneyDate("2026-06-30T14:30:00.000Z")).toBe("2026-07-01");
    expect(fyOfDate("2026-06-30T14:30:00.000Z")).toBe("2026-27");
    // Date-only strings pass through unchanged.
    expect(fyOfDate("2026-06-30")).toBe("2025-26");
    expect(fyOfDate("2026-07-01")).toBe("2026-27");
    expect(fyOfDate("2026-01-15")).toBe("2025-26");
    expect(fyOfDate("garbage")).toBeNull();
  });

  it("defaults the picker to the last completed FY", () => {
    expect(currentFy(new Date("2026-09-13T00:00:00Z"))).toBe("2026-27");
    expect(lastCompletedFy(new Date("2026-09-13T00:00:00Z"))).toBe("2025-26");
    expect(lastCompletedFy(new Date("2026-05-01T00:00:00Z"))).toBe("2024-25");
    // 1 Jul 00:30 AEST: the new FY has started, 2025-26 just completed.
    expect(lastCompletedFy(new Date("2026-06-30T14:30:00Z"))).toBe("2025-26");
    expect(fyOptions([stmt("DS-AAAAA-AAAAA", "2023-12-01")], new Date("2026-09-13T00:00:00Z"))).toEqual(["2026-27", "2025-26", "2023-24"]);
  });

  it("numbers and prices", () => {
    expect(taxStatementNumber("2025-26", 3)).toBe("TS-2025-26-3");
    expect(taxStatementNumber("2025-26", 0)).toBe("TS-2025-26-1");
    expect(TAX_STATEMENT_NO_RE.test("TS-2025-26-12")).toBe(true);
    expect(TAX_STATEMENT_NO_RE.test("DS-2025-26-12")).toBe(false);
    expect(taxStatementCostLabel(2, false)).toBe("2 credits per financial year");
    expect(taxStatementCostLabel(2, true)).toBe("included in your plan");
  });
});

describe("summariseFinancialYear", () => {
  it("aggregates live statements paid inside the FY per shareholder, skipping voided and out-of-year rows", () => {
    const statements = [
      stmt("DS-AAAAA-AAAAA", "2025-09-30"),
      stmt("DS-BBBBB-BBBBB", "2026-03-31"),
      stmt("DS-CCCCC-CCCCC", "2026-06-30"), // last day — in
      stmt("DS-DDDDD-DDDDD", "2026-07-01"), // next FY — out
      { ...stmt("DS-EEEEE-EEEEE", "2026-01-31"), voidedAt: "2026-02-01T00:00:00Z" }, // voided — out
      { statementNo: "DS-FFFFF-FFFFF", voidedAt: null, payload: SAMPLE_STATEMENT_WITHHELD }, // Seed Investor, paid 2026-07-15 — out (next FY)
      { statementNo: "DS-GGGGG-GGGGG", voidedAt: null, payload: { ...SAMPLE_STATEMENT_WITHHELD, dividend: { ...SAMPLE_STATEMENT_WITHHELD.dividend, paidAt: "2025-12-15" } } },
    ];
    const s = summariseFinancialYear({ fy: "2025-26", statements })!;
    expect(s.fy.label).toBe("2025-26");
    expect(s.excluded).toEqual({ voided: 1, outsideFy: 2, undated: 0 });
    expect(s.shareholders.map((x) => x.name)).toEqual(["Jane Founder", "Seed Investor Pty Ltd"]);

    const jane = s.shareholders[0];
    expect(jane.shareholderKey).toBe("id:22222222-2222-4222-8222-222222222222");
    expect(jane.distributions.map((d) => d.paidAt)).toEqual(["2025-09-30", "2026-03-31", "2026-06-30"]);
    expect(jane.totals).toMatchObject({ distributions: 3, grossAud: 90_000, frankedAud: 90_000, unfrankedAud: 0, frankingCreditAud: 30_000, tfnWithheldAud: 0, netPaidAud: 90_000, grossedUpAud: 120_000, dripShares: 0 });

    const seed = s.shareholders[1];
    expect(seed.shareholderKey).toBe("name:seed investor pty ltd");
    expect(seed.tfnOnFile).toBe(false);
    expect(seed.totals).toMatchObject({ distributions: 1, grossAud: 20_000, frankedAud: 10_000, unfrankedAud: 10_000, frankingCreditAud: 4_285.71, tfnWithheldAud: 4_700, netPaidAud: 15_300, grossedUpAud: 24_285.71 });
  });

  it("returns null for a bad FY and counts undated statements", () => {
    expect(summariseFinancialYear({ fy: "nope", statements: [] })).toBeNull();
    const s = summariseFinancialYear({ fy: "2025-26", statements: [{ statementNo: "DS-AAAAA-AAAAA", voidedAt: null, payload: { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "" } } }] })!;
    expect(s.shareholders).toHaveLength(0);
    expect(s.excluded.undated).toBe(1);
  });

  it("carries DRIP shares into the totals and the notes", () => {
    const drip = { electionId: "e1", participationPct: 50, priceBasis: "manual" as const, priceAud: 1.5, shares: 10_000, reinvestedAud: 15_000, residualAud: 0, cashPaidAud: 15_000, skipped: null };
    const s = summariseFinancialYear({ fy: "2025-26", statements: [stmt("DS-AAAAA-AAAAA", "2025-09-30", { drip }), stmt("DS-BBBBB-BBBBB", "2026-03-31")] })!;
    const jane = s.shareholders[0];
    expect(jane.totals.dripShares).toBe(10_000);
    expect(jane.totals.dripReinvestedAud).toBe(15_000);
    const payload = buildShareholderTaxStatement({ company: SAMPLE_COMPANY, summary: jane, fy: s.fy, now: new Date("2026-07-16T02:00:00Z") }, "TS-2025-26-1");
    expect(payload.notes.some((n) => n.includes("10,000 shares were allotted under the dividend reinvestment plan"))).toBe(true);
  });
});

describe("buildShareholderTaxStatement", () => {
  it("freezes the founder's entity, the FY, the per-distribution table, reconciled totals and the ATO / not-tax-advice wording", () => {
    const s = summariseFinancialYear({ fy: "2025-26", statements: [stmt("DS-AAAAA-AAAAA", "2025-09-30"), stmt("DS-BBBBB-BBBBB", "2026-06-30")] })!;
    const p = buildShareholderTaxStatement({ company: SAMPLE_COMPANY, summary: s.shareholders[0], fy: s.fy, now: new Date("2026-07-16T02:00:00Z") }, "TS-2025-26-1");
    expect(p.version).toBe("ts-v1");
    expect(p.statementNo).toBe("TS-2025-26-1");
    expect(p.statementDate).toBe("2026-07-16T02:00:00.000Z");
    expect(p.fy).toMatchObject({ label: "2025-26", start: "2025-07-01", end: "2026-06-30" });
    expect(p.entity).toEqual({ name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" });
    expect(p.shareholder).toMatchObject({ id: "22222222-2222-4222-8222-222222222222", name: "Jane Founder", role: "founder", sharesHeld: 600_000, tfnOnFile: true });
    expect(p.distributions).toHaveLength(2);
    expect(p.distributions[1]).toMatchObject({ statementNo: "DS-BBBBB-BBBBB", paidAt: "2026-06-30", grossAud: 30_000, frankingCreditAud: 10_000 });
    expect(p.totals).toMatchObject({ distributions: 2, grossAud: 60_000, frankingCreditAud: 20_000, grossedUpAud: 80_000, netPaidAud: 60_000 });
    expect(p.reconciled).toBe(true);
    expect(p.notes[0]).toBe(TAX_STATEMENT_ATO_NOTE);
    expect(p.notes[0]).toContain("may be reported to the Australian Taxation Office");
    expect(p.notes[0]).toContain("franking credits as assessable income");
    expect(p.notes[0]).toContain("claim the franking credits as a tax offset");
    expect(p.notes[p.notes.length - 1]).toBe(TAX_STATEMENT_GENERAL_NOTE);
    expect(p.notes[p.notes.length - 1]).toContain("not tax advice");
    expect(JSON.stringify(p)).not.toMatch(/Auschain|BlockID|659 615 111/);
  });
});
