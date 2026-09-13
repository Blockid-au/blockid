// Colocated suite for the distribution statement maths (S25-B).
//
// Pins: fully franked / unfranked / partially franked splits; base rate
// entity (25 %) vs 30 % franking credit; reconciliation with
// `calculateDividends` (a fully franked statement carries exactly the
// payout's franking credit); TFN withholding at 47 % on the UNFRANKED part
// only, only when no TFN is on file, and the record-level override; cents
// rounding; totals checks; the register totals + reconciliation; the
// idempotency key; period-end fallback for the payment date.

import { describe, expect, it } from "vitest";
import { calculateDividends } from "@/lib/dividends";
import {
  AU_BASE_RATE_ENTITY_TAX,
  AU_FULL_CORPORATE_TAX_RATE,
  TFN_WITHHOLDING_RATE,
  buildDividendRegister,
  buildDividendStatement,
  checkStatementTotals,
  computeStatementAmounts,
  formatAbn,
  formatAcn,
  formatAudCents,
  frankingCreditRate,
  periodEndDate,
  shareholderKey,
  statementCostLabel,
  type StatementCompany,
  type StatementDividendRecord,
} from "./statement";

const COMPANY: StatementCompany = { name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789" };

function record(over: Partial<StatementDividendRecord> = {}): StatementDividendRecord {
  return {
    id: "rec-1",
    period: "2026-06",
    createdAt: "2026-07-01T00:00:00.000Z",
    paidAt: "2026-07-15",
    totalDividendAud: 50_000,
    perShareDividendAud: 0.05,
    companyTaxRate: AU_BASE_RATE_ENTITY_TAX,
    frankingPct: 100,
    tfnWithholdingRate: 0,
    ...over,
  };
}

const NOW = new Date("2026-07-16T02:00:00.000Z");

describe("computeStatementAmounts — franking splits", () => {
  it("fully franked at 25 %: credit = gross × 1/3, nothing unfranked, no withholding even without a TFN", () => {
    const a = computeStatementAmounts({ grossAud: 3_000, companyTaxRate: 0.25, frankingPct: 100, tfnOnFile: false });
    expect(a.frankedAud).toBe(3_000);
    expect(a.unfrankedAud).toBe(0);
    expect(a.frankingCreditAud).toBe(1_000);
    expect(a.tfnWithheldAud).toBe(0);
    expect(a.tfnWithholdingRate).toBe(0);
    expect(a.netPaidAud).toBe(3_000);
    expect(a.grossedUpAud).toBe(4_000);
  });

  it("fully franked at 30 %: credit = gross × 3/7", () => {
    const a = computeStatementAmounts({ grossAud: 7_000, companyTaxRate: 0.3, frankingPct: 100, tfnOnFile: true });
    expect(a.frankingCreditAud).toBe(3_000);
    expect(a.grossedUpAud).toBe(10_000);
  });

  it("unfranked: no credit; 47 % withheld when no TFN is on file", () => {
    const a = computeStatementAmounts({ grossAud: 1_000, companyTaxRate: 0.25, frankingPct: 0, tfnOnFile: false });
    expect(a.frankedAud).toBe(0);
    expect(a.unfrankedAud).toBe(1_000);
    expect(a.frankingCreditAud).toBe(0);
    expect(a.tfnWithholdingRate).toBe(TFN_WITHHOLDING_RATE);
    expect(a.tfnWithheldAud).toBe(470);
    expect(a.netPaidAud).toBe(530);
    expect(TFN_WITHHOLDING_RATE).toBe(0.47);
  });

  it("unfranked with a TFN on file: nothing withheld", () => {
    const a = computeStatementAmounts({ grossAud: 1_000, companyTaxRate: 0.25, frankingPct: 0, tfnOnFile: true });
    expect(a.tfnWithheldAud).toBe(0);
    expect(a.netPaidAud).toBe(1_000);
  });

  it("partially franked (60 %): split, credit on the franked part only, withholding on the unfranked part only", () => {
    const a = computeStatementAmounts({ grossAud: 1_000, companyTaxRate: 0.3, frankingPct: 60, tfnOnFile: false });
    expect(a.frankedAud).toBe(600);
    expect(a.unfrankedAud).toBe(400);
    expect(a.frankingCreditAud).toBe(257.14); // 600 × 3/7
    expect(a.tfnWithheldAud).toBe(188); // 400 × 0.47
    expect(a.netPaidAud).toBe(812);
    expect(a.grossedUpAud).toBe(1_257.14);
    expect(checkStatementTotals(a, 0.3).ok).toBe(true);
  });

  it("record-level tfnWithholdingRate overrides the statutory rate; 0 means statutory", () => {
    const custom = computeStatementAmounts({ grossAud: 100, companyTaxRate: 0.25, frankingPct: 0, tfnOnFile: false, tfnWithholdingRate: 0.3 });
    expect(custom.tfnWithheldAud).toBe(30);
    const statutory = computeStatementAmounts({ grossAud: 100, companyTaxRate: 0.25, frankingPct: 0, tfnOnFile: false, tfnWithholdingRate: 0 });
    expect(statutory.tfnWithheldAud).toBe(47);
  });

  it("rounds every figure to cents and the parts still sum to the gross", () => {
    const a = computeStatementAmounts({ grossAud: 1_234.567, companyTaxRate: 0.25, frankingPct: 33.333, tfnOnFile: false });
    expect(a.grossAud).toBe(1_234.57);
    for (const [k, v] of Object.entries(a)) if (k.endsWith("Aud")) expect(Math.round(v * 100) / 100).toBe(v);
    expect(Math.round((a.frankedAud + a.unfrankedAud) * 100) / 100).toBe(a.grossAud);
    expect(checkStatementTotals(a, 0.25).ok).toBe(true);
  });

  it("clamps a bad franking percentage and a negative gross", () => {
    expect(computeStatementAmounts({ grossAud: -5, companyTaxRate: 0.25, frankingPct: 150, tfnOnFile: true }).grossAud).toBe(0);
    expect(computeStatementAmounts({ grossAud: 100, companyTaxRate: 0.25, frankingPct: 150, tfnOnFile: true }).frankingPct).toBe(100);
    expect(computeStatementAmounts({ grossAud: 100, companyTaxRate: 0.25, frankingPct: Number.NaN, tfnOnFile: true }).frankingPct).toBe(100);
  });
});

describe("frankingCreditRate", () => {
  it("is r/(1−r): 1/3 at 25 %, 3/7 at 30 %; 0 for a nonsense rate", () => {
    expect(frankingCreditRate(AU_BASE_RATE_ENTITY_TAX)).toBe(0.333333);
    expect(frankingCreditRate(AU_FULL_CORPORATE_TAX_RATE)).toBe(0.428571);
    expect(frankingCreditRate(0)).toBe(0);
    expect(frankingCreditRate(1)).toBe(0);
  });
});

describe("buildDividendStatement — reconciles with calculateDividends", () => {
  const engine = calculateDividends({
    netIncome: 100_000,
    distributionPct: 50,
    totalShares: 1_000_000,
    shareholders: [
      { name: "Jane Founder", shares: 600_000, role: "founder" },
      { name: "Seed Investor Pty Ltd", shares: 250_000, role: "investor" },
      { name: "Advisor", shares: 3_333, role: "advisor" },
    ],
    companyTaxRate: 0.25,
  });

  it("a fully franked statement carries exactly the engine's franking credit for every payout", () => {
    for (const payout of engine.payouts) {
      const s = buildDividendStatement({
        company: COMPANY,
        record: record({ totalDividendAud: engine.totalDividend, perShareDividendAud: engine.perShareDividend, companyTaxRate: engine.frankingRate }),
        payout,
        shareholder: { id: null, name: payout.name, role: payout.role, sharesHeld: payout.shares, tfnOnFile: true },
        now: NOW,
      });
      expect(s.amounts.grossAud).toBe(payout.grossDividend);
      expect(s.amounts.frankingCreditAud).toBe(payout.frankingCredit);
      expect(s.amounts.frankedAud).toBe(payout.grossDividend);
      expect(s.totals.ok).toBe(true);
    }
  });

  it("carries every s 202-80 field: entity + ABN/ACN, date paid, amounts, franking %, tax rate, TFN withheld, holding, statement date", () => {
    const payout = engine.payouts[0];
    const s = buildDividendStatement({
      company: COMPANY,
      record: record({ totalDividendAud: engine.totalDividend, perShareDividendAud: engine.perShareDividend }),
      payout,
      shareholder: { id: "sh-1", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, tfnOnFile: true },
      now: NOW,
    }, "DS-AAAAA-BBBBB");
    expect(s.version).toBe("ds-v1");
    expect(s.statementNo).toBe("DS-AAAAA-BBBBB");
    expect(s.statementDate).toBe(NOW.toISOString());
    expect(s.entity).toEqual({ name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: null, isBaseRateEntity: true });
    expect(s.dividend.paidAt).toBe("2026-07-15");
    expect(s.dividend.companyTaxRate).toBe(0.25);
    expect(s.dividend.frankingCreditRate).toBe(0.333333);
    expect(s.dividend.frankingPct).toBe(100);
    expect(s.dividend.perShareAud).toBe(0.05);
    expect(s.shareholder).toEqual({ id: "sh-1", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, ownershipPct: 60, tfnOnFile: true });
    expect(s.amounts.grossAud).toBe(30_000);
    expect(s.amounts.frankingCreditAud).toBe(10_000);
    expect(s.amounts.tfnWithheldAud).toBe(0);
    expect(s.notes.join(" ")).toContain("25% (base rate entity)");
    expect(s.notes.join(" ")).toContain("fully franked");
  });

  it("30 % company: not a base rate entity; partial franking + no TFN → withholding note", () => {
    const s = buildDividendStatement({
      company: COMPANY,
      record: record({ companyTaxRate: 0.3, frankingPct: 50 }),
      payout: { name: "Seed Investor Pty Ltd", role: "investor", shares: 250_000, ownershipPct: 25, grossDividend: 12_500, frankingCredit: 0 },
      shareholder: { id: null, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 250_000, tfnOnFile: false },
      now: NOW,
    });
    expect(s.entity.isBaseRateEntity).toBe(false);
    expect(s.amounts.frankedAud).toBe(6_250);
    expect(s.amounts.unfrankedAud).toBe(6_250);
    expect(s.amounts.frankingCreditAud).toBe(2_678.57);
    expect(s.amounts.tfnWithheldAud).toBe(2_937.5);
    expect(s.amounts.netPaidAud).toBe(9_562.5);
    expect(s.notes.join(" ")).toContain("47% was withheld from the unfranked amount");
    expect(s.notes.join(" ")).toContain("50% franked");
    expect(s.notes.join(" ")).not.toMatch(/PhD/);
  });

  it("falls back to the payout's shares/name and the period end when the shareholder row is thin", () => {
    const s = buildDividendStatement({
      company: COMPANY,
      record: record({ paidAt: null, period: "2026-02" }),
      payout: { name: "Ghost Holder", role: "esop", shares: 10, ownershipPct: 0.001, grossDividend: 0.5, frankingCredit: 0.17 },
      shareholder: { id: null, name: "  ", role: "", sharesHeld: 0, tfnOnFile: true },
      now: NOW,
    });
    expect(s.shareholder.name).toBe("Ghost Holder");
    expect(s.shareholder.role).toBe("esop");
    expect(s.shareholder.sharesHeld).toBe(10);
    expect(s.dividend.paidAt).toBe("2026-02-28");
    expect(s.amounts.frankingCreditAud).toBe(0.17);
  });
});

describe("buildDividendRegister", () => {
  const engine = calculateDividends({
    netIncome: 100_000,
    distributionPct: 50,
    totalShares: 1_000_000,
    shareholders: [
      { name: "A", shares: 600_000, role: "founder" },
      { name: "B", shares: 400_000, role: "investor" },
    ],
    companyTaxRate: 0.25,
  });
  const rec = record({ totalDividendAud: engine.totalDividend, perShareDividendAud: engine.perShareDividend });
  const statements = engine.payouts.map((payout, i) => ({
    statementNo: `DS-0000${i}-00000`,
    voidedAt: null,
    payload: buildDividendStatement({ company: COMPANY, record: rec, payout, shareholder: { id: `sh-${i}`, name: payout.name, role: payout.role, sharesHeld: payout.shares, tfnOnFile: i === 0 }, now: NOW }, `DS-0000${i}-00000`),
  }));

  it("sums live statements, reconciles to the record total, and lists voided rows without counting them", () => {
    const reg = buildDividendRegister({ company: COMPANY, record: rec, statements, now: NOW });
    expect(reg.rows).toHaveLength(2);
    expect(reg.totals.grossAud).toBe(50_000);
    expect(reg.totals.frankingCreditAud).toBe(engine.frankingCredits);
    expect(reg.totals.sharesHeld).toBe(1_000_000);
    expect(reg.totals.statementsIssued).toBe(2);
    expect(reg.reconciled).toBe(true);
    expect(reg.varianceAud).toBe(0);

    const withVoid = buildDividendRegister({
      company: COMPANY,
      record: rec,
      statements: [{ ...statements[0], voidedAt: "2026-07-20T00:00:00Z" }, statements[1]],
      now: NOW,
    });
    expect(withVoid.totals.statementsVoided).toBe(1);
    expect(withVoid.totals.statementsIssued).toBe(1);
    expect(withVoid.totals.grossAud).toBe(20_000);
    expect(withVoid.reconciled).toBe(false);
    expect(withVoid.varianceAud).toBe(-30_000);
    expect(withVoid.rows[0].status).toBe("voided");
  });

  it("an empty register is trivially reconciled", () => {
    const reg = buildDividendRegister({ company: COMPANY, record: rec, statements: [], now: NOW });
    expect(reg.rows).toEqual([]);
    expect(reg.reconciled).toBe(true);
    expect(reg.totals.grossAud).toBe(0);
  });
});

describe("helpers", () => {
  it("shareholderKey prefers the cap-table id and normalises names", () => {
    expect(shareholderKey({ id: "sh-1", name: "X" })).toBe("id:sh-1");
    expect(shareholderKey({ id: null, name: "  Jane   Founder " })).toBe("name:jane founder");
  });
  it("periodEndDate handles leap years and junk", () => {
    expect(periodEndDate("2028-02")).toBe("2028-02-29");
    expect(periodEndDate("2026-12")).toBe("2026-12-31");
    expect(periodEndDate("nope")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("formats ABN / ACN / AUD", () => {
    expect(formatAbn("79659615111")).toBe("79 659 615 111");
    expect(formatAbn("123")).toBeNull();
    expect(formatAcn("659615111")).toBe("659 615 111");
    expect(formatAcn(null)).toBeNull();
    expect(formatAudCents(1234.5)).toBe("A$1,234.50");
    expect(formatAudCents(0)).toBe("A$0.00");
    expect(formatAudCents(-20_000)).toBe("-A$20,000.00");
  });
  it("cost label", () => {
    expect(statementCostLabel(2, false)).toBe("2 credits");
    expect(statementCostLabel(1, false)).toBe("1 credit");
    expect(statementCostLabel(2, true)).toBe("included in your plan");
  });
});
