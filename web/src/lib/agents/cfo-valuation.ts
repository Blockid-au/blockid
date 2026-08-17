/**
 * src/lib/agents/cfo-valuation.ts
 * 
 * CFO domain module — VC-grade startup valuation methodology + research basis.
 * Updated with 2026 AU-specific funding benchmarks, R&D tax incentives, and sector multiples.
 */

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
} from "@/lib/exits/au-benchmark";
import { callAI } from "@/lib/ai-client";

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "cybertech"
  | "wealthtech"
  | "biotech"
  | "cleantech"
  | "edtech"
  | "proptech"
  | "agtech"
  | "insurtech"
  | "legaltech"
  | "gaming"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  medianMultiple: number;
  multipleRange: [number, number];
  source: string;
  sources?: string[];
  premiumFactor?: number;
  arrMultiple?: { low: number; mid: number; high: number };
  grossMarginTarget?: number;
}

export interface AuMarketBenchmarks {
  preSeedValuation: [number, number];
  seedValuation: [number, number];
  avgPreMoneyValuation: number;
  avgPostMoneyValuation: number;
  avgSeedRoundSize: [number, number];
  targetRunwayMonths: [number, number];
  rdtiRefundRate: number;
  esicOffset: number;
  marketSizeDiscount: number;
  somCaptureRate: [number, number];
}

/**
 * Latest research-backed AU Market Benchmarks (2024-2026)
 * Sources: AVCAL, Cut Through Venture, ATO, AusIndustry, Y Combinator
 */
export const AU_MARKET_DATA: AuMarketBenchmarks = {
  preSeedValuation: [2000000, 5000000],
  seedValuation: [5000000, 12000000],
  avgPreMoneyValuation: 8300000,
  avgPostMoneyValuation: 10900000,
  avgSeedRoundSize: [1000000, 3000000],
  targetRunwayMonths: [18, 24],
  rdtiRefundRate: 0.435,
  esicOffset: 0.20,
  marketSizeDiscount: 0.20,
  somCaptureRate: [0.01, 0.05],
};

/**
 * Sector Multiples based on Bessemer, Carta, and PitchBook 2024/25
 * Incorporates the "Efficiency Era" correction (downward shift from 2021 peaks)
 */
export const SECTOR_MULTIPLES: Record<Sector, VcBenchmark> = {
  saas: { 
    sector: "saas", 
    medianMultiple: 6.75, 
    multipleRange: [6.0, 7.5], 
    source: "Bessemer / AVCA",
    arrMultiple: { low: 6, mid: 8, high: 10 }
  },
  ai: { 
    sector: "ai", 
    medianMultiple: 16.0, 
    multipleRange: [12.0, 20.0], 
    source: "PitchBook / Carta",
    premiumFactor: 2.5
  },
  fintech: { 
    sector: "fintech", 
    medianMultiple: 5.0, 
    multipleRange: [4.0, 6.0], 
    source: "SaaS Capital / PitchBook" 
  },
  healthtech: { 
    sector: "healthtech", 
    medianMultiple: 6.5, 
    multipleRange: [5.0, 8.0], 
    source: "Carta" 
  },
  marketplace: { 
    sector: "marketplace", 
    medianMultiple: 4.0, 
    multipleRange: [3.0, 5.0], 
    source: "PitchBook" 
  },
  deeptech: { sector: "deeptech", medianMultiple: 5.0, multipleRange: [3.0, 8.0], source: "Internal" },
  ecommerce: { sector: "ecommerce", medianMultiple: 2.0, multipleRange: [1.0, 3.0], source: "Internal" },
  cybertech: { sector: "cybertech", medianMultiple: 8.0, multipleRange: [6.0, 11.0], source: "Bessemer" },
  wealthtech: { sector: "wealthtech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Internal" },
  biotech: { sector: "biotech", medianMultiple: 4.0, multipleRange: [2.0, 10.0], source: "Internal" },
  cleantech: { sector: "cleantech", medianMultiple: 5.0, multipleRange: [3.0, 7.0], source: "Internal" },
  edtech: { sector: "edtech", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "Internal" },
  proptech: { sector: "proptech", medianMultiple: 4.0, multipleRange: [3.0, 6.0], source: "Internal" },
  agtech: { sector: "agtech", medianMultiple: 3.5, multipleRange: [2.0, 5.0], source: "Internal" },
  insurtech: { sector: "insurtech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Internal" },
  legaltech: { sector: "legaltech", medianMultiple: 5.0, multipleRange: [4.0, 7.0], source: "Internal" },
  gaming: { sector: "gaming", medianMultiple: 6.0, multipleRange: [4.0, 9.0], source: "Internal" },
  default: { sector: "default", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Generic" },
};

export interface ValuationInput {
  sector: Sector;
  arr: number;
  growthRate: number;
  churnRate: number;
  grossMargin: number;
  bottomUpValidated: boolean;
  estimatedRndExpenditure: number;
}

/**
 * Calculates the valuation based on revenue multiples and applies 
 * AU-specific research adjustments.
 */
export function calculateVcValuation(input: ValuationInput): {
  baseValuation: number;
  adjustedValuation: number;
  rdtiBenefit: number;
  valuationReasoning: string;
} {
  const benchmark = SECTOR_MULTIPLES[input.sector] || SECTOR_MULTIPLES.default;
  const baseValuation = input.arr * benchmark.medianMultiple;
  
  let adjustmentFactor = 1.0;
  
  if (!input.bottomUpValidated) {
    adjustmentFactor -= AU_MARKET_DATA.marketSizeDiscount;
  }

  const adjustedValuation = baseValuation * adjustmentFactor;
  const rdtiBenefit = input.estimatedRndExpenditure * AU_MARKET_DATA.rdtiRefundRate;

  return {
    baseValuation,
    adjustedValuation,
    rdtiBenefit,
    valuationReasoning: `Based on a ${benchmark.medianMultiple}x multiple for ${input.sector} (${benchmark.source}). ${!input.bottomUpValidated ? 'Applied a 20% discount due to lack of bottom-up TAM validation.' : 'Full value retained via bottom-up validation.'}`
  };
}

/**
 * Calculates potential investor tax offset via ESIC
 */
export function calculateEsicBenefit(investmentAmount: number): number {
  return investmentAmount * AU_MARKET_DATA.esicOffset;
}

/**
 * Estimates the SOM (Serviceable Obtainable Market) based on research capture rates
 */
export function estimateSom(sam: number): {
  conservative: number;
  aggressive: number;
} {
  const [low, high] = AU_MARKET_DATA.somCaptureRate;
  return {
    conservative: sam * low,
    aggressive: sam * high,
  };
}

/**
 * Validates if a round size is within AU benchmarks
 */
export function validateRoundSize(roundSize: number, stage: 'pre-seed' | 'seed'): {
  isWithinBenchmark: boolean;
  deviation: string;
} {
  const [low, high] = AU_MARKET_DATA.avgSeedRoundSize;
  const isWithinBenchmark = roundSize >= low && roundSize <= high;
  const deviation = isWithinBenchmark 
    ? "Within standard AU seed range" 
    : roundSize < low ? "Below average AU seed round" : "Above average AU seed round";
    
  return { isWithinBenchmark, deviation };
}
