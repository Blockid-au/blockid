import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import * as path from "path";
import * as fs from "fs";

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

  return (
    <Document>
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
            STARTUP VALUATION INTELLIGENCE REPORT
          </Text>
          <Text style={{ fontSize: 28, fontFamily: "Helvetica-Bold", color: C.white, lineHeight: 1.2 }}>
            {name}
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
                SVI v{analysis.version} | Confidence: {confidence}%
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
        <PageTitle title="Executive Summary" subtitle="Your Startup at a Glance" />

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

        <Footer />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
       *  PAGE 3: PERFORMANCE DASHBOARD
       * ──────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <HeaderBar />
        <PageTitle title="Performance Dashboard" subtitle="8-Dimension Scorecard" />

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
       *  PAGE 10: RISK LANDSCAPE
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
        <PageTitle title="Next Steps" subtitle="Continue Your Growth Journey" />

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
            <ActionItem num={1} text="Log in to blockid.au/workspace" detail="Access your full dashboard and tools" />
          </View>
          <ActionItem num={2} text="Upload evidence for your top gaps" detail="Each piece of evidence strengthens your SVI score" />
          <ActionItem num={3} text="Schedule your next re-analysis" detail="Track improvement monthly for investor-ready positioning" />
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
