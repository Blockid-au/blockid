// Chart Generator — Server-side chart/visual rendering for report exports.
//
// Generates chart specifications that can be rendered as:
// 1. Inline SVG for web display
// 2. PNG images for DOCX/PDF embedding
//
// Uses simple SVG generation (no external rendering dependencies in Phase A).
// Phase E will add resvg-js for SVG→PNG conversion.

import type { VisualSpec, ChartType, AgentRole, ReportContext } from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERIA } from "@/lib/evaluation-criteria";

// ── Chart Definitions per Section ───────────────────────────────────────────

interface ChartTemplate {
  sectionId: string;
  type: ChartType;
  title: string;
  agentId: AgentRole;
  builder: (context: ReportContext) => Record<string, unknown> | null;
}

const CHART_TEMPLATES: ChartTemplate[] = [
  {
    sectionId: "executive",
    type: "radar",
    title: "SVI Dimension Radar",
    agentId: "cdo",
    builder: (ctx) => {
      const subs = ctx.sviAnalysis.subs;
      if (!subs.length) return null;
      return {
        labels: subs.map((s: { label: string }) => s.label),
        values: subs.map((s: { value: number }) => s.value),
        max: 100,
      };
    },
  },
  {
    sectionId: "market",
    type: "funnel",
    title: "TAM / SAM / SOM",
    agentId: "cmo",
    builder: (ctx) => {
      const marketResult = ctx.criterionResults.get("market");
      if (!marketResult) return null;
      return {
        levels: ["TAM", "SAM", "SOM"],
        description: "Market sizing funnel",
        dataSource: marketResult.dataPoints,
      };
    },
  },
  {
    sectionId: "revenue",
    type: "bar",
    title: "Revenue Projection (3 Scenarios)",
    agentId: "cfo",
    builder: (ctx) => {
      const revenueResult = ctx.criterionResults.get("revenue");
      if (!revenueResult) return null;
      return {
        scenarios: ["Bear", "Base", "Bull"],
        description: "12-month revenue projection",
        dataSource: revenueResult.dataPoints,
      };
    },
  },
  {
    sectionId: "org",
    type: "org_chart",
    title: "Team Structure",
    agentId: "chro",
    builder: (ctx) => {
      const teamResult = ctx.criterionResults.get("team_structure");
      if (!teamResult) return null;
      return {
        description: "Current organizational structure",
        dataSource: teamResult.dataPoints,
      };
    },
  },
  {
    sectionId: "roadmap",
    type: "timeline",
    title: "Product Roadmap Timeline",
    agentId: "cpo",
    builder: (ctx) => {
      const roadmapResult = ctx.criterionResults.get("roadmap");
      if (!roadmapResult) return null;
      return {
        description: "12-month product roadmap",
        milestones: roadmapResult.nextSteps,
      };
    },
  },
  {
    sectionId: "customers",
    type: "line",
    title: "Growth Trajectory",
    agentId: "cro",
    builder: (ctx) => {
      const customerResult = ctx.criterionResults.get("customer_size");
      if (!customerResult) return null;
      return {
        description: "Customer growth trend",
        dataSource: customerResult.dataPoints,
      };
    },
  },
  {
    sectionId: "risk",
    type: "heat_map",
    title: "Risk Heat Map",
    agentId: "clo",
    builder: (ctx) => {
      const risks = ctx.sviAnalysis.riskPenalties;
      if (!risks.length) return null;
      return {
        risks: risks.map((r: { label: string; points: number; reason?: string }) => ({
          label: r.label,
          impact: r.points,
          reason: r.reason,
        })),
      };
    },
  },
  {
    sectionId: "code",
    type: "progress",
    title: "Technical Maturity Dashboard",
    agentId: "cto",
    builder: (ctx) => {
      const codeResult = ctx.criterionResults.get("code_git");
      if (!codeResult) return null;
      return {
        score: codeResult.score,
        confidence: codeResult.confidence,
        description: "Code quality and technical maturity",
      };
    },
  },
];

// ── Generate Charts for Report ──────────────────────────────────────────────

export function generateCharts(context: ReportContext): VisualSpec[] {
  const charts: VisualSpec[] = [];

  for (const template of CHART_TEMPLATES) {
    const data = template.builder(context);
    if (!data) continue;

    charts.push({
      type: template.type,
      title: template.title,
      data,
      placement: template.type === "radar" ? "full_page" : "inline",
      agentId: template.agentId,
    });
  }

  return charts;
}

// ── SVG Renderers (simple server-side SVG generation) ───────────────────────

export function renderRadarSVG(data: {
  labels: string[];
  values: number[];
  max: number;
}): string {
  const { labels, values, max } = data;
  const n = labels.length;
  const cx = 200, cy = 200, r = 150;
  const angleStep = (2 * Math.PI) / n;

  // Grid lines
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPaths = gridLevels.map((level) => {
    const points = Array.from({ length: n }, (_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + r * level * Math.cos(angle);
      const y = cy + r * level * Math.sin(angle);
      return `${x},${y}`;
    });
    return `<polygon points="${points.join(" ")}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
  });

  // Axis lines
  const axisLines = Array.from({ length: n }, (_, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  });

  // Data polygon
  const dataPoints = values.map((v, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const ratio = Math.min(v / max, 1);
    const x = cx + r * ratio * Math.cos(angle);
    const y = cy + r * ratio * Math.sin(angle);
    return `${x},${y}`;
  });

  // Labels
  const labelElements = labels.map((label, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + (r + 25) * Math.cos(angle);
    const y = cy + (r + 25) * Math.sin(angle);
    const anchor = Math.abs(x - cx) < 5 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" font-family="Arial" fill="#374151">${label}</text>`;
  });

  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  ${gridPaths.join("\n  ")}
  ${axisLines.join("\n  ")}
  <polygon points="${dataPoints.join(" ")}" fill="rgba(37,99,235,0.2)" stroke="#2563eb" stroke-width="2"/>
  ${labelElements.join("\n  ")}
</svg>`;
}

export function renderBarSVG(data: {
  labels: string[];
  values: number[];
  max: number;
  colors?: string[];
}): string {
  const { labels, values, max } = data;
  const colors = data.colors ?? ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const w = 500, h = 300, pad = 60;
  const barW = (w - pad * 2) / labels.length - 10;

  const bars = labels.map((label, i) => {
    const barH = ((values[i] ?? 0) / max) * (h - pad * 2);
    const x = pad + i * (barW + 10);
    const y = h - pad - barH;
    const color = colors[i % colors.length];
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="4"/>
    <text x="${x + barW / 2}" y="${h - pad + 16}" text-anchor="middle" font-size="11" font-family="Arial" fill="#374151">${label}</text>
    <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="10" font-family="Arial" fill="#374151">${values[i]}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#e5e7eb" stroke-width="1"/>
  ${bars.join("\n  ")}
</svg>`;
}

// ── Get chart for a specific section ────────────────────────────────────────

export function getChartForSection(sectionId: string, context: ReportContext): VisualSpec | null {
  const template = CHART_TEMPLATES.find((t) => t.sectionId === sectionId);
  if (!template) return null;

  const data = template.builder(context);
  if (!data) return null;

  return {
    type: template.type,
    title: template.title,
    data,
    placement: "inline",
    agentId: template.agentId,
  };
}
