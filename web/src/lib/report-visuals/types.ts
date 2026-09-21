// report-visuals — shared data contract for every deterministic report chart.
//
// G13-W1-R1 (docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md
// §A.2, §A.3, §D). Decision D7: every visual in a Trusted Business Report is
// a pure function `data → SVG string`. The same `VisualSpecV2` feeds the web
// (inline SVG), the react-pdf twins (S-R4) and the DOCX / email PNG path, so
// the numbers and labels are shared and re-derivable from `data`.
//
// Pure module: types + kind list only. Renderers live one-per-file next to
// this and are dispatched by `index.ts:renderVisual`.

import type { ChartType, VisualSpec } from "@/lib/report-pipeline/types";

/** Chart kinds added by ReportV2 on top of the pipeline's `ChartType`. */
export const VISUAL_KINDS_V2 = [
  "score_ring",
  "three_questions_strip",
  "sparkline",
  "donut",
  "range_bars",
  "gauge",
  "route_map",
  "gantt",
  "positioning_2x2",
  /** G27: the dashboard's 8-dimension bars against the stage median band. */
  "dim_bars",
] as const;

export type ChartTypeV2 = ChartType | (typeof VISUAL_KINDS_V2)[number];

/** Every kind `renderVisual` accepts (legacy `ChartType` + the V2 additions). */
export const ALL_VISUAL_KINDS: readonly ChartTypeV2[] = [
  "radar",
  "bar",
  "line",
  "pie",
  "funnel",
  "scatter",
  "org_chart",
  "timeline",
  "heat_map",
  "progress",
  "flow_diagram",
  "checklist",
  ...VISUAL_KINDS_V2,
];

export type DataState = "real" | "partial" | "benchmark_only" | "target";

export type Band = "strong" | "developing" | "early" | "pending";

/** Accessibility payload every chart carries (D.2). */
export interface VisualA11y {
  title: string;
  description: string;
  /** Rows a screen reader / PDF appendix can print instead of the picture. */
  tableFallback: Array<Record<string, string | number>>;
}

// ── Per-kind data shapes (type aliases so they stay assignable to
//    VisualSpec.data: Record<string, unknown>) ────────────────────────────

export type ScoreRingData = {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  band?: Band;
};

export type RadarAxis = { label: string; value: number; reference?: number | null };
export type RadarData = {
  axes: RadarAxis[];
  max?: number;
  seriesLabel?: string;
  referenceLabel?: string;
};

export type FunnelStage = { label: string; value: number; display?: string };
export type FunnelData = { stages: FunnelStage[]; unit?: string };

export type HeatMapData = {
  rows: string[];
  cols: string[];
  /** rows × cols; `null` renders as an "unknown" cell (hatched, "?"). */
  cells: Array<Array<number | null>>;
  /** Optional per-cell text overriding the numeric label ("✓", "–", "?"). */
  cellLabels?: Array<Array<string>>;
  max?: number;
  legend?: string;
};

export type RangeBarRow = {
  label: string;
  low: number;
  mid: number;
  high: number;
  applicable?: boolean;
};
export type RangeBarsData = {
  rows: RangeBarRow[];
  consensus?: { low: number; mid: number; high: number; label?: string };
  marker?: { label: string; value: number };
  currency?: "AUD";
};

export type SparklinePoint = { label?: string; value: number };
export type SparklineData = {
  points: SparklinePoint[];
  /** Cohort band drawn behind the line (p25–p75 for benchmark_only). */
  band?: { low: number; high: number; label?: string };
  marker?: { label: string; value: number };
  unit?: string;
  /** True when the series is a placeholder ("Connect Stripe/Xero to plot"). */
  ghost?: boolean;
  ghostLabel?: string;
};

export type DonutSlice = { label: string; value: number };
export type DonutData = {
  slices: DonutSlice[];
  centreLabel?: string;
  centreValue?: string;
};

export type GaugeData = {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
};

export type ChecklistStatus = "done" | "pending" | "unknown" | "na";
export type ChecklistItem = { label: string; status: ChecklistStatus; detail?: string };
export type ChecklistData = { items: ChecklistItem[] };

