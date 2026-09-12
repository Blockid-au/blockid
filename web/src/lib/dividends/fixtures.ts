// Shared fixtures for the dividend statement suites (S25-B) — pure data,
// no `server-only`, so PDF, route and UI tests can all import them.

import type { DividendPayout } from "@/lib/dividends";
import { buildDividendRegister, buildDividendStatement, type DividendRegisterPayload, type DividendStatementPayload, type StatementCompany, type StatementDividendRecord } from "./statement";

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
