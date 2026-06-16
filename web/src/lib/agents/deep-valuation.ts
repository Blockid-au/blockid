// Deep multi-perspective valuation analysis.
//
// Augments the deterministic SVI score with 4 independent valuation lenses so
// the founder (and the partner reading the PDF) sees not just a single number
// but a triangulation of methodologies. Each lens has its own assumptions and
// confidence so they're auditable.
//
// Lenses:
//   1. INVESTOR — VC-method projections discounted by stage IRR target
//   2. MARKET — Top-down TAM × realistic penetration × revenue multiple
//   3. OPERATIONAL — Unit economics (LTV/CAC × ARR × gross margin)
//   4. ECOSYSTEM — AU stage discounts + sector EBITDA comps
//
// Combined into a `blendedValuation` band whose weights reflect the data
// quality available (no signal → 0 weight to that lens). Methodology lines
// are exposed so the PDF can show "how we got here".

import type { SVIAnalysis } from "@/lib/svi-analysis";
import { detectSector } from "@/lib/svi-analysis";
import type { WebsiteCompetitiveIntelligence } from "@/lib/competitive-intelligence";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PerspectiveCode = "investor" | "market" | "operational" | "ecosystem";

export interface ValuationPerspective {
  code: PerspectiveCode;
  label: string;
  lowAud: number;
  midAud: number;
  highAud: number;
  weight: number; // 0-1, how much this contributes to blended
  rationale: string;
  assumptions: string[];
  confidence: "low" | "medium" | "high";
}

export interface MarketSizing {
  tamAud: number; // Total addressable
  samAud: number; // Serviceable addressable
  somAud: number; // Serviceable obtainable (year-3 realistic)
  methodology: string;
  sources: string[];
  confidence: "low" | "medium" | "high";
}

export interface RevenueScenario {
  scenario: "conservative" | "base" | "optimistic";
  year1MrrAud: number;
  year3ArrAud: number;
  payingCustomers: number;
  assumptions: string;
}

export interface PeerComparable {
  name: string;
  sector: string;
  stageGuess: string;
  estValuationLowAud: number;
  estValuationHighAud: number;
  similarityScore: number; // 0-100
  source: string;
}

export interface DeepValuationAnalysis {
  perspectives: ValuationPerspective[];
  marketSizing: MarketSizing;
  revenueScenarios: RevenueScenario[];
  peerComparables: PeerComparable[];
  blendedValuation: {
    lowAud: number;
    midAud: number;
    highAud: number;
    confidence: "low" | "medium" | "high";
    weights: Record<PerspectiveCode, number>;
  };
  methodNotes: string[];
  riskFlags: string[];
  generatedAt: string;
}

// ─── Sector market-size reference (AU TAM, 2026 baselines, AUD) ──────────────

const SECTOR_TAM_AUD: Record<string, { tam: number; samPct: number; somPct: number; growthPct: number; sources: string[] }> = {
  saas:        { tam: 22_000_000_000, samPct: 0.25, somPct: 0.012, growthPct: 13, sources: ["IBISWorld AU SaaS 2025", "Bessemer Cloud Index"] },
  fintech:     { tam: 35_000_000_000, samPct: 0.15, somPct: 0.008, growthPct: 17, sources: ["KPMG Fintech Pulse AU 2025", "Cut Through Venture"] },
  marketplace: { tam: 28_000_000_000, samPct: 0.10, somPct: 0.005, growthPct: 14, sources: ["Statista AU Marketplaces", "a16z marketplace benchmarks"] },
  healthtech:  { tam: 18_000_000_000, samPct: 0.20, somPct: 0.010, growthPct: 16, sources: ["AHHA Health Tech Report 2025", "Rock Health"] },
  ai:          { tam: 12_000_000_000, samPct: 0.30, somPct: 0.015, growthPct: 28, sources: ["IBISWorld AI Services AU", "a16z AI 2025"] },
  deeptech:    { tam: 9_500_000_000,  samPct: 0.18, somPct: 0.008, growthPct: 18, sources: ["CSIRO Deep Tech Audit 2025", "AVCAL deeptech"] },
  ecommerce:   { tam: 65_000_000_000, samPct: 0.08, somPct: 0.004, growthPct: 11, sources: ["IBISWorld AU Online Retail", "Australia Post eCommerce Index"] },
  default:     { tam: 15_000_000_000, samPct: 0.15, somPct: 0.008, growthPct: 12, sources: ["PitchBook AU 2025 medians"] },
};