export type TimelineItem = {
  label: string;
  /** Position on the axis (months, days or years — see `unit`). */
  at: number;
  detail?: string;
  status?: "done" | "current" | "upcoming";
};
export type TimelineData = { items: TimelineItem[]; unit?: string; horizon?: number };

export type RoutePhase = { id: string; label: string; status: "done" | "current" | "upcoming" };
export type RouteMapData = { phases: RoutePhase[] };

export type PositioningPoint = { label: string; x: number; y: number; self?: boolean };
export type Positioning2x2Data = {
  xLabel: string;
  yLabel: string;
  points: PositioningPoint[];
  /** Quadrant captions: [top-left, top-right, bottom-left, bottom-right]. */
  quadrants?: [string, string, string, string];
};

export type BarItem = { label: string; value: number; reference?: number | null };
export type BarData = { bars: BarItem[]; max?: number; unit?: string; referenceLabel?: string };

export type ThreeQuestionsData = { where: string; worth: string; next: string };

export type ScatterData = {
  xLabel: string;
  yLabel: string;
  points: PositioningPoint[];
};

export type LineSeries = { label: string; points: number[] };
export type LineData = { series: LineSeries[]; xLabels?: string[]; unit?: string };

export type ProgressData = { value: number; max?: number; label?: string };

export type GanttRow = { label: string; start: number; end: number; owner?: string };
export type GanttData = { rows: GanttRow[]; horizon: number; unit?: string };

/** G27 — dashboard bars: one row per dimension, band + median optional (omitted below the publication floor). */
export type DimBarRow = { label: string; value: number; p25?: number | null; p50?: number | null; p75?: number | null; pending?: boolean; pendingLabel?: string };
export type DimBarsData = {
  rows: DimBarRow[];
  /** False = draw no band / tick even when the rows carry anchors (cohort below n = 10). */
  showBand?: boolean;
};

export type VisualDataByKind = {
  score_ring: ScoreRingData;
  dim_bars: DimBarsData;
  radar: RadarData;
  funnel: FunnelData;
  heat_map: HeatMapData;
  range_bars: RangeBarsData;
  sparkline: SparklineData;
  donut: DonutData;
  pie: DonutData;
  gauge: GaugeData;
  checklist: ChecklistData;
  timeline: TimelineData;
  route_map: RouteMapData;
  positioning_2x2: Positioning2x2Data;
  bar: BarData;
  three_questions_strip: ThreeQuestionsData;
  scatter: ScatterData;
  line: LineData;
  progress: ProgressData;
  gantt: GanttData;
  org_chart: Record<string, unknown>;
  flow_diagram: Record<string, unknown>;
};

/**
 * ReportV2 visual — extends the pipeline's `VisualSpec` (so today's
 * `charts[]` consumers still type-check) with the fields every chapter
 * renderer needs: a stable id, the V2 kind, the owning dimension, how real
 * the numbers are, the a11y payload and the deterministic SVG.
 */
export interface VisualSpecV2 extends VisualSpec {
  id: string;
  kind: ChartTypeV2;
  dim?: "tre" | "mpc" | "ftv" | "ptd" | "cgh" | "iri" | "lco" | "svm";
  dataState: DataState;
  a11y: VisualA11y;
  /** Deterministic render, filled at assemble time for PDF/DOCX/email. */
  svg?: string;
}

/** Map a V2 kind onto the legacy `ChartType` bucket `VisualSpec.type` needs. */
export function legacyChartType(kind: ChartTypeV2): ChartType {
  switch (kind) {
    case "score_ring":
    case "gauge":
      return "progress";
    case "three_questions_strip":
    case "route_map":
      return "flow_diagram";
    case "sparkline":
      return "line";
    case "donut":
      return "pie";
    case "range_bars":
    case "dim_bars":
      return "bar";
    case "gantt":
      return "timeline";
    case "positioning_2x2":
      return "scatter";
    default:
      return kind;
  }
}
