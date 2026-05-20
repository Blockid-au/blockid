// Fundraise round calculation engine.
//
// Computes share price, new shares issued, dilution impact per shareholder,
// and a projected post-money cap table for priced rounds, SAFEs, and
// convertible notes.

export interface FundraiseRound {
  roundName: string; // "Pre-Seed", "Seed", "Series A"
  targetAmount: number; // AUD
  preMoneyValuation: number;
  instrumentType: "priced" | "safe" | "convertible_note";
  safeDiscount?: number; // % discount for SAFE/convertible
  safeCap?: number; // valuation cap for SAFE/convertible
}

export interface ShareholderRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  shares_held: number;
  ownership_pct?: number;
}

export interface EsopPoolRow {
  total_pool_shares: number;
  allocated_shares: number;
}

export interface CapTableData {
  shareholders: ShareholderRow[];
  esopPool: EsopPoolRow | null;
}

export interface DilutionRow {
  name: string;
  role: string;
  sharesBefore: number;
  pctBefore: number;
  sharesAfter: number;
  pctAfter: number;
  dilutionPct: number;
}

export interface RoundResult {
  sharePrice: number;
  newShares: number;
  dilutionPct: number;
  postMoneyValuation: number;
  dilutionTable: DilutionRow[];
  newCapTable: {
    shareholders: DilutionRow[];
    newInvestorBlock: {
      name: string;
      shares: number;
      pct: number;
    };
    esop: {
      shares: number;
      pctBefore: number;
      pctAfter: number;
    } | null;
    totalSharesAfter: number;
  };
}

export function calculateRound(
  round: FundraiseRound,
  capTable: CapTableData,
): RoundResult {
  const totalSharesBefore = capTable.shareholders.reduce(
    (sum, s) => sum + Number(s.shares_held),
    0,
  );
  const esopShares = capTable.esopPool
    ? Number(capTable.esopPool.total_pool_shares)
    : 0;
  const fullyDilutedBefore = totalSharesBefore + esopShares;

  if (fullyDilutedBefore === 0) {
    throw new Error("Cannot calculate round with zero existing shares");
  }

  // Effective pre-money for SAFE/convertible with caps
  let effectivePreMoney = round.preMoneyValuation;
  if (
    (round.instrumentType === "safe" ||
      round.instrumentType === "convertible_note") &&
    round.safeCap
  ) {
    effectivePreMoney = Math.min(round.preMoneyValuation, round.safeCap);
  }

  // Share price
  const sharePrice = effectivePreMoney / fullyDilutedBefore;

  // For SAFE/convertible with discount, the investor gets more shares
  let effectiveSharePrice = sharePrice;
  if (
    (round.instrumentType === "safe" ||
      round.instrumentType === "convertible_note") &&
    round.safeDiscount &&
    round.safeDiscount > 0
  ) {
    effectiveSharePrice = sharePrice * (1 - round.safeDiscount / 100);
  }

  const newShares = Math.round(round.targetAmount / effectiveSharePrice);
  const totalSharesAfter = fullyDilutedBefore + newShares;
  const dilutionPct = Number(
    ((newShares / totalSharesAfter) * 100).toFixed(2),
  );
  const postMoneyValuation = effectivePreMoney + round.targetAmount;

  // Build dilution table
  const dilutionTable: DilutionRow[] = capTable.shareholders.map((s) => {
    const sharesBefore = Number(s.shares_held);
    const pctBefore = Number(
      ((sharesBefore / fullyDilutedBefore) * 100).toFixed(2),
    );
    const pctAfter = Number(
      ((sharesBefore / totalSharesAfter) * 100).toFixed(2),
    );
    return {
      name: s.name,
      role: s.role,
      sharesBefore,
      pctBefore,
      sharesAfter: sharesBefore, // existing shareholders keep their shares
      pctAfter,
      dilutionPct: Number((pctBefore - pctAfter).toFixed(2)),
    };
  });

  // ESOP dilution
  const esopEntry = capTable.esopPool
    ? {
        shares: esopShares,
        pctBefore: Number(
          ((esopShares / fullyDilutedBefore) * 100).toFixed(2),
        ),
        pctAfter: Number(
          ((esopShares / totalSharesAfter) * 100).toFixed(2),
        ),
      }
    : null;

  return {
    sharePrice: Number(effectiveSharePrice.toFixed(4)),
    newShares,
    dilutionPct,
    postMoneyValuation,
    dilutionTable,
    newCapTable: {
      shareholders: dilutionTable,
      newInvestorBlock: {
        name: `${round.roundName} Investors`,
        shares: newShares,
        pct: dilutionPct,
      },
      esop: esopEntry,
      totalSharesAfter,
    },
  };
}
