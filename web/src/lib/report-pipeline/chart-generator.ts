// Chart Generator — Server-side chart/visual rendering for report exports.
//
// Three rendering tiers (ưu tiên AI image trước):
//   1. AI Image Generation — Gemini/OpenRouter/DALL-E for infographics
//   2. Mermaid Diagrams — org charts, timelines, flowcharts (local, free)
//   3. Built-in SVG — radar, bar, funnel, progress charts (local, free)
//
// The pipeline tries AI images first, falls back to Mermaid/SVG.

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

// ── AI-Enhanced Chart Generation ────────────────────────────────────────────
// Generates both AI infographics AND SVG fallback charts for each section.
// Priority: AI image → Mermaid → SVG (always generates SVG as fallback).

export interface EnhancedChartResult {
  sectionId: string;
  /** AI-generated image (infographic/diagram) — may be null if AI unavailable */
  aiImage?: {
    base64: string;
    mimeType: string;
    provider: string;
    model: string;
  };
  /** SVG fallback chart (always generated) */
  svgChart?: string;
  /** Mermaid diagram SVG (for org charts, timelines, flows) */
  mermaidSvg?: string;
}

/**
 * Generate enhanced visuals for all report sections.
 * Ưu tiên: AI image (Gemini/OpenRouter) → Mermaid → SVG charts.
 */
export async function generateEnhancedCharts(
  context: ReportContext,
  sectionIds: string[],
): Promise<Map<string, EnhancedChartResult>> {
  const results = new Map<string, EnhancedChartResult>();

  // Lazy import to avoid "server-only" issues in non-server contexts
  let generateSectionImage: typeof import("@/lib/ai-image-client").generateSectionImage | null = null;
  try {
    const mod = await import("@/lib/ai-image-client");
    generateSectionImage = mod.generateSectionImage;
  } catch {
    // ai-image-client not available — continue with SVG only
  }

  for (const sectionId of sectionIds) {
    const result: EnhancedChartResult = { sectionId };

    // 1. Always generate SVG chart as fallback
    const svgChart = getChartForSection(sectionId, context);
    if (svgChart) {
      const data = svgChart.data as Record<string, unknown>;
      if (svgChart.type === "radar" && data.labels && data.values) {
        result.svgChart = renderRadarSVG(data as { labels: string[]; values: number[]; max: number });
      } else if (svgChart.type === "bar" && data.labels && data.values) {
        result.svgChart = renderBarSVG(data as { labels: string[]; values: number[]; max: number });
      }
    }

    // 2. Try AI image generation (ưu tiên)
    if (generateSectionImage) {
      try {
        const milestones = context.criterionResults.get("roadmap")?.nextSteps ?? [];
        const roles = Object.keys(
          context.criterionResults.get("team_structure")?.dataPoints ?? {},
        );
        const actionSteps = context.criterionResults.get("roadmap")?.nextSteps
          ?? [...context.criterionResults.values()].flatMap((r) => r.nextSteps).slice(0, 6);

        const imageResult = await generateSectionImage(sectionId, {
          startupName: context.startupName,
          sviScore: context.sviAnalysis.totalSVI,
          stage: context.sviAnalysis.stageLabel,
          milestones,
          roles,
          actionSteps,
        });

        if (imageResult) {
          result.aiImage = {
            base64: imageResult.base64,
            mimeType: imageResult.mimeType,
            provider: imageResult.provider,
            model: imageResult.model,
          };
          // If Mermaid was used, also store as mermaidSvg
          if (imageResult.provider === "mermaid") {
            result.mermaidSvg = Buffer.from(imageResult.base64, "base64").toString("utf-8");
          }
        }
      } catch (err) {
        console.warn(`[chart-gen] AI image failed for ${sectionId}:`, err);
      }
    }

    results.set(sectionId, result);
  }

  return results;
}

// ── Render funnel SVG ───────────────────────────────────────────────────────

