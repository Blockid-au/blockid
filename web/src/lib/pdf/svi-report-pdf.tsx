import {
  Document, Page, Text, View, Image, StyleSheet,
  Svg, Path, Circle, Rect, Line, Polygon,
} from "@react-pdf/renderer";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS, SVI_BENCHMARKS } from "@/lib/svi-analysis";
import { estimateValuation, formatAUD } from "@/lib/valuation";
import * as path from "path";
import * as fs from "fs";

/* Report template version — SCN = Startup Navigation System narrative
 * (Validation → Position → Value → Direction → Capital). Native vector
 * infographics render from analysis data so charts always appear, even when
 * upstream AI image generation is unavailable. */
const REPORT_TEMPLATE_VERSION = "SCN 3.0";

// Load logo as base64 data URI for PDF embedding
const LOGO_PATH = path.join(process.cwd(), "public", "images", "logo-transparent.png");
const LOGO_SRC = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`
  : null;

/* ─── Brand Palette ─────────────────────────────────────────────────────── */
const C = {
  brand700: "#1d4ed8",
  brand600: "#2563eb",
  brand500: "#3b82f6",
  brand100: "#dbeafe",
  brand50: "#eff6ff",
  ink900: "#0f172a",
  ink800: "#1e293b",
  ink700: "#334155",
  ink600: "#475569",
  ink500: "#64748b",
  ink400: "#94a3b8",
  ink300: "#cbd5e1",
  surface200: "#e2e8f0",
  surface100: "#f1f5f9",
  surface50: "#f8fafc",
  emerald600: "#059669",
  emerald500: "#10b981",
  emerald100: "#d1fae5",
  emerald50: "#ecfdf5",
  amber600: "#d97706",
  amber500: "#f59e0b",
  amber100: "#fef3c7",
  red600: "#dc2626",
  red500: "#ef4444",
  red100: "#fee2e2",
  teal600: "#0d9488",
  white: "#ffffff",
};

/* ─── Dimension metadata ────────────────────────────────────────────────── */
const DIM_LABELS: Record<string, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

const DIM_WEIGHTS: Record<string, string> = {
  ftv: "15%",
  mpc: "18%",
  ptd: "12%",
  tre: "20%",
  cgh: "12%",
  iri: "10%",
  lco: "8%",
  svm: "5%",
};

/* ─── Consulting-style section title map ────────────────────────────────── */
const SECTION_TITLES: Record<string, string> = {
  "founder": "Founding Team & Leadership Capability",
  "ftv": "Founding Team & Leadership Capability",
  "market": "Market Opportunity & Growth Potential",
  "mpc": "Market Opportunity & Growth Potential",
  "product": "Product & Technical Architecture",
  "ptd": "Product & Technical Architecture",
  "traction": "Traction, Revenue & Growth Metrics",
  "tre": "Traction, Revenue & Growth Metrics",
  "gtm": "Go-to-Market Strategy & Distribution",
  "cap": "Equity Structure & Corporate Governance",
  "cgh": "Equity Structure & Corporate Governance",
  "investor": "Investor Readiness & Fundraise Positioning",
  "iri": "Investor Readiness & Fundraise Positioning",
  "legal": "Legal Framework & Compliance Posture",
  "lco": "Legal Framework & Compliance Posture",
  "vision": "Strategic Vision & Competitive Moat",
  "svm": "Strategic Vision & Competitive Moat",
  "financial": "Financial Projections & Unit Economics",
  "risk": "Risk Landscape & Mitigation Strategies",
};

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink800,
    backgroundColor: C.white,
  },

  /* Header bar — fixed thin blue line at top */
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: C.brand600,
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 20,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
    paddingTop: 6,
  },
  footerText: { fontSize: 6.5, color: C.ink400 },
  footerBrand: { fontSize: 7, color: C.brand600, fontFamily: "Helvetica-Bold" },

  /* Typography */
  h1: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 4,
  },
  h1Sub: {
    fontSize: 9,
    color: C.ink500,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.ink800,
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink700,
    marginTop: 8,
    marginBottom: 4,
  },
  body: {
    fontSize: 9,
    color: C.ink600,
    lineHeight: 1.65,
    marginBottom: 8,
  },
  label: {
    fontSize: 7,
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  bigNum: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: C.brand600,
  },

  /* Score bar */
  barOuter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.surface200,
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },

  /* Metric cards */
  metricCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.surface50,
    alignItems: "center",
  },

  /* Insight callout box */
  insightBox: {
    backgroundColor: C.brand600,
    borderRadius: 8,
    padding: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  insightText: {
    fontSize: 9,
    color: C.white,
    lineHeight: 1.6,
  },
  insightLabel: {
    fontSize: 7,
    color: C.brand100,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },

  /* Action items */
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  actionNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.brand600,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },
  actionNumText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  /* Risk card */
  riskCard: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: C.surface50,
  },

  /* Section number badge */
  sectionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  sectionBadgeText: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.brand600,
  },
});

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function barColor(score: number): string {
  if (score >= 70) return C.emerald600;
  if (score >= 50) return C.brand600;
  if (score >= 35) return C.amber600;
  return C.red600;
}

function sviLabel(svi: number): string {
  if (svi >= 300) return "Exceptional";
  if (svi >= 200) return "Elite";
  if (svi >= 170) return "Outstanding";
  if (svi >= 140) return "Strong";
  if (svi >= 120) return "Above Average";
  if (svi >= 100) return "Average";
  if (svi >= 80) return "Below Average";
  return "Early Stage";
}

function riskSeverity(points: number): string {
  if (points >= 12) return "CRITICAL";
  if (points >= 8) return "HIGH";
  if (points >= 5) return "MEDIUM";
  return "LOW";
}

function riskBorderColor(points: number): string {
  if (points >= 12) return C.red600;
  if (points >= 8) return C.red500;
  if (points >= 5) return C.amber600;
  return C.ink300;
}

function scoreColor(score: number): string {
  if (score >= 70) return C.emerald600;
  if (score >= 50) return C.brand600;
  if (score >= 35) return C.amber600;
  return C.red600;
}

function findSub(analysis: SVIAnalysis, key: string) {
  return analysis.subs.find((sub) => sub.key === key);
}

function getSectionTitle(id: string): string {
  const lower = id.toLowerCase();
  for (const [key, title] of Object.entries(SECTION_TITLES)) {
    if (lower.includes(key)) return title;
  }
  return id;
}

/* ─── Shared Components ─────────────────────────────────────────────────── */

function HeaderBar() {
  return <View style={s.headerBar} fixed />;
}

function Footer({ disclaimer }: { disclaimer?: boolean }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Confidential</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {LOGO_SRC && <Image src={LOGO_SRC} style={{ width: 56, height: 13 }} />}
        {!LOGO_SRC && <Text style={s.footerBrand}>BlockID.au</Text>}
      </View>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ height: 2, width: 40, backgroundColor: C.brand600, marginBottom: 10 }} />
      <Text style={s.h1}>{title}</Text>
      {subtitle && <Text style={s.h1Sub}>{subtitle}</Text>}
    </View>
  );
}

function SectionNumberBadge({ num }: { num: string }) {
  return (
    <View style={s.sectionBadge}>
      <Text style={s.sectionBadgeText}>{num}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <View style={s.metricCard}>
      <Text style={s.label}>{label}</Text>
      <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: color || C.brand600, marginTop: 2 }}>
        {value}
      </Text>
      {sub && <Text style={{ fontSize: 7, color: C.ink500, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

function ScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const color = scoreColor(score);
  const borderW = size * 0.08;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: borderW,
        borderColor: C.surface200,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Colored arc — simulated with partial border */}
      <View
        style={{
          position: "absolute",
          top: -borderW,
          left: -borderW,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: borderW,
          borderColor: "transparent",
          borderTopColor: color,
          borderRightColor: score > 25 ? color : "transparent",
          borderBottomColor: score > 50 ? color : "transparent",
          borderLeftColor: score > 75 ? color : "transparent",
        }}
      />
      <Text style={{ fontSize: size * 0.32, fontFamily: "Helvetica-Bold", color }}>
        {Math.round(score)}
      </Text>
    </View>
  );
}

function InsightBox({ text, label }: { text: string; label?: string }) {
  return (
    <View style={s.insightBox}>
      <Text style={s.insightLabel}>{label || "KEY INSIGHT"}</Text>
      <Text style={s.insightText}>{text}</Text>
    </View>
  );
}

function ActionItem({ num, text, detail }: { num: number; text: string; detail?: string }) {
  return (
    <View style={s.actionRow}>
      <View style={s.actionNum}>
        <Text style={s.actionNumText}>{num}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{text}</Text>
        {detail && (
          <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 2 }}>{detail}</Text>
        )}
      </View>
    </View>
  );
}

function DimensionBar({
  label,
  score,
  weight,
  insight,
}: {
  label: string;
  score: number;
  weight: string;
  insight?: string;
}) {
  const rounded = Math.round(score);
  const color = barColor(score);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, color: C.ink700, fontFamily: "Helvetica-Bold" }}>
            {label}
          </Text>
          <Text style={{ fontSize: 7, color: C.ink400 }}>({weight})</Text>
        </View>
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color }}>{rounded}/100</Text>
      </View>
      <View style={s.barOuter}>
        <View style={[s.barFill, { width: `${rounded}%`, backgroundColor: color }]} />
      </View>
      {insight && (
        <Text style={{ fontSize: 7.5, color: C.ink500, marginTop: 2, lineHeight: 1.4 }}>{insight}</Text>
      )}
    </View>
  );
}

function Bullet({ text, color }: { text: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4 }}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: color || C.emerald600,
          marginRight: 8,
          marginTop: 3,
        }}
      />
      <Text style={{ flex: 1, fontSize: 8.5, color: C.ink600, lineHeight: 1.5 }}>{text}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  NATIVE VECTOR INFOGRAPHICS  (always render from analysis data)
 *  Drawn with @react-pdf SVG primitives so charts never depend on upstream
 *  AI image generation — guarantees every report ships with visuals.
 * ═══════════════════════════════════════════════════════════════════════════ */

function clampN(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* SCN stage banner — the navigation spine of the whole report. */
const SCN_COLORS = [C.teal600, C.brand600, C.emerald600, C.amber600, C.brand700];
function ScnBanner({
  index,
  label,
  question,
  color,
}: {
  index: string;
  label: string;
  question: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.white }}>{index}</Text>
      </View>
      <View>
        <Text style={{ fontSize: 6.5, letterSpacing: 2, color: C.ink400, textTransform: "uppercase" }}>
          SCN · Startup Navigation System
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900 }}>
          {label} <Text style={{ color: C.ink400, fontFamily: "Helvetica", fontSize: 11 }}>— {question}</Text>
        </Text>
      </View>
    </View>
  );
}

/* 8-axis radar / spider chart of the SVI dimensions. */
function RadarChartSVG({ subs, size = 230 }: { subs: SVIAnalysis["subs"]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.34;
  const n = Math.max(subs.length, 3);
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, frac: number): [number, number] => [
    cx + Math.cos(ang(i)) * R * frac,
    cy + Math.sin(ang(i)) * R * frac,
  ];
  const fmt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const rings = [0.25, 0.5, 0.75, 1];
  const dataPts = subs.map((sub, i) => pt(i, clampN(sub.value, 3, 100) / 100));
  return (
    <Svg width={size} height={size}>
      {rings.map((r, ri) => (
        <Polygon
          key={`ring-${ri}`}
          points={subs.map((_, i) => fmt(pt(i, r))).join(" ")}
          fill="none"
          stroke={C.surface200}
          strokeWidth={0.7}
        />
      ))}
      {subs.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <Line key={`axis-${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={C.surface200} strokeWidth={0.6} />;
      })}
      <Polygon
        points={dataPts.map(fmt).join(" ")}
        fill={C.brand500}
        fillOpacity={0.25}
        stroke={C.brand600}
        strokeWidth={1.5}
      />
      {dataPts.map(([x, y], i) => (
        <Circle key={`dot-${i}`} cx={x} cy={y} r={1.9} fill={C.brand700} />
      ))}
      {subs.map((sub, i) => {
        const [lx, ly] = pt(i, 1.17);
        return (
          <Text key={`lbl-${i}`} x={lx} y={ly + 2} fill={C.ink500} style={{ fontSize: 6.5 }} textAnchor="middle">
            {sub.key.toUpperCase()}
          </Text>
        );
      })}
    </Svg>
  );
}

