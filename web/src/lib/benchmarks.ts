// AU startup benchmarks by stage — Phase 3 MVP Value Index
//
// Percentile data (p25 / p50 / p75) sourced from publicly available Australian
// startup ecosystem reports and aggregated anonymised sector averages.
// Column names mirror the startup_metrics table (flat-column design).

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
    monthly_churn_pct: { p25: 15, p50: 10, p75: 5 }, // lower is better
    nrr_pct: { p25: 80, p50: 95, p75: 110 },
    cac_aud: { p25: 200, p50: 100, p75: 30 }, // lower is better
    ltv_aud: { p25: 100, p50: 500, p75: 2000 },
    burn_rate_aud: { p25: 30000, p50: 15000, p75: 5000 }, // lower is better
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
 *
 * Uses linear interpolation between p25/p50/p75 anchor points:
 *   - Below p25 -> 0-25 (linear from 0)
 *   - p25-p50   -> 25-50
 *   - p50-p75   -> 50-75
 *   - Above p75 -> 75-100 (capped at 100)
 *
 * For "lower is better" metrics (churn, cac, burn_rate) the band values are
 * stored in descending order (p25 > p50 > p75). The function detects this and
 * inverts the interpolation so a lower value yields a higher percentile.
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
    // Flip so the math works the same way
    [p25, p75] = [p75, p25];
    // Invert the value relative to the midpoint
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

/** Metric columns from the startup_metrics table with display labels. */
export const METRIC_LABELS: Record<string, string> = {
  mrr_aud: "MRR (AUD)",
  arr_aud: "ARR (AUD)",
  revenue_growth_pct: "Revenue Growth (%)",
  mau: "Monthly Active Users",
  dau: "Daily Active Users",
  monthly_churn_pct: "Monthly Churn (%)",
  nrr_pct: "Net Revenue Retention (%)",
  cac_aud: "CAC (AUD)",
  ltv_aud: "LTV (AUD)",
  burn_rate_aud: "Burn Rate (AUD)",
  runway_months: "Runway (Months)",
};

/** Stages with display labels. */
export const STAGES: Record<string, string> = {
  "pre-seed": "Pre-Seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B+",
};
