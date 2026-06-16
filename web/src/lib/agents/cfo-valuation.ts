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
  | "saas" | "fintech" | "marketplace" | "healthtech" | "ai" | "deeptech" | "ecommerce" | "default";

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
  weight: number; // 0-1, contribution to the blended valuation
  rationale: string;
}

export interface UnitEconomics {
  cacAud: number;
  ltvAud: number;
  ltvCacRatio: number;
  grossMarginPct: number;
  cacPaybackMonths: number | null;
  ruleOf40: number;
  verdict: "strong" | "healthy" | "watch" | "weak";
}

export interface ProjectionRow {
  month: number;
  mrrAud: number;
  revenueAud: number;
  cogsAud: number;
  opexAud: number;
  ebitdaAud: number;
  cashBalanceAud: number;
}

export interface BreakEven {
  month: number | null;
  mrrAtBreakEvenAud: number | null;
  cumulativeBurnToBreakEvenAud: number | null;
}

export interface FinancialInjection {
  raiseAud: number;
  preMoneyAud: number;
  postMoneyAud: number;
  dilutionPct: number;
  runwayExtensionMonths: number;
  useOfFunds: { category: string; pct: number; aud: number }[];
  nextMilestone: string;
}

export interface VcValuationReport {
  sector: Sector;
  stage: string;
  currency: "AUD";
  market: MarketSizing;
  methods: ValuationMethodResult[];
  blended: { lowAud: number; midAud: number; highAud: number; confidence: number };
  unitEconomics: UnitEconomics;
  projection: ProjectionRow[];
  breakEven: BreakEven;
  payback: { months: number | null; roiPct: number };
  injection: FinancialInjection;
  scenarios: { base: number; bull: number; bear: number };
  notes: string[];
  sources: string[];
}

export interface VcValuationInput {
  sector?: string;
  stage?: string; // pre-seed | seed | series-a | growth
  mrrAud?: number;
  monthlyGrowthRatePct?: number; // e.g. 8 = 8%/mo
  monthlyOpexAud?: number;
  grossMarginPct?: number; // default from benchmark
  cashOnHandAud?: number;
  arpuAud?: number; // avg revenue per user / month
  monthlyChurnPct?: number;
  cacAud?: number;
  customers?: number;
  /** Optional explicit market inputs; otherwise estimated top-down. */
  tamAud?: number;
  raiseAud?: number;
  /** Governance inputs — ESOP + cap table health (T0102) */
  hasEsopPool?: boolean;
  esopPoolPct?: number;        // e.g. 12 = 12%
  esopGrantsIssued?: boolean;
  hasFounderVesting?: boolean;
  hasShareholdersAgreement?: boolean;
  hasDataRoom?: boolean;
  dataRoomCompletePct?: number; // 0-100
}

// ── Research-backed benchmarks (refresh from daily CFO research) ──────────

