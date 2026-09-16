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
} from "./index";
import { KIND_FIXTURES as FIXTURES, specForKind as spec } from "./kind-fixtures";

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