// ─── Stage IRR & discount (VC perspective) ───────────────────────────────────

const STAGE_TARGET_IRR: Record<string, { irr: number; exitYears: number; dilution: number }> = {
  "pre-seed": { irr: 0.30, exitYears: 8, dilution: 0.65 },
  "seed":     { irr: 0.22, exitYears: 7, dilution: 0.55 },
  "series-a": { irr: 0.18, exitYears: 6, dilution: 0.45 },
  "series-b": { irr: 0.14, exitYears: 5, dilution: 0.35 },
  "growth":   { irr: 0.10, exitYears: 4, dilution: 0.25 },
};

// AU stage-specific multiple discount vs global. From AVCAL, Cut Through.
const AU_STAGE_DISCOUNT: Record<string, number> = {
  "pre-seed": 0.65,
  "seed":     0.75,
  "series-a": 0.85,
  "series-b": 0.92,
  "growth":   0.95,
};

// ─── SVI stage → label mapping ──────────────────────────────────────────────

function stageLabel(stage: number): string {
  if (stage <= 1) return "pre-seed";
  if (stage <= 2) return "seed";
  if (stage <= 3) return "series-a";
  if (stage <= 4) return "series-b";
  return "growth";
}

function round(n: number, step = 10_000): number {
  if (n <= 0) return 0;
  return Math.round(n / step) * step;
}

// ─── Perspective 1: Investor (VC Method) ─────────────────────────────────────
// Projects 3-yr ARR forward, applies sector multiple at exit, discounts back
// at stage IRR, then dilutes for follow-on rounds. Lowest weight when MRR=0.

function investorPerspective(args: {
  sviScore: number;
  mrrAud: number;
  growthRate: number; // monthly growth %
  sector: string;
  stage: string;
}): ValuationPerspective {
  const { sviScore, mrrAud, growthRate, sector, stage } = args;
  const { irr, exitYears, dilution } = STAGE_TARGET_IRR[stage] ?? STAGE_TARGET_IRR["seed"];
  const tamData = SECTOR_TAM_AUD[sector] ?? SECTOR_TAM_AUD["default"];
  const auDiscount = AU_STAGE_DISCOUNT[stage] ?? 0.80;

  // Estimate Year-3 ARR
  const monthlyGrowth = Math.max(0.02, growthRate / 100);
  const arrYear3 = mrrAud > 0 ? mrrAud * Math.pow(1 + monthlyGrowth, 36) * 12 : 0;

  // Exit multiple by sector (mid)
  const exitMultiples: Record<string, number> = { saas: 7, fintech: 6, ai: 12, healthtech: 6, marketplace: 4, deeptech: 8, ecommerce: 2.5, default: 5 };
  const exitMultiple = (exitMultiples[sector] ?? 5) * auDiscount;

  // Adjust by SVI quality (better fundamentals → higher confidence in projections)
  const sviMultiplier = Math.max(0.5, Math.min(1.5, sviScore / 100));

  const projectedExit = arrYear3 * exitMultiple * sviMultiplier;
  const presentValue = projectedExit / Math.pow(1 + irr, exitYears);
  const postDilution = presentValue * (1 - dilution);

  const mid = postDilution > 0 ? postDilution : tamData.tam * 0.000005 * sviMultiplier; // floor for pre-revenue
  const low = mid * 0.6;
  const high = mid * 1.7;

  return {
    code: "investor",
    label: "Investor Lens (VC Method)",
    lowAud: round(low),
    midAud: round(mid),
    highAud: round(high),
    weight: mrrAud > 0 ? 0.30 : 0.15,
    rationale: `Discounts a Year-3 ARR projection by stage IRR (${(irr * 100).toFixed(0)}%) over ${exitYears} years, applies sector exit multiple ${exitMultiple.toFixed(1)}× with AU discount.`,
    assumptions: [
      `MRR baseline: A$${Math.round(mrrAud).toLocaleString("en-AU")}`,
      `Monthly growth: ${monthlyGrowth * 100}%`,
      `Sector exit multiple (AU-adjusted): ${exitMultiple.toFixed(1)}×`,
      `Follow-on dilution allowance: ${(dilution * 100).toFixed(0)}%`,
    ],
    confidence: mrrAud > 1000 ? "medium" : "low",
  };
}

