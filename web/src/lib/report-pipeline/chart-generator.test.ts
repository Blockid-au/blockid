// Colocated vitest for the previously-untested pure server-side chart / SVG
// renderer `web/src/lib/report-pipeline/chart-generator.ts`.
//
// The renderers here produce the visuals inlined into every SVI report DOCX
// (radar, bar, funnel, progress gauge, risk heat-map) plus feed the report
// pipeline's `charts[]` array via `generateCharts()` / `getChartForSection()`.
// A silent regression is DOCX-visible to founders:
//   - dropped `<svg viewBox=…>` → renderers no longer scale in the exported
//     .docx via docx-svg-embed
//   - dropped ratio-cap in the radar → an SVI sub-score > max blows the
//     polygon outside the grid, cropping the export
//   - dropped colour-banding in the progress gauge (green / blue / amber /
//     red at 0.70 / 0.50 / 0.35) → the "at a glance" investor cue used on
//     the exec-summary page is silently wrong
//   - dropped 8-risk cap in the heat-map → the /admin/ops overlay overflows
//     the fixed viewBox and hides the axis labels
//
// Pure — no I/O, no Supabase, no `callAI` — every test is a string-shape
// assertion against the produced SVG or a shape-check of the visual-spec
// array. `generateEnhancedCharts` is the one async export; we skip it here
// because it dynamically imports `@/lib/ai-image-client` (server-only) which
// pulls in the whole DB stack and defeats the "colocated + fast" contract.
// Its SVG-fallback branch is fully covered by the `renderRadarSVG` +
// `renderBarSVG` + `getChartForSection` tests below.

import { describe, expect, it } from "vitest";
import type { ReportContext, AgentAnalysisResult } from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import {
  generateCharts,
  getChartForSection,
  renderRadarSVG,
  renderBarSVG,
  renderFunnelSVG,
  renderProgressSVG,
  renderHeatMapSVG,
} from "./chart-generator";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeAgentResult(
  criterion: CriterionKey,
  overrides: Partial<AgentAnalysisResult> = {},
): AgentAnalysisResult {
  return {
    criterion,
    agentRole: overrides.agentRole ?? "ceo",
    score: overrides.score ?? 60,
    content: overrides.content ?? "",
    highlights: overrides.highlights ?? [],
    dataPoints: overrides.dataPoints ?? {},
    risks: overrides.risks ?? [],
    nextSteps: overrides.nextSteps ?? [],
    visuals: overrides.visuals ?? [],
    confidence: overrides.confidence ?? 0.7,
    wordCount: overrides.wordCount ?? 400,
    durationMs: overrides.durationMs ?? 1200,
  };
}

function makeContext(overrides: {
  subs?: Array<{ label: string; value: number }>;
  riskPenalties?: Array<{ label: string; points: number; reason?: string }>;
  results?: Partial<Record<CriterionKey, AgentAnalysisResult>>;
} = {}): ReportContext {
  const criterionResults = new Map<CriterionKey, AgentAnalysisResult>();
  for (const [k, v] of Object.entries(overrides.results ?? {})) {
    if (v) criterionResults.set(k as CriterionKey, v);
  }
  return {
    accountId: "acc_1",
    userId: "u_1",
    projectId: "p_1",
    startupName: "Acme Robotics",
    rawText: "",
    sviAnalysis: {
      totalSVI: 132,
      stageLabel: "Growth",
      subs: overrides.subs ?? [],
      riskPenalties: overrides.riskPenalties ?? [],
    } as unknown as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: {} as ReportContext["criteriaData"],
    stage: 3,
    locale: "en",
    gatherResults: {},
    criterionResults,
  };
}

// ---------------------------------------------------------------------------
// generateCharts()
// ---------------------------------------------------------------------------

