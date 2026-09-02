// Lightweight worst/average/best-case valuation estimator for the SVI
// streaming done-state. Deliberately simple and deterministic so the
// output renders identically for every founder with the same
// (svi, stage, sector) tuple — this is a snapshot preview, not a
// full DCF (that lives in cfo-valuation.ts and requires financials).
//
// Model: stage-anchored base × SVI multiplier × sector adjust × case spread.
// Numbers are AUD; anchor bands sourced from PitchBook AU 2024-2026 +
// AFR 2026 median seed round observations.

export type Stage = "idea" | "pre_seed" | "seed" | "series_a" | "series_b" | "growth";
export type Sector =
  | "saas"
  | "fintech"
  | "ai"
  | "healthtech"
  | "marketplace"
  | "deeptech"
  | "ecommerce"
  | "other";

const STAGE_BASE_AUD: Record<Stage, number> = {
  idea:       500_000,
  pre_seed:   1_500_000,
  seed:       4_000_000,
  series_a:   14_000_000,
  series_b:   45_000_000,
  growth:    120_000_000,
};

const SECTOR_ADJUST: Record<Sector, number> = {
  fintech:     1.35,
  ai:          1.55,
  saas:        1.20,
  healthtech:  1.10,
  marketplace: 1.00,
  deeptech:    1.25,
  ecommerce:   0.85,
  other:       1.00,
};

const CASE_SPREAD = { worst: 0.55, average: 1.00, best: 1.85 } as const;

export interface ValuationCase {
  low: number;
  mid: number;
  high: number;
}
export interface ThreeCaseValuation {
  worst: ValuationCase;
  average: ValuationCase;
  best: ValuationCase;
  currency: "AUD";
  stage: Stage;
  sector: Sector;
  sviInput: number;
  disclaimer: string;
}

function normaliseStage(input: string | null | undefined): Stage {
  if (!input) return "seed";
  const s = input.toLowerCase().replace(/[-\s]/g, "_");
  if (s.startsWith("idea") || s === "pre_launch") return "idea";
  if (s.startsWith("pre_seed") || s === "preseed") return "pre_seed";
  if (s.startsWith("seed")) return "seed";
  if (s === "a" || s.includes("series_a")) return "series_a";
  if (s === "b" || s.includes("series_b")) return "series_b";
  if (s === "c" || s.includes("series_c") || s === "growth") return "growth";
  return "seed";
}

function normaliseSector(input: string | null | undefined): Sector {
  if (!input) return "other";
  const s = input.toLowerCase();
  if (s.includes("fintech") || s.includes("finance") || s.includes("bank")) return "fintech";
  if (s.includes("ai") || s.includes("ml") || s.includes("machine learning")) return "ai";
  if (s.includes("saas") || s.includes("b2b software")) return "saas";
  if (s.includes("health") || s.includes("medtech") || s.includes("bio")) return "healthtech";
  if (s.includes("marketplace") || s.includes("platform")) return "marketplace";
  if (s.includes("deeptech") || s.includes("deep tech") || s.includes("quantum") || s.includes("robot")) return "deeptech";
  if (s.includes("ecommerce") || s.includes("commerce") || s.includes("retail")) return "ecommerce";
  return "other";
}

/** SVI curve — 0..1 multiplier so a 0 SVI collapses to a token 15% anchor. */
function sviMultiplier(svi: number): number {
  const s = Math.max(0, Math.min(100, svi));
  // Sigmoid-lite: below 30 punishing, above 70 rewarding, smooth in the middle.
  if (s <= 30) return 0.15 + (s / 30) * 0.35;         // 0.15 → 0.50
  if (s <= 70) return 0.50 + ((s - 30) / 40) * 0.70;  // 0.50 → 1.20
  return 1.20 + ((s - 70) / 30) * 1.30;               // 1.20 → 2.50
}

/** Round to 1 significant AUD figure so estimates look like the ranges VCs quote. */
function roundBand(value: number): number {
  if (value <= 0) return 0;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.round(value / power) * power;
}

export function computeThreeCaseValuation(
  svi: number,
  stage: string | null | undefined,
  sector: string | null | undefined,
): ThreeCaseValuation {
  const stageK = normaliseStage(stage);
  const sectorK = normaliseSector(sector);
  const base = STAGE_BASE_AUD[stageK] * SECTOR_ADJUST[sectorK] * sviMultiplier(svi);

  // Each case has its own tight band (±20%) so the founder sees "worst
  // 400k–600k" rather than a single point — matches how VCs quote ranges.
  const cases = {
    worst:   base * CASE_SPREAD.worst,
    average: base * CASE_SPREAD.average,
    best:    base * CASE_SPREAD.best,
  };
  const toBand = (mid: number): ValuationCase => ({
    low: roundBand(mid * 0.8),
    mid: roundBand(mid),
    high: roundBand(mid * 1.2),
  });

  return {
    worst: toBand(cases.worst),
    average: toBand(cases.average),
    best: toBand(cases.best),
    currency: "AUD",
    stage: stageK,
    sector: sectorK,
    sviInput: Math.round(svi),
    disclaimer:
      "Directional estimate only — not a formal valuation. Uses PitchBook AU 2024-2026 " +
      "stage anchors + sector adjusts + your live SVI. A full DCF requires financial statements.",
  };
}

/** Format an AUD number as a compact display string. */
export function formatAud(n: number): string {
  if (n >= 1_000_000_000) return `A$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `A$${(n / 1_000).toFixed(0)}k`;
  return `A$${n}`;
}