export function renderFunnelSVG(data: {
  levels: string[];
  values?: number[];
}): string {
  const { levels } = data;
  const w = 500, h = 300;
  const colors = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];

  const funnelParts = levels.map((label, i) => {
    const topWidth = w - (i * 80);
    const bottomWidth = w - ((i + 1) * 80);
    const topX = (w - topWidth) / 2;
    const bottomX = (w - bottomWidth) / 2;
    const y = 40 + i * 70;
    const color = colors[i % colors.length];

    return `<polygon points="${topX},${y} ${topX + topWidth},${y} ${bottomX + bottomWidth},${y + 60} ${bottomX},${y + 60}" fill="${color}" opacity="0.85"/>
    <text x="${w / 2}" y="${y + 35}" text-anchor="middle" font-size="13" font-family="Arial" fill="white" font-weight="bold">${label}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${funnelParts.join("\n  ")}
</svg>`;
}

// ── Render progress gauge SVG ───────────────────────────────────────────────

export function renderProgressSVG(data: {
  score: number;
  label?: string;
  maxScore?: number;
}): string {
  const { score, label, maxScore = 100 } = data;
  const ratio = Math.min(score / maxScore, 1);
  const w = 200, h = 200;
  const r = 80;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - ratio);
  const color = ratio >= 0.7 ? "#10b981" : ratio >= 0.5 ? "#2563eb" : ratio >= 0.35 ? "#f59e0b" : "#ef4444";

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${w / 2}" cy="${w / 2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12"/>
  <circle cx="${w / 2}" cy="${w / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
    transform="rotate(-90 ${w / 2} ${w / 2})"/>
  <text x="${w / 2}" y="${w / 2 + 8}" text-anchor="middle" font-size="28" font-family="Arial" fill="#111827" font-weight="bold">${score}</text>
  ${label ? `<text x="${w / 2}" y="${w / 2 + 28}" text-anchor="middle" font-size="11" font-family="Arial" fill="#6b7280">${label}</text>` : ""}
</svg>`;
}

// ── Render heat map SVG ─────────────────────────────────────────────────────

export function renderHeatMapSVG(data: {
  risks: Array<{ label: string; impact: number }>;
}): string {
  const { risks } = data;
  const w = 500, h = 350, pad = 60;
  const cellW = (w - pad * 2) / 5;
  const cellH = (h - pad * 2) / 5;

  // Grid
  const gridCells: string[] = [];
  const impactLabels = ["Very Low", "Low", "Medium", "High", "Critical"];
  const colors = ["#dcfce7", "#bbf7d0", "#fef9c3", "#fed7aa", "#fecaca"];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = pad + col * cellW;
      const y = pad + (4 - row) * cellH;
      const colorIdx = Math.min(row + col, 4);
      gridCells.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${colors[colorIdx]}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    }
  }

  // Place risks on the map
  const riskDots = risks.slice(0, 8).map((risk, i) => {
    const col = Math.min(Math.floor(risk.impact / 4), 4);
    const row = Math.min(2 + Math.floor(i / 3), 4);
    const x = pad + col * cellW + cellW / 2;
    const y = pad + (4 - row) * cellH + cellH / 2;
    return `<circle cx="${x}" cy="${y}" r="8" fill="#ef4444" opacity="0.8"/>
    <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="8" font-family="Arial" fill="white">${i + 1}</text>`;
  });

  // Labels
  const xLabels = impactLabels.map((label, i) =>
    `<text x="${pad + i * cellW + cellW / 2}" y="${h - 20}" text-anchor="middle" font-size="9" font-family="Arial" fill="#6b7280">${label}</text>`,
  );

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <text x="${w / 2}" y="20" text-anchor="middle" font-size="13" font-family="Arial" fill="#111827" font-weight="bold">Risk Heat Map</text>
  <text x="${w / 2}" y="${h - 5}" text-anchor="middle" font-size="10" font-family="Arial" fill="#6b7280">Impact →</text>
  <text x="15" y="${h / 2}" text-anchor="middle" font-size="10" font-family="Arial" fill="#6b7280" transform="rotate(-90 15 ${h / 2})">Likelihood →</text>
  ${gridCells.join("\n  ")}
  ${riskDots.join("\n  ")}
  ${xLabels.join("\n  ")}
</svg>`;
}
