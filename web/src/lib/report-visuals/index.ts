// report-visuals — public surface.
//
//   renderVisual(spec)          → SVG string (pure, deterministic)
//   makeVisual({...})           → VisualSpecV2 with `svg` filled
//   withSvg(spec)               → same spec, `svg` (re)rendered
//
// Every kind in `ALL_VISUAL_KINDS` renders something with role="img" and a
// <title>; kinds without a dedicated renderer (org_chart, flow_diagram) fall
// back to a labelled placeholder so the "no text-only chapter" rule still
// holds and the a11y table carries the numbers.

import type { AgentRole } from "@/lib/report-pipeline/types";
import { renderBars, renderLine } from "./bars";
import { renderDimBars } from "./dim-bars";
import { renderChecklist } from "./checklist";
import { renderDonut } from "./donut";
import { renderFunnel } from "./funnel";
import { renderGauge, renderProgress } from "./gauge";
import { renderHeatMap } from "./heatmap";
import { INK } from "./palette";
import { renderPositioning2x2, renderScatter } from "./positioning";
import { renderRadar } from "./radar";
import { renderRangeBars } from "./range-bars";
import type { RenderOpts } from "./render-opts";
import { renderRouteMap } from "./route-map";
import { renderScoreRing } from "./score-ring";
import { renderSparkline } from "./sparkline";
import { fin, frame, text, truncate } from "./svg";
import { renderThreeQuestions } from "./three-questions";
import { renderGantt, renderTimeline } from "./timeline";
import {
  legacyChartType,
  type ChartTypeV2,
  type DataState,
  type VisualA11y,
  type VisualDataByKind,
  type VisualSpecV2,
} from "./types";

export * from "./types";
export { BAND_COLOUR, SERIES, HEAT_RAMP, INK, bandFor, DATA_STATE_LABEL } from "./palette";
export { aud, esc, fin, num } from "./svg";
export type { RenderOpts } from "./render-opts";
export {
  renderBars,
  renderDimBars,
  renderChecklist,
  renderDonut,
  renderFunnel,
  renderGauge,
  renderGantt,
  renderHeatMap,
  renderLine,
  renderPositioning2x2,
  renderProgress,
  renderRadar,
  renderRangeBars,
  renderRouteMap,
  renderScatter,
  renderScoreRing,
  renderSparkline,
  renderThreeQuestions,
  renderTimeline,
};

function renderPlaceholder(kind: string, opts: RenderOpts): string {
  const width = Math.max(200, Math.round(fin(opts.width, 320)));
  const body =
    `<rect x="4" y="4" width="${width - 8}" height="52" rx="6" fill="${INK.surfaceAlt}" stroke="${INK.grid}" stroke-width="1"/>` +
    text(width / 2, 34, truncate(`${kind} — see table`, 40), { size: 10, anchor: "middle", fill: INK.muted });
  return frame({ id: opts.id, title: opts.title, description: opts.description, width, height: 60, dataState: opts.dataState, hideBadge: opts.hideBadge }, body);
}

/** Pure dispatch: the spec's `data` is trusted to match its `kind` (validated upstream by the ReportV2 schema). */
export function renderVisual(spec: VisualSpecV2, override: Partial<RenderOpts> = {}): string {
  const opts: RenderOpts = {
    id: spec.id,
    title: spec.a11y?.title ?? spec.title,
    description: spec.a11y?.description ?? spec.subtitle ?? spec.title,
    dataState: spec.dataState ?? "partial",
    ...override,
  };
  const data = (spec.data ?? {}) as Record<string, unknown>;
  switch (spec.kind) {
    case "score_ring":
      return renderScoreRing(data as VisualDataByKind["score_ring"], opts);
    case "radar":
      return renderRadar(data as VisualDataByKind["radar"], opts);
    case "funnel":
      return renderFunnel(data as VisualDataByKind["funnel"], opts);
    case "heat_map":
      return renderHeatMap(data as VisualDataByKind["heat_map"], opts);
    case "range_bars":
      return renderRangeBars(data as VisualDataByKind["range_bars"], opts);
    case "sparkline":
      return renderSparkline(data as VisualDataByKind["sparkline"], opts);
    case "donut":
    case "pie":
      return renderDonut(data as VisualDataByKind["donut"], opts);
    case "gauge":
      return renderGauge(data as VisualDataByKind["gauge"], opts);
    case "progress":
      return renderProgress(data as VisualDataByKind["progress"], opts);
    case "checklist":
      return renderChecklist(data as VisualDataByKind["checklist"], opts);
    case "timeline":
      return renderTimeline(data as VisualDataByKind["timeline"], opts);
    case "gantt":
      return renderGantt(data as VisualDataByKind["gantt"], opts);
    case "route_map":
      return renderRouteMap(data as VisualDataByKind["route_map"], opts);
    case "positioning_2x2":
      return renderPositioning2x2(data as VisualDataByKind["positioning_2x2"], opts);
    case "scatter":
      return renderScatter(data as VisualDataByKind["scatter"], opts);
    case "bar":
      return renderBars(data as VisualDataByKind["bar"], opts);
    case "dim_bars":
      return renderDimBars(data as VisualDataByKind["dim_bars"], opts);
    case "line":
      return renderLine(data as VisualDataByKind["line"], opts);
    case "three_questions_strip":
      return renderThreeQuestions(data as VisualDataByKind["three_questions_strip"], opts);
    default:
      return renderPlaceholder(String(spec.kind), opts);
  }
}

export interface MakeVisualArgs<K extends ChartTypeV2> {
  id: string;
  kind: K;
  title: string;
  subtitle?: string;
  data: K extends keyof VisualDataByKind ? VisualDataByKind[K] : Record<string, unknown>;
  dataState: DataState;
  agentId: AgentRole;
  dim?: VisualSpecV2["dim"];
  placement?: VisualSpecV2["placement"];
  a11y?: Partial<VisualA11y>;
  width?: number;
}

/** Build a spec and render its SVG in one step (the adapter's workhorse). */
export function makeVisual<K extends ChartTypeV2>(args: MakeVisualArgs<K>): VisualSpecV2 {
  const spec: VisualSpecV2 = {
    id: args.id,
    kind: args.kind,
    type: legacyChartType(args.kind),
    title: args.title,
    subtitle: args.subtitle,
    data: args.data as Record<string, unknown>,
    placement: args.placement ?? "inline",
    agentId: args.agentId,
    dim: args.dim,
    dataState: args.dataState,
    a11y: {
      title: args.a11y?.title ?? args.title,
      description: args.a11y?.description ?? args.subtitle ?? args.title,
      tableFallback: args.a11y?.tableFallback ?? [],
    },
  };
  spec.svg = renderVisual(spec, args.width ? { width: args.width } : {});
  return spec;
}

/** Re-render `svg` for a stored spec (e.g. after the renderer changed). */
export function withSvg(spec: VisualSpecV2, width?: number): VisualSpecV2 {
  return { ...spec, svg: renderVisual(spec, width ? { width } : {}) };
}