describe("generateCharts()", () => {
  it("returns an empty array when the context has no sub-scores, no risks, and no criterion results", () => {
    const ctx = makeContext();
    expect(generateCharts(ctx)).toEqual([]);
  });

  it("returns a radar VisualSpec when sviAnalysis.subs is populated (executive template)", () => {
    const ctx = makeContext({
      subs: [
        { label: "Team", value: 80 },
        { label: "Market", value: 65 },
        { label: "Revenue", value: 40 },
      ],
    });
    const out = generateCharts(ctx);
    const radar = out.find((c) => c.title === "SVI Dimension Radar");
    expect(radar).toBeDefined();
    expect(radar?.type).toBe("radar");
    expect(radar?.agentId).toBe("cdo");
  });

  it("places the radar chart 'full_page' (every other chart is 'inline')", () => {
    // Radar full-page vs everything-else inline is the DOCX pagination
    // contract that section-assembler relies on when deciding where to break.
    const ctx = makeContext({
      subs: [{ label: "Team", value: 80 }],
      results: {
        revenue: makeAgentResult("revenue", { agentRole: "cfo" }),
        team_structure: makeAgentResult("team_structure", { agentRole: "chro" }),
      },
    });
    const out = generateCharts(ctx);
    const placements = Object.fromEntries(out.map((c) => [c.type, c.placement]));
    expect(placements.radar).toBe("full_page");
    for (const [type, placement] of Object.entries(placements)) {
      if (type !== "radar") expect(placement).toBe("inline");
    }
  });

  it("skips the radar template when subs is empty (builder returns null)", () => {
    const ctx = makeContext({ subs: [] });
    const radar = generateCharts(ctx).find((c) => c.title === "SVI Dimension Radar");
    expect(radar).toBeUndefined();
  });

  it("emits a bar chart for the revenue criterion via CFO agent", () => {
    const ctx = makeContext({
      results: {
        revenue: makeAgentResult("revenue", {
          agentRole: "cfo",
          dataPoints: { bear: "$100k", base: "$200k", bull: "$400k" },
        }),
      },
    });
    const bar = generateCharts(ctx).find((c) => c.type === "bar");
    expect(bar?.title).toBe("Revenue Projection (3 Scenarios)");
    expect(bar?.agentId).toBe("cfo");
    expect(Array.isArray((bar?.data as { scenarios: string[] }).scenarios)).toBe(true);
    expect((bar?.data as { scenarios: string[] }).scenarios).toEqual(["Bear", "Base", "Bull"]);
  });

  it("emits a funnel chart for the market criterion (TAM / SAM / SOM)", () => {
    const ctx = makeContext({
      results: {
        market: makeAgentResult("market", { agentRole: "cmo" }),
      },
    });
    const funnel = generateCharts(ctx).find((c) => c.type === "funnel");
    expect(funnel?.title).toBe("TAM / SAM / SOM");
    expect((funnel?.data as { levels: string[] }).levels).toEqual(["TAM", "SAM", "SOM"]);
    expect(funnel?.agentId).toBe("cmo");
  });

  it("emits an org_chart for team_structure, timeline for roadmap, line for customer_size", () => {
    const ctx = makeContext({
      results: {
        team_structure: makeAgentResult("team_structure", { agentRole: "chro" }),
        roadmap: makeAgentResult("roadmap", {
          agentRole: "cpo",
          nextSteps: ["Q1 launch", "Q2 seed", "Q3 pilot"],
        }),
        customer_size: makeAgentResult("customer_size", { agentRole: "cro" }),
      },
    });
    const types = generateCharts(ctx).map((c) => c.type);
    expect(types).toContain("org_chart");
    expect(types).toContain("timeline");
    expect(types).toContain("line");
  });

  it("emits a heat_map when sviAnalysis.riskPenalties is populated (CLO agent)", () => {
    const ctx = makeContext({
      riskPenalties: [
        { label: "Solo founder", points: 12, reason: "single point of failure" },
        { label: "No revenue", points: 8 },
      ],
    });
    const heat = generateCharts(ctx).find((c) => c.type === "heat_map");
    expect(heat?.title).toBe("Risk Heat Map");
    expect(heat?.agentId).toBe("clo");
    const risks = (heat?.data as { risks: Array<{ label: string; impact: number; reason?: string }> }).risks;
    expect(risks).toEqual([
      { label: "Solo founder", impact: 12, reason: "single point of failure" },
      { label: "No revenue", impact: 8, reason: undefined },
    ]);
  });

  it("emits a progress gauge for code_git (CTO), forwarding score + confidence", () => {
    const ctx = makeContext({
      results: {
        code_git: makeAgentResult("code_git", {
          agentRole: "cto",
          score: 72,
          confidence: 0.85,
        }),
      },
    });
    const gauge = generateCharts(ctx).find((c) => c.type === "progress");
    expect(gauge?.title).toBe("Technical Maturity Dashboard");
    expect(gauge?.agentId).toBe("cto");
    const data = gauge?.data as { score: number; confidence: number };
    expect(data.score).toBe(72);
    expect(data.confidence).toBe(0.85);
  });

  it("skips a template whose criterionResult is absent (no revenue key ⇒ no bar chart)", () => {
    const ctx = makeContext({
      results: { market: makeAgentResult("market", { agentRole: "cmo" }) },
    });
    const out = generateCharts(ctx);
    expect(out.find((c) => c.type === "bar")).toBeUndefined();
    expect(out.find((c) => c.type === "funnel")).toBeDefined();
  });

  it("skips the heat_map template when riskPenalties is an empty array", () => {
    const ctx = makeContext({ riskPenalties: [] });
    expect(generateCharts(ctx).find((c) => c.type === "heat_map")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getChartForSection()
// ---------------------------------------------------------------------------

describe("getChartForSection()", () => {
  it("returns null for an unknown sectionId", () => {
    const ctx = makeContext();
    expect(getChartForSection("nope-not-a-section", ctx)).toBeNull();
  });

  it("returns null when the section's builder returns null (missing data)", () => {
    const ctx = makeContext(); // no criterionResults + no subs
    expect(getChartForSection("executive", ctx)).toBeNull();
    expect(getChartForSection("revenue", ctx)).toBeNull();
  });

  it("returns a VisualSpec keyed by sectionId=executive → radar", () => {
    const ctx = makeContext({ subs: [{ label: "Team", value: 80 }] });
    const spec = getChartForSection("executive", ctx);
    expect(spec?.type).toBe("radar");
    expect(spec?.title).toBe("SVI Dimension Radar");
  });

  it("always returns placement='inline' (differs from generateCharts full_page radar)", () => {
    // getChartForSection is the per-section fetch and never uses full_page —
    // section-assembler places the chart inline under the heading.
    const ctx = makeContext({ subs: [{ label: "Team", value: 80 }] });
    const spec = getChartForSection("executive", ctx);
    expect(spec?.placement).toBe("inline");
  });

  it("returns the CFO revenue bar when the revenue criterion result exists", () => {
    const ctx = makeContext({
      results: { revenue: makeAgentResult("revenue", { agentRole: "cfo" }) },
    });
    const spec = getChartForSection("revenue", ctx);
    expect(spec?.type).toBe("bar");
    expect(spec?.agentId).toBe("cfo");
  });
});

// ---------------------------------------------------------------------------
// renderRadarSVG()
// ---------------------------------------------------------------------------

describe("renderRadarSVG()", () => {
  const base = { labels: ["A", "B", "C", "D"], values: [80, 60, 40, 90], max: 100 };

  it("produces a well-formed <svg> with the fixed 400×400 viewBox", () => {
    const out = renderRadarSVG(base);
    expect(out.startsWith("<svg")).toBe(true);
    expect(out.endsWith("</svg>")).toBe(true);
    expect(out).toContain('viewBox="0 0 400 400"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("draws exactly 4 grid polygons (25% / 50% / 75% / 100% rings)", () => {
    const out = renderRadarSVG(base);
    const grid = out.match(/<polygon [^>]*stroke="#e5e7eb"/g) ?? [];
    expect(grid.length).toBe(4);
  });

  it("draws one axis line per label", () => {
    const out = renderRadarSVG(base);
    const axes = out.match(/<line [^>]*stroke="#e5e7eb"/g) ?? [];
    expect(axes.length).toBe(base.labels.length);
  });

  it("draws one <text> label per input label", () => {
    const out = renderRadarSVG(base);
    const texts = out.match(/<text /g) ?? [];
    expect(texts.length).toBe(base.labels.length);
    for (const label of base.labels) expect(out).toContain(`>${label}</text>`);
  });

  it("emits a data polygon with the brand-blue fill + stroke", () => {
    const out = renderRadarSVG(base);
    expect(out).toContain('fill="rgba(37,99,235,0.2)"');
    expect(out).toContain('stroke="#2563eb"');
  });

  it("caps each data ratio at 1.0 so an over-max value does not escape the grid", () => {
    // Ratio cap is the "over-100 sub-score does not blow the polygon out of
    // the DOCX page" guarantee — a regression here silently crops exports.
    const out = renderRadarSVG({ labels: ["X"], values: [500], max: 100 });
    // With ratio capped at 1.0, the single data-point sits on the outer ring
    // at angle -pi/2, i.e. cx=200 and cy = 200 - 150 = 50.
    expect(out).toMatch(/<polygon points="200,50" fill="rgba\(37,99,235,0\.2\)"/);
  });

  it("handles a single-label input without dividing by zero (n=1)", () => {
    expect(() => renderRadarSVG({ labels: ["Only"], values: [50], max: 100 })).not.toThrow();
    const out = renderRadarSVG({ labels: ["Only"], values: [50], max: 100 });
    expect(out).toContain(">Only</text>");
  });
});

// ---------------------------------------------------------------------------
// renderBarSVG()
// ---------------------------------------------------------------------------

describe("renderBarSVG()", () => {
  const base = { labels: ["Bear", "Base", "Bull"], values: [100, 200, 400], max: 400 };

  it("produces a well-formed <svg> with the fixed 500×300 viewBox", () => {
    const out = renderBarSVG(base);
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).toContain('viewBox="0 0 500 300"');
  });

  it("draws one <rect> per bar", () => {
    const out = renderBarSVG(base);
    const rects = out.match(/<rect /g) ?? [];
    expect(rects.length).toBe(base.labels.length);
  });

  it("emits the value text above each bar (data label callout)", () => {
    const out = renderBarSVG(base);
    for (const v of base.values) expect(out).toContain(`>${v}</text>`);
  });

  it("uses the default 5-colour palette when no colors[] override is supplied", () => {
    const out = renderBarSVG(base);
    expect(out).toContain('fill="#2563eb"');
    expect(out).toContain('fill="#10b981"');
    expect(out).toContain('fill="#f59e0b"');
  });

  it("cycles the palette modulo when labels.length > colors.length", () => {
    // 6 bars, default palette is 5 → 6th bar reuses colours[0].
    const out = renderBarSVG({
      labels: ["a", "b", "c", "d", "e", "f"],
      values: [1, 2, 3, 4, 5, 6],
      max: 6,
    });
    const brandBlue = (out.match(/fill="#2563eb"/g) ?? []).length;
    expect(brandBlue).toBeGreaterThanOrEqual(2);
  });

  it("honours a caller-supplied colors[] override in order", () => {
    const out = renderBarSVG({ ...base, colors: ["#111111", "#222222", "#333333"] });
    expect(out).toContain('fill="#111111"');
    expect(out).toContain('fill="#222222"');
    expect(out).toContain('fill="#333333"');
    // Default palette not present when override is complete.
    expect(out).not.toContain('fill="#2563eb"');
  });

  it("draws the x-axis baseline at y = h - pad (240)", () => {
    // pad=60, h=300 → baseline y = 240. If a future rewrite drops the axis
    // the /admin/ops overlay reads as a floating cluster of bars.
    const out = renderBarSVG(base);
    expect(out).toMatch(/<line x1="60" y1="240" x2="440" y2="240"/);
  });
});

// ---------------------------------------------------------------------------
// renderFunnelSVG()
// ---------------------------------------------------------------------------

describe("renderFunnelSVG()", () => {
  it("produces a well-formed <svg> with the fixed 500×300 viewBox", () => {
    const out = renderFunnelSVG({ levels: ["TAM", "SAM", "SOM"] });
    expect(out).toContain('viewBox="0 0 500 300"');
  });

  it("draws one <polygon> per funnel level", () => {
    const out = renderFunnelSVG({ levels: ["TAM", "SAM", "SOM"] });
    const polys = out.match(/<polygon /g) ?? [];
    expect(polys.length).toBe(3);
  });

  it("emits every level label as a centred bold <text>", () => {
    const out = renderFunnelSVG({ levels: ["Awareness", "Signup", "Paid"] });
    for (const label of ["Awareness", "Signup", "Paid"]) {
      expect(out).toContain(`>${label}</text>`);
    }
    expect(out).toContain('font-weight="bold"');
  });

  it("gracefully handles an empty levels array (no polygons, still valid <svg>)", () => {
    const out = renderFunnelSVG({ levels: [] });
    expect(out).toContain("<svg");
    expect((out.match(/<polygon /g) ?? []).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// renderProgressSVG()
// ---------------------------------------------------------------------------

describe("renderProgressSVG()", () => {
  it("emits a two-circle gauge (background ring + progress arc) at 200×200", () => {
    const out = renderProgressSVG({ score: 60 });
    expect(out).toContain('viewBox="0 0 200 200"');
    const circles = out.match(/<circle /g) ?? [];
    expect(circles.length).toBe(2);
    // background ring stroke first, then coloured arc
    expect(out).toContain('stroke="#e5e7eb"');
  });

  it("centres the score number as bold body text", () => {
    const out = renderProgressSVG({ score: 74 });
    expect(out).toMatch(/>74<\/text>/);
    expect(out).toContain('font-weight="bold"');
  });

  it("omits the sub-label <text> when no label prop is supplied", () => {
    const out = renderProgressSVG({ score: 50 });
    const texts = out.match(/<text /g) ?? [];
    expect(texts.length).toBe(1);
  });

  it("emits a second <text> for the sub-label when label is supplied", () => {
    const out = renderProgressSVG({ score: 50, label: "Team Readiness" });
    expect(out).toContain(">Team Readiness</text>");
    expect((out.match(/<text /g) ?? []).length).toBe(2);
  });

  it("colour-band: score ≥ 70% max → green (#10b981)", () => {
    expect(renderProgressSVG({ score: 70 })).toContain('stroke="#10b981"');
    expect(renderProgressSVG({ score: 100 })).toContain('stroke="#10b981"');
  });

  it("colour-band: 50% ≤ score < 70% → blue (#2563eb)", () => {
    expect(renderProgressSVG({ score: 50 })).toContain('stroke="#2563eb"');
    expect(renderProgressSVG({ score: 69 })).toContain('stroke="#2563eb"');
  });

  it("colour-band: 35% ≤ score < 50% → amber (#f59e0b)", () => {
    expect(renderProgressSVG({ score: 35 })).toContain('stroke="#f59e0b"');
    expect(renderProgressSVG({ score: 49 })).toContain('stroke="#f59e0b"');
  });

  it("colour-band: score < 35% → red (#ef4444)", () => {
    expect(renderProgressSVG({ score: 0 })).toContain('stroke="#ef4444"');
    expect(renderProgressSVG({ score: 34 })).toContain('stroke="#ef4444"');
  });

  it("honours a caller-supplied maxScore override when computing the ratio", () => {
    // score=70 with default max=100 → green; same score with max=200 → amber.
    // Reads the same value but re-bands per the caller's ceiling.
    expect(renderProgressSVG({ score: 70, maxScore: 200 })).toContain('stroke="#f59e0b"');
  });

  it("caps ratio at 1.0 (score > maxScore → offset=0, arc is closed)", () => {
    const out = renderProgressSVG({ score: 500, maxScore: 100 });
    // stroke-dashoffset should render as 0 (or a rounded 0), not negative.
    expect(out).toMatch(/stroke-dashoffset="0"/);
  });
});

// ---------------------------------------------------------------------------
// renderHeatMapSVG()
// ---------------------------------------------------------------------------

describe("renderHeatMapSVG()", () => {
  it("draws the fixed 5×5 grid (25 <rect> cells) + 500×350 viewBox", () => {
    const out = renderHeatMapSVG({ risks: [] });
    expect(out).toContain('viewBox="0 0 500 350"');
    const rects = out.match(/<rect /g) ?? [];
    expect(rects.length).toBe(25);
  });

  it("emits the 5 impact-axis labels along the bottom", () => {
    const out = renderHeatMapSVG({ risks: [] });
    for (const l of ["Very Low", "Low", "Medium", "High", "Critical"]) {
      expect(out).toContain(`>${l}</text>`);
    }
  });

  it("includes 'Impact →' / 'Likelihood →' axis captions + 'Risk Heat Map' title", () => {
    const out = renderHeatMapSVG({ risks: [] });
    expect(out).toContain(">Risk Heat Map</text>");
    expect(out).toContain(">Impact →</text>");
    expect(out).toContain(">Likelihood →</text>");
  });

  it("draws one red dot per risk (with its 1-based ordinal as the label)", () => {
    const out = renderHeatMapSVG({
      risks: [
        { label: "R1", impact: 4 },
        { label: "R2", impact: 8 },
      ],
    });
    const dots = out.match(/<circle [^>]*fill="#ef4444"/g) ?? [];
    expect(dots.length).toBe(2);
    expect(out).toContain(">1</text>");
    expect(out).toContain(">2</text>");
  });

  it("caps rendered risks at 8 (slice) — extra risks are dropped silently", () => {
    // The heat-map has 25 cells so more than ~8 risks becomes visually
    // unreadable. `.slice(0, 8)` is the display cap.
    const risks = Array.from({ length: 12 }, (_, i) => ({
      label: `risk ${i}`,
      impact: (i % 5) * 4,
    }));
    const out = renderHeatMapSVG({ risks });
    const dots = out.match(/<circle [^>]*fill="#ef4444"/g) ?? [];
    expect(dots.length).toBe(8);
  });

  it("clamps impact bucketing so an impact > 16 maps to the rightmost column (col=4)", () => {
    // With one risk at impact=999 the bucketing is Math.floor(999/4)=249 → clamped to 4.
    // Column 4's centre-x is pad + 4*cellW + cellW/2 where pad=60, cellW=(500-120)/5=76.
    // → cx = 60 + 4*76 + 38 = 60 + 304 + 38 = 402
    const out = renderHeatMapSVG({ risks: [{ label: "big", impact: 999 }] });
    expect(out).toMatch(/<circle cx="402"/);
  });

  it("does not throw on an empty risks array (renders grid + labels only, no dots)", () => {
    const out = renderHeatMapSVG({ risks: [] });
    const dots = out.match(/<circle [^>]*fill="#ef4444"/g) ?? [];
    expect(dots.length).toBe(0);
    expect(out).toContain(">Very Low</text>");
  });
});
