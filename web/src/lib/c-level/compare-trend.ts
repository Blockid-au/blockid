/**
 * src/lib/c-level/compare-trend.ts
 *
 * 12-week trend comparison for C-Level report cards.
 *
 * Consumes `clevel_trend_snapshots` rows (see 20260816_clevel_reports_v2.sql)
 * and returns direction + magnitude of change for the dashboard sparklines.
 *
 * Multi-startup safe: always scoped by (projectId, role). Never returns
 * cross-project data.
 */

export type Role = "cfo" | "ceo" | "cto" | "cmo" | "cdo";

export type TrendMetric =
  | "svi_score"
  | "arr_aud"
  | "mrr_aud"
  | "runway_months"
  | "burn_rate_monthly"
  | "ltv_cac_ratio"
  | "cac_payback_months"
  | "churn_rate_pct"
  | "gross_margin_pct"
  | "dcf_valuation_base";

export interface TrendSnapshot {
  week_number: number;
  snapshot_date: string; // ISO date
  svi_score?: number | null;
  arr_aud?: number | null;
  mrr_aud?: number | null;
  runway_months?: number | null;
  burn_rate_monthly?: number | null;
  ltv_cac_ratio?: number | null;
  cac_payback_months?: number | null;
  churn_rate_pct?: number | null;
  gross_margin_pct?: number | null;
  dcf_valuation_base?: number | null;
}

export interface TrendResult {
  metric: TrendMetric;
  startValue: number | null;
  endValue: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  direction: "up" | "down" | "flat" | "insufficient-data";
  sparkline: number[]; // Up to 12 values, oldest → newest
  weekOverWeekPct: number | null; // Most-recent vs previous week
  alert: null | {
    severity: "warning" | "critical";
    message: string;
  };
}

const ALERT_WEEK_OVER_WEEK_DROP_PCT = -15; // Trigger critical alert if drop > 15% WoW

/**
 * Compare a single metric across up to 12 weeks of snapshots.
 * Snapshots may arrive out of order — this function sorts them.
 */
export function compareTrendAcross12Weeks(
  snapshots: TrendSnapshot[],
  metric: TrendMetric,
): TrendResult {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime(),
  );
  const trimmed = sorted.slice(-12);

  const values = trimmed
    .map((s) => (s[metric] ?? null) as number | null)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  if (values.length < 2) {
    return {
      metric,
      startValue: values[0] ?? null,
      endValue: values[values.length - 1] ?? null,
      deltaAbs: null,
      deltaPct: null,
      direction: "insufficient-data",
      sparkline: values,
      weekOverWeekPct: null,
      alert: null,
    };
  }

  const startValue = values[0];
  const endValue = values[values.length - 1];
  const deltaAbs = endValue - startValue;
  const deltaPct = startValue !== 0 ? (deltaAbs / Math.abs(startValue)) * 100 : 0;

  // Week-over-week (last vs second-last)
  const wow =
    values.length >= 2 && values[values.length - 2] !== 0
      ? ((values[values.length - 1] - values[values.length - 2]) /
          Math.abs(values[values.length - 2])) *
        100
      : null;

  const direction: TrendResult["direction"] =
    Math.abs(deltaPct) < 1 ? "flat" : deltaAbs > 0 ? "up" : "down";

  const alert = buildAlert(metric, wow);

  return {
    metric,
    startValue,
    endValue,
    deltaAbs: round2(deltaAbs),
    deltaPct: round2(deltaPct),
    direction,
    sparkline: values,
    weekOverWeekPct: wow !== null ? round2(wow) : null,
    alert,
  };
}

function buildAlert(
  metric: TrendMetric,
  wow: number | null,
): TrendResult["alert"] {
  if (wow === null) return null;

  // For "good is bigger" metrics: valuation, ARR, MRR, LTV/CAC, gross margin, runway, SVI
  const goodIsBigger = new Set<TrendMetric>([
    "svi_score",
    "arr_aud",
    "mrr_aud",
    "runway_months",
    "ltv_cac_ratio",
    "gross_margin_pct",
    "dcf_valuation_base",
  ]);

  if (goodIsBigger.has(metric) && wow <= ALERT_WEEK_OVER_WEEK_DROP_PCT) {
    return {
      severity: "critical",
      message: `${metric} dropped ${Math.abs(wow).toFixed(1)}% week-over-week (threshold ${Math.abs(ALERT_WEEK_OVER_WEEK_DROP_PCT)}%).`,
    };
  }

  // For "good is smaller" metrics: churn, CAC payback, burn
  const goodIsSmaller = new Set<TrendMetric>([
    "churn_rate_pct",
    "cac_payback_months",
    "burn_rate_monthly",
  ]);
  if (goodIsSmaller.has(metric) && wow >= Math.abs(ALERT_WEEK_OVER_WEEK_DROP_PCT)) {
    return {
      severity: "critical",
      message: `${metric} rose ${wow.toFixed(1)}% week-over-week (threshold ${Math.abs(ALERT_WEEK_OVER_WEEK_DROP_PCT)}%).`,
    };
  }

  return null;
}

/**
 * Convenience: get the primary metric for a role.
 * CFO → dcf_valuation_base
 * CEO → runway_months
 * CTO → svi_score (proxy — until tech-debt % is landed)
 * CMO → cac_payback_months
 * CDO → svi_score (proxy — until GDPR-% metric is landed)
 */
export function primaryMetricForRole(role: Role): TrendMetric {
  switch (role) {
    case "cfo":
      return "dcf_valuation_base";
    case "ceo":
      return "runway_months";
    case "cto":
      return "svi_score";
    case "cmo":
      return "cac_payback_months";
    case "cdo":
      return "svi_score";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
