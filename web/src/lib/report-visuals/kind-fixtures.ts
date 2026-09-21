// One sample `data` payload per visual kind (every entry of
// `ALL_VISUAL_KINDS`). Shared by the renderer contract test, the react-pdf
// twin test and the PNG test so "every kind renders" means the same thing
// on every surface. Not a test file: importable from any suite.

import { legacyChartType, type ChartTypeV2, type VisualSpecV2 } from "./types";

export const KIND_FIXTURES: Record<ChartTypeV2, Record<string, unknown>> = {
  score_ring: { value: 61, label: "SVI", sublabel: "Developing" },
  radar: {
    axes: [
      { label: "TRE", value: 61, reference: 52 },
      { label: "MPC", value: 55, reference: 58 },
      { label: "FTV", value: 70, reference: 60 },
      { label: "PTD", value: 48, reference: 62 },
      { label: "CGH", value: 40, reference: 58 },
    ],
  },
  funnel: { stages: [{ label: "TAM", value: 1200 }, { label: "SAM", value: 300 }, { label: "SOM", value: 30 }], unit: "A$M" },
  heat_map: { rows: ["Corporate", "Cap table"], cols: ["Present", "Fresh"], cells: [[100, 50], [null, 0]] },
  range_bars: {
    rows: [
      { label: "Revenue multiple", low: 1_000_000, mid: 2_000_000, high: 3_000_000 },
      { label: "Berkus", low: 800_000, mid: 1_500_000, high: 2_100_000, applicable: false },
    ],
    consensus: { low: 1_000_000, mid: 1_800_000, high: 2_600_000 },
    marker: { label: "Ask", value: 2_400_000 },
  },
  sparkline: { points: [{ label: "Jan", value: 10 }, { label: "Feb", value: 12 }, { label: "Mar", value: 15 }], unit: "k" },
  donut: { slices: [{ label: "Founders", value: 70 }, { label: "ESOP", value: 12 }, { label: "Investors", value: 18 }], centreValue: "70%", centreLabel: "founders" },
  pie: { slices: [{ label: "A", value: 1 }, { label: "B", value: 3 }] },
  gauge: { value: 72, label: "Core Web Vitals" },
  progress: { value: 6, max: 8, label: "Data room folders" },
  checklist: { items: [{ label: "ABN / ACN", status: "done" }, { label: "Privacy policy", status: "pending" }, { label: "Trademark", status: "unknown" }] },
  timeline: { items: [{ label: "Strategic", at: 3, detail: "A$8–12M" }, { label: "PE", at: 5 }, { label: "ASX", at: 7 }], unit: "yr", horizon: 8 },
  gantt: { rows: [{ label: "Connect Stripe", start: 0, end: 30, owner: "cro" }, { label: "ESOP pool", start: 30, end: 60, owner: "cfo" }], horizon: 90, unit: "d" },
  route_map: { phases: [{ id: "vision", label: "Vision", status: "done" }, { id: "customer_dev", label: "Customers", status: "current" }, { id: "revenue_model", label: "Revenue", status: "upcoming" }] },
  positioning_2x2: { xLabel: "Price", yLabel: "Differentiation", points: [{ label: "You", x: 40, y: 75, self: true }, { label: "Rival", x: 70, y: 40 }], quadrants: ["Niche", "Premium", "Commodity", "Value"] },
  scatter: { xLabel: "ARR", yLabel: "Valuation", points: [{ label: "Comp A", x: 1, y: 8 }, { label: "You", x: 2, y: 10, self: true }] },
  dim_bars: { rows: [{ label: "Traction & Revenue", value: 46, p25: 50, p50: 65, p75: 80 }, { label: "Market Pull", value: 87, p25: 50, p50: 65, p75: 80 }, { label: "Legal & Compliance", value: 0, pending: true }] },
  bar: { bars: [{ label: "Commits / 90d", value: 63, reference: 62 }, { label: "Tests", value: 40, reference: 62 }], max: 100, referenceLabel: "stage p50" },
  line: { series: [{ label: "Founders", points: [90, 72, 58] }], xLabels: ["Now", "Seed", "Series A"], unit: "%" },
  three_questions_strip: { where: "Seed-stage AU SaaS at SVI 61.", worth: "A$1.4–2.6M consensus.", next: "Connect Stripe and reserve an ESOP pool." },
  org_chart: { nodes: [] },
  flow_diagram: { steps: [] },
};

/** A minimal, valid spec for `kind` (data defaults to the kind fixture). */
export function specForKind(kind: ChartTypeV2, data: Record<string, unknown> = KIND_FIXTURES[kind], id = `t-${kind}`): VisualSpecV2 {
  return {
    id,
    kind,
    type: legacyChartType(kind),
    title: `${kind} title`,
    data,
    placement: "inline",
    agentId: "cdo",
    dataState: "partial",
    a11y: { title: `${kind} title`, description: `${kind} description`, tableFallback: [] },
  };
}