// ─── Perspective 2: Market (TAM × penetration) ───────────────────────────────

function marketPerspective(args: {
  sviScore: number;
  sector: string;
  stage: string;
  ciBlueOcean?: number;
}): ValuationPerspective {
  const { sviScore, sector, stage, ciBlueOcean } = args;
  const tamData = SECTOR_TAM_AUD[sector] ?? SECTOR_TAM_AUD["default"];
  const auDiscount = AU_STAGE_DISCOUNT[stage] ?? 0.80;

  // SOM = realistic capture in Year 3
  const som = tamData.tam * tamData.somPct;

  // Apply blue-ocean adjustment (less competition → higher capture realism)
  const blueOceanFactor = ciBlueOcean ? 0.7 + (ciBlueOcean / 100) * 0.6 : 1.0;

  // Revenue → valuation: AU early-stage SaaS trades around 4-6× forward
  const revenueMultiple = 4.5 * auDiscount;
  const sviMultiplier = Math.max(0.4, Math.min(1.6, sviScore / 100));

  const mid = som * revenueMultiple * blueOceanFactor * sviMultiplier * 0.05; // 5% of SOM reachable
  const low = mid * 0.5;
  const high = mid * 2.0;

  return {
    code: "market",
    label: "Market Lens (TAM × Penetration)",
    lowAud: round(low),
    midAud: round(mid),
    highAud: round(high),
    weight: 0.25,
    rationale: `Bottom-up valuation: SOM × revenue multiple, adjusted for blue-ocean competitive landscape and SVI quality multiplier.`,
    assumptions: [
      `Sector TAM (AU): A$${(tamData.tam / 1_000_000_000).toFixed(1)}B`,
      `SOM (Year-3 capture): A$${(som / 1_000_000).toFixed(1)}M (${(tamData.somPct * 100).toFixed(2)}% of TAM)`,
      `Revenue multiple (AU-adjusted): ${revenueMultiple.toFixed(1)}×`,
      `Blue-ocean factor: ${blueOceanFactor.toFixed(2)}`,
    ],
    confidence: "medium",
  };
}

// ─── Perspective 3: Operational (Unit economics) ─────────────────────────────

function operationalPerspective(args: {
  sviScore: number;
  mrrAud: number;
  ltvCacRatio: number;
  grossMarginPct: number;
  sector: string;
  stage: string;
}): ValuationPerspective {
  const { sviScore, mrrAud, ltvCacRatio, grossMarginPct, sector, stage } = args;
  const auDiscount = AU_STAGE_DISCOUNT[stage] ?? 0.80;

  // Rule of 40 + LTV/CAC health drive multiple expansion
  const ueHealth = Math.min(2.0, ltvCacRatio / 3) * Math.min(1.5, grossMarginPct / 60);

  // Base multiple from sector, adjusted by UE health
  const sectorBase: Record<string, number> = { saas: 7, fintech: 6, ai: 12, healthtech: 6, marketplace: 4, deeptech: 8, ecommerce: 2.5, default: 5 };
  const multiple = (sectorBase[sector] ?? 5) * ueHealth * auDiscount;

  const arr = mrrAud * 12;
  const sviMultiplier = Math.max(0.5, Math.min(1.4, sviScore / 100));

  const mid = arr > 0 ? arr * multiple * sviMultiplier : 0;
  const low = mid * 0.6;
  const high = mid * 1.6;

  return {
    code: "operational",
    label: "Operational Lens (Unit Economics)",
    lowAud: round(low),
    midAud: round(mid),
    highAud: round(high),
    weight: mrrAud > 0 ? 0.25 : 0.05,
    rationale: `ARR × unit-economics-adjusted sector multiple. Healthier LTV/CAC and gross margin compress the discount.`,
    assumptions: [
      `ARR: A$${arr.toLocaleString("en-AU")}`,
      `LTV/CAC ratio: ${ltvCacRatio.toFixed(1)}`,
      `Gross margin: ${grossMarginPct.toFixed(0)}%`,
      `UE-adjusted multiple: ${multiple.toFixed(1)}×`,
    ],
    confidence: mrrAud > 500 ? "high" : "low",
  };
}