/* Percentile-position band — where you sit vs AU peers at your stage. */
function PercentileBandSVG({ percentile, width = 460, height = 34 }: { percentile: number; width?: number; height?: number }) {
  const pct = clampN(percentile, 2, 98);
  const x0 = 6;
  const x1 = width - 6;
  const trackW = x1 - x0;
  const y = 14;
  const h = 9;
  const markerX = x0 + (pct / 100) * trackW;
  const segs = [
    { from: 0, to: 25, color: C.red100 },
    { from: 25, to: 50, color: C.amber100 },
    { from: 50, to: 75, color: C.brand100 },
    { from: 75, to: 100, color: C.emerald100 },
  ];
  return (
    <Svg width={width} height={height}>
      {segs.map((seg, i) => (
        <Rect
          key={`seg-${i}`}
          x={x0 + (seg.from / 100) * trackW}
          y={y}
          width={((seg.to - seg.from) / 100) * trackW}
          height={h}
          fill={seg.color}
        />
      ))}
      <Line x1={markerX} y1={y - 6} x2={markerX} y2={y + h + 6} stroke={C.ink900} strokeWidth={1.5} />
      <Polygon
        points={`${markerX - 4},${y - 6} ${markerX + 4},${y - 6} ${markerX},${y - 1}`}
        fill={C.brand700}
      />
      <Circle cx={markerX} cy={y + h + 5} r={2} fill={C.brand700} />
    </Svg>
  );
}