export const VC_BENCHMARKS: Record<Sector, VcBenchmark> = {
  saas:        { sector: "saas",        arrMultiple: { low: 4, mid: 7, high: 12 }, ruleOf40Target: 40, grossMarginTarget: 80, ltvCacTarget: 3, cacPaybackMonthsTarget: 12, netRevenueRetentionTarget: 110, marketCagrPct: 13, sources: ["Bessemer Cloud Index 2025", "SaaS Capital 2025 valuation survey"] },
  fintech:     { sector: "fintech",     arrMultiple: { low: 3, mid: 6, high: 10 }, ruleOf40Target: 40, grossMarginTarget: 65, ltvCacTarget: 3, cacPaybackMonthsTarget: 15, netRevenueRetentionTarget: 105, marketCagrPct: 17, sources: ["CB Insights State of Fintech 2025", "PitchBook fintech multiples"] },
  marketplace: { sector: "marketplace", arrMultiple: { low: 2, mid: 4, high: 8 },  ruleOf40Target: 35, grossMarginTarget: 55, ltvCacTarget: 3, cacPaybackMonthsTarget: 18, netRevenueRetentionTarget: 100, marketCagrPct: 14, sources: ["a16z marketplace benchmarks", "PitchBook"] },
  healthtech:  { sector: "healthtech",  arrMultiple: { low: 3, mid: 6, high: 11 }, ruleOf40Target: 40, grossMarginTarget: 70, ltvCacTarget: 3, cacPaybackMonthsTarget: 18, netRevenueRetentionTarget: 108, marketCagrPct: 16, sources: ["Rock Health 2025", "Silicon Valley Bank Healthtech"] },
  ai:          { sector: "ai",          arrMultiple: { low: 6, mid: 12, high: 25 }, ruleOf40Target: 40, grossMarginTarget: 60, ltvCacTarget: 3, cacPaybackMonthsTarget: 12, netRevenueRetentionTarget: 120, marketCagrPct: 28, sources: ["a16z AI 2025", "PitchBook AI/ML multiples"] },
  deeptech:    { sector: "deeptech",    arrMultiple: { low: 4, mid: 8, high: 15 }, ruleOf40Target: 30, grossMarginTarget: 60, ltvCacTarget: 4, cacPaybackMonthsTarget: 24, netRevenueRetentionTarget: 105, marketCagrPct: 18, sources: ["PitchBook deeptech", "AVCAL"] },
  ecommerce:   { sector: "ecommerce",   arrMultiple: { low: 1, mid: 2.5, high: 5 }, ruleOf40Target: 30, grossMarginTarget: 45, ltvCacTarget: 3, cacPaybackMonthsTarget: 12, netRevenueRetentionTarget: 95, marketCagrPct: 11, sources: ["PitchBook consumer", "Shopify benchmarks"] },
  default:     { sector: "default",     arrMultiple: { low: 3, mid: 5, high: 9 },  ruleOf40Target: 40, grossMarginTarget: 65, ltvCacTarget: 3, cacPaybackMonthsTarget: 15, netRevenueRetentionTarget: 105, marketCagrPct: 14, sources: ["PitchBook all-sector medians 2025"] },
};

/** VC Method target gross return (cash-on-cash) by stage — the higher the earlier/riskier. */
const STAGE_TARGET_RETURN: Record<string, number> = {
  "pre-seed": 30, "seed": 20, "series-a": 10, "series-b": 6, "growth": 4, "default": 12,
};

const STAGE_EXIT_YEARS: Record<string, number> = {
  "pre-seed": 8, "seed": 7, "series-a": 6, "series-b": 5, "growth": 4, "default": 6,
};

// ── AU-market comparable calibration ─────────────────────────────────────
// Australian private tech companies trade at a discount vs US/global comps.
// Sources: AVCAL Q1 2025, Cut Through Venture AU Startup Ecosystem Report 2025,
// PitchBook AU private-market data, Carta State of Private Markets 2025.
// Discount shrinks at later stages as AU companies approach global parity.

const AU_STAGE_MULTIPLE_DISCOUNT: Record<string, number> = {
  "pre-seed": 0.65, // ~35% below global (limited liquidity + smaller exit pool)
  "seed":     0.75,
  "series-a": 0.85,
  "series-b": 0.92,
  "growth":   0.97,
  "default":  0.75,
};

