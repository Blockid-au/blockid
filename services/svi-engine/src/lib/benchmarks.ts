// AU startup benchmarks by stage — SVI Engine microservice
//
// Percentile data (p25 / p50 / p75) sourced from publicly available Australian
// startup ecosystem reports and aggregated anonymised sector averages.

export interface PercentileBand {
  p25: number;
  p50: number;
  p75: number;
}

export interface StageBenchmarks {
  mrr_aud: PercentileBand;
  arr_aud: PercentileBand;
  revenue_growth_pct: PercentileBand;
  mau: PercentileBand;
  dau: PercentileBand;
  monthly_churn_pct: PercentileBand;
  nrr_pct: PercentileBand;
  cac_aud: PercentileBand;
  ltv_aud: PercentileBand;
  burn_rate_aud: PercentileBand;
  runway_months: PercentileBand;
}

export const BENCHMARKS: Record<string, StageBenchmarks> = {
  "pre-seed": {
    mrr_aud: { p25: 0, p50: 500, p75: 3000 },
    arr_aud: { p25: 0, p50: 6000, p75: 36000 },
    revenue_growth_pct: { p25: 0, p50: 10, p75: 30 },
    mau: { p25: 50, p50: 200, p75: 1000 },
    dau: { p25: 5, p50: 30, p75: 150 },
    monthly_churn_pct: { p25: 15, p50: 10, p75: 5 },
    nrr_pct: { p25: 80, p50: 95, p75: 110 },
    cac_aud: { p25: 200, p50: 100, p75: 30 },
    ltv_aud: { p25: 100, p50: 500, p75: 2000 },
    burn_rate_aud: { p25: 30000, p50: 15000, p75: 5000 },
    runway_months: { p25: 3, p50: 6, p75: 12 },
  },
  seed: {
    mrr_aud: { p25: 2000, p50: 10000, p75: 50000 },
    arr_aud: { p25: 24000, p50: 120000, p75: 600000 },
    revenue_growth_pct: { p25: 5, p50: 15, p75: 40 },
    mau: { p25: 500, p50: 2000, p75: 10000 },
    dau: { p25: 75, p50: 300, p75: 1500 },
    monthly_churn_pct: { p25: 10, p50: 7, p75: 3 },
    nrr_pct: { p25: 90, p50: 100, p75: 120 },
    cac_aud: { p25: 150, p50: 80, p75: 25 },
    ltv_aud: { p25: 500, p50: 2000, p75: 10000 },
    burn_rate_aud: { p25: 100000, p50: 50000, p75: 20000 },
    runway_months: { p25: 6, p50: 12, p75: 18 },
  },
  "series-a": {
    mrr_aud: { p25: 30000, p50: 100000, p75: 300000 },
    arr_aud: { p25: 360000, p50: 1200000, p75: 3600000 },
    revenue_growth_pct: { p25: 10, p50: 25, p75: 50 },
    mau: { p25: 5000, p50: 20000, p75: 100000 },
    dau: { p25: 750, p50: 3000, p75: 15000 },
    monthly_churn_pct: { p25: 8, p50: 5, p75: 2 },
    nrr_pct: { p25: 95, p50: 110, p75: 130 },
    cac_aud: { p25: 120, p50: 60, p75: 20 },
    ltv_aud: { p25: 2000, p50: 8000, p75: 30000 },
    burn_rate_aud: { p25: 300000, p50: 150000, p75: 80000 },
    runway_months: { p25: 12, p50: 18, p75: 24 },
  },
  "series-b": {
    mrr_aud: { p25: 200000, p50: 500000, p75: 2000000 },
    arr_aud: { p25: 2400000, p50: 6000000, p75: 24000000 },
    revenue_growth_pct: { p25: 15, p50: 30, p75: 60 },
    mau: { p25: 50000, p50: 200000, p75: 1000000 },
    dau: { p25: 7500, p50: 30000, p75: 150000 },
    monthly_churn_pct: { p25: 5, p50: 3, p75: 1 },
    nrr_pct: { p25: 100, p50: 115, p75: 140 },
    cac_aud: { p25: 100, p50: 50, p75: 15 },
    ltv_aud: { p25: 5000, p50: 20000, p75: 80000 },
    burn_rate_aud: { p25: 1000000, p50: 500000, p75: 200000 },
    runway_months: { p25: 12, p50: 18, p75: 24 },
  },
};

/**
 * Returns a 0-100 percentile estimate for a given metric value within a stage.
 */
