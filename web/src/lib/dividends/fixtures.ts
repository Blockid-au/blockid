// Shared fixtures for the dividend statement suites (S25-B) — pure data,
// no `server-only`, so PDF, route and UI tests can all import them.

import type { DividendPayout } from "@/lib/dividends";
import { buildDividendRegister, buildDividendStatement, type DividendRegisterPayload, type DividendStatementPayload, type StatementCompany, type StatementDividendRecord } from "./statement";
import { buildShareholderTaxStatement, summariseFinancialYear, type ShareholderTaxStatementPayload } from "./fy-summary";

export const SAMPLE_COMPANY: StatementCompany = {
  name: "Acme Robotics Pty Ltd",
  abn: "12 345 678 901",
  acn: "123 456 789",
  address: "Sydney NSW",
};

export const SAMPLE_RECORD: StatementDividendRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  period: "2026-06",
  createdAt: "2026-07-01T00:00:00.000Z",
  paidAt: "2026-07-15",
  totalDividendAud: 50_000,
  perShareDividendAud: 0.05,
  companyTaxRate: 0.25,
  frankingPct: 100,
  tfnWithholdingRate: 0,
};

export const SAMPLE_PAYOUTS: DividendPayout[] = [
  { name: "Jane Founder", role: "founder", shares: 600_000, ownershipPct: 60, grossDividend: 30_000, frankingCredit: 10_000, netDividend: 30_000 },
  { name: "Seed Investor Pty Ltd", role: "investor", shares: 400_000, ownershipPct: 40, grossDividend: 20_000, frankingCredit: 6_666.67, netDividend: 20_000 },
];

export const SAMPLE_NOW = new Date("2026-07-16T02:00:00.000Z");

export const SAMPLE_STATEMENT: DividendStatementPayload = buildDividendStatement(
  {
    company: SAMPLE_COMPANY,
    record: SAMPLE_RECORD,
    payout: SAMPLE_PAYOUTS[0],
    shareholder: { id: "22222222-2222-4222-8222-222222222222", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, tfnOnFile: true },
    now: SAMPLE_NOW,
  },
  "DS-7K3MP-Q9X2A",
);

/** Partially franked, no TFN → withholding line. */
export const SAMPLE_STATEMENT_WITHHELD: DividendStatementPayload = buildDividendStatement(
  {
    company: SAMPLE_COMPANY,
    record: { ...SAMPLE_RECORD, companyTaxRate: 0.3, frankingPct: 50 },
    payout: SAMPLE_PAYOUTS[1],
    shareholder: { id: null, name: "Seed Investor Pty Ltd", role: "investor", shareClass: null, sharesHeld: 400_000, tfnOnFile: false },
    now: SAMPLE_NOW,
  },
  "DS-ABCDE-FGHJK",
);

/** S28-A — Jane reinvests 50 % under the DRIP at A$1.37: 10,948 shares, A$14,998.76, residual A$1.24. */
export const SAMPLE_STATEMENT_DRIP: DividendStatementPayload = buildDividendStatement(
  {
    company: SAMPLE_COMPANY,
    record: SAMPLE_RECORD,
    payout: SAMPLE_PAYOUTS[0],
    shareholder: { id: "22222222-2222-4222-8222-222222222222", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, tfnOnFile: true },
    now: SAMPLE_NOW,
    drip: { electionId: "el-1", participationPct: 50, priceBasis: "share_price_mid", priceAud: 1.37, shares: 10_948, reinvestedAud: 14_998.76, residualAud: 1.24, cashPaidAud: 15_001.24, skipped: null },
  },
  "DS-DRIP1-DRIP1",
);

/** S28-A — Jane's FY 2025-26 annual statement: two fully franked distributions (Mar + 30 Jun), one of them under the DRIP. */
export const SAMPLE_TAX_STATEMENT: ShareholderTaxStatementPayload = (() => {
  const mar = { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "2026-03-31", period: "2026-03" } };
  const jun = { ...SAMPLE_STATEMENT_DRIP, dividend: { ...SAMPLE_STATEMENT_DRIP.dividend, paidAt: "2026-06-30", period: "2026-06" } };
  const summary = summariseFinancialYear({
    fy: "2025-26",
    statements: [
      { id: "s1", statementNo: "DS-7K3MP-Q9X2A", payload: mar, voidedAt: null },
      { id: "s2", statementNo: "DS-DRIP1-DRIP1", payload: jun, voidedAt: null },
      { id: "s3", statementNo: "DS-ABCDE-FGHJK", payload: SAMPLE_STATEMENT_WITHHELD, voidedAt: null }, // paid 15 Jul 2026 → next FY
    ],
  })!;
  return buildShareholderTaxStatement({ company: SAMPLE_COMPANY, summary: summary.shareholders[0], fy: summary.fy, now: new Date("2026-07-20T02:00:00.000Z") }, "TS-2025-26-1");
})();

export const SAMPLE_REGISTER: DividendRegisterPayload = buildDividendRegister({
  company: SAMPLE_COMPANY,
  record: SAMPLE_RECORD,
  statements: [
    { payload: SAMPLE_STATEMENT, statementNo: SAMPLE_STATEMENT.statementNo, voidedAt: null },
    {
      payload: buildDividendStatement(
        { company: SAMPLE_COMPANY, record: SAMPLE_RECORD, payout: SAMPLE_PAYOUTS[1], shareholder: { id: null, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 400_000, tfnOnFile: false }, now: SAMPLE_NOW },
        "DS-ABCDE-FGHJK",
      ),
      statementNo: "DS-ABCDE-FGHJK",
      voidedAt: null,
    },
  ],
  now: SAMPLE_NOW,
});
