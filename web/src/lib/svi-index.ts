// SVI Market Index — Nikkei/Dow Jones style unbounded index
//
// Transforms the raw SVI component score into a market-style index that:
// 1. Has NO upper limit (grows like stock indices)
// 2. Uses a base period (first snapshot = 100)
// 3. Applies a "data richness" multiplier that rewards connected data sources
// 4. Tracks growth trajectory over time
//
// Formula: IndexValue = (rawSVI / basePeriodRawSVI) * 100 * dataRichnessFactor
//
// Example: Raw SVI = 150, base period raw = 100, data richness = 1.5
//          Index = (150/100) * 100 * 1.5 = 225

export interface SVIIndexResult {
  indexValue: number;
  rawSVI: number;
  basePeriodSVI: number;
  basePeriodDate: string;
  dataRichness: DataRichnessBreakdown;
  dataRichnessFactor: number;
  growthFromBase: number;
  tier: string;
}

export interface DataRichnessBreakdown {
  evidenceCount: number;
  evidenceBonus: number;
  metricsMonths: number;
  metricsBonus: number;
  connectedSources: string[];
  sourcesBonus: number;
  historyMonths: number;
  historyBonus: number;
  totalFactor: number;
}

export interface SVIIndexInput {
  rawSVI: number;
  basePeriodSVI: number | null;
  basePeriodDate: string | null;
  evidenceCount: number;
  metricsMonths: number;
  connectedSources: string[];
  firstSnapshotDate: string | null;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  github: 0.10,
  stripe: 0.15,
  analytics: 0.10,
  xero: 0.12,
  google_drive: 0.05,
  linkedin: 0.05,
  crunchbase: 0.05,
  pitch_deck: 0.08,
};

const INDEX_TIERS = [
  { min: 500, label: "Unicorn Track" },
  { min: 350, label: "Exceptional" },
  { min: 250, label: "Elite" },
  { min: 180, label: "Outstanding" },
  { min: 130, label: "Strong" },
  { min: 100, label: "Baseline" },
  { min: 70, label: "Developing" },
  { min: 0, label: "Early Stage" },
];

export function computeDataRichness(input: {
  evidenceCount: number;
  metricsMonths: number;
  connectedSources: string[];
  firstSnapshotDate: string | null;
}): DataRichnessBreakdown {
  // Evidence items: each adds 0.01, capped at 0.5
  const evidenceBonus = Math.min(0.5, input.evidenceCount * 0.01);

  // Metrics history: each month adds 0.02, capped at 0.3
  const metricsBonus = Math.min(0.3, input.metricsMonths * 0.02);

  // Connected data sources: weighted by type
  const sourcesBonus = input.connectedSources.reduce(
    (sum, src) => sum + (SOURCE_WEIGHTS[src.toLowerCase()] ?? 0.03),
    0,
  );

  // Historical depth: months since first snapshot, each adds 0.01, capped at 0.2
  let historyMonths = 0;
  if (input.firstSnapshotDate) {
    const first = new Date(input.firstSnapshotDate);
    const now = new Date();
    historyMonths = Math.max(0, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth());
  }
  const historyBonus = Math.min(0.2, historyMonths * 0.01);

  const totalFactor = 1.0 + evidenceBonus + metricsBonus + sourcesBonus + historyBonus;

  return {
    evidenceCount: input.evidenceCount,
    evidenceBonus: Math.round(evidenceBonus * 1000) / 1000,
    metricsMonths: input.metricsMonths,
    metricsBonus: Math.round(metricsBonus * 1000) / 1000,
    connectedSources: input.connectedSources,
    sourcesBonus: Math.round(sourcesBonus * 1000) / 1000,
    historyMonths,
    historyBonus: Math.round(historyBonus * 1000) / 1000,
    totalFactor: Math.round(totalFactor * 1000) / 1000,
  };
}

export function computeSVIIndex(input: SVIIndexInput): SVIIndexResult {
  const baseSVI = input.basePeriodSVI ?? input.rawSVI;
  const baseDate = input.basePeriodDate ?? new Date().toISOString().slice(0, 10);

  const richness = computeDataRichness({
    evidenceCount: input.evidenceCount,
    metricsMonths: input.metricsMonths,
    connectedSources: input.connectedSources,
    firstSnapshotDate: input.firstSnapshotDate,
  });

  // Index = (rawSVI / basePeriodSVI) * 100 * dataRichnessFactor
  // When baseSVI = rawSVI and richness = 1.0, index = 100 (base case)
  const denominator = Math.max(1, baseSVI);
  const indexValue = Math.round(((input.rawSVI / denominator) * 100 * richness.totalFactor) * 10) / 10;

  const growthFromBase = Math.round(((indexValue - 100) / 100) * 1000) / 10;

  const tier = INDEX_TIERS.find((t) => indexValue >= t.min)?.label ?? "Early Stage";

  return {
    indexValue,
    rawSVI: input.rawSVI,
    basePeriodSVI: baseSVI,
    basePeriodDate: baseDate,
    dataRichness: richness,
    dataRichnessFactor: richness.totalFactor,
    growthFromBase,
    tier,
  };
}