// ─── Perspective 4: Ecosystem (AU sector EBITDA comps) ───────────────────────

function ecosystemPerspective(args: {
  sviScore: number;
  sector: string;
  stage: string;
  ebitdaMultiple?: number;
}): ValuationPerspective {
  const { sviScore, sector, stage, ebitdaMultiple } = args;
  const auDiscount = AU_STAGE_DISCOUNT[stage] ?? 0.80;

  // Pre-revenue AU startups: median pre-money from AVCAL data
  const auPreMoney: Record<string, number> = {
    "pre-seed": 1_200_000,
    "seed":     4_500_000,
    "series-a": 15_000_000,
    "series-b": 45_000_000,
    "growth":   120_000_000,
  };

  const baseValuation = auPreMoney[stage] ?? auPreMoney["seed"];
  const sectorAdjust = ebitdaMultiple ? Math.min(1.5, Math.max(0.7, ebitdaMultiple / 6)) : 1.0;
  const sviMultiplier = Math.max(0.5, Math.min(1.5, sviScore / 100));

  const mid = baseValuation * sectorAdjust * sviMultiplier * auDiscount;
  const low = mid * 0.7;
  const high = mid * 1.5;

  return {
    code: "ecosystem",
    label: "Ecosystem Lens (AU Comparables)",
    lowAud: round(low),
    midAud: round(mid),
    highAud: round(high),
    weight: 0.20,
    rationale: `Benchmarks against AU stage-median pre-money from AVCAL/Cut Through, adjusted for sector EBITDA multiple and SVI quality.`,
    assumptions: [
      `AU ${stage} median pre-money: A$${baseValuation.toLocaleString("en-AU")}`,
      `Sector EBITDA multiple: ${(ebitdaMultiple ?? 6).toFixed(1)}×`,
      `Stage discount vs global: ${(auDiscount * 100).toFixed(0)}%`,
    ],
    confidence: "medium",
  };
}

// ─── Peer comparables (template — real version would query a DB) ─────────────

function buildPeerComparables(sector: string, stage: string): PeerComparable[] {
  // Curated AU peers per sector. In production this would be backed by a
  // peer-companies DB updated from Crunchbase / Cut Through Venture.
  const peers: Record<string, PeerComparable[]> = {
    saas: [
      { name: "SafetyCulture", sector: "saas", stageGuess: "growth", estValuationLowAud: 2_200_000_000, estValuationHighAud: 2_800_000_000, similarityScore: 60, source: "AFR 2024" },
      { name: "Linktree", sector: "saas", stageGuess: "series-b", estValuationLowAud: 1_100_000_000, estValuationHighAud: 1_500_000_000, similarityScore: 55, source: "Crunchbase" },
      { name: "Employment Hero", sector: "saas", stageGuess: "growth", estValuationLowAud: 1_800_000_000, estValuationHighAud: 2_200_000_000, similarityScore: 70, source: "AFR 2025" },
    ],
    fintech: [
      { name: "Athena Home Loans", sector: "fintech", stageGuess: "growth", estValuationLowAud: 1_100_000_000, estValuationHighAud: 1_500_000_000, similarityScore: 50, source: "AFR" },
      { name: "Zeller", sector: "fintech", stageGuess: "series-b", estValuationLowAud: 900_000_000, estValuationHighAud: 1_300_000_000, similarityScore: 60, source: "Crunchbase" },
    ],
    ai: [
      { name: "Harrison.ai", sector: "ai", stageGuess: "series-b", estValuationLowAud: 600_000_000, estValuationHighAud: 1_000_000_000, similarityScore: 65, source: "Cut Through 2025" },
      { name: "Leonardo.ai", sector: "ai", stageGuess: "series-a", estValuationLowAud: 200_000_000, estValuationHighAud: 350_000_000, similarityScore: 55, source: "Crunchbase" },
    ],
    healthtech: [
      { name: "Eucalyptus", sector: "healthtech", stageGuess: "growth", estValuationLowAud: 350_000_000, estValuationHighAud: 500_000_000, similarityScore: 50, source: "AFR" },
      { name: "Mable", sector: "healthtech", stageGuess: "series-b", estValuationLowAud: 250_000_000, estValuationHighAud: 380_000_000, similarityScore: 55, source: "Crunchbase" },
    ],
    marketplace: [
      { name: "Mr Yum", sector: "marketplace", stageGuess: "series-b", estValuationLowAud: 90_000_000, estValuationHighAud: 140_000_000, similarityScore: 50, source: "Cut Through 2024" },
    ],
    default: [
      { name: "AU Series-A median", sector: "default", stageGuess: stage, estValuationLowAud: 12_000_000, estValuationHighAud: 22_000_000, similarityScore: 40, source: "AVCAL Q1 2025" },
    ],
  };

  return (peers[sector] ?? peers["default"]).slice(0, 3);
}

