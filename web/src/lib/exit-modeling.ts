/**
 * Exit Modeling Engine
 *
 * Calculates per-shareholder payouts under different exit scenarios,
 * including liquidation preferences, ESOP exercise, and Australian CGT.
 */

export interface ExitScenario {
  method: "acquisition" | "ipo" | "secondary" | "buyout";
  exitValuation: number; // AUD
  exitMultiple?: number; // revenue multiple
}

export interface ShareholderPayout {
  name: string;
  role: string;
  shares: number;
  ownershipPct: number;
  grossPayout: number;
  cgtEstimate: number; // 50% CGT discount if held >12 months
  netPayout: number;
}

export interface ESOPExercise {
  totalValue: number;
  exerciseCost: number;
  netGain: number;
}

export interface ExitResult {
  scenario: ExitScenario;
  totalProceeds: number;
  perShareValue: number;
  shareholderPayouts: ShareholderPayout[];
  liquidationPreference: number;
  esopExercise: ESOPExercise | null;
}

export interface ShareholderInput {
  name: string;
  role: string;
  shares: number;
  shareClassType: string; // ordinary, preference
  liquidationMultiple?: number; // 1x, 2x for preference shares
  vestingStart?: string | null;
  pricePerShare?: number; // exercise / issue price
}

export interface ESOPInput {
  totalPoolShares: number;
  allocatedShares: number;
  exercisePrice: number;
}

export interface CapTableInput {
  shareholders: ShareholderInput[];
  esop?: ESOPInput | null;
  totalShares: number; // fully diluted total
}

/**
 * Estimate Australian CGT on a capital gain.
 * Assumes individual tax (47% marginal for high earners).
 * If held > 12 months, 50% CGT discount applies.
 */
function estimateCGT(gain: number, heldOver12Months: boolean): number {
  if (gain <= 0) return 0;
  const taxableGain = heldOver12Months ? gain * 0.5 : gain;
  // Use top marginal rate (45%) + Medicare levy (2%) = 47%
  return taxableGain * 0.47;
}

function isHeldOver12Months(vestingStart?: string | null): boolean {
  if (!vestingStart) return true; // assume long-held if unknown
  const start = new Date(vestingStart);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return diffMs > 365.25 * 24 * 60 * 60 * 1000;
}

export function calculateExit(
  scenario: ExitScenario,
  capTable: CapTableInput,
): ExitResult {
  const { exitValuation } = scenario;
  const { shareholders, esop, totalShares } = capTable;

  if (totalShares <= 0) {
    return {
      scenario,
      totalProceeds: exitValuation,
      perShareValue: 0,
      shareholderPayouts: [],
      liquidationPreference: 0,
      esopExercise: null,
    };
  }

  // 1. Calculate liquidation preferences (preference shareholders get paid first)
  let remainingProceeds = exitValuation;
  let totalLiqPref = 0;

  const preferenceHolders = shareholders.filter(
    (s) => s.shareClassType === "preference" && s.liquidationMultiple,
  );
  const ordinaryHolders = shareholders.filter(
    (s) => s.shareClassType !== "preference" || !s.liquidationMultiple,
  );

  const prefPayouts: Map<string, number> = new Map();

  for (const holder of preferenceHolders) {
    const prefAmount =
      holder.shares * (holder.pricePerShare ?? 0) * (holder.liquidationMultiple ?? 1);
    const actualPayout = Math.min(prefAmount, remainingProceeds);
    prefPayouts.set(holder.name, actualPayout);
    remainingProceeds -= actualPayout;
    totalLiqPref += actualPayout;
  }

  // 2. ESOP exercise
  let esopExercise: ESOPExercise | null = null;
  let esopSharesInPool = 0;

  if (esop && esop.allocatedShares > 0) {
    esopSharesInPool = esop.allocatedShares;
    const perShare = remainingProceeds > 0 ? remainingProceeds / (totalShares - preferenceHolders.reduce((s, h) => s + h.shares, 0)) : 0;
    const totalValue = esopSharesInPool * perShare;
    const exerciseCost = esopSharesInPool * esop.exercisePrice;
    esopExercise = {
      totalValue,
      exerciseCost,
      netGain: Math.max(0, totalValue - exerciseCost),
    };
  }

  // 3. Per-share value for ordinary holders (remaining proceeds / ordinary shares)
  const ordinaryTotalShares = ordinaryHolders.reduce((s, h) => s + h.shares, 0) + esopSharesInPool;
  const perShareOrdinary = ordinaryTotalShares > 0 ? remainingProceeds / ordinaryTotalShares : 0;

  // 4. Calculate per-shareholder payouts
  const payouts: ShareholderPayout[] = [];

  for (const holder of preferenceHolders) {
    const prefPayout = prefPayouts.get(holder.name) ?? 0;
    // Preference holders may also participate pro-rata in remaining (participating preferred)
    // For simplicity, use non-participating preferred (they get the greater of liq pref or pro-rata)
    const proRataPayout = holder.shares * perShareOrdinary;
    const grossPayout = Math.max(prefPayout, proRataPayout);
    const gain = grossPayout - holder.shares * (holder.pricePerShare ?? 0);
    const longHeld = isHeldOver12Months(holder.vestingStart);
    const cgt = estimateCGT(gain, longHeld);

    payouts.push({
      name: holder.name,
      role: holder.role,
      shares: holder.shares,
      ownershipPct: totalShares > 0 ? (holder.shares / totalShares) * 100 : 0,
      grossPayout: Math.round(grossPayout * 100) / 100,
      cgtEstimate: Math.round(cgt * 100) / 100,
      netPayout: Math.round((grossPayout - cgt) * 100) / 100,
    });
  }

  for (const holder of ordinaryHolders) {
    const grossPayout = holder.shares * perShareOrdinary;
    const gain = grossPayout - holder.shares * (holder.pricePerShare ?? 0);
    const longHeld = isHeldOver12Months(holder.vestingStart);
    const cgt = estimateCGT(gain, longHeld);

    payouts.push({
      name: holder.name,
      role: holder.role,
      shares: holder.shares,
      ownershipPct: totalShares > 0 ? (holder.shares / totalShares) * 100 : 0,
      grossPayout: Math.round(grossPayout * 100) / 100,
      cgtEstimate: Math.round(cgt * 100) / 100,
      netPayout: Math.round((grossPayout - cgt) * 100) / 100,
    });
  }

  return {
    scenario,
    totalProceeds: exitValuation,
    perShareValue: totalShares > 0 ? Math.round((exitValuation / totalShares) * 10000) / 10000 : 0,
    shareholderPayouts: payouts,
    liquidationPreference: Math.round(totalLiqPref * 100) / 100,
    esopExercise,
  };
}

/**
 * Generate multiple exit scenarios at standard revenue multiples.
 */
export function generateScenarios(
  capTable: CapTableInput,
  annualRevenue: number,
  method: ExitScenario["method"] = "acquisition",
): ExitResult[] {
  const multiples = [3, 5, 10, 20];

  return multiples.map((multiple) => {
    const scenario: ExitScenario = {
      method,
      exitValuation: annualRevenue * multiple,
      exitMultiple: multiple,
    };
    return calculateExit(scenario, capTable);
  });
}
