// Shared fixtures for the board-resolution suites (S26-B) — builder, PDF and
// route tests all use the same company / records so the pinned strings agree.

import type { DividendResolutionRecord, EsopPlanRecord, ResolutionCompany, ResolutionDirector, ShareIssueRecord } from "./build";

export const FIXTURE_COMPANY: ResolutionCompany = {
  name: "Acme Robotics Pty Ltd",
  acn: "123 456 789",
  abn: "12 345 678 901",
  address: "Sydney NSW",
};

export const FIXTURE_DIRECTORS: ResolutionDirector[] = [{ name: "Jane Founder" }, { name: "Raj Cofounder" }];

export const FIXTURE_SHARE_ISSUE: ShareIssueRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  allotteeName: "Seed Investor Pty Ltd",
  allotteeRole: "investor",
  shareClass: "Ordinary",
  shares: 400_000,
  pricePerShareAud: 0.25,
  totalValueAud: 100_000,
  roundName: "Seed",
  effectiveDate: "2026-08-01",
  notes: null,
};

export const FIXTURE_DIVIDEND: DividendResolutionRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  period: "2026-06",
  totalDividendAud: 50_000,
  perShareDividendAud: 0.05,
  frankingPct: 100,
  companyTaxRate: 0.25,
  paidAt: "2026-07-15",
  payoutCount: 2,
};

export const FIXTURE_ESOP: EsopPlanRecord = {
  id: "55555555-5555-4555-8555-555555555555",
  totalPoolShares: 1_000_000,
  allocatedShares: 150_000,
  poolPct: 10,
  vestingMonths: 48,
  cliffMonths: 12,
  fullyDilutedShares: 10_000_000,
};