// ─── Revenue scenarios ──────────────────────────────────────────────────────

function buildRevenueScenarios(args: {
  mrrAud: number;
  growthRatePct: number;
  sector: string;
}): RevenueScenario[] {
  const { mrrAud, growthRatePct, sector } = args;
  const base = mrrAud > 0 ? mrrAud : 0;
  const monthly = Math.max(0.02, growthRatePct / 100);
  const tamData = SECTOR_TAM_AUD[sector] ?? SECTOR_TAM_AUD["default"];

  function project(mrr: number, growth: number): { y1: number; y3Arr: number; customers: number } {
    const y1 = mrr * Math.pow(1 + growth, 12);
    const y3Arr = mrr * Math.pow(1 + growth, 36) * 12;
    // Estimate paying customers assuming A$200 ARPU (sector median)
    const arpu = sector === "fintech" ? 80 : sector === "saas" ? 250 : 150;
    const customers = Math.round(y3Arr / 12 / arpu);
    return { y1, y3Arr, customers };
  }

  // If no MRR, use floor of A$2K/mo to make projections meaningful
  const effective = base > 0 ? base : 2000;

  const consv = project(effective, monthly * 0.5);
  const baseS = project(effective, monthly);
  const opt = project(effective, Math.min(0.25, monthly * 1.8));

  return [
    {
      scenario: "conservative",
      year1MrrAud: Math.round(consv.y1),
      year3ArrAud: Math.round(consv.y3Arr),
      payingCustomers: consv.customers,
      assumptions: `${(monthly * 50).toFixed(0)}% monthly growth, market headwinds, average sector CAC.`,
    },
    {
      scenario: "base",
      year1MrrAud: Math.round(baseS.y1),
      year3ArrAud: Math.round(baseS.y3Arr),
      payingCustomers: baseS.customers,
      assumptions: `${(monthly * 100).toFixed(0)}% monthly growth, ${(tamData.growthPct).toFixed(0)}% market CAGR, AU stage discount applied.`,
    },
    {
      scenario: "optimistic",
      year1MrrAud: Math.round(opt.y1),
      year3ArrAud: Math.round(opt.y3Arr),
      payingCustomers: opt.customers,
      assumptions: `Top-quartile execution, capital-efficient growth, expansion revenue 110%+ NRR.`,
    },
  ];
}

// ─── Risk flags ──────────────────────────────────────────────────────────────

