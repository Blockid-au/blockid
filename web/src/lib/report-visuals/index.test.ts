// Contract tests for every visual kind (G13-W1-R1, spec §F S-R1 "svg
// contains <title>, deterministic hash per fixture"). Each kind must:
//   - render `role="img"` + a `<title>` + a `<desc>` (D.2 accessibility)
//   - be deterministic for the same input (same string twice)
//   - never leak NaN / undefined / Infinity into attributes
//   - survive empty / hostile data (no throw, still an <svg role="img">)
//   - escape labels (no raw `<` from a label reaching the markup)

import { describe, expect, it } from "vitest";
import {
  ALL_VISUAL_KINDS,
  legacyChartType,
  makeVisual,
  renderVisual,
  withSvg,
  type ChartTypeV2,
  type VisualSpecV2,
} from "./index";

const FIXTURES: Record<ChartTypeV2, Record<string, unknown>> = {
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
  bar: { bars: [{ label: "Commits / 90d", value: 63, reference: 62 }, { label: "Tests", value: 40, reference: 62 }], max: 100, referenceLabel: "stage p50" },
  line: { series: [{ label: "Founders", points: [90, 72, 58] }], xLabels: ["Now", "Seed", "Series A"], unit: "%" },
  three_questions_strip: { where: "Seed-stage AU SaaS at SVI 61.", worth: "A$1.4–2.6M consensus.", next: "Connect Stripe and reserve an ESOP pool." },
  org_chart: { nodes: [] },
  flow_diagram: { steps: [] },
};

function spec(kind: ChartTypeV2, data: Record<string, unknown>, id = `t-${kind}`): VisualSpecV2 {
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

const BAD_TOKENS = /NaN|undefined|Infinity/;

describe("report-visuals contract — every kind", () => {
  for (const kind of ALL_VISUAL_KINDS) {
    describe(kind, () => {
      it("renders an accessible, deterministic SVG", () => {
        const s = spec(kind, FIXTURES[kind]);
        const a = renderVisual(s);
        const b = renderVisual(s);
        expect(a).toBe(b);
        expect(a.startsWith("<svg")).toBe(true);
        expect(a.endsWith("</svg>")).toBe(true);
        expect(a).toContain('role="img"');
        expect(a).toContain(`<title id="t-${kind}-title">${kind} title</title>`);
        expect(a).toContain(`<desc id="t-${kind}-desc">${kind} description</desc>`);
        expect(a).toContain(`aria-labelledby="t-${kind}-title t-${kind}-desc"`);
        expect(a).not.toMatch(BAD_TOKENS);
      });

      it("survives empty data without NaN", () => {
        const a = renderVisual(spec(kind, {}));
        expect(a).toContain('role="img"');
        expect(a).not.toMatch(BAD_TOKENS);
      });

      it("survives hostile data (strings, negatives, nulls)", () => {
        const hostile: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(FIXTURES[kind])) {
          hostile[k] = Array.isArray(v) ? v.map(() => ({ label: "<x>", value: "abc", x: -5, y: null, at: "z", start: null, end: NaN, status: "weird", points: ["a"] })) : typeof v === "number" ? NaN : "<bad>";
        }
        const a = renderVisual(spec(kind, hostile));
        expect(a).toContain('role="img"');
        expect(a).not.toMatch(BAD_TOKENS);
        expect(a).not.toContain("<x>");
        expect(a).not.toContain("<bad>");
      });
    });
  }
});

describe("makeVisual / withSvg", () => {
  it("fills legacy type, a11y defaults and svg", () => {
    const v = makeVisual({ id: "cover-ring", kind: "score_ring", title: "SVI 61", data: { value: 61 }, dataState: "real", agentId: "cdo" });
    expect(v.type).toBe("progress");
    expect(v.a11y.title).toBe("SVI 61");
    expect(v.svg).toContain('role="img"');
    expect(v.svg).toContain("aria-labelledby=\"cover-ring-title cover-ring-desc\"");
    const again = withSvg({ ...v, svg: undefined });
    expect(again.svg).toBe(v.svg);
  });

  it("sanitises ids that are not valid xml name starts", () => {
    const v = makeVisual({ id: "1 bad id!", kind: "gauge", title: "g", data: { value: 5 }, dataState: "real", agentId: "cto" });
    expect(v.svg).toContain('aria-labelledby="v-1-bad-id--title v-1-bad-id--desc"');
  });

  it("maps every V2 kind onto a legacy ChartType", () => {
    const legacy = new Set(["radar", "bar", "line", "pie", "funnel", "scatter", "org_chart", "timeline", "heat_map", "progress", "flow_diagram", "checklist"]);
    for (const kind of ALL_VISUAL_KINDS) expect(legacy.has(legacyChartType(kind))).toBe(true);
  });

  it("shows the data-state badge except on cover strips", () => {
    const ring = makeVisual({ id: "r", kind: "score_ring", title: "r", data: { value: 1 }, dataState: "benchmark_only", agentId: "cdo" });
    expect(ring.svg).not.toContain(">benchmark only<");
    const bars = makeVisual({ id: "b", kind: "bar", title: "b", data: { bars: [{ label: "a", value: 1 }] }, dataState: "benchmark_only", agentId: "cto" });
    expect(bars.svg).toContain(">benchmark only<");
    expect(bars.svg).toContain('data-state="benchmark_only"');
  });
});