/* Indicative valuation range bar (low → mid → high), AUD. */
function ValuationRangeSVG({ low, mid, high, width = 460, height = 30 }: { low: number; mid: number; high: number; width?: number; height?: number }) {
  const x0 = 6;
  const x1 = width - 6;
  const trackW = x1 - x0;
  const y = 12;
  const h = 8;
  const frac = high > low ? clampN((mid - low) / (high - low), 0.05, 0.95) : 0.5;
  const midX = x0 + frac * trackW;
  return (
    <Svg width={width} height={height}>
      <Rect x={x0} y={y} width={trackW} height={h} rx={4} fill={C.surface200} />
      <Rect x={x0} y={y} width={midX - x0} height={h} rx={4} fill={C.brand500} />
      <Circle cx={x0} cy={y + h / 2} r={3} fill={C.ink400} />
      <Circle cx={x1} cy={y + h / 2} r={3} fill={C.ink400} />
      <Circle cx={midX} cy={y + h / 2} r={6} fill={C.brand700} />
      <Circle cx={midX} cy={y + h / 2} r={2.4} fill={C.white} />
    </Svg>
  );
}

/* Google-Maps-style route — "You are here → Next → Then → Then". */
function RouteMapSVG({ count, width = 500, height = 64 }: { count: number; width?: number; height?: number }) {
  const stops = clampN(count, 2, 4);
  const y = 36;
  const xs: number[] = [];
  for (let i = 0; i < stops; i++) xs.push(22 + (i * (width - 44)) / (stops - 1));
  let d = `M ${xs[0]} ${y}`;
  for (let i = 1; i < stops; i++) {
    const mx = (xs[i - 1] + xs[i]) / 2;
    const cyc = i % 2 ? y - 16 : y + 16;
    d += ` Q ${mx.toFixed(1)} ${cyc} ${xs[i].toFixed(1)} ${y}`;
  }
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={C.surface200} strokeWidth={10} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={C.brand500} strokeWidth={1.6} strokeDasharray="2 4" fill="none" />
      {xs.map((x, i) => (
        <Circle
          key={`stop-${i}`}
          cx={x}
          cy={y}
          r={i === 0 ? 9 : 7}
          fill={i === 0 ? C.brand700 : C.white}
          stroke={C.brand600}
          strokeWidth={1.5}
        />
      ))}
      {xs.map((x, i) => (
        <Text key={`num-${i}`} x={x} y={y + 3} fill={i === 0 ? C.white : C.brand700} style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }} textAnchor="middle">
          {i === 0 ? "X" : String(i)}
        </Text>
      ))}
    </Svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN DOCUMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

interface SVIReportPDFProps {
  analysis: SVIAnalysis;
  startupName?: string;
  email?: string;
  tier?: "preview" | "standard" | "premium" | "deep_dive" | "modular";
  reportDate?: string;
  sections?: Array<{
    id: string;
    title: string;
    content: string;
    score?: number;
    keyInsight?: string;
    actions?: string[];
  }>;
  charts?: Map<string, string>;
}

