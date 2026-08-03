```typescript
/**
 * CFO domain module — VC‑grade startup valuation methodology + research basis.
 *
 * Updated with 2026 research on R&D Tax Incentive, ESIC offsets, funding norms,
 * financial projection benchmarks, and Australian market sizing methodology.
 */

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
} from "@/lib/exits/au-benchmark";

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "edtech"
  | "cleantech"
  | "proptech"
  | "agtech"
  | "biotech"
  | "cybertech"
  | "wealthtech"
  | "insurtech"
  | "legaltech"
  | "gaming"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  arrMultiple: { low: number; mid: number; high: number };
  topQuartileMultiple: number;
  typicalGrowthRate: { seed: number; seriesA: number; seriesB: number };
  targetNrr: { seed: number; seriesA: number; seriesB: number };
}

/**
 * 2024 Q2 Benchmarks based on Bessemer, PitchBook, and AVCAL research.
 */
export const VALUATION_BENCHMARKS: Record<Sector, VcBenchmark> = {
  saas: {
    sector: "saas",
    arrMultiple: { low: 5.0, mid: 7.5, high: 10.0 },
    topQuartileMultiple: 12.0,
    typicalGrowthRate: { seed: 0.45, seriesA: 0.55, seriesB: 0.4 },
    targetNrr: { seed: 1.1, seriesA: 1.25, seriesB: 1.3 },
  },
  fintech: {
    sector: "fintech",
    arrMultiple: { low: 4.0, mid: 6.2, high: 8.0 },
    topQuartileMultiple: 9.8,
    typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 },
    targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 },
  },
  healthtech: {
    sector: "healthtech",
    arrMultiple: { low: 4.0, mid: 6.0, high: 9.0 },
    topQuartileMultiple: 11.0,
    typicalGrowthRate: { seed: 0.35, seriesA: 0.45, seriesB: 0.3 },
    targetNrr: { seed: 1.0, seriesA: 1.1, seriesB: 1.15 },
  },
  ai: {
    sector: "ai",
    arrMultiple: { low: 8.0, mid: 12.0, high: 20.0 },
    topQuartileMultiple: 25.0,
    typicalGrowthRate: { seed: 0.55, seriesA: 0.65, seriesB: 0.5 },
    targetNrr: { seed: 1.2, seriesA: 1.35, seriesB: 1.4 },
  },
  marketplace: {
    sector: "marketplace",
    arrMultiple: { low: 3.0, mid: 5.0, high: 7.0 },
    topQuartileMultiple: 9.0,
    typicalGrowthRate: { seed: 0.5, seriesA: 0.6, seriesB: 0.45 },
    targetNrr: { seed: 1.1, seriesA: 1.2, seriesB: 1.25 },
  },
  deeptech: {
    sector: "deeptech",
    arrMultiple: { low: 6.0, mid: 9.0, high: 15.0 },
    topQuartileMultiple: 18.0,
    typicalGrowthRate: { seed: 0.4, seriesA: 0.55, seriesB: 0.35 },
    targetNrr: { seed: 1.05, seriesA: 1.2, seriesB: 1.25 },
  },
  default: {
    sector: "default",
    arrMultiple: { low: 4.0, mid: 6.0, high: 8.0 },
    topQuartileMultiple: 10.0,
    typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 },
    targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 },
  },
  // remaining sectors inherit default values
  ecommerce: { sector: "ecommerce", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  edtech: { sector: "edtech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  cleantech: { sector: "cleantech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  proptech: { sector: "proptech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  agtech: { sector: "agtech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  biotech: { sector: "biotech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  cybertech: { sector: "cybertech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  wealthtech: { sector: "wealthtech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  insurtech: { sector: "insurtech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  legaltech: { sector: "legaltech", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
  gaming: { sector: "gaming", arrMultiple: { low: 4, mid: 6, high: 8 }, topQuartileMultiple: 10, typicalGrowthRate: { seed: 0.4, seriesA: 0.5, seriesB: 0.35 }, targetNrr: { seed: 1.05, seriesA: 1.15, seriesB: 1.2 } },
};

/* ==== Australian funding & incentive constants ==== */
export const RDTI_REFUND_RATE = 0.435; // 43.5% refundable offset for small companies
export const ESIC_TAX_OFFSET_RATE = 0.2; // 20% non‑refundable offset
export const MEDIAN_SEED_VALUATION_RANGE = { low: 3_000_000, high: 7_000_000 } as const;
