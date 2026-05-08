/**
 * Funding plan calculator for pre-incorporation / idea-stage founders.
 *
 * Pure functions only — no React, no DOM. Called from the
 * `/tools/funding-plan` client component.
 */

export type RaiseType = "ff_safe" | "preseed_vc" | "angel";

export interface FounderContribution {
  /** Stable id for React keys. */
  id: string;
  name: string;
  /** Cash this founder can put in (AUD). */
  cashAud: number;
  /** Optional equity allocation % — used for per-founder dilution preview. */
  equityPct?: number;
}

export interface FundingPlanInput {
  // Burn plan
  cofounderCount: number;
  /** Avg cofounder living wage AUD/mo. */
  monthlyWageAud: number;
  /** Skip wages for first 6 months ("sweat only" toggle). */
  sweatFirstSixMonths: boolean;
  monthlyToolsAud: number;
  monthlyMarketingAud: number;
  /** Legal / accounting one-off (AUD). */
  legalOneOffAud: number;
  /** Buffer % expressed as 0–100. */
  bufferPct: number;
  /** Runway target in months. */
  runwayMonths: number;

  // Cap-stack
  founders: FounderContribution[];
  /** Pre-money idea-stage valuation (AUD). */
  preMoneyAud: number;
  /** Target ESOP pool % post-money (0–100). */
  esopPct: number;
  raiseType: RaiseType;
}

export interface FundingPlanScenario {
  label: string;
  externalRaiseAud: number;
  postMoneyAud: number;
  investorPct: number;
  esopPct: number;
  founderPctAfter: number;
}

export interface FundingPlanFlag {
  level: "warn" | "info";
  message: string;
}

export interface SafeSuggestion {
  discountPct: number;
  capAud: number;
}

export interface FounderDilutionRow {
  id: string;
  name: string;
  cashAud: number;
  equityBeforePct: number;
  equityAfterPct: number;
  diluted: number;
}

export interface FundingPlanResult {
  // Burn breakdown
  monthlyBurnAud: number;
  monthlyWageSubtotalAud: number;
  monthlyOpexSubtotalAud: number;
  burnBeforeBufferAud: number;
  bufferAud: number;
  totalNeedAud: number;

  // Cap stack
  founderCapitalPooledAud: number;
  externalRaiseAud: number;
  postMoneyAud: number;
  investorPct: number;
  esopPct: number;
  founderPctAfter: number;

  // Per-founder dilution preview
  founderRows: FounderDilutionRow[];

  // SAFE suggestion (only meaningful for ff_safe; populated for all)
  safe: SafeSuggestion;

  // Sensitivity
  scenarios: FundingPlanScenario[];

  // Risk flags
  flags: FundingPlanFlag[];

