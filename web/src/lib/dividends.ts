// Dividend Calculation Engine for BlockID
//
// Handles Australian franking credits (imputation system) and per-shareholder
// dividend distribution based on cap table data.
//
// AU tax: Company tax rate is 25% for "base rate entities" (turnover < $50M and
// <= 80% passive income). Otherwise 30%. We default to 25% for startups.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DividendPolicy {
  netIncome: number;
  distributionPct: number; // e.g. 50 means 50% of net income
  totalShares: number;
  shareholders: Array<{ name: string; shares: number; role: string }>;
  companyTaxRate?: number; // default 0.25 for AU base rate entities
}

export interface DividendPayout {
  name: string;
  role: string;
  shares: number;
  ownershipPct: number;
  grossDividend: number;
  frankingCredit: number;
  netDividend: number;
}

export interface DividendResult {
  totalDividend: number;
  perShareDividend: number;
  payouts: DividendPayout[];
  frankingRate: number;
  frankingCredits: number; // total franking credits across all payouts
  retainedEarnings: number;
  distributionPct: number;
  netIncome: number;
  exDividendDate: string; // YYYY-MM-DD, 14 days from now
  paymentDate: string; // YYYY-MM-DD, 30 days from now
}

/**
 * Full dividend calculation result (matches Phase 7 spec).
 * Alias for DividendResult — exported for external consumption.
 */
export type DividendCalculation = DividendResult;

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Australian corporate tax rate for base rate entities.
 * Applies to companies with aggregated turnover < $50M.
 * Full rate (30%) applies to larger companies.
 */
const AU_BASE_RATE_ENTITY_TAX = 0.25;
const AU_FULL_CORPORATE_TAX_RATE = 0.30;

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Calculate dividend distribution with Australian franking credits.
 *
 * Franking credit formula (AU imputation):
 *   frankingCredit = grossDividend * (taxRate / (1 - taxRate))
 *
 * This means for a 30% tax rate:
 *   frankingCredit = grossDividend * (0.30 / 0.70) = grossDividend * 3/7
 *
 * The franking credit represents the corporate tax already paid on the
 * profit being distributed, so shareholders can offset it against their
 * personal tax liability.
 */
export function calculateDividends(policy: DividendPolicy): DividendResult {
  const { netIncome, distributionPct, totalShares, shareholders } = policy;
  const taxRate = policy.companyTaxRate ?? AU_BASE_RATE_ENTITY_TAX;

  // Dates
  const exDividendDate = new Date(Date.now() + 14 * 86400000)
    .toISOString()
    .split("T")[0];
  const paymentDate = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .split("T")[0];

  // Guard: no distribution if net income is zero or negative
  if (netIncome <= 0 || distributionPct <= 0 || totalShares <= 0) {
    return {
      totalDividend: 0,
      perShareDividend: 0,
      payouts: shareholders.map((s) => ({
        name: s.name,
        role: s.role,
        shares: s.shares,
        ownershipPct:
          totalShares > 0
            ? round2((s.shares / totalShares) * 100)
            : 0,
        grossDividend: 0,
        frankingCredit: 0,
        netDividend: 0,
      })),
      frankingRate: taxRate,
      frankingCredits: 0,
      retainedEarnings: Math.max(0, netIncome),
      distributionPct,
      netIncome,
      exDividendDate,
      paymentDate,
    };
  }

  // 1. Total dividend = net income * distribution %
  const clampedPct = Math.min(100, Math.max(0, distributionPct));
  const totalDividend = round2(netIncome * (clampedPct / 100));

  // 2. Per share dividend
  const perShareDividend = round6(totalDividend / totalShares);

  // 3. Franking credit rate: taxRate / (1 - taxRate)
  const frankingMultiplier = taxRate / (1 - taxRate);

  // 4. Per shareholder payouts
  const payouts: DividendPayout[] = shareholders.map((s) => {
    const grossDividend = round2(s.shares * perShareDividend);
    const frankingCredit = round2(grossDividend * frankingMultiplier);
    // Net dividend is the cash actually paid out (same as gross for fully franked)
    // The franking credit is a tax offset, not deducted from cash payment
    const netDividend = grossDividend;

    return {
      name: s.name,
      role: s.role,
      shares: s.shares,
      ownershipPct: round2((s.shares / totalShares) * 100),
      grossDividend,
      frankingCredit,
      netDividend,
    };
  });

  // 5. Total franking credits
  const frankingCredits = round2(
    totalDividend * frankingMultiplier,
  );

  // 6. Retained earnings
  const retainedEarnings = round2(netIncome - totalDividend);

  return {
    totalDividend,
    perShareDividend,
    payouts,
    frankingRate: taxRate,
    frankingCredits,
    retainedEarnings,
    distributionPct: clampedPct,
    netIncome,
    exDividendDate,
    paymentDate,
  };
}

/**
 * Calculate dividend using the alternate Phase 7 interface.
 * This is a convenience wrapper that maps named parameters to DividendPolicy.
 */
export function calculateDividend(params: {
  netIncome: number;
  policyPercent: number;
  shareholders: Array<{ name: string; shares: number }>;
  totalShares: number;
  companyTaxRate?: number;
}): DividendCalculation {
  return calculateDividends({
    netIncome: params.netIncome,
    distributionPct: params.policyPercent,
    totalShares: params.totalShares,
    shareholders: params.shareholders.map((s) => ({
      ...s,
      role: "shareholder",
    })),
    companyTaxRate: params.companyTaxRate,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