export function getPercentile(
  stage: string,
  metric: string,
  value: number,
): number {
  const stageBenchmarks = BENCHMARKS[stage];
  if (!stageBenchmarks) return 50;

  const band = stageBenchmarks[metric as keyof StageBenchmarks];
  if (!band) return 50;

  let { p25, p50, p75 } = band;

  // Detect "lower is better" metrics where p25 > p75
  const inverted = p25 > p75;
  if (inverted) {
    [p25, p75] = [p75, p25];
    value = p25 + p75 - value;
  }

  if (value <= 0 && p25 <= 0) return 0;

  if (value <= p25) {
    if (p25 === 0) return 0;
    return Math.max(0, Math.round((value / p25) * 25));
  }

  if (value <= p50) {
    const range = p50 - p25;
    if (range === 0) return 37;
    return Math.round(25 + ((value - p25) / range) * 25);
  }

  if (value <= p75) {
    const range = p75 - p50;
    if (range === 0) return 62;
    return Math.round(50 + ((value - p50) / range) * 25);
  }

  // Above p75
  const extraRange = p75 - p50;
  if (extraRange === 0) return 100;
  const overshoot = (value - p75) / extraRange;
  return Math.min(100, Math.round(75 + overshoot * 25));
}

// ─── SVI Stage Benchmarks (AU startup ecosystem) ─────────────────────────────

export interface SVIStageBenchmark {
  stage: number;
  label: string;
  avgSVI: number;
  medianSVI: number;
  p25: number;
  p75: number;
  topDecile: number;
  dimensions: Record<string, { avg: number; top: number }>;
}

export const SVI_STAGE_BENCHMARKS: SVIStageBenchmark[] = [
  { stage: 0, label: "Idea", avgSVI: 85, medianSVI: 80, p25: 65, p75: 100, topDecile: 125,
    dimensions: { ftv: { avg: 35, top: 70 }, mpc: { avg: 30, top: 65 }, ptd: { avg: 15, top: 45 }, tre: { avg: 5, top: 20 }, cgh: { avg: 20, top: 55 }, iri: { avg: 15, top: 50 }, lco: { avg: 25, top: 60 }, svm: { avg: 20, top: 50 } } },
  { stage: 1, label: "Concept", avgSVI: 95, medianSVI: 92, p25: 78, p75: 110, topDecile: 140,
    dimensions: { ftv: { avg: 40, top: 75 }, mpc: { avg: 40, top: 70 }, ptd: { avg: 25, top: 55 }, tre: { avg: 10, top: 30 }, cgh: { avg: 25, top: 60 }, iri: { avg: 20, top: 55 }, lco: { avg: 30, top: 65 }, svm: { avg: 25, top: 55 } } },
  { stage: 2, label: "Building", avgSVI: 110, medianSVI: 105, p25: 90, p75: 130, topDecile: 160,
    dimensions: { ftv: { avg: 50, top: 80 }, mpc: { avg: 50, top: 75 }, ptd: { avg: 40, top: 70 }, tre: { avg: 20, top: 45 }, cgh: { avg: 35, top: 65 }, iri: { avg: 30, top: 60 }, lco: { avg: 35, top: 70 }, svm: { avg: 30, top: 60 } } },
  { stage: 3, label: "Launched", avgSVI: 130, medianSVI: 125, p25: 105, p75: 155, topDecile: 185,
    dimensions: { ftv: { avg: 55, top: 85 }, mpc: { avg: 60, top: 80 }, ptd: { avg: 55, top: 80 }, tre: { avg: 35, top: 60 }, cgh: { avg: 40, top: 70 }, iri: { avg: 40, top: 70 }, lco: { avg: 40, top: 75 }, svm: { avg: 35, top: 65 } } },
  { stage: 4, label: "Traction", avgSVI: 155, medianSVI: 150, p25: 130, p75: 180, topDecile: 210,
    dimensions: { ftv: { avg: 60, top: 90 }, mpc: { avg: 65, top: 85 }, ptd: { avg: 60, top: 85 }, tre: { avg: 50, top: 75 }, cgh: { avg: 50, top: 75 }, iri: { avg: 50, top: 75 }, lco: { avg: 45, top: 80 }, svm: { avg: 40, top: 70 } } },
  { stage: 5, label: "Revenue", avgSVI: 180, medianSVI: 175, p25: 155, p75: 210, topDecile: 245,
    dimensions: { ftv: { avg: 65, top: 92 }, mpc: { avg: 70, top: 90 }, ptd: { avg: 65, top: 88 }, tre: { avg: 65, top: 85 }, cgh: { avg: 55, top: 80 }, iri: { avg: 60, top: 82 }, lco: { avg: 55, top: 85 }, svm: { avg: 50, top: 78 } } },
];

export function getSVIBenchmark(stage: number): SVIStageBenchmark {
  return SVI_STAGE_BENCHMARKS[Math.min(stage, SVI_STAGE_BENCHMARKS.length - 1)];
}

export function getSVIPercentile(svi: number, stage: number): number {
  const b = getSVIBenchmark(stage);
  if (svi >= b.topDecile) return 95;
  if (svi >= b.p75) return 75 + ((svi - b.p75) / (b.topDecile - b.p75)) * 20;
  if (svi >= b.medianSVI) return 50 + ((svi - b.medianSVI) / (b.p75 - b.medianSVI)) * 25;
  if (svi >= b.p25) return 25 + ((svi - b.p25) / (b.medianSVI - b.p25)) * 25;
  return Math.max(5, Math.round((svi / b.p25) * 25));
}