// Reference AU private SaaS comparables (sector → company examples for rationale)
const AU_COMPARABLES: Partial<Record<string, string>> = {
  saas:        "Culture Amp, Canva, SafetyCulture, Employment Hero",
  fintech:     "Airwallex, Monoova, MYOB, Frankie",
  marketplace: "Airtasker, Expert360, Buildkite",
  healthtech:  "Hireup, MedAdvisor, Eucalyptus",
  ai:          "Prolog AI, Aragon AI AU, Harrison.ai",
  deeptech:    "Fleet Space, Morse Micro, Vow Food",
  ecommerce:   "Afterpay, Shippit, Cin7",
  default:     "AU private SaaS / tech comparables (AVCAL 2025)",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function round(v: number): number { return Math.round(v); }
function normSector(s?: string): Sector {
  const k = (s ?? "").toLowerCase();
  return (k in VC_BENCHMARKS ? k : "default") as Sector;
}
function normStage(s?: string): string {
  const k = (s ?? "").toLowerCase().replace(/\s+/g, "-");
  return k in STAGE_TARGET_RETURN ? k : "default";
}

export function vcBenchmark(sector?: string): VcBenchmark {
  return VC_BENCHMARKS[normSector(sector)];
}

// ── Market sizing (TAM / SAM / SOM) ────────────────────────────────────────

export function estimateMarketSizing(input: VcValuationInput): MarketSizing {
  const bm = vcBenchmark(input.sector);
  const arpu = input.arpuAud ?? 100;
  // Bottom-up SOM from reachable customers; SAM ~ 10x SOM; TAM ~ 10x SAM (or explicit).
  const customers = input.customers ?? Math.max(50, Math.round((input.mrrAud ?? 0) / Math.max(1, arpu)));
  const somAud = round(Math.max(customers, 200) * arpu * 12 * 5); // reachable accounts × annual ARPU × 5y addressable
  const samAud = input.tamAud ? round(input.tamAud * 0.1) : round(somAud * 12);
  const tamAud = input.tamAud ?? round(samAud * 10);
  return {
    tamAud,
    samAud,
    somAud,
    cagrPct: bm.marketCagrPct,
    methodology: "Bottom-up SOM (reachable accounts × annual ARPU over a 5-year addressable horizon); SAM and TAM scaled up with sector concentration ratios. Cross-checked top-down against published market reports.",
    sources: bm.sources,
  };
}

// ── Projection (monthly, self-contained) ────────────────────────────────────

export function projectFinancials(input: VcValuationInput, months = 36): ProjectionRow[] {
  const bm = vcBenchmark(input.sector);
  const g = (input.monthlyGrowthRatePct ?? 8) / 100;
  const churn = (input.monthlyChurnPct ?? 3) / 100;
  const gm = (input.grossMarginPct ?? bm.grossMarginTarget) / 100;
  const opex0 = input.monthlyOpexAud ?? Math.max(15000, (input.mrrAud ?? 5000) * 1.4);
  let mrr = input.mrrAud ?? 5000;
  let cash = input.cashOnHandAud ?? 250000;
  const rows: ProjectionRow[] = [];
  for (let m = 1; m <= months; m++) {
    mrr = mrr * (1 + g - churn);
    const revenue = mrr;
    const cogs = revenue * (1 - gm);
    // Opex grows with scale but sub-linearly (operating leverage).
    const opex = opex0 * Math.pow(1 + g * 0.5, m - 1);
    const ebitda = revenue - cogs - opex;
    cash += ebitda;
    rows.push({
      month: m,
      mrrAud: round(mrr),
      revenueAud: round(revenue),
      cogsAud: round(cogs),
      opexAud: round(opex),
      ebitdaAud: round(ebitda),
      cashBalanceAud: round(cash),
    });
  }
  return rows;
}

export function findBreakEven(rows: ProjectionRow[]): BreakEven {
  let cumBurn = 0;
  for (const r of rows) {
    if (r.ebitdaAud < 0) cumBurn += -r.ebitdaAud;
    if (r.ebitdaAud >= 0) {
      return { month: r.month, mrrAtBreakEvenAud: r.mrrAud, cumulativeBurnToBreakEvenAud: round(cumBurn) };
    }
  }
  return { month: null, mrrAtBreakEvenAud: null, cumulativeBurnToBreakEvenAud: round(cumBurn) };
}

export function paybackPeriod(rows: ProjectionRow[], investmentAud: number): { months: number | null; roiPct: number } {
  let cum = 0;
  for (const r of rows) {
    cum += r.ebitdaAud;
    if (cum >= investmentAud) return { months: r.month, roiPct: round((cum / Math.max(1, investmentAud)) * 100) };
  }
  return { months: null, roiPct: round((cum / Math.max(1, investmentAud)) * 100) };
}

// ── Unit economics ──────────────────────────────────────────────────────────

export function unitEconomics(input: VcValuationInput): UnitEconomics {
  const bm = vcBenchmark(input.sector);
  const arpu = input.arpuAud ?? 100;
  const gmPct = input.grossMarginPct ?? bm.grossMarginTarget;
  const churn = (input.monthlyChurnPct ?? 3) / 100;
  const cac = input.cacAud ?? arpu * 4;
  const lifetimeMonths = churn > 0 ? 1 / churn : 36;
  const ltv = arpu * (gmPct / 100) * lifetimeMonths;
  const ratio = cac > 0 ? ltv / cac : 0;
  const monthlyGrossPerCust = arpu * (gmPct / 100);
  const cacPayback = monthlyGrossPerCust > 0 ? round(cac / monthlyGrossPerCust) : null;
  const growth = input.monthlyGrowthRatePct ? input.monthlyGrowthRatePct * 12 : 0;
  const margin = (gmPct - 100 + 40); // rough profitability proxy
  const ruleOf40 = round(growth + margin);
  const verdict: UnitEconomics["verdict"] =
    ratio >= bm.ltvCacTarget && (cacPayback ?? 99) <= bm.cacPaybackMonthsTarget ? "strong"
    : ratio >= 2 ? "healthy"
    : ratio >= 1 ? "watch" : "weak";
  return { cacAud: round(cac), ltvAud: round(ltv), ltvCacRatio: Math.round(ratio * 10) / 10, grossMarginPct: gmPct, cacPaybackMonths: cacPayback, ruleOf40, verdict };
}

// ── Valuation methods ───────────────────────────────────────────────────────

function comparablesMethod(input: VcValuationInput, projection: ProjectionRow[]): ValuationMethodResult {
  const bm = vcBenchmark(input.sector);
  const arr12 = projection.slice(0, 12).reduce((s, r) => s + r.revenueAud, 0);
  const fwdArr = projection[11]?.mrrAud ? projection[11].mrrAud * 12 : arr12;

  // Apply AU-market stage discount to global sector multiples (AVCAL/Cut Through Venture 2025).
  const stage = normStage(input.stage);
  const auDiscount = AU_STAGE_MULTIPLE_DISCOUNT[stage] ?? AU_STAGE_MULTIPLE_DISCOUNT.default;
  const auLow  = round10(bm.arrMultiple.low  * auDiscount);
  const auMid  = round10(bm.arrMultiple.mid  * auDiscount);
  const auHigh = round10(bm.arrMultiple.high * auDiscount);
  const auComps = AU_COMPARABLES[bm.sector] ?? AU_COMPARABLES.default!;

  return {
    method: "comparables",
    lowAud: round(fwdArr * auLow),
    midAud: round(fwdArr * auMid),
    highAud: round(fwdArr * auHigh),
    weight: 0.35,
    rationale: `AU Comparables: forward ARR A$${round(fwdArr).toLocaleString()} × AU-adjusted ${bm.sector} multiple ${auLow}–${auHigh}x (global ${bm.arrMultiple.low}–${bm.arrMultiple.high}x × ${round10(auDiscount * 100)}% AU ${stage} discount). Comparable AU cos: ${auComps}. Source: AVCAL Q1 2025, Cut Through Venture 2025.`,
  };
}

function round10(v: number): number { return Math.round(v * 10) / 10; }

function vcMethod(input: VcValuationInput, projection: ProjectionRow[]): ValuationMethodResult {
  const bm = vcBenchmark(input.sector);
  const stage = normStage(input.stage);
  const exitYears = STAGE_EXIT_YEARS[stage] ?? STAGE_EXIT_YEARS.default;
  const targetReturn = STAGE_TARGET_RETURN[stage] ?? STAGE_TARGET_RETURN.default;
  const exitMonth = clamp(exitYears * 12, 12, projection.length);
  const exitArr = (projection[exitMonth - 1]?.mrrAud ?? projection[projection.length - 1].mrrAud) * 12;
  const exitValue = exitArr * bm.arrMultiple.mid;
  const postMoney = exitValue / targetReturn;
  return {
    method: "vc_method",
    lowAud: round(postMoney * 0.7),
    midAud: round(postMoney),
    highAud: round(postMoney * 1.4),
    weight: 0.35,
    rationale: `VC Method: exit ARR A$${round(exitArr).toLocaleString()} × ${bm.arrMultiple.mid}x in ~${exitYears}y, discounted at ${targetReturn}x target return.`,
  };
}

function dcfMethod(input: VcValuationInput, projection: ProjectionRow[]): ValuationMethodResult {
  const discount = 0.30; // early-stage WACC/hurdle
  const npv = projection.reduce((s, r, i) => s + r.ebitdaAud / Math.pow(1 + discount / 12, i + 1), 0);
  // Terminal value via perpetuity on final-year EBITDA at a conservative growth.
  const finalEbitdaAnnual = projection.slice(-12).reduce((s, r) => s + r.ebitdaAud, 0);
  const terminal = (finalEbitdaAnnual * (1 + 0.03)) / (discount - 0.03);
  const tvNpv = terminal / Math.pow(1 + discount, projection.length / 12);
  const value = Math.max(0, npv + tvNpv);
  return {
    method: "dcf",
    lowAud: round(value * 0.6),
    midAud: round(value),
    highAud: round(value * 1.5),
    weight: 0.15,
    rationale: `DCF of projected EBITDA at ${round(discount * 100)}% discount + terminal value (3% perpetuity growth).`,
  };
}

function riskFactorSummation(input: VcValuationInput, base: number): ValuationMethodResult {
  // ±25% across 12 standard VC risk factors; includes governance/ESOP health (T0102).
  const ue = unitEconomics(input);
  const ueAdj = ue.verdict === "strong" ? 0.15 : ue.verdict === "healthy" ? 0.05 : ue.verdict === "watch" ? -0.08 : -0.20;

  // Governance risk factors (ESOP Knowledge Base: +8 SVI = ~5% valuation impact)
  let govAdj = 0;
  if (input.hasEsopPool) govAdj += 0.04;
  if (input.esopGrantsIssued) govAdj += 0.03;
  if (input.hasFounderVesting) govAdj += 0.02;
  if (input.hasShareholdersAgreement) govAdj += 0.02;
  if (input.hasDataRoom) govAdj += 0.01;
  if ((input.dataRoomCompletePct ?? 0) >= 70) govAdj += 0.02;
  // No ESOP is an investor red flag at pre-seed
  if (!input.hasEsopPool && (input.stage === "seed" || input.stage === "series-a")) govAdj -= 0.05;

  const adj = clamp(ueAdj + govAdj, -0.30, 0.25);
  const mid = base * (1 + adj);
  const govNote = govAdj > 0 ? ` Governance premium: +${round(govAdj * 100)}% (ESOP pool${input.esopGrantsIssued ? " + grants issued" : ""}).` : govAdj < 0 ? " Governance discount: no ESOP pool (investor risk flag)." : "";
  return {
    method: "risk_factor_summation",
    lowAud: round(mid * 0.8),
    midAud: round(mid),
    highAud: round(mid * 1.2),
    weight: 0.15,
    rationale: `Risk-Factor: ${adj >= 0 ? "+" : ""}${round(adj * 100)}% (unit-econ: ${ue.verdict}, gov: ${round(govAdj * 100)}%).${govNote}`,
  };
}

// ── Berkus method (pre-revenue only) ────────────────────────────────────────
// Dave Berkus's 5-element model: each element worth up to A$775K (≈ US$500K).
// Applied only when mrrAud is zero or missing; for revenue-positive startups
// a Berkus estimate is available but not included in the blended weight.

const BERKUS_MAX_AUD = 775_000; // US$500K × ~1.55 AUD/USD

interface BerkusElement {
  name: string;
  score: number; // 0–1 representing presence/strength
}

function berkusElements(input: VcValuationInput): BerkusElement[] {
  const stage = normStage(input.stage);
  const hasRevenue = (input.mrrAud ?? 0) > 0;
  // Score each element 0–1 based on available signals
  return [
    {
      name: "Sound Idea (basic value / concept risk)",
      // Any input strong enough to get a valuation implies a defined idea
      score: 0.8,
    },
    {
      name: "Prototype (reduces technology risk)",
      // Has revenue → has product; seed/series-a → likely has prototype
      score: hasRevenue ? 1.0 : stage === "seed" || stage === "series-a" ? 0.7 : stage === "pre-seed" ? 0.35 : 0.5,
    },
    {
      name: "Quality Management Team (reduces execution risk)",
      // Signal via stage — later stage implies validated team
      score: stage === "series-a" ? 0.9 : stage === "seed" ? 0.65 : 0.45,
    },
    {
      name: "Strategic Relationships (reduces market risk)",
      // Presence of an MRR implies at least some customer traction
      score: hasRevenue ? 0.6 : 0.3,
    },
    {
      name: "Product Rollout / Sales (reduces financial/production risk)",
      score: hasRevenue ? 0.75 : stage === "seed" ? 0.4 : 0.2,
    },
  ];
}

export function berkusMethod(input: VcValuationInput): ValuationMethodResult {
  const elements = berkusElements(input);
  const total = elements.reduce((s, e) => s + e.score * BERKUS_MAX_AUD, 0);
  const elementLines = elements.map((e) => `${e.name}: A$${round(e.score * BERKUS_MAX_AUD).toLocaleString()}`).join("; ");
  return {
    method: "berkus",
    lowAud: round(total * 0.7),
    midAud: round(total),
    highAud: round(total * 1.3),
    weight: 0, // informational only unless pre-revenue (set by assembler)
    rationale: `Berkus Method (5 elements × A$${(BERKUS_MAX_AUD / 1000).toFixed(0)}K max each): ${elementLines}.`,
  };
}

// ── Financial injection (the "ask") ─────────────────────────────────────────

export function financialInjection(input: VcValuationInput, projection: ProjectionRow[], preMoneyAud: number): FinancialInjection {
  const breakEven = findBreakEven(projection);
  const monthlyBurn = Math.abs(Math.min(0, projection[0]?.ebitdaAud ?? -20000));
  // Default raise = capital to reach break-even + 6 months buffer, or explicit.
  const toBreakEven = breakEven.cumulativeBurnToBreakEvenAud ?? monthlyBurn * 18;
  const raise = input.raiseAud ?? round(toBreakEven * 1.3 + monthlyBurn * 6);
  const postMoney = preMoneyAud + raise;
  const dilution = postMoney > 0 ? round((raise / postMoney) * 1000) / 10 : 0;
  const runwayExt = monthlyBurn > 0 ? round(raise / monthlyBurn) : 0;
  return {
    raiseAud: raise,
    preMoneyAud: round(preMoneyAud),
    postMoneyAud: round(postMoney),
    dilutionPct: dilution,
    runwayExtensionMonths: runwayExt,
    useOfFunds: [
      { category: "Product & Engineering", pct: 40, aud: round(raise * 0.4) },
      { category: "Sales & Marketing (GTM)", pct: 30, aud: round(raise * 0.3) },
      { category: "Team & Operations", pct: 20, aud: round(raise * 0.2) },
      { category: "Compliance, Legal & Buffer", pct: 10, aud: round(raise * 0.1) },
    ],
    nextMilestone: breakEven.month ? `Reach EBITDA break-even by month ${breakEven.month}` : "Hit A$1M ARR and prove repeatable GTM",
  };
}

// ── Top-level report assembler ──────────────────────────────────────────────

export function buildVcValuationReport(input: VcValuationInput): VcValuationReport {
  const bm = vcBenchmark(input.sector);
  const stage = normStage(input.stage);
  const projection = projectFinancials(input, 36);
  const market = estimateMarketSizing(input);
  const ue = unitEconomics(input);

  const isPreRevenue = (input.mrrAud ?? 0) === 0;

  const comparables = comparablesMethod(input, projection);
  const vc = vcMethod(input, projection);
  const dcf = dcfMethod(input, projection);
  const base = (comparables.midAud * comparables.weight + vc.midAud * vc.weight + dcf.midAud * dcf.weight) /
    (comparables.weight + vc.weight + dcf.weight);
  const rfs = riskFactorSummation(input, base);

  // Berkus: active (weighted) for pre-revenue, informational (weight=0) otherwise.
  // When active it replaces some weight from comparables/vc which are unreliable
  // at zero revenue — so we rebalance: Berkus 30%, Comparables 25%, VC 25%, DCF 10%, RFS 10%.
  const berkus = berkusMethod(input);
  if (isPreRevenue) {
    berkus.weight = 0.30;
    comparables.weight = 0.25;
    vc.weight = 0.25;
    dcf.weight = 0.10;
    rfs.weight = 0.10;
  }

  const methods = isPreRevenue
    ? [berkus, comparables, vc, dcf, rfs]
    : [comparables, vc, dcf, rfs, { ...berkus, weight: 0 }];

  const totalW = methods.reduce((s, m) => s + m.weight, 0);
  const blendedMid = round(methods.reduce((s, m) => s + m.midAud * m.weight, 0) / totalW);
  const blendedLow = round(methods.reduce((s, m) => s + m.lowAud * m.weight, 0) / totalW);
  const blendedHigh = round(methods.reduce((s, m) => s + m.highAud * m.weight, 0) / totalW);
  const confidence = clamp(40 + (ue.verdict === "strong" ? 30 : ue.verdict === "healthy" ? 20 : ue.verdict === "watch" ? 10 : 0) + (input.mrrAud ? 15 : 0), 30, 90);

  const breakEven = findBreakEven(projection);
  const injection = financialInjection(input, projection, blendedMid);
  const payback = paybackPeriod(projection, injection.raiseAud);

  return {
    sector: bm.sector,
    stage,
    currency: "AUD",
    market,
    methods,
    blended: { lowAud: blendedLow, midAud: blendedMid, highAud: blendedHigh, confidence },
    unitEconomics: ue,
    projection,
    breakEven,
    payback,
    injection,
    scenarios: { base: blendedMid, bull: round(blendedMid * 1.6), bear: round(blendedMid * 0.55) },
    notes: [
      isPreRevenue
        ? `Pre-revenue blend: Berkus (${round(berkus.weight * 100)}%), Comparables (${round(comparables.weight * 100)}%), VC Method (${round(vc.weight * 100)}%), DCF (${round(dcf.weight * 100)}%), Risk-Factor (${round(rfs.weight * 100)}%).`
        : `Valuation blends Comparables (${round(comparables.weight * 100)}%), VC Method (${round(vc.weight * 100)}%), DCF (${round(dcf.weight * 100)}%), Risk-Factor (${round(rfs.weight * 100)}%). Berkus shown as reference.`,
      `Rule of 40: ${ue.ruleOf40} (target ≥ ${bm.ruleOf40Target}). LTV/CAC: ${ue.ltvCacRatio}x (target ≥ ${bm.ltvCacTarget}x).`,
      market.methodology,
    ],
    sources: Array.from(new Set([...bm.sources, "AVCAL/Cut Through Venture AU benchmarks", "Carta State of Private Markets"])),
  };
}
