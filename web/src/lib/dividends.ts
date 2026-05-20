// Dividend Calculation Engine for BlockID
//
// Handles Australian franking credits (imputation system) and per-shareholder
// dividend distribution based on cap table data.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DividendPolicy {
  netIncome: number;
  distributionPct: number; // e.g. 50 means 50% of net income
  totalShares: number;
  shareholders: Array<{ name: string; shares: number; role: string }>;
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
  frankingRate: number; // 30% AU corporate tax rate
  retainedEarnings: number;
  distributionPct: number;
  netIncome: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Australian corporate tax rate (base rate for small business). */
const AU_CORPORATE_TAX_RATE = 0.30;

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
      frankingRate: AU_CORPORATE_TAX_RATE,
      retainedEarnings: Math.max(0, netIncome),
      distributionPct,
      netIncome,
    };
  }

  // 1. Total dividend = net income * distribution %
  const clampedPct = Math.min(100, Math.max(0, distributionPct));
  const totalDividend = round2(netIncome * (clampedPct / 100));

  // 2. Per share dividend
  const perShareDividend = round6(totalDividend / totalShares);

  // 3. Franking credit rate: taxRate / (1 - taxRate)
  const frankingMultiplier =
    AU_CORPORATE_TAX_RATE / (1 - AU_CORPORATE_TAX_RATE);

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

  // 5. Retained earnings
  const retainedEarnings = round2(netIncome - totalDividend);

  return {
    totalDividend,
    perShareDividend,
    payouts,
    frankingRate: AU_CORPORATE_TAX_RATE,
    retainedEarnings,
    distributionPct: clampedPct,
    netIncome,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