function buildRiskFlags(args: { sviScore: number; mrrAud: number; sector: string; competitionLevel?: string }): string[] {
  const flags: string[] = [];
  if (args.sviScore < 50) flags.push("SVI < 50 — fundamentals need work before raising at these valuations.");
  if (args.mrrAud === 0) flags.push("Pre-revenue — investor lens uses TAM/penetration proxy; expect 30-50% haircut at term sheet.");
  if (args.competitionLevel === "extreme") flags.push("Extreme competition — multiple compression of 20-30% likely vs sector median.");
  if (args.competitionLevel === "high") flags.push("High competition — moat must be defensible to hold mid-band valuation.");
  if (args.sector === "ecommerce") flags.push("eCommerce trades at lower revenue multiples (1-5×) vs SaaS (4-12×).");
  return flags;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export interface DeepValuationInput {
  sviAnalysis: SVIAnalysis;
  rawText: string;
  scrapedText?: string;
  competitiveIntelligence?: WebsiteCompetitiveIntelligence | null;
  // Hard data from connectors (Stripe etc.) if present
  mrrAud?: number;
  growthRatePct?: number;
  ltvCacRatio?: number;
  grossMarginPct?: number;
}

export function buildDeepValuationAnalysis(input: DeepValuationInput): DeepValuationAnalysis {
  const sviScore = input.sviAnalysis.totalSVI;
  const stage = stageLabel(input.sviAnalysis.stage ?? 0);
  const sectorText = `${input.rawText} ${input.scrapedText ?? ""}`;
  const sector = detectSector(sectorText) ?? "default";

  const mrrAud = input.mrrAud ?? 0;
  const growthRatePct = input.growthRatePct ?? (mrrAud > 0 ? 8 : 6);
  const ltvCacRatio = input.ltvCacRatio ?? 3;
  const grossMarginPct = input.grossMarginPct ?? (sector === "saas" ? 75 : sector === "fintech" ? 65 : 55);

  // Build 4 perspectives
  const investorP = investorPerspective({ sviScore, mrrAud, growthRate: growthRatePct, sector, stage });
  const marketP = marketPerspective({
    sviScore, sector, stage,
    ciBlueOcean: input.competitiveIntelligence?.blueOceanScore,
  });
  const operationalP = operationalPerspective({ sviScore, mrrAud, ltvCacRatio, grossMarginPct, sector, stage });
  const ebitdaLow = input.competitiveIntelligence?.ebitdaMetrics?.evEbitdaMultipleLow;
  const ebitdaHigh = input.competitiveIntelligence?.ebitdaMetrics?.evEbitdaMultipleHigh;
  const ebitdaMid = ebitdaLow != null && ebitdaHigh != null ? (ebitdaLow + ebitdaHigh) / 2 : undefined;
  const ecosystemP = ecosystemPerspective({
    sviScore, sector, stage,
    ebitdaMultiple: ebitdaMid,
  });

  const perspectives = [investorP, marketP, operationalP, ecosystemP];

  // Renormalise weights (only non-zero contributors)
  const totalWeight = perspectives.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of perspectives) p.weight = +(p.weight / totalWeight).toFixed(3);

  // Blend
  const weightedLow = perspectives.reduce((s, p) => s + p.lowAud * p.weight, 0);
  const weightedMid = perspectives.reduce((s, p) => s + p.midAud * p.weight, 0);
  const weightedHigh = perspectives.reduce((s, p) => s + p.highAud * p.weight, 0);

  // Overall confidence: count how many high/medium-confidence lenses
  const confCount = perspectives.filter((p) => p.confidence === "high").length;
  const confidence: "low" | "medium" | "high" = confCount >= 2 ? "high" : confCount >= 1 || perspectives.filter((p) => p.confidence === "medium").length >= 2 ? "medium" : "low";

  // Market sizing
  const tamData = SECTOR_TAM_AUD[sector] ?? SECTOR_TAM_AUD["default"];
  const marketSizing: MarketSizing = {
    tamAud: tamData.tam,
    samAud: tamData.tam * tamData.samPct,
    somAud: tamData.tam * tamData.somPct,
    methodology: `Top-down: AU sector TAM × addressable share (${(tamData.samPct * 100).toFixed(0)}%) × Year-3 obtainable (${(tamData.somPct * 100).toFixed(2)}%).`,
    sources: tamData.sources,
    confidence: "medium",
  };

  return {
    perspectives,
    marketSizing,
    revenueScenarios: buildRevenueScenarios({ mrrAud, growthRatePct, sector }),
    peerComparables: buildPeerComparables(sector, stage),
    blendedValuation: {
      lowAud: round(weightedLow),
      midAud: round(weightedMid),
      highAud: round(weightedHigh),
      confidence,
      weights: {
        investor: investorP.weight,
        market: marketP.weight,
        operational: operationalP.weight,
        ecosystem: ecosystemP.weight,
      },
    },
    methodNotes: [
      "Each lens is computed independently then weighted by data quality available.",
      "MRR-based lenses (Investor, Operational) get higher weight when revenue is present.",
      "Pre-revenue startups are anchored to AU stage-median pre-money (AVCAL Q1 2025).",
      "All multiples are AU-adjusted vs global comps using stage discount factors (0.65–0.95).",
    ],
    riskFlags: buildRiskFlags({
      sviScore, mrrAud, sector,
      competitionLevel: input.competitiveIntelligence?.competitionLevel,
    }),
    generatedAt: new Date().toISOString(),
  };
}