  // Echo of recommended raise headline
  recommended: {
    raiseAud: number;
    preMoneyAud: number;
    dilutionPct: number;
  };
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const safeNum = (v: number) => (Number.isFinite(v) ? v : 0);

/** Compute investor / ESOP / founder splits given pre-money, raise and ESOP target. */
function computeSplit(
  preMoneyAud: number,
  externalRaiseAud: number,
  esopPctTarget: number,
): {
  postMoneyAud: number;
  investorPct: number;
  esopPct: number;
  founderPctAfter: number;
} {
  const pre = Math.max(0, preMoneyAud);
  const raise = Math.max(0, externalRaiseAud);
  const esopFraction = clampPct(esopPctTarget) / 100;
  const post = pre + raise;
  if (post <= 0) {
    return {
      postMoneyAud: 0,
      investorPct: 0,
      esopPct: clampPct(esopPctTarget),
      founderPctAfter: 100 - clampPct(esopPctTarget),
    };
  }
  // Investor % is share of post-money cash, scaled down so ESOP can sit alongside it.
  const investorPctRaw = (raise / post) * (1 - esopFraction);
  const investorPct = investorPctRaw * 100;
  const esopPct = esopFraction * 100;
  const founderPctAfter = Math.max(0, 100 - investorPct - esopPct);
  return {
    postMoneyAud: post,
    investorPct,
    esopPct,
    founderPctAfter,
  };
}

export function computeFundingPlan(
  input: FundingPlanInput,
): FundingPlanResult {
  const cofounderCount = Math.max(1, Math.min(5, Math.floor(input.cofounderCount)));
  const monthlyWageAud = Math.max(0, safeNum(input.monthlyWageAud));
  const monthlyToolsAud = Math.max(0, safeNum(input.monthlyToolsAud));
  const monthlyMarketingAud = Math.max(0, safeNum(input.monthlyMarketingAud));
  const legalOneOffAud = Math.max(0, safeNum(input.legalOneOffAud));
  const bufferPct = clampPct(safeNum(input.bufferPct));
  const runwayMonths = Math.max(1, Math.floor(safeNum(input.runwayMonths)));
  const preMoneyAud = Math.max(0, safeNum(input.preMoneyAud));
  const esopTargetPct = clampPct(safeNum(input.esopPct));

  // Wages: optionally skip first 6 months
  const wageMonths = input.sweatFirstSixMonths
    ? Math.max(0, runwayMonths - 6)
    : runwayMonths;
  const wageTotalAud = cofounderCount * monthlyWageAud * wageMonths;
  const opexTotalAud =
    (monthlyToolsAud + monthlyMarketingAud) * runwayMonths;

  const monthlyOpexSubtotalAud = monthlyToolsAud + monthlyMarketingAud;
  const monthlyWageSubtotalAud = cofounderCount * monthlyWageAud;
  const monthlyBurnAud = monthlyWageSubtotalAud + monthlyOpexSubtotalAud;

  const burnBeforeBufferAud = wageTotalAud + opexTotalAud;
  const bufferAud = burnBeforeBufferAud * (bufferPct / 100);
  const totalNeedAud = burnBeforeBufferAud + bufferAud + legalOneOffAud;

  const founderCapitalPooledAud = input.founders.reduce(
    (acc, f) => acc + Math.max(0, safeNum(f.cashAud)),
    0,
  );
  const externalRaiseAud = Math.max(0, totalNeedAud - founderCapitalPooledAud);

  const split = computeSplit(preMoneyAud, externalRaiseAud, esopTargetPct);

  // Per-founder dilution preview. If no equityPct provided, assume equal split.
  const fallbackEquity = 100 / Math.max(1, input.founders.length);
  const equitySum = input.founders.reduce(
    (acc, f) =>
      acc +
      (typeof f.equityPct === "number" && Number.isFinite(f.equityPct)
        ? Math.max(0, f.equityPct)
        : 0),
    0,
  );
  const useProvidedEquity = equitySum > 0;

  const founderRows: FounderDilutionRow[] = input.founders.map((f) => {
    const equityBeforePct = useProvidedEquity
      ? (Math.max(0, safeNum(f.equityPct ?? 0)) / equitySum) * 100
      : fallbackEquity;
    const equityAfterPct =
      (equityBeforePct / 100) * split.founderPctAfter;
    return {
      id: f.id,
      name: f.name,
      cashAud: Math.max(0, safeNum(f.cashAud)),
      equityBeforePct,
      equityAfterPct,
      diluted: equityBeforePct - equityAfterPct,
    };
  });

  // SAFE suggestion
  let safeDiscount = 20;
  let safeCapMultiplier = 1.5;
  if (input.raiseType === "preseed_vc") {
    safeDiscount = 15;
    safeCapMultiplier = 1.25;
  } else if (input.raiseType === "angel") {
    safeDiscount = 20;
    safeCapMultiplier = 1.4;
  }
  const safe: SafeSuggestion = {
    discountPct: safeDiscount,
    capAud: preMoneyAud * safeCapMultiplier,
  };

  // Scenarios — smaller raise / bigger raise / no external raise (full bootstrap)
  const smaller = Math.max(0, externalRaiseAud * 0.6);
  const bigger = externalRaiseAud * 1.4;
  const buildScenario = (
    label: string,
    raise: number,
  ): FundingPlanScenario => {
    const s = computeSplit(preMoneyAud, raise, esopTargetPct);
    return {
      label,
      externalRaiseAud: raise,
      postMoneyAud: s.postMoneyAud,
      investorPct: s.investorPct,
      esopPct: s.esopPct,
      founderPctAfter: s.founderPctAfter,
    };
  };

  const scenarios: FundingPlanScenario[] = [
    buildScenario("Smaller raise (60%)", smaller),
    buildScenario("Recommended", externalRaiseAud),
    buildScenario("Bigger raise (140%)", bigger),
    buildScenario("Full bootstrap", 0),
  ];

  // Risk flags
  const flags: FundingPlanFlag[] = [];
  if (totalNeedAud > 500_000) {
    flags.push({
      level: "warn",
      message:
        "Total need exceeds $500k at idea stage — likely too aggressive. Trim wages or runway, or split into a friends-and-family + pre-seed plan.",
    });
  }
  if (founderCapitalPooledAud > 0) {
    const maxContribution = Math.max(
      ...input.founders.map((f) => Math.max(0, safeNum(f.cashAud))),
    );
    if (maxContribution / founderCapitalPooledAud > 0.5 && input.founders.length > 1) {
      flags.push({
        level: "warn",
        message:
          "One founder is contributing more than 50% of the pooled cash — consider weighted equity to reflect that imbalance.",
      });
    }
  }
  if (esopTargetPct < 8) {
    flags.push({
      level: "warn",
      message:
        "ESOP pool below 8% — most pre-seed leads will require a top-up at the next round, which dilutes founders again.",
    });
  }
  if (externalRaiseAud === 0 && totalNeedAud > 0) {
    flags.push({
      level: "info",
      message:
        "Founders cover full runway — no external raise needed. You keep 100% (less ESOP) but personal cash is at risk.",
    });
  }

  const recommended = {
    raiseAud: externalRaiseAud,
    preMoneyAud,
    dilutionPct: split.investorPct + split.esopPct,
  };

  return {
    monthlyBurnAud,
    monthlyWageSubtotalAud,
    monthlyOpexSubtotalAud,
    burnBeforeBufferAud,
    bufferAud,
    totalNeedAud,
    founderCapitalPooledAud,
    externalRaiseAud,
    postMoneyAud: split.postMoneyAud,
    investorPct: split.investorPct,
    esopPct: split.esopPct,
    founderPctAfter: split.founderPctAfter,
    founderRows,
    safe,
    scenarios,
    flags,
    recommended,
  };
}
