import { isValuationAvailable } from "./schema";
// dashboard-view — G27: the page-1 dashboard as one view-model (spec § 5):
// the four stat tiles (SVI index · evidence confidence · verdict · valuation),
// the 8-dimension `dim_bars` chart spec with its caption and table twin, and
// the footer line (top strength / top gap / unverified claims / last updated
// / methodology). Web, PDF, DOCX and the e-mail summary all read this, so
// the numbers on every surface are the same numbers. Pure, client-safe.

import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import { benchmarkLabel, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { makeVisual } from "@/lib/report-visuals";
import { aud } from "@/lib/report-visuals/svg";
import type { Band, DimBarRow, VisualSpecV2 } from "@/lib/report-visuals/types";
import type { AssessmentBenchmark, AssessmentCardData } from "@/lib/svi/assessment-card";
import { coverValuationPending } from "./cover-hero";
import { dimName, investmentLocale, isAssessed, type InvestmentLocale } from "./investment-view";
import type { InvestmentView, ReportV2 } from "./schema";

export interface DashboardTile {
  id: "svi" | "evidence" | "verdict" | "valuation";
  label: string;
  /** The big mono figure ("135", "64 %", "B", "A$3.0M – 6.6M"). */
  value: string;
  /** Second line ("● Strong ▲ +4", "connected sources", "With conditions", "5 of 7 methods · ask —"). */
  sub: string;
  /** Third line ("composite 82/100", "conviction: medium", "2 conditions ↓", "2 revenue methods not run"). */
  note: string;
  band?: Band;
}

export interface DashboardView {
  strings: TbrV3Strings;
  tiles: [DashboardTile, DashboardTile, DashboardTile, DashboardTile];
  chart: VisualSpecV2;
  chartCaption: string;
  /** Legend row is always present (score · stage band · median); the band entries drop when no band is drawn. */
  legend: string[];
  showBand: boolean;
  footer: { topStrength: string | null; topGap: string | null; unverified: string; lastUpdated: string; methodology: string };
}

const REVENUE_METHODS = new Set(["revenue_multiple", "dcf_proxy", "comparables", "risk_factor_summation"]);

export function dashboardDate(iso: string, locale: InvestmentLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** The n a dimension may publish a band against: the server benchmark first, else the chapter's own n. */
export function dimBenchmarkN(report: ReportV2, dim: DimKey, dims?: Partial<Record<DimKey, AssessmentBenchmark>>): number | null {
  const fromServer = dims?.[dim]?.n;
  if (typeof fromServer === "number") return fromServer;
  const n = report.dimensions.find((d) => d.dim === dim)?.benchmark.n;
  return typeof n === "number" ? n : null;
}

export function buildDashboardView(
  report: ReportV2,
  card: AssessmentCardData,
  view: InvestmentView,
  localeIn: string | undefined = report.locale,
  dims?: Partial<Record<DimKey, AssessmentBenchmark>>,
): DashboardView {
  const locale = investmentLocale(localeIn);
  const t = getTbrV3Strings(locale);
  const s43 = getTbrS43Strings(locale);
  const c = report.cover;
  const v = report.valuation;

  // ① SVI index
  const sviValue = card.svi === null ? "—" : String(card.svi);
  const delta = c.svi.deltaVsLast;
  const bandWord = (b: Band) => ({ strong: locale === "vi" ? "Mạnh" : "Strong", developing: locale === "vi" ? "Đang phát triển" : "Developing", early: locale === "vi" ? "Sớm" : "Early", pending: locale === "vi" ? "Chưa đánh giá" : "Pending" })[b];
  const sviTile: DashboardTile = {
    id: "svi",
    label: t.tileSvi,
    value: sviValue,
    sub: `${bandWord(card.sviBand)}${delta !== null && delta !== undefined ? ` · ${t.deltaVsLast(`${delta >= 0 ? "+" : ""}${delta}`)}` : ""}`,
    // G21 P1 review: the cohort rank only beside its n and only above the publication floor.
    note: `${view.compositeScore === null ? t.compositePending : t.composite(view.compositeScore)}${c.svi.cohortPercentile !== null && typeof c.svi.cohortN === "number" && mayShowPercentile(c.svi.cohortN) ? ` · ${t.benchPercentile(c.svi.cohortPercentile)} (n = ${c.svi.cohortN})` : ""}`,
    band: card.sviBand,
  };
  // ② Evidence confidence
  const rung = c.evidenceLevel ? (s43.evidenceLevel[c.evidenceLevel.level] ?? c.evidenceLevel.level) : card.verification.label;
  const evidenceTile: DashboardTile = { id: "evidence", label: t.tileEvidence, value: `${view.evidenceConfidence} %`, sub: rung, note: `${locale === "vi" ? "mức tin tưởng" : "conviction"}: ${t.conviction[view.conviction]}` };
  // ③ Verdict
  const verdictTile: DashboardTile = { id: "verdict", label: t.tileVerdict, value: view.band, sub: t.bandLabel[view.band], note: view.band === "D" ? t.evidenceCtas : t.conditionsCount(view.conditions.length) };
  // ④ Valuation
  const pending = coverValuationPending(report);
  const applicable = isValuationAvailable(v) ? v.methods.filter((m) => m.applicable).length : 0;
  const revenueNotRun = isValuationAvailable(v) ? v.methods.filter((m) => !m.applicable && REVENUE_METHODS.has(m.method)).length : 0;
  const valuationTile: DashboardTile = {
    id: "valuation",
    label: t.tileValuation,
    value: pending || !isValuationAvailable(v) ? t.valuationPending : `${aud(v.consensus.lowAud)} – ${aud(v.consensus.highAud)}`,
    sub: isValuationAvailable(v) ? `${t.methodsRan(applicable, v.methods.length)} · ${v.ask ? t.askChip[v.ask.verdict] : t.askNone}` : "",
    note: revenueNotRun > 0 ? t.revenueNotRun(revenueNotRun) : "",
  };

  // Chart — the band is drawn only where the cohort clears the publication floor.
  const ns = DIM_ORDER.map((d) => dimBenchmarkN(report, d, dims));
  const published = ns.filter((n): n is number => n !== null && mayShowPercentile(n));
  const showBand = published.length === DIM_ORDER.length;
  const rows: DimBarRow[] = report.dimensions.map((ch) => {
    const pendingDim = !isAssessed(ch) || ch.band === "pending";
    return {
      label: dimName(ch.dim, locale),
      value: pendingDim ? 0 : ch.score,
      p25: showBand ? ch.benchmark.p25 : null,
      p50: showBand ? ch.benchmark.p50 : null,
      p75: showBand ? ch.benchmark.p75 : null,
      ...(pendingDim ? { pending: true, pendingLabel: `— / 100 · ${t.pendingBar}` } : {}),
    };
  });
  const nMin = published.length ? Math.min(...published) : ns.find((n) => n !== null) ?? null;
  const chartCaption = showBand && nMin !== null ? t.chartCaptionBand(nMin, benchmarkLabel(nMin).replace(/ \(n = \d+\)$/, "")) : nMin !== null ? t.chartCaptionNoBand(nMin) : t.chartCaptionUnknown;
  const tableFallback = report.dimensions.map((ch) => ({
    [t.thDim]: dimName(ch.dim, locale),
    [t.thScore]: isAssessed(ch) && ch.band !== "pending" ? ch.score : "—",
    p25: showBand ? ch.benchmark.p25 : "—",
    p50: showBand ? ch.benchmark.p50 : "—",
    p75: showBand ? ch.benchmark.p75 : "—",
  }));
  const chart = makeVisual({
    id: `${report.reportId}-dim-bars`,
    kind: "dim_bars",
    title: t.chartTitle,
    subtitle: chartCaption,
    data: { rows, showBand },
    dataState: showBand ? "real" : "partial",
    agentId: "cdo",
    placement: "full_page",
    a11y: { title: t.chartTitle, description: chartCaption, tableFallback },
  });

  const legend = showBand ? [t.legendScore, t.legendBand, t.legendMedian] : [t.legendScore];
  const strengthName = card.topStrength ? `${dimName(card.topStrength.dim, locale)} ${card.topStrength.score}/100` : null;
  const gapName = card.topGap ? `${dimName(card.topGap.dim, locale)} ${card.topGap.score}/100` : null;
  return {
    strings: t,
    tiles: [sviTile, evidenceTile, verdictTile, valuationTile],
    chart,
    chartCaption,
    legend,
    showBand,
    footer: {
      topStrength: strengthName,
      topGap: gapName,
      unverified: t.unverifiedCount(view.unverifiedClaims),
      lastUpdated: t.lastUpdated(dashboardDate(card.lastUpdated, locale)),
      methodology: t.methodology(card.methodologyVersion),
    },
  };
}