export function SVIReportPDF({
  analysis,
  startupName,
  email,
  tier = "standard",
  reportDate,
  sections,
  charts,
}: SVIReportPDFProps) {
  const isPaid = tier === "premium" || tier === "deep_dive";
  const date =
    reportDate ||
    new Date().toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const name = startupName || "Startup";
  const sviScore = analysis.totalSVI;
  const confidence = Math.round(analysis.confidenceMultiplier * 100);
  const riskCount = analysis.riskPenalties.length;
  const totalRiskPts = analysis.riskPenalties.reduce((sum, r) => sum + r.points, 0);

  const topStrengths = [...analysis.subs]
    .filter((sub) => sub.value >= 60)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  const topWeaknesses = [...analysis.subs]
    .filter((sub) => sub.value < 50)
    .sort((a, b) => a.value - b.value)
    .slice(0, 4);

  const p0Gaps = analysis.evidenceGaps.filter((g) => g.priority === "P0");
  const p1Gaps = analysis.evidenceGaps.filter((g) => g.priority === "P1");

  // ── SCN navigation data (Position / Value / Direction) ─────────────────
  const valuation = estimateValuation(sviScore, analysis.stage);
  const percentile = analysis.percentileRank ?? 50;
  const topPercent = Math.max(1, 100 - percentile);
  const weakestSub = [...analysis.subs].sort((a, b) => a.value - b.value)[0];
  const stageBenchmark = SVI_BENCHMARKS[analysis.stage] ?? SVI_BENCHMARKS[0];

  // Direction route — "You are here → Next → Then → Then"
  const directionSteps = (analysis.nextActions && analysis.nextActions.length > 0
    ? analysis.nextActions
    : [...p0Gaps, ...p1Gaps].map((g) => ({
        priority: g.priority,
        title: g.label,
        detail: g.action,
        impact: `+${g.impact} SVI`,
      }))
  ).slice(0, 3);

  // Build section pages from either the sections prop or fallback to dimension data
  const sectionPages = sections && sections.length > 0
    ? sections.slice(0, 6)
    : analysis.subs.slice(0, 6).map((sub) => ({
        id: sub.key,
        title: SECTION_TITLES[sub.key] || DIM_LABELS[sub.key] || sub.label,
        content: sub.rationale,
        score: Math.round(sub.value),
        keyInsight: sub.evidence[0] || undefined,
        actions: sub.gaps.slice(0, 3),
      }));

  // Calculate hook/problem statement from analysis
  const problemStatement = analysis.problemStatementFromFounder
    || `Solving a key problem for ${analysis.targetMarket || "your market"}`
    || `${name} is focused on a specific opportunity in their market`;

  return (
    <Document>
      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 0: HOOK — Problem + Position Hero (opens with first-principles)
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />

        {/* First-principles hook question */}
        <View style={{ marginBottom: 20, backgroundColor: C.brand50, borderRadius: 8, padding: 16, borderLeftWidth: 4, borderLeftColor: C.brand600 }}>
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.brand600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
            First-Principles Question
          </Text>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900, lineHeight: 1.4 }}>
            What problem do you solve, for whom?
          </Text>
        </View>

        {/* Problem statement */}
        <View style={{ marginBottom: 16 }}>
          <Text style={[s.label, { marginBottom: 6 }]}>YOUR PROBLEM</Text>
          <View style={{ backgroundColor: C.surface50, borderRadius: 8, padding: 12, borderWidth: 0.5, borderColor: C.surface200 }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink900, lineHeight: 1.6 }}>
              {problemStatement || `${name} is solving a critical problem in ${analysis.targetMarket || "the startup ecosystem"}.`}
            </Text>
          </View>
        </View>

        {/* THE HERO: Position */}
        <View style={{
          backgroundColor: C.brand700,
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
          alignItems: "center",
          textAlign: "center",
        }}>
          <Text style={{ fontSize: 8, color: C.brand100, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
            Where You Stand Right Now
          </Text>

          {/* Big index score */}
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 32, fontFamily: "Helvetica-Bold", color: C.white }}>
              {sviScore}
            </Text>
            <Text style={{ fontSize: 10, color: C.brand100, marginTop: 2 }}>
              Startup Index Score
            </Text>
          </View>

          {/* Stage + percentile */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 12 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white }}>
                {analysis.stageLabel}
              </Text>
              <Text style={{ fontSize: 7, color: C.brand100, marginTop: 2 }}>Current Stage</Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.brand500 }} />
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.emerald400 }}>
                Top {topPercent}%
              </Text>
              <Text style={{ fontSize: 7, color: C.brand100, marginTop: 2 }}>of AU Startups</Text>
            </View>
          </View>

          <Text style={{ fontSize: 8.5, color: C.brand100, lineHeight: 1.5, textAlign: "center", maxWidth: 280 }}>
            You're ahead of {percentile}% of startups at your stage. This is your starting point.
          </Text>
        </View>

        {/* Top gap (biggest leverage) */}
        <View style={{ marginBottom: 12 }}>
          <Text style={[s.label, { marginBottom: 6 }]}>BIGGEST OPPORTUNITY</Text>
          <View style={{ borderWidth: 0.5, borderColor: C.amber600, borderRadius: 8, padding: 12, backgroundColor: C.amber50 }}>
            <Text style={{ fontSize: 8, color: C.amber700, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
              Immediate Gap
            </Text>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
              {DIM_LABELS[weakestSub?.key] || "Validation"} is your weakest layer
            </Text>
            <Text style={{ fontSize: 8, color: C.ink600, marginTop: 3, lineHeight: 1.4 }}>
              Strengthening this from {Math.round(weakestSub?.value ?? 0)}/100 to {Math.round((weakestSub?.value ?? 0) + 15)} is your highest-leverage move in the next 30 days.
            </Text>
          </View>
        </View>

        {/* CTA to full navigation */}
        <View style={{
          backgroundColor: C.brand600,
          borderRadius: 8,
          padding: 14,
          marginTop: 16,
          alignItems: "center",
        }}>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white, textAlign: "center" }}>
            Continue to your full Startup Navigation Plan
          </Text>
          <Text style={{ fontSize: 7, color: C.brand100, marginTop: 3, textAlign: "center" }}>
            The pages ahead show: Validation → Position → Value → Direction → Capital
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 1: COVER
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 10, color: C.ink800 }}>
        {/* Dark blue header block */}
        <View
          style={{
            backgroundColor: C.brand700,
            height: 260,
            paddingHorizontal: 52,
            paddingTop: 48,
            justifyContent: "flex-end",
            paddingBottom: 32,
          }}
        >
          {/* Logo */}
          <View style={{ position: "absolute", top: 28, left: 52 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {LOGO_SRC && <Image src={LOGO_SRC} style={{ width: 100, height: 23, opacity: 0.9 }} />}
            {!LOGO_SRC && (
              <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white }}>
                BlockID.au
              </Text>
            )}
          </View>

          <Text style={{ fontSize: 10, color: C.brand100, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            STARTUP NAVIGATION REPORT
          </Text>
          <Text style={{ fontSize: 28, fontFamily: "Helvetica-Bold", color: C.white, lineHeight: 1.2 }}>
            {name}
          </Text>
          <Text style={{ fontSize: 8.5, color: C.brand100, marginTop: 8, letterSpacing: 0.5 }}>
            Validation  ·  Position  ·  Value  ·  Direction  ·  Capital
          </Text>
        </View>

        {/* Score area */}
        <View style={{ paddingHorizontal: 52, paddingTop: 36, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 24 }}>
            {/* SVI Score gauge */}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  borderWidth: 6,
                  borderColor: C.surface200,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: -6,
                    left: -6,
                    width: 110,
                    height: 110,
                    borderRadius: 55,
                    borderWidth: 6,
                    borderColor: "transparent",
                    borderTopColor: C.brand600,
                    borderRightColor: sviScore > 75 ? C.brand600 : "transparent",
                    borderBottomColor: sviScore > 150 ? C.brand600 : "transparent",
                    borderLeftColor: sviScore > 225 ? C.brand600 : "transparent",
                  }}
                />
                <Text style={{ fontSize: 36, fontFamily: "Helvetica-Bold", color: C.brand600 }}>
                  {sviScore}
                </Text>
                <Text style={{ fontSize: 8, color: C.ink500, marginTop: -2 }}>SVI SCORE</Text>
              </View>
            </View>

            {/* Score details */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 4 }}>
                {sviLabel(sviScore)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View
                  style={{
                    backgroundColor: C.brand50,
                    borderRadius: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.brand600 }}>
                    Stage {analysis.stage}: {analysis.stageLabel}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: isPaid ? C.emerald50 : C.surface100,
                    borderRadius: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8,
                      fontFamily: "Helvetica-Bold",
                      color: isPaid ? C.emerald600 : C.ink500,
                    }}
                  >
                    {isPaid ? "Premium Report" : tier === "standard" ? "Standard Report" : "Preview Report"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 8, color: C.ink500 }}>
                Generated {date}
              </Text>
              <Text style={{ fontSize: 8, color: C.ink400, marginTop: 2 }}>
                {REPORT_TEMPLATE_VERSION} · SVI v{analysis.version} | Confidence: {confidence}%
              </Text>
              {email && (
                <Text style={{ fontSize: 7, color: C.ink400, marginTop: 4 }}>
                  Confidential — Prepared for {email}
                </Text>
              )}
            </View>
          </View>

          {/* Tagline */}
          <View
            style={{
              marginTop: 32,
              borderTopWidth: 0.5,
              borderTopColor: C.surface200,
              paddingTop: 16,
            }}
          >
            <Text style={{ fontSize: 9, color: C.ink500, textAlign: "center" }}>
              Powered by 11 C-Level AI Agents | Auschain PTY LTD | ACN 659 615 111
            </Text>
          </View>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 2: EXECUTIVE SUMMARY
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <ScnBanner index="01" label="Validation" question="Am I solving the right problem?" color={SCN_COLORS[0]} />

        {/* 4 metric cards */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <MetricCard label="SVI SCORE" value={String(sviScore)} sub={sviLabel(sviScore)} />
          <MetricCard
            label="STAGE"
            value={String(analysis.stage)}
            sub={analysis.stageLabel}
            color={C.ink800}
          />
          <MetricCard
            label="CONFIDENCE"
            value={`${confidence}%`}
            sub={analysis.signals.evidenceLevel.replace(/_/g, " ")}
            color={confidence >= 50 ? C.emerald600 : C.amber600}
          />
          <MetricCard
            label="RISK FLAGS"
            value={String(riskCount)}
            sub={riskCount === 0 ? "No flags" : `-${totalRiskPts} pts`}
            color={riskCount > 3 ? C.red600 : riskCount > 0 ? C.amber600 : C.emerald600}
          />
        </View>

        {/* Summary paragraph */}
        <Text style={[s.body, { fontSize: 9.5, lineHeight: 1.7 }]}>
          {analysis.summary}
        </Text>

        {/* Two columns: Strengths & Gaps */}
        <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
          {/* Key Strengths */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <View style={{ width: 3, height: 14, backgroundColor: C.emerald600, borderRadius: 1 }} />
              <Text style={[s.h3, { marginTop: 0, marginBottom: 0, color: C.emerald600 }]}>
                Key Strengths
              </Text>
            </View>
            {topStrengths.length > 0 ? (
              topStrengths.map((sub) => (
                <Bullet
                  key={sub.key}
                  text={`${DIM_LABELS[sub.key] || sub.label}: ${Math.round(sub.value)}/100${sub.evidence[0] ? ` — ${sub.evidence[0]}` : ""}`}
                  color={C.emerald600}
                />
              ))
            ) : (
              <Text style={{ fontSize: 8, color: C.ink400 }}>Building evidence will reveal strengths</Text>
            )}
          </View>

          {/* Critical Gaps */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <View style={{ width: 3, height: 14, backgroundColor: C.red600, borderRadius: 1 }} />
              <Text style={[s.h3, { marginTop: 0, marginBottom: 0, color: C.red600 }]}>
                Critical Gaps
              </Text>
            </View>
            {topWeaknesses.length > 0 ? (
              topWeaknesses.map((sub) => (
                <Bullet
                  key={sub.key}
                  text={`${DIM_LABELS[sub.key] || sub.label}: ${Math.round(sub.value)}/100${sub.gaps[0] ? ` — ${sub.gaps[0]}` : ""}`}
                  color={C.red600}
                />
              ))
            ) : (
              <Text style={{ fontSize: 8, color: C.ink400 }}>No critical gaps detected</Text>
            )}
          </View>
        </View>

        {/* Value Proposition insight box */}
        <InsightBox
          label="VALUE PROPOSITION"
          text={
            analysis.summary.length > 120
              ? analysis.summary.substring(0, 120) + "..."
              : `${name} scores ${sviScore} on the SVI index as a ${analysis.stageLabel} startup. ${sviLabel(sviScore)} positioning with ${confidence}% evidence confidence.`
          }
        />

        {/* CTA: Continue to Evidence Vault */}
        <View style={{
          backgroundColor: C.brand50,
          borderRadius: 8,
          padding: 12,
          marginTop: 12,
          borderWidth: 1,
          borderColor: C.brand200,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.brand600 }}>→ Continue in Evidence Vault</Text>
          </View>
          <Text style={{ fontSize: 7, color: C.ink500 }}>
            Log in to blockid.au to document your customer interviews, market research, and willingness-to-pay signals. Track validation progress in real-time.
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  SCN 02 — POSITION ("Where am I?")
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <ScnBanner index="02" label="Position" question="Where am I?" color={SCN_COLORS[1]} />

        {/* Index + stage + percentile + value */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <MetricCard label="STARTUP INDEX" value={String(sviScore)} sub={sviLabel(sviScore)} />
          <MetricCard label="STAGE" value={String(analysis.stage)} sub={analysis.stageLabel} color={C.ink800} />
          <MetricCard label="VS AU PEERS" value={`Top ${topPercent}%`} sub={`P${percentile} at stage`} color={C.emerald600} />
          <MetricCard label="EST. VALUE" value={formatAUD(valuation.mid)} sub="indicative" color={C.teal600} />
        </View>

        <Text style={[s.body, { marginBottom: 6 }]}>
          {name} sits at{" "}
          <Text style={{ fontFamily: "Helvetica-Bold", color: C.ink800 }}>{sviScore} on the Startup Index</Text>{" "}
          — {sviLabel(sviScore)} for a {analysis.stageLabel} startup, ahead of roughly {percentile}% of Australian
          startups at the same stage. The estimated value is an output of this position, not the goal.
        </Text>

        {/* Radar + percentile band */}
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4, alignItems: "center" }}>
          <View style={{ width: 220, alignItems: "center" }}>
            <Text style={[s.label, { marginBottom: 2 }]}>YOUR 8-DIMENSION SHAPE</Text>
            <RadarChartSVG subs={analysis.subs} size={210} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { marginBottom: 6 }]}>PERCENTILE vs AU PEERS</Text>
            <PercentileBandSVG percentile={percentile} width={250} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1, width: 250 }}>
              <Text style={{ fontSize: 6.5, color: C.ink400 }}>Bottom</Text>
              <Text style={{ fontSize: 6.5, color: C.ink400 }}>Median</Text>
              <Text style={{ fontSize: 6.5, color: C.ink400 }}>Top</Text>
            </View>
            <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.5, marginTop: 12 }}>
              Benchmark band for {analysis.stageLabel}: median {stageBenchmark.p50}, top-decile{" "}
              {stageBenchmark.p90}. You are at {sviScore}.
            </Text>
          </View>
        </View>

        <InsightBox
          label="WHERE YOU STAND"
          text={`At ${sviScore} you rank in the top ${topPercent}% of ${analysis.stageLabel} startups. Reaching the stage top-decile (${stageBenchmark.p90}) is a matter of closing the gaps set out in Direction.`}
        />

        {/* CTA: SVI Dashboard */}
        <View style={{
          backgroundColor: C.emerald50,
          borderRadius: 8,
          padding: 12,
          marginTop: 12,
          borderWidth: 1,
          borderColor: C.emerald200,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.emerald600 }}>→ Track Position Over Time</Text>
          </View>
          <Text style={{ fontSize: 7, color: C.ink500 }}>
            Log in to SVI Dashboard on blockid.au to see how your score trends as you close gaps. Watch your percentile rank rise as you strengthen each dimension.
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  SCN 03 — VALUE ("What's my startup worth?") + 8-dimension scorecard
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <ScnBanner index="03" label="Value" question="What's my startup worth?" color={SCN_COLORS[2]} />

        {/* Indicative valuation range */}
        <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8, padding: 14, backgroundColor: C.surface50, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
            <Text style={s.label}>INDICATIVE PRE-MONEY VALUATION (AUD)</Text>
            <Text style={{ fontSize: 7, color: C.ink400 }}>{valuation.method} · {Math.round(valuation.confidence * 100)}% conf.</Text>
          </View>
          <Text style={{ fontSize: 24, fontFamily: "Helvetica-Bold", color: C.teal600, marginBottom: 6 }}>
            {formatAUD(valuation.low)} – {formatAUD(valuation.high)}
          </Text>
          <ValuationRangeSVG low={valuation.low} mid={valuation.mid} high={valuation.high} width={250} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1, width: 250 }}>
            <Text style={{ fontSize: 6.5, color: C.ink400 }}>{formatAUD(valuation.low)}</Text>
            <Text style={{ fontSize: 6.5, color: C.brand700, fontFamily: "Helvetica-Bold" }}>{formatAUD(valuation.mid)}</Text>
            <Text style={{ fontSize: 6.5, color: C.ink400 }}>{formatAUD(valuation.high)}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: C.ink500, marginTop: 8, lineHeight: 1.45 }}>
            Triangulated from Berkus, Scorecard and revenue-multiple methods calibrated to 2024–2025 Australian
            market comparables. Indicative only — not a formal valuation under the Corporations Act 2001 (Cth).
          </Text>
        </View>

        <Text style={[s.label, { marginBottom: 8 }]}>8-DIMENSION SCORECARD — WHAT DRIVES THE NUMBER</Text>

        {/* Dimension bars */}
        {analysis.subs.map((sub) => (
          <DimensionBar
            key={sub.key}
            label={`${sub.key.toUpperCase()} — ${DIM_LABELS[sub.key] || sub.label}`}
            score={sub.value}
            weight={DIM_WEIGHTS[sub.key] || ""}
            insight={sub.rationale.length > 100 ? sub.rationale.substring(0, 100) + "..." : sub.rationale}
          />
        ))}

        {/* Visual score grid — 4x2 */}
        <View style={{ marginTop: 10 }}>
          <Text style={[s.label, { marginBottom: 8 }]}>SCORE COMPARISON</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {analysis.subs.map((sub) => {
              const rounded = Math.round(sub.value);
              return (
                <View
                  key={`grid-${sub.key}`}
                  style={{
                    width: "22%",
                    borderWidth: 0.5,
                    borderColor: C.surface200,
                    borderRadius: 6,
                    padding: 8,
                    alignItems: "center",
                    backgroundColor: C.surface50,
                  }}
                >
                  <Text style={{ fontSize: 7, textTransform: "uppercase", color: C.ink500, marginBottom: 4, letterSpacing: 0.5 }}>
                    {sub.key.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: scoreColor(sub.value) }}>
                    {rounded}
                  </Text>
                  <View style={{ width: "100%", height: 4, borderRadius: 2, backgroundColor: C.surface200, marginTop: 4 }}>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        width: `${rounded}%`,
                        backgroundColor: scoreColor(sub.value),
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Chart image if available */}
        {charts?.get("radar") && (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={charts.get("radar")!} style={{ width: 280, height: 200 }} />
          </View>
        )}

        {/* CTA: Valuation Engine */}
        <View style={{
          backgroundColor: C.teal50,
          borderRadius: 8,
          padding: 12,
          marginTop: 12,
          borderWidth: 1,
          borderColor: C.teal200,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.teal600 }}>→ Model Valuation Scenarios</Text>
          </View>
          <Text style={{ fontSize: 7, color: C.ink500 }}>
            Log in to Valuation Engine on blockid.au to run "what-if" scenarios. See how improvements in revenue, user count, or team strength move your valuation up.
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGES 4-9: SECTION PAGES
       * ──────────────────────────────────────────────────────────────────── */}
      {sectionPages.map((section, idx) => {
        const sectionNum = String(idx + 1).padStart(2, "0");
        const sectionScore = section.score ?? 0;
        const title = getSectionTitle(section.id) !== section.id
          ? getSectionTitle(section.id)
          : section.title;
        const chartKey = section.id.toLowerCase();

        return (
          <Page key={`section-${idx}`} size="A4" style={s.page}>
            <HeaderBar />

            {/* Section badge + title */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
              <SectionNumberBadge num={sectionNum} />
              <View style={{ flex: 1 }}>
                <Text style={s.h1}>{title}</Text>
                {section.content && (
                  <Text style={s.h1Sub}>
                    {section.content.length > 120
                      ? section.content.substring(0, 120) + "..."
                      : section.content.substring(0, 120)}
                  </Text>
                )}
              </View>
              {/* Score gauge */}
              <ScoreGauge score={sectionScore} size={56} />
            </View>

            {/* Content area */}
            <Text style={[s.body, { lineHeight: 1.7 }]}>
              {section.content}
            </Text>

            {/* Chart image if available */}
            {charts?.get(chartKey) && (
              <View style={{ marginTop: 8, marginBottom: 8, alignItems: "center" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={charts.get(chartKey)!} style={{ width: 320, height: 160 }} />
              </View>
            )}

            {/* Key Insight callout */}
            {section.keyInsight && (
              <InsightBox text={section.keyInsight} />
            )}

            {/* Recommended Actions */}
            {section.actions && section.actions.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <View style={{ width: 3, height: 14, backgroundColor: C.brand600, borderRadius: 1 }} />
                  <Text style={[s.h3, { marginTop: 0, marginBottom: 0 }]}>Recommended Actions</Text>
                </View>
                {section.actions.map((action, aIdx) => (
                  <ActionItem key={`action-${idx}-${aIdx}`} num={aIdx + 1} text={action} />
                ))}
              </View>
            )}

            <Footer />
          </Page>
        );
      })}

      {/* ────────────────────────────────────────────────────────────────────
       *  SCN 04 — DIRECTION ("What do I do next?") — Google-Maps-style route
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <ScnBanner index="04" label="Direction" question="What do I do next?" color={SCN_COLORS[3]} />

        {/* You are here */}
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: C.surface50, borderWidth: 0.5, borderColor: C.surface200, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand600, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white }}>YOU</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, letterSpacing: 1.2, color: C.ink400, textTransform: "uppercase" }}>You are here</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink900 }}>
              Stage {analysis.stage} · {analysis.stageLabel}
            </Text>
            <Text style={{ fontSize: 8, color: C.ink600, marginTop: 2 }}>
              Weakest layer: {DIM_LABELS[weakestSub?.key] || weakestSub?.label} ({Math.round(weakestSub?.value ?? 0)}/100) —
              the moves below are sequenced from here.
            </Text>
          </View>
        </View>

        {/* Route */}
        <View style={{ alignItems: "center", marginBottom: 4 }}>
          <RouteMapSVG count={directionSteps.length + 1} width={490} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 14 }}>
          <Text style={{ fontSize: 6.5, color: C.ink400 }}>You are here</Text>
          <Text style={{ fontSize: 6.5, color: C.ink400 }}>Next</Text>
          {directionSteps.length > 1 && <Text style={{ fontSize: 6.5, color: C.ink400 }}>Then</Text>}
          {directionSteps.length > 2 && <Text style={{ fontSize: 6.5, color: C.ink400 }}>Then</Text>}
        </View>

        {/* Step cards */}
        {directionSteps.length > 0 ? directionSteps.map((step, i) => {
          const isNext = i === 0;
          const pColor = step.priority === "P0" ? C.red600 : step.priority === "P1" ? C.amber600 : C.ink500;
          return (
            <View
              key={`dir-${i}`}
              style={{
                borderWidth: isNext ? 1 : 0.5,
                borderColor: isNext ? C.brand600 : C.surface200,
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                backgroundColor: isNext ? C.brand50 : C.white,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: isNext ? C.brand600 : C.ink300, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.white }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: isNext ? C.brand600 : C.ink400, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {isNext ? "Next step" : "Then"}
                  </Text>
                  <View style={{ backgroundColor: C.surface100, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: pColor }}>{step.priority}</Text>
                  </View>
                </View>
                {step.impact && <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.teal600 }}>{step.impact}</Text>}
              </View>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink800 }}>{step.title}</Text>
              <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 2 }}>{step.detail}</Text>
            </View>
          );
        }) : (
          <Text style={s.body}>Add evidence on blockid.au to generate your next-best-action route.</Text>
        )}

        <InsightBox label="HOW TO USE THIS" text="Like a map: take one turn at a time. Complete the Next step, upload the evidence on blockid.au, and your position re-computes — revealing the following turn." />

        {/* CTA: Action Plan */}
        <View style={{
          backgroundColor: C.brand50,
          borderRadius: 8,
          padding: 12,
          marginTop: 12,
          borderWidth: 1,
          borderColor: C.brand200,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.brand600 }}>→ Build Your Action Plan</Text>
          </View>
          <Text style={{ fontSize: 7, color: C.ink500 }}>
            Log in to Action Plan on blockid.au. Assign owners to each step, set weekly milestones, and track progress. Your plan updates as your position improves.
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  RISK LANDSCAPE
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <PageTitle title="Risk Landscape" subtitle="Risk Assessment & Mitigation Strategies" />

        {analysis.riskPenalties.length > 0 ? (
          <>
            {/* Risk summary bar */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <MetricCard
                label="TOTAL RISKS"
                value={String(riskCount)}
                color={riskCount > 3 ? C.red600 : C.amber600}
              />
              <MetricCard
                label="TOTAL IMPACT"
                value={`-${totalRiskPts}`}
                sub="SVI points"
                color={C.red600}
              />
              <MetricCard
                label="HIGHEST SEVERITY"
                value={riskSeverity(Math.max(...analysis.riskPenalties.map((r) => r.points)))}
                color={C.red600}
              />
            </View>

            {/* Risk cards */}
            {[...analysis.riskPenalties]
              .sort((a, b) => b.points - a.points)
              .map((risk, i) => (
                <View
                  key={`risk-${i}`}
                  style={[s.riskCard, { borderLeftColor: riskBorderColor(risk.points) }]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                        {risk.label}
                      </Text>
                      <View
                        style={{
                          backgroundColor: risk.points >= 8 ? C.red100 : C.amber100,
                          borderRadius: 3,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 7,
                            fontFamily: "Helvetica-Bold",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: risk.points >= 8 ? C.red600 : C.amber600,
                          }}
                        >
                          {riskSeverity(risk.points)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.red600 }}>
                      -{risk.points} pts
                    </Text>
                  </View>
                  <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.5 }}>
                    {risk.reason}
                  </Text>
                  {/* Impact meter */}
                  <View style={{ marginTop: 6 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: C.surface200 }}>
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          width: `${Math.min((risk.points / 15) * 100, 100)}%`,
                          backgroundColor: riskBorderColor(risk.points),
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))}
          </>
        ) : (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 48,
              borderWidth: 1,
              borderColor: C.emerald100,
              borderRadius: 12,
              backgroundColor: C.emerald50,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.emerald600 }}>
              No Risk Flags Detected
            </Text>
            <Text style={{ fontSize: 9, color: C.ink500, marginTop: 6, textAlign: "center", maxWidth: 300 }}>
              Your startup has no critical risk penalties. Continue building evidence to maintain
              this clean profile.
            </Text>
          </View>
        )}

        {/* Risk chart if available */}
        {charts?.get("risk") && (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={charts.get("risk")!} style={{ width: 320, height: 160 }} />
          </View>
        )}

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 11: 90-DAY GROWTH ROADMAP
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <PageTitle title="Your 90-Day Growth Roadmap" subtitle="Prioritised Action Plan for Measurable Progress" />

        {/* Three columns */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {/* Month 1 */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: C.emerald600,
                borderRadius: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white }}>
                MONTH 1
              </Text>
              <Text style={{ fontSize: 7, color: C.emerald100, marginTop: 1 }}>Quick Wins</Text>
            </View>
            {[...p0Gaps, ...p1Gaps].slice(0, 4).map((gap, i) => (
              <View key={`m1-${i}`} style={{ marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <View
                    style={{
                      backgroundColor: gap.priority === "P0" ? C.red100 : C.amber100,
                      borderRadius: 2,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 6,
                        fontFamily: "Helvetica-Bold",
                        color: gap.priority === "P0" ? C.red600 : C.amber600,
                      }}
                    >
                      {gap.priority}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                  {gap.label}
                </Text>
                <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                  {gap.action}
                </Text>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.teal600, marginTop: 2 }}>
                  +{gap.impact} SVI
                </Text>
              </View>
            ))}
          </View>

          {/* Month 2 */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: C.brand600,
                borderRadius: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white }}>
                MONTH 2
              </Text>
              <Text style={{ fontSize: 7, color: C.brand100, marginTop: 1 }}>Build Foundation</Text>
            </View>
            {analysis.nextActions.slice(0, 4).map((action, i) => (
              <View key={`m2-${i}`} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                  {action.title}
                </Text>
                <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                  {action.detail}
                </Text>
                <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.teal600, marginTop: 2 }}>
                  {action.impact}
                </Text>
              </View>
            ))}
          </View>

          {/* Month 3 */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: C.amber600,
                borderRadius: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white }}>
                MONTH 3
              </Text>
              <Text style={{ fontSize: 7, color: C.amber100, marginTop: 1 }}>Scale & Review</Text>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                Re-analyse on BlockID.au
              </Text>
              <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                Upload new evidence, update your profile with progress, and track your SVI improvement.
              </Text>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                Investor Outreach
              </Text>
              <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                With a stronger SVI, begin targeted outreach to investors matching your stage and sector.
              </Text>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                Board Advisory Meeting
              </Text>
              <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                Review your 90-day progress with advisors and set the next quarter targets.
              </Text>
            </View>
            {analysis.nextActions.length > 4 && (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink800 }}>
                  {analysis.nextActions[4]?.title || "Expand growth channels"}
                </Text>
                <Text style={{ fontSize: 7, color: C.ink600, lineHeight: 1.4, marginTop: 1 }}>
                  {analysis.nextActions[4]?.detail || "Diversify acquisition and build repeatable playbooks."}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Potential improvement */}
        <View
          style={{
            marginTop: 14,
            backgroundColor: C.brand50,
            borderRadius: 8,
            padding: 14,
            borderWidth: 1,
            borderColor: C.brand100,
          }}
        >
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brand600, marginBottom: 3 }}>
            Projected Improvement
          </Text>
          <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.5 }}>
            By completing the Month 1-2 actions, you could improve your SVI by an estimated +
            {analysis.evidenceGaps
              .filter((g) => g.priority === "P0" || g.priority === "P1")
              .reduce((sum, g) => sum + g.impact, 0)}{" "}
            points, moving from {sviLabel(sviScore)} to a stronger positioning for investors and partners.
          </Text>
        </View>

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 12: FINAL PAGE — NEXT STEPS & BRANDING
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <ScnBanner index="05" label="Capital" question="How do I grow faster?" color={SCN_COLORS[4]} />

        {/* Stage journey */}
        <View style={{ marginBottom: 16 }}>
          <Text style={[s.label, { marginBottom: 8 }]}>YOUR STAGE JOURNEY</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {SVI_STAGE_LABELS.map((label, idx) => {
              const isCurrent = idx === analysis.stage;
              const isPast = idx < analysis.stage;
              const bg = isCurrent ? C.brand600 : isPast ? C.emerald600 : C.surface200;
              const textColor = isCurrent || isPast ? C.white : C.ink400;
              return (
                <View key={label} style={{ alignItems: "center", flex: 1 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: bg,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: textColor }}>
                      {idx}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 6,
                      color: isCurrent ? C.brand600 : C.ink500,
                      textAlign: "center",
                      fontFamily: isCurrent ? "Helvetica-Bold" : "Helvetica",
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* CTA: Data Room + Fundraising features */}
        <View style={{
          backgroundColor: C.emerald50,
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: C.emerald200,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.emerald600 }}>→ Get Fundraise-Ready in 30 Days</Text>
          </View>
          <Text style={{ fontSize: 7, color: C.ink500 }}>
            Log in to Data Room on blockid.au. Organize cap table, legal docs, financials, and pitch materials in one secure place. Track your Funding Readiness % as you complete gaps.
          </Text>
        </View>

        {/* CTA box */}
        <View
          style={{
            borderWidth: 1,
            borderColor: C.brand600,
            borderRadius: 10,
            padding: 20,
            backgroundColor: C.brand50,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600, marginBottom: 6 }}>
            Keep Building. We Are Here to Help.
          </Text>
          <Text style={{ fontSize: 9, color: C.ink600, lineHeight: 1.6, marginBottom: 10 }}>
            Your dashboard at blockid.au is ready. Upload evidence as you complete each step
            and watch your score grow. The Evidence Vault, cap table tools, and weekly tracking
            are all included.
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionItem num={1} text="Build your Data Room" detail="Organize cap table, legal docs, pitch deck for investors" />
          </View>
          <ActionItem num={2} text="Create your Pitch Deck" detail="BlockID templates guide you through investor storytelling" />
          <ActionItem num={3} text="Clean your Cap Table" detail="Get investor-ready equity structure and ESOP allocation" />
        </View>

        {!isPaid && (
          <View
            style={{
              backgroundColor: C.amber100,
              borderRadius: 8,
              padding: 14,
              borderWidth: 1,
              borderColor: C.amber600,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.amber600, marginBottom: 3 }}>
              Unlock Your Full Premium Report
            </Text>
            <Text style={{ fontSize: 8.5, color: C.ink600, lineHeight: 1.5 }}>
              This is a {tier === "preview" ? "preview" : "standard"} report. The premium report includes
              unlimited analysis depth, detailed competitor profiles, financial projections,
              and step-by-step guidance tailored to your stage. Visit blockid.au/workspace to upgrade.
            </Text>
          </View>
        )}

        {/* QR code placeholder */}
        {charts?.get("qr") && (
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={charts.get("qr")!} style={{ width: 80, height: 80 }} />
            <Text style={{ fontSize: 7, color: C.ink500, marginTop: 4 }}>
              Scan to access your dashboard
            </Text>
          </View>
        )}

        {/* Branding footer */}
        <View
          style={{
            marginTop: "auto",
            alignItems: "center",
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: C.surface200,
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {LOGO_SRC && <Image src={LOGO_SRC} style={{ width: 100, height: 23, marginBottom: 6 }} />}
          {!LOGO_SRC && (
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600, marginBottom: 6 }}>
              BlockID.au
            </Text>
          )}
          <Text style={{ fontSize: 8, color: C.ink500 }}>blockid.au</Text>
          <Text style={{ fontSize: 7, color: C.ink400, marginTop: 4 }}>
            Auschain PTY LTD | ACN 659 615 111 | ABN 79 659 615 111 | Sydney, NSW, Australia
          </Text>
          <Text
            style={{
              fontSize: 6,
              color: C.ink400,
              marginTop: 8,
              lineHeight: 1.5,
              textAlign: "center",
              maxWidth: 420,
            }}
          >
            This analysis is produced by BlockID.au (Auschain PTY LTD). The Startup Value Index (SVI)
            is an indicative assessment tool — it is NOT a financial valuation, investment recommendation,
            or professional advice under the Corporations Act 2001 (Cth). BlockID does not hold an
            Australian Financial Services Licence (AFSL). Users should seek independent professional
            advice from qualified accountants, lawyers, and financial advisers. All prices are in AUD
            and include GST where applicable.
          </Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}
