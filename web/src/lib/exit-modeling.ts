/**
 * Exit Modeling Engine
 *
 * Calculates per-shareholder payouts under different exit scenarios,
 * including liquidation preferences, ESOP exercise, and Australian CGT.
 */

export type ExitMethod = "acquisition" | "ipo" | "secondary" | "buyout" | "acqui_hire";

export const EXIT_METHODS: readonly ExitMethod[] = ["acquisition", "ipo", "secondary", "buyout", "acqui_hire"] as const;

export interface ExitScenario {
  method: ExitMethod;
  exitValuation: number; // AUD — for acqui_hire this is the EQUITY consideration (after the retention pool)
  exitMultiple?: number; // revenue multiple
  /** Set on acqui_hire results — how the price was built. */
  acquiHire?: AcquiHireBreakdown;
}

// ---------------------------------------------------------------------------
// Acqui-hire (S26-B)
//
// An acqui-hire prices the TEAM, not the business: the buyer pays roughly a
// per-engineer figure for the people it retains, a small or nil premium for
// IP / product, and routes a large share of the price into retention
// bonuses that vest with continued employment (2–3 years) — money that
// never reaches the cap table. Only the remainder (the "equity
// consideration") flows through the liquidation-preference waterfall.
//
// ASSUMPTION (editable input, not a fact about any company): AU per-engineer
// retention values in an acqui-hire are commonly discussed in the
// A$500K – A$1.5M range (US deals quote US$1–2M; AU salaries and the
// smaller acquirer pool sit lower). `ACQUI_HIRE_DEFAULTS` carries that range
// with A$1M as the mid; the UI pre-fills the mid and lets the founder edit.
// Retention share defaults to 40 % of the gross price over 3 years; IP
// premium defaults to A$0 ("low / no premium for IP").
// ---------------------------------------------------------------------------

export const ACQUI_HIRE_DEFAULTS = {
  perEngineerValueAud: { low: 500_000, mid: 1_000_000, high: 1_500_000 },
  retentionBonusShare: 0.4,
  retentionYears: 3 as 2 | 3,
  ipPremiumAud: 0,
  assumptionNote:
    "Per-engineer retention value is an assumption (AU acqui-hires are commonly discussed at A$500K–A$1.5M per retained engineer; US deals quote US$1–2M). Edit it to the offer on the table — no figure here is a valuation of the company.",
} as const;

export interface AcquiHireInputs {
  /** Retained engineers / staff the buyer is paying for. */
  teamSize: number;
  /** A$ per retained engineer (default ACQUI_HIRE_DEFAULTS.perEngineerValueAud.mid). */
  perEngineerValueAud?: number;
  /** Share of the gross price paid as retention bonuses (0–0.9; default 0.4). */
  retentionBonusShare?: number;
  /** Years the retention bonuses vest over (2 or 3; default 3). */
  retentionYears?: 2 | 3;
  /** Premium for IP / product (default 0 — low or no premium). */
  ipPremiumAud?: number;
}

export interface AcquiHireBreakdown {
  teamSize: number;
  perEngineerValueAud: number;
  /** teamSize × perEngineerValue. */
  teamValueAud: number;
  ipPremiumAud: number;
  /** teamValue + ipPremium. */
  grossPriceAud: number;
  retentionBonusShare: number;
  retentionYears: 2 | 3;
  /** grossPrice × retentionBonusShare — paid to retained staff, never to shareholders. */
  retentionPoolAud: number;
  /** Straight-line vesting of the retention pool, one entry per year. */
  retentionSchedule: Array<{ year: number; amountAud: number; cumulativeAud: number }>;
  /** grossPrice − retentionPool — what goes through the waterfall. */
  equityConsiderationAud: number;
  assumptions: string[];
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Pure: the acqui-hire price and its split. Never NaN; negative inputs clamp to 0. */
export function computeAcquiHirePrice(inputs: AcquiHireInputs): AcquiHireBreakdown {
  const teamSize = Math.max(0, Math.floor(finiteOr(inputs.teamSize, 0)));
  const perEngineer = Math.max(0, finiteOr(inputs.perEngineerValueAud, ACQUI_HIRE_DEFAULTS.perEngineerValueAud.mid));
  const share = Math.min(0.9, Math.max(0, finiteOr(inputs.retentionBonusShare, ACQUI_HIRE_DEFAULTS.retentionBonusShare)));
  const years: 2 | 3 = inputs.retentionYears === 2 ? 2 : 3;
  const ipPremium = Math.max(0, finiteOr(inputs.ipPremiumAud, ACQUI_HIRE_DEFAULTS.ipPremiumAud));

  const teamValue = Math.round(teamSize * perEngineer);
  const gross = Math.round(teamValue + ipPremium);
  const retentionPool = Math.round(gross * share);
  const equity = Math.max(0, gross - retentionPool);

  const perYear = years > 0 ? retentionPool / years : 0;
  const schedule: AcquiHireBreakdown["retentionSchedule"] = [];
  let cumulative = 0;
  for (let y = 1; y <= years; y++) {
    const amount = y === years ? retentionPool - cumulative : Math.round(perYear);
    cumulative += amount;
    schedule.push({ year: y, amountAud: amount, cumulativeAud: cumulative });
  }

  return {
    teamSize,
    perEngineerValueAud: perEngineer,
    teamValueAud: teamValue,
    ipPremiumAud: ipPremium,
    grossPriceAud: gross,
    retentionBonusShare: share,
    retentionYears: years,
    retentionPoolAud: retentionPool,
    retentionSchedule: schedule,
    equityConsiderationAud: equity,
    assumptions: [
      ACQUI_HIRE_DEFAULTS.assumptionNote,
      `${Math.round(share * 100)}% of the gross price (A$${retentionPool.toLocaleString("en-AU")}) is a retention pool vesting over ${years} years with continued employment — it is paid to the retained team, not to shareholders, and is forfeited by anyone who leaves early.`,
      ipPremium > 0
        ? `A$${ipPremium.toLocaleString("en-AU")} is attributed to IP / product — acqui-hires usually pay little or nothing for IP.`
        : "No premium is attributed to IP / product — acqui-hires usually pay little or nothing for it.",
      "Only the equity consideration flows through the liquidation-preference waterfall below; preference holders are paid first exactly as in the other scenarios.",
    ],
  };
}

/**
 * Acqui-hire exit: price the team, split out the retention pool, then run
 * the EQUITY consideration through the ordinary waterfall.
 */
export function calculateAcquiHireExit(inputs: AcquiHireInputs, capTable: CapTableInput): ExitResult {
  const breakdown = computeAcquiHirePrice(inputs);
  const scenario: ExitScenario = { method: "acqui_hire", exitValuation: breakdown.equityConsiderationAud, acquiHire: breakdown };
  return calculateExit(scenario, capTable);
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
