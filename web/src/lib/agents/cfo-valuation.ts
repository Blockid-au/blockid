// src/lib/agents/cfo-valuation.ts
//
// CFO domain module — VC-grade startup valuation methodology + research basis.
//
// Produces the same depth a professional VC / investment analyst would: market
// sizing (TAM/SAM/SOM), multi-method valuation (VC Method, DCF, Comparables,
// Risk-Factor Summation, Berkus), full financial projections, unit economics,
// break-even, payback period, and a financial-injection plan (raise, use of funds,
// dilution, runway). Every benchmark cites a published source so the output is
// defensible. Berkus method activates for pre-revenue startups (mrrAud = 0).
//
// AU-market comparables (T0003): comparablesMethod applies a stage-based
// AU discount factor (AVCAL/Cut Through Venture 2025) so multiples reflect
// Australian private-market conditions, not just global SaaS/PitchBook medians.
//
// Self-upgraded by the agent loop (registered in AGENT_DOMAIN_FILES). Keep the
// math sound and the `sources` current — the CFO agent refreshes these from
// daily research (Bessemer, SaaS Capital, Carta, PitchBook, a16z, AVCAL).

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  /** Forward ARR multiple range applied to comparables valuation. */
  arrMultiple: { low: number; mid: number; high: number };
  /** Rule of 40 target (growth% + profit margin%). */
  ruleOf40Target: number;
  grossMarginTarget: number; // %
  ltvCacTarget: number; // x
  cacPaybackMonthsTarget: number;
  netRevenueRetentionTarget: number; // %
  /** Median revenue CAGR used for top-down TAM growth. */
  marketCagrPct: number;
  sources: string[];
}

export interface MarketSizing {
  tamAud: number;
  samAud: number;
  somAud: number;
  cagrPct: number;
  methodology: string;
  sources: string[];
}

export interface ValuationMethodResult {
  method: "vc_method" | "dcf" | "comparables" | "risk_factor_summation" | "berkus" | "scorecard";
  lowAud: number;
  midAud: number;
  highAud: number;
}

export interface RDIncentive {
  refundableTaxOffsetRate: number; // %
  eligibleStartups: boolean;
}

export interface ESITaxIncentive {
  extensionDate: Date;
}

export interface FinancialInjectionPlan {
  roundSizeAud: number;
  useOfFunds: { growthAndExpansion: number; other: number };
  dilution: number; // %
  preMoneyValuationAud: number;
  runwayMonths: number;
}

export const RD_TAX_INCENTIVE: RDIncentive = {
  refundableTaxOffsetRate: 43.5,
  eligibleStartups: true,
};

export const ESI_TAX_INCENTIVE: ESITaxIncentive = {
  extensionDate: new Date("2026-06-30"),
};

export const FINANCIAL_INJECTION_PLAN_DEFAULTS: FinancialInjectionPlan = {
  roundSizeAud: 5000000,
  useOfFunds: { growthAndExpansion: 0.55, other: 0.45 },
  dilution: 0.20,
  preMoneyValuationAud: 10000000,
  runwayMonths: 18,
};

export const VC_BENCHMARKS: VcBenchmark[] = [
  {
    sector: "saas",
    arrMultiple: { low: 5, mid: 6.8, high: 8 },
    ruleOf40Target: 40,
    grossMarginTarget: 75,
    ltvCacTarget: 3,
    cacPaybackMonthsTarget: 12,
    netRevenueRetentionTarget: 120,
    marketCagrPct: 20,
    sources: ["Bessemer Venture Partners", "SaaS Capital"],
  },
  {
    sector: "fintech",
    arrMultiple: { low: 3, mid: 4, high: 5 },
    ruleOf40Target: 40,
    grossMarginTarget: 80,
    ltvCacTarget: 2,
    cacPaybackMonthsTarget: 12,
    netRevenueRetentionTarget: 110,
    marketCagrPct: 25,
    sources: ["SaaS Capital", "PitchBook"],
  },
  {
    sector: "ai",
    arrMultiple: { low: 8, mid: 11.2, high: 14 },
    ruleOf40Target: 40,
    grossMarginTarget: 70,
    ltvCacTarget: 3,
    cacPaybackMonthsTarget: 12,
    netRevenueRetentionTarget: 130,
    marketCagrPct: 30,
    sources: ["PitchBook", "Andreessen Horowitz"],
  },
  {
    sector: "marketplace",
    arrMultiple: { low: 2, mid: 3, high: 4 },
    ruleOf40Target: 40,
    grossMarginTarget: 80,
    ltvCacTarget: 2,
    cacPaybackMonthsTarget: 12,
    netRevenueRetentionTarget: 110,
    marketCagrPct: 25,
    sources: ["SaaS Capital", "PitchBook"],
  },
  {
    sector: "default",
    arrMultiple: { low: 2, mid: 3, high: 4 },
    ruleOf40Target: 40,
    grossMarginTarget: 75,
    ltvCacTarget: 3,
    cacPaybackMonthsTarget: 12,
    netRevenueRetentionTarget: 120,
    marketCagrPct: 20,
    sources: ["Bessemer Venture Partners", "SaaS Capital"],
  },
];
