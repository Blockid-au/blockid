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
  brand600: "#2563eb",
  brand100: "#dbeafe",
  brand50: "#eff6ff",
  ink800: "#1e293b",
  ink700: "#334155",
  ink600: "#475569",
  ink500: "#64748b",
  ink400: "#94a3b8",
  surface200: "#e2e8f0",
  surface100: "#f1f5f9",
  surface50: "#f8fafc",
  emerald600: "#059669",
  emerald100: "#d1fae5",
  amber600: "#d97706",
  amber100: "#fef3c7",
  red600: "#dc2626",
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

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  /* Page */
  page: {
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink800,
  },

  /* Footer — absolute on every page */
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: C.ink400 },
  footerBrand: { fontSize: 7, color: C.brand600, fontWeight: "bold" },

  /* Cover */
  coverCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  coverBrand: {
    fontSize: 28,
    fontWeight: "bold",
    color: C.brand600,
    letterSpacing: 1,
  },
  coverDot: { color: C.ink500 },
  coverTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.ink800,
    marginTop: 32,
    textAlign: "center",
  },
  coverScore: {
    fontSize: 72,
    fontWeight: "bold",
    color: C.brand600,
    marginTop: 24,
    textAlign: "center",
  },
  coverStage: {
    fontSize: 12,
    color: C.ink600,
    marginTop: 8,
    textAlign: "center",
  },
  coverDate: {
    fontSize: 9,
    color: C.ink500,
    marginTop: 24,
    textAlign: "center",
  },
  coverConf: {
    fontSize: 8,
    color: C.ink400,
    marginTop: 6,
    textAlign: "center",
  },

  /* Section & heading */
  h1: {
    fontSize: 16,
    fontWeight: "bold",
    color: C.ink800,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
    paddingBottom: 6,
  },
  h2: {
    fontSize: 12,
    fontWeight: "bold",
    color: C.ink700,
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.ink700,
    marginTop: 10,
    marginBottom: 4,
  },
  body: { fontSize: 9, color: C.ink600, lineHeight: 1.6, marginBottom: 8 },

  /* Metric cards */
  metricRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  metricCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: C.surface50,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 7,
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  metricValue: { fontSize: 16, fontWeight: "bold", color: C.ink800 },
  metricSub: { fontSize: 7, color: C.ink500, marginTop: 2 },

  /* Dimension rows */
  dimRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.surface100,
  },
  dimLabel: { flex: 1, fontSize: 9, color: C.ink700 },
  dimWeight: { width: 30, fontSize: 8, color: C.ink500, textAlign: "center" },
  dimScore: { width: 40, fontSize: 9, fontWeight: "bold", color: C.ink800, textAlign: "right" },
  dimAdj: { width: 35, fontSize: 8, textAlign: "right" },

  /* Score bar */
  barOuter: { width: 80, height: 6, borderRadius: 3, backgroundColor: C.surface200, marginLeft: 6 },
  barFill: { height: 6, borderRadius: 3 },

  /* Bullet items */
  bulletRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 9, color: C.emerald600 },
  bulletDotAmber: { width: 10, fontSize: 9, color: C.amber600 },
  bulletDotRed: { width: 10, fontSize: 9, color: C.red600 },
  bulletText: { flex: 1, fontSize: 8.5, color: C.ink600, lineHeight: 1.5 },

  /* Risk cards */
  riskCard: {
    borderWidth: 0.5,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  riskLabel: { fontSize: 9, fontWeight: "bold", color: C.ink800 },
  riskPts: { fontSize: 9, fontWeight: "bold", color: C.red600 },
  riskReason: { fontSize: 8, color: C.ink600, lineHeight: 1.5 },

  /* Gap cards */
  gapCard: {
    borderWidth: 0.5,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 5,
  },
  gapRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gapPriority: { fontSize: 7, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.8 },
  gapLabel: { fontSize: 9, fontWeight: "bold", color: C.ink800, marginTop: 2 },
  gapAction: { fontSize: 8, color: C.ink600, marginTop: 1, lineHeight: 1.4 },
  gapImpact: { fontSize: 8, fontWeight: "bold", color: C.teal600 },

  /* Stage journey */
  stageRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  stageCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  stageNum: { fontSize: 8, fontWeight: "bold", color: C.white },
  stageLabel: { fontSize: 9, color: C.ink600 },
  stageCurrent: { fontSize: 9, fontWeight: "bold", color: C.brand600 },

  /* Dimension detail page */
  detailBox: {
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    backgroundColor: C.surface50,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  detailDimName: { fontSize: 11, fontWeight: "bold", color: C.ink800 },
  detailScore: { fontSize: 14, fontWeight: "bold", color: C.brand600 },

  /* Signals indicator */
  signalRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  signalDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  signalText: { fontSize: 8.5, color: C.ink600 },
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
  if (points >= 12) return "Critical";
  if (points >= 8) return "High";
  if (points >= 5) return "Medium";
  return "Low";
}

function riskBorderColor(points: number): string {
  if (points >= 12) return C.red600;
  if (points >= 8) return "#f87171";
  if (points >= 5) return C.amber600;
  return C.surface200;
}

function priorityColor(p: string): string {
  if (p === "P0") return C.red600;
  if (p === "P1") return C.amber600;
  return C.ink500;
}

function priorityBg(p: string): string {
  if (p === "P0") return C.red100;
  if (p === "P1") return C.amber100;
  return C.surface100;
}

function findSub(analysis: SVIAnalysis, key: string) {
  return analysis.subs.find((sub) => sub.key === key);
}

/* ─── Shared footer with logo ──────────────────────────────────────────── */
function Footer({ pageNum }: { pageNum: number }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Confidential</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {LOGO_SRC && <Image src={LOGO_SRC} style={{ width: 60, height: 14 }} />}
        {!LOGO_SRC && <Text style={s.footerBrand}>BlockID.au</Text>}
      </View>
      <Text style={s.footerText}>Page {pageNum}</Text>
    </View>
  );
}

/* ─── Dimension detail block (reusable for pages 5-7) ──────────────────── */
function DimensionDetail({
  sub,
}: {
  sub: SVIAnalysis["subs"][number] | undefined;
}) {
  if (!sub) return null;
  const label = DIM_LABELS[sub.key] ?? sub.label;
  const weight = DIM_WEIGHTS[sub.key] ?? "";
  const score = Math.round(sub.value);
  return (
    <View style={s.detailBox}>
      <View style={s.detailHeader}>
        <View>
          <Text style={s.detailDimName}>
            {sub.key.toUpperCase()} — {label}
          </Text>
          <Text style={{ fontSize: 8, color: C.ink500, marginTop: 1 }}>Weight: {weight}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.detailScore}>{score}/100</Text>
          <Text
            style={{
              fontSize: 8,
              fontWeight: "bold",
              color: sub.adjustment >= 0 ? C.emerald600 : C.red600,
            }}
          >
            {sub.adjustment >= 0 ? "+" : ""}
            {sub.adjustment} adj
          </Text>
        </View>
      </View>

      {/* Score bar */}
      <View style={s.barOuter}>
        <View style={[s.barFill, { width: `${score}%`, backgroundColor: barColor(score) }]} />
      </View>

      <Text style={[s.body, { marginTop: 6 }]}>{sub.rationale}</Text>

      {sub.evidence.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: C.emerald600, marginBottom: 3 }}>
            EVIDENCE
          </Text>
          {sub.evidence.map((e, i) => (
            <View key={`${sub.key}-ev-${i}`} style={s.bulletRow}>
              <Text style={s.bulletDot}>+</Text>
              <Text style={s.bulletText}>{e}</Text>
            </View>
          ))}
        </View>
      )}

      {sub.gaps.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: C.amber600, marginBottom: 3 }}>
            GAPS
          </Text>
          {sub.gaps.map((g, i) => (
            <View key={`${sub.key}-gap-${i}`} style={s.bulletRow}>
              <Text style={s.bulletDotAmber}>!</Text>
              <Text style={s.bulletText}>{g}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─── Signal indicator row ──────────────────────────────────────────────── */
function Signal({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={s.signalRow}>
      <View
        style={[
          s.signalDot,
          { backgroundColor: active ? C.emerald600 : C.surface200 },
        ]}
      />
      <Text style={[s.signalText, active ? { color: C.ink800 } : {}]}>{label}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN DOCUMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  analysis: SVIAnalysis;
  email?: string;
}

export function SVIReportPDF({ analysis, email }: Props) {
  const date = new Date().toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const topStrengths = [...analysis.subs]
    .filter((sub) => sub.value >= 60)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const topGaps = [...analysis.evidenceGaps]
    .sort((a, b) => {
      const order: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    })
    .slice(0, 3);

  const p0Gaps = analysis.evidenceGaps.filter((g) => g.priority === "P0");
  const p1Gaps = analysis.evidenceGaps.filter((g) => g.priority === "P1");
  const p2Gaps = analysis.evidenceGaps.filter((g) => g.priority === "P2");

  const mpc = findSub(analysis, "mpc");
  const ptd = findSub(analysis, "ptd");
  const tre = findSub(analysis, "tre");
  const cgh = findSub(analysis, "cgh");
  const iri = findSub(analysis, "iri");
  const lco = findSub(analysis, "lco");

  return (
    <Document>
      {/* ─── Page 1: Cover ────────────────────────────────────────────────── */}
      <Page size="A4" style={[s.page, { paddingTop: 0, paddingBottom: 0 }]}>
        <View style={s.coverCenter}>
          {LOGO_SRC && (
            <Image src={LOGO_SRC} style={{ width: 220, height: 50, marginBottom: 8 }} />
          )}
          {!LOGO_SRC && (
            <Text style={s.coverBrand}>
              BlockID<Text style={s.coverDot}>.au</Text>
            </Text>
          )}
          <Text style={s.coverTitle}>Startup Value Index Report</Text>
          <Text style={s.coverScore}>{analysis.totalSVI}</Text>
          <Text style={s.coverStage}>
            {sviLabel(analysis.totalSVI)} — Stage {analysis.stage}: {analysis.stageLabel}
          </Text>
          <Text style={s.coverDate}>Generated {date}</Text>
          {email && (
            <Text style={s.coverConf}>Confidential — Prepared for {email}</Text>
          )}
          <Text style={{ fontSize: 8, color: C.ink400, marginTop: 16, textAlign: "center" }}>
            SVI v{analysis.version} | Evidence Confidence: {Math.round(analysis.confidenceMultiplier * 100)}%
          </Text>
        </View>
        <Footer pageNum={1} />
      </Page>

      {/* ─── Page 2: Executive Summary ────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Executive Summary</Text>
        <Text style={s.body}>{analysis.summary}</Text>

        {/* Key metrics */}
        <View style={s.metricRow}>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>SVI Score</Text>
            <Text style={[s.metricValue, { color: C.brand600 }]}>{analysis.totalSVI}</Text>
            <Text style={s.metricSub}>{sviLabel(analysis.totalSVI)}</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Confidence</Text>
            <Text style={s.metricValue}>{Math.round(analysis.confidenceMultiplier * 100)}%</Text>
            <Text style={s.metricSub}>{analysis.signals.evidenceLevel.replace(/_/g, " ")}</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Percentile</Text>
            <Text style={s.metricValue}>P{analysis.percentileRank ?? 50}</Text>
            <Text style={s.metricSub}>For {analysis.stageLabel}</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Risk Flags</Text>
            <Text
              style={[
                s.metricValue,
                {
                  color:
                    analysis.riskPenalties.length > 3
                      ? C.red600
                      : analysis.riskPenalties.length > 0
                        ? C.amber600
                        : C.emerald600,
                },
              ]}
            >
              {analysis.riskPenalties.length}
            </Text>
            <Text style={s.metricSub}>
              {analysis.riskPenalties.length === 0
                ? "No flags"
                : `-${analysis.riskPenalties.reduce((sum, r) => sum + r.points, 0)} pts`}
            </Text>
          </View>
        </View>

        {/* Score breakdown */}
        <View style={s.metricRow}>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Base Score</Text>
            <Text style={s.metricValue}>100</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Net Adjustment</Text>
            <Text
              style={[
                s.metricValue,
                { color: analysis.netAdjustment >= 0 ? C.emerald600 : C.red600 },
              ]}
            >
              {analysis.netAdjustment >= 0 ? "+" : ""}
              {analysis.netAdjustment}
            </Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Stage Bonus</Text>
            <Text style={[s.metricValue, { color: C.brand600 }]}>+{analysis.stageBonus}</Text>
          </View>
        </View>

        {/* Top strengths */}
        {topStrengths.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.h2}>Key Strengths</Text>
            {topStrengths.map((sub) => (
              <View key={sub.key} style={s.bulletRow}>
                <Text style={s.bulletDot}>+</Text>
                <Text style={s.bulletText}>
                  {DIM_LABELS[sub.key] ?? sub.label}: {Math.round(sub.value)}/100
                  {sub.evidence.length > 0 ? ` — ${sub.evidence[0]}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Top gaps */}
        {topGaps.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.h2}>Key Gaps</Text>
            {topGaps.map((gap, i) => (
              <View key={`topgap-${i}`} style={s.bulletRow}>
                <Text style={s.bulletDotAmber}>!</Text>
                <Text style={s.bulletText}>
                  [{gap.priority}] {gap.label} — {gap.action} (+{gap.impact} SVI)
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 14, borderWidth: 0.5, borderColor: C.surface200, borderRadius: 6, padding: 10, backgroundColor: C.surface50 }}>
          <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800, marginBottom: 3 }}>How to Use This Report</Text>
          <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5 }}>
            This report analyses your startup across 8 key dimensions. Focus on the "Your Personalised Action Plan" (Page 10) for specific next steps. Each dimension page (5-7) shows detailed evidence and gaps. Upload verified evidence at blockid.au/workspace/evidence to boost your score over time.
          </Text>
        </View>

        <Footer pageNum={2} />
      </Page>

      {/* ─── Page 3-4: Dimension Breakdown ──────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Dimension Breakdown (1 of 2)</Text>
        <Text style={s.body}>
          Your SVI is composed of 8 weighted dimensions. Each dimension scores 0-100 and contributes
          a weighted adjustment to your base score of 100.
        </Text>

        {/* Dimension table header */}
        <View
          style={[
            s.dimRow,
            {
              backgroundColor: C.surface100,
              borderBottomWidth: 1,
              borderBottomColor: C.surface200,
            },
          ]}
        >
          <Text style={[s.dimLabel, { fontWeight: "bold", fontSize: 8 }]}>Dimension</Text>
          <Text style={[s.dimWeight, { fontWeight: "bold", fontSize: 8 }]}>Wt.</Text>
          <Text style={[s.dimScore, { fontSize: 8 }]}>Score</Text>
          <Text style={[s.dimAdj, { fontWeight: "bold", fontSize: 8 }]}>Adj.</Text>
          <View style={[s.barOuter, { backgroundColor: "transparent" }]}>
            <Text style={{ fontSize: 8, color: C.ink500, textAlign: "center" }}>Bar</Text>
          </View>
        </View>

        {analysis.subs.map((sub) => (
          <View key={sub.key} style={s.dimRow}>
            <Text style={s.dimLabel}>
              {sub.key.toUpperCase()} — {DIM_LABELS[sub.key] ?? sub.label}
            </Text>
            <Text style={s.dimWeight}>{DIM_WEIGHTS[sub.key]}</Text>
            <Text style={s.dimScore}>{Math.round(sub.value)}/100</Text>
            <Text
              style={[
                s.dimAdj,
                { color: sub.adjustment >= 0 ? C.emerald600 : C.red600 },
              ]}
            >
              {sub.adjustment >= 0 ? "+" : ""}
              {sub.adjustment}
            </Text>
            <View style={s.barOuter}>
              <View
                style={[
                  s.barFill,
                  {
                    width: `${Math.round(sub.value)}%`,
                    backgroundColor: barColor(sub.value),
                  },
                ]}
              />
            </View>
          </View>
        ))}

        {/* First 4 dimensions detailed */}
        <Text style={[s.h2, { marginTop: 16 }]}>Detailed Scores (1-4)</Text>
        {analysis.subs.slice(0, 4).map((sub) => (
          <View key={`detail-${sub.key}`} style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>
                {sub.key.toUpperCase()}: {DIM_LABELS[sub.key] ?? sub.label}
              </Text>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.brand600 }}>
                {Math.round(sub.value)}/100
              </Text>
            </View>
            {sub.evidence.length > 0 &&
              sub.evidence.slice(0, 2).map((e, i) => (
                <View key={`${sub.key}-ev2-${i}`} style={s.bulletRow}>
                  <Text style={s.bulletDot}>+</Text>
                  <Text style={s.bulletText}>{e}</Text>
                </View>
              ))}
            {sub.gaps.length > 0 &&
              sub.gaps.slice(0, 2).map((g, i) => (
                <View key={`${sub.key}-gap2-${i}`} style={s.bulletRow}>
                  <Text style={s.bulletDotAmber}>!</Text>
                  <Text style={s.bulletText}>{g}</Text>
                </View>
              ))}
          </View>
        ))}

        <Footer pageNum={3} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Dimension Breakdown (2 of 2)</Text>
        <Text style={s.h2}>Detailed Scores (5-8)</Text>
        {analysis.subs.slice(4).map((sub) => (
          <View key={`detail2-${sub.key}`} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>
                {sub.key.toUpperCase()}: {DIM_LABELS[sub.key] ?? sub.label}
              </Text>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.brand600 }}>
                {Math.round(sub.value)}/100
              </Text>
            </View>
            <View style={s.barOuter}>
              <View
                style={[
                  s.barFill,
                  { width: `${Math.round(sub.value)}%`, backgroundColor: barColor(sub.value) },
                ]}
              />
            </View>
            <Text style={[s.body, { marginTop: 3 }]}>{sub.rationale}</Text>
            {sub.evidence.length > 0 &&
              sub.evidence.map((e, i) => (
                <View key={`${sub.key}-ev3-${i}`} style={s.bulletRow}>
                  <Text style={s.bulletDot}>+</Text>
                  <Text style={s.bulletText}>{e}</Text>
                </View>
              ))}
            {sub.gaps.length > 0 &&
              sub.gaps.map((g, i) => (
                <View key={`${sub.key}-gap3-${i}`} style={s.bulletRow}>
                  <Text style={s.bulletDotAmber}>!</Text>
                  <Text style={s.bulletText}>{g}</Text>
                </View>
              ))}
          </View>
        ))}

        <Footer pageNum={4} />
      </Page>

      {/* ─── Page 5: Market & Product ──────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Market & Product Deep Dive</Text>

        <Text style={s.h2}>Market & Problem Clarity (MPC)</Text>
        <DimensionDetail sub={mpc} />

        {/* Market signals */}
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Market Signals</Text>
            <Signal label={`Market Size: ${analysis.signals.marketSize}`} active={analysis.signals.marketSize !== "unknown"} />
            <Signal label={`Problem Clarity: ${analysis.signals.problemClarity}`} active={analysis.signals.problemClarity !== "vague"} />
            <Signal label="Customer Interviews" active={analysis.signals.hasCustomerInterviews} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Competitive Moat</Text>
            <Signal label="Moat Identified" active={analysis.signals.hasMoat} />
            <Signal label="Network Effect" active={analysis.signals.hasNetworkEffect} />
            <Signal label="Data Advantage" active={analysis.signals.hasDataAdvantage} />
            <Signal label="Switching Costs" active={analysis.signals.hasSwitchingCosts} />
            {analysis.signals.isAIWrapper && (
              <Signal label="AI Wrapper Risk" active={true} />
            )}
          </View>
        </View>

        <Text style={s.h2}>Product & Technical Depth (PTD)</Text>
        <DimensionDetail sub={ptd} />

        {/* Product signals */}
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Product Signals</Text>
            <Signal label="Product Built" active={analysis.signals.hasProduct} />
            <Signal label="Demo / Prototype" active={analysis.signals.hasDemo} />
            <Signal label="Source Code Linked" active={analysis.signals.hasSourceCode} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Distribution</Text>
            <Signal label="Website Live" active={analysis.signals.hasWebsite} />
            <Signal label="Mobile App" active={analysis.signals.hasApp} />
          </View>
        </View>

        <Footer pageNum={5} />
      </Page>

      {/* ─── Page 6: Traction & Cap Table ──────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Traction & Governance</Text>

        <Text style={s.h2}>Traction & Revenue Evidence (TRE)</Text>
        <DimensionDetail sub={tre} />

        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Revenue Signals</Text>
            <Signal label={`Revenue Band: ${analysis.signals.revenueBand.replace(/-/g, " ")}`} active={analysis.signals.hasRevenue} />
            <Signal label="Paying Customers" active={analysis.signals.hasCustomers} />
            <Signal label="Analytics Connected" active={analysis.signals.hasAnalytics} />
            <Signal label="Social Proof" active={analysis.signals.hasSocialProof} />
          </View>
        </View>

        <Text style={s.h2}>Cap Table & Governance Health (CGH)</Text>
        <DimensionDetail sub={cgh} />

        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Governance Signals</Text>
            <Signal label="Cap Table" active={analysis.signals.hasCapTable} />
            <Signal label="Vesting Schedule" active={analysis.signals.hasVesting} />
            <Signal label="Shareholders Agreement" active={analysis.signals.hasShareholdersAgreement} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Corporate Health</Text>
            <Signal label="ESOP Allocated" active={analysis.signals.esopAllocated} />
            <Signal label="Board Cadence" active={analysis.signals.hasBoardCadence} />
            <Signal label="Financial Audit" active={analysis.signals.hasFinancialAudit} />
          </View>
        </View>

        <Footer pageNum={6} />
      </Page>

      {/* ─── Page 7: Investor Readiness & Legal ────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Investor Readiness & Legal</Text>

        <Text style={s.h2}>Investor Readiness Index (IRI)</Text>
        <DimensionDetail sub={iri} />

        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Investor Materials</Text>
            <Signal label="Pitch Deck" active={analysis.signals.hasPitchDeck} />
            <Signal label="Financial Model" active={analysis.signals.hasFinancialModel} />
            <Signal label="Data Room" active={analysis.signals.hasDataRoom} />
            <Signal label="Raise Target Stated" active={analysis.signals.targetRaiseMentioned} />
          </View>
        </View>

        <Text style={s.h2}>Legal & Compliance (LCO)</Text>
        <DimensionDetail sub={lco} />

        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Legal Signals</Text>
            <Signal label="ABN / ASIC Registration" active={analysis.signals.hasABN} />
            <Signal label="IP Protection" active={analysis.signals.hasIPProtection} />
            <Signal label="Contracts / ToS" active={analysis.signals.hasContracts} />
            <Signal label="Legal Documentation" active={analysis.signals.hasLegalDocs} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Founder Signals</Text>
            <Signal label={`Experience: ${analysis.signals.founderExperience.replace(/-/g, " ")}`} active={analysis.signals.founderExperience !== "first-time"} />
            <Signal label="Co-Founder" active={analysis.signals.hasCoFounder} />
            <Signal label="Domain Expertise" active={analysis.signals.founderSectorFit} />
            <Signal label="Advisors" active={analysis.signals.hasAdvisors} />
          </View>
        </View>

        <Footer pageNum={7} />
      </Page>

      {/* ─── Page 8: Risk Assessment ───────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Risk Assessment</Text>

        {analysis.riskPenalties.length > 0 ? (
          <>
            <Text style={s.body}>
              {analysis.riskPenalties.length} risk{analysis.riskPenalties.length !== 1 ? "s" : ""}{" "}
              detected, totalling -{analysis.riskPenalties.reduce((sum, r) => sum + r.points, 0)} SVI
              points. Risks are ranked by severity.
            </Text>

            {[...analysis.riskPenalties]
              .sort((a, b) => b.points - a.points)
              .map((risk, i) => (
                <View
                  key={`risk-${i}`}
                  style={[s.riskCard, { borderColor: riskBorderColor(risk.points) }]}
                >
                  <View style={s.riskRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.riskLabel}>{risk.label}</Text>
                      <View
                        style={{
                          backgroundColor: risk.points >= 8 ? C.red100 : C.amber100,
                          borderRadius: 3,
                          paddingHorizontal: 4,
                          paddingVertical: 1,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 7,
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            color: risk.points >= 8 ? C.red600 : C.amber600,
                          }}
                        >
                          {riskSeverity(risk.points)}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.riskPts}>-{risk.points} pts</Text>
                  </View>
                  <Text style={s.riskReason}>{risk.reason}</Text>
                </View>
              ))}
          </>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: C.emerald600 }}>
              No Risk Flags Detected
            </Text>
            <Text style={[s.body, { textAlign: "center", marginTop: 6 }]}>
              Your startup has no critical risk penalties. Continue building evidence to maintain this
              clean profile.
            </Text>
          </View>
        )}

        <Footer pageNum={8} />
      </Page>

      {/* ─── Page 9: Action Plan ───────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Evidence Gaps & Action Plan</Text>
        <Text style={s.body}>
          Address these evidence gaps to increase your SVI. Items are ordered by priority and potential
          impact.
        </Text>

        {/* P0 — Critical */}
        {p0Gaps.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={[s.h3, { color: C.red600 }]}>Critical (P0)</Text>
            {p0Gaps.map((gap, i) => (
              <View
                key={`p0-${i}`}
                style={[s.gapCard, { borderColor: C.red600, backgroundColor: C.red100 }]}
              >
                <View style={s.gapRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View
                      style={{
                        backgroundColor: C.red600,
                        borderRadius: 2,
                        paddingHorizontal: 3,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={[s.gapPriority, { color: C.white }]}>P0</Text>
                    </View>
                  </View>
                  <Text style={s.gapImpact}>+{gap.impact} SVI</Text>
                </View>
                <Text style={s.gapLabel}>{gap.label}</Text>
                <Text style={s.gapAction}>{gap.action}</Text>
              </View>
            ))}
          </View>
        )}

        {/* P1 — Important */}
        {p1Gaps.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={[s.h3, { color: C.amber600 }]}>Important (P1)</Text>
            {p1Gaps.map((gap, i) => (
              <View
                key={`p1-${i}`}
                style={[s.gapCard, { borderColor: C.amber600, backgroundColor: C.amber100 }]}
              >
                <View style={s.gapRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View
                      style={{
                        backgroundColor: C.amber600,
                        borderRadius: 2,
                        paddingHorizontal: 3,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={[s.gapPriority, { color: C.white }]}>P1</Text>
                    </View>
                  </View>
                  <Text style={s.gapImpact}>+{gap.impact} SVI</Text>
                </View>
                <Text style={s.gapLabel}>{gap.label}</Text>
                <Text style={s.gapAction}>{gap.action}</Text>
              </View>
            ))}
          </View>
        )}

        {/* P2 — Nice to Have */}
        {p2Gaps.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={[s.h3, { color: C.ink500 }]}>Nice to Have (P2)</Text>
            {p2Gaps.map((gap, i) => (
              <View
                key={`p2-${i}`}
                style={[s.gapCard, { borderColor: C.surface200, backgroundColor: C.surface50 }]}
              >
                <View style={s.gapRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View
                      style={{
                        backgroundColor: C.ink500,
                        borderRadius: 2,
                        paddingHorizontal: 3,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={[s.gapPriority, { color: C.white }]}>P2</Text>
                    </View>
                  </View>
                  <Text style={s.gapImpact}>+{gap.impact} SVI</Text>
                </View>
                <Text style={s.gapLabel}>{gap.label}</Text>
                <Text style={s.gapAction}>{gap.action}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Next actions */}
        {analysis.nextActions.length > 0 && (
          <View>
            <Text style={[s.h2, { color: C.brand600 }]}>Recommended Actions</Text>
            {analysis.nextActions.map((action, i) => (
              <View key={`na-${i}`} style={{ marginBottom: 5 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <View
                        style={{
                          backgroundColor: priorityBg(action.priority),
                          borderRadius: 2,
                          paddingHorizontal: 3,
                          paddingVertical: 1,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 7,
                            fontWeight: "bold",
                            color: priorityColor(action.priority),
                          }}
                        >
                          {action.priority}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>{action.title}</Text>
                    </View>
                    <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.4 }}>{action.detail}</Text>
                  </View>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: C.teal600, marginLeft: 8 }}>
                    {action.impact}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Footer pageNum={9} />
      </Page>

      {/* ─── Page 10: Your Personalised Next Steps ───────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Your Personalised Action Plan</Text>

        <Text style={[s.body, { fontSize: 10, lineHeight: 1.7 }]}>
          Based on your SVI analysis, here are the specific steps we recommend you take
          in the next 30 days. Focus on the highest-impact items first — even small
          improvements in evidence quality can significantly boost your score.
        </Text>

        {/* Week 1: Quick Wins */}
        <View style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: C.emerald600, paddingLeft: 12, marginBottom: 14 }}>
          <Text style={[s.h2, { color: C.emerald600, marginTop: 0 }]}>Week 1: Quick Wins</Text>
          <Text style={s.body}>These take less than 1 hour each and have immediate SVI impact.</Text>
          {analysis.evidenceGaps
            .filter(g => g.priority === "P0" || g.priority === "P1")
            .slice(0, 3)
            .map((gap, i) => (
              <View key={`w1-${i}`} style={[s.bulletRow, { marginBottom: 5 }]}>
                <Text style={{ width: 20, fontSize: 12, color: C.emerald600, fontWeight: "bold" }}>✓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>{gap.label}</Text>
                  <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 1 }}>{gap.action}</Text>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: C.teal600, marginTop: 2 }}>Expected impact: +{gap.impact} SVI points</Text>
                </View>
              </View>
            ))}
        </View>

        {/* Week 2-3: Build Foundation */}
        <View style={{ borderLeftWidth: 3, borderLeftColor: C.brand600, paddingLeft: 12, marginBottom: 14 }}>
          <Text style={[s.h2, { color: C.brand600, marginTop: 0 }]}>Week 2-3: Build Foundation</Text>
          <Text style={s.body}>These require more effort but establish lasting credibility.</Text>
          {analysis.nextActions
            .slice(0, 3)
            .map((action, i) => (
              <View key={`w23-${i}`} style={[s.bulletRow, { marginBottom: 5 }]}>
                <Text style={{ width: 20, fontSize: 12, color: C.brand600, fontWeight: "bold" }}>→</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>{action.title}</Text>
                  <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 1 }}>{action.detail}</Text>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: C.teal600, marginTop: 2 }}>{action.impact}</Text>
                </View>
              </View>
            ))}
        </View>

        {/* Week 4: Review & Refine */}
        <View style={{ borderLeftWidth: 3, borderLeftColor: C.amber600, paddingLeft: 12 }}>
          <Text style={[s.h2, { color: C.amber600, marginTop: 0 }]}>Week 4: Review & Refine</Text>
          <Text style={s.body}>Re-run your SVI analysis to measure progress and identify the next wave of improvements.</Text>
          <View style={s.bulletRow}>
            <Text style={{ width: 20, fontSize: 12, color: C.amber600, fontWeight: "bold" }}>↻</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.ink800 }}>Re-analyse your startup on BlockID.au</Text>
              <Text style={{ fontSize: 8, color: C.ink600, lineHeight: 1.5, marginTop: 1 }}>Upload new evidence, update your description with progress, and get a fresh SVI score. Track your improvement over time.</Text>
            </View>
          </View>
        </View>

        <Footer pageNum={10} />
      </Page>

      {/* ─── Page 11: Next Steps ───────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Next Steps & Recommendations</Text>

        {/* Stage Journey */}
        <Text style={s.h2}>Stage Journey</Text>
        <View style={{ marginBottom: 14 }}>
          {SVI_STAGE_LABELS.map((label, idx) => {
            const isCurrent = idx === analysis.stage;
            const isPast = idx < analysis.stage;
            return (
              <View key={label} style={s.stageRow}>
                <View
                  style={[
                    s.stageCircle,
                    {
                      backgroundColor: isCurrent
                        ? C.brand600
                        : isPast
                          ? C.emerald600
                          : C.surface200,
                    },
                  ]}
                >
                  <Text
                    style={[s.stageNum, { color: isCurrent || isPast ? C.white : C.ink500 }]}
                  >
                    {idx}
                  </Text>
                </View>
                <Text style={isCurrent ? s.stageCurrent : s.stageLabel}>
                  {label}
                  {isCurrent ? " (Current)" : ""}
                  {idx === analysis.stage + 1 ? " — Next target" : ""}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Projected improvements */}
        <Text style={s.h2}>Projected Improvements</Text>
        <Text style={s.body}>
          By addressing the top evidence gaps identified in this report, your SVI could improve by an
          estimated +
          {analysis.evidenceGaps
            .filter((g) => g.priority === "P0" || g.priority === "P1")
            .reduce((sum, g) => sum + g.impact, 0)}{" "}
          points. Focus on P0 items first for maximum impact.
        </Text>

        {/* Top 3 quick wins recap */}
        {analysis.nextActions.slice(0, 3).map((action, i) => (
          <View key={`qw-${i}`} style={s.bulletRow}>
            <Text style={s.bulletDot}>{i + 1}.</Text>
            <Text style={s.bulletText}>
              {action.title} — {action.impact}
            </Text>
          </View>
        ))}

        {/* CTA box */}
        <View
          style={{
            marginTop: 20,
            borderWidth: 1,
            borderColor: C.brand600,
            borderRadius: 8,
            padding: 16,
            backgroundColor: C.brand50,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "bold", color: C.brand600, marginBottom: 4 }}>
            Track Your SVI Over Time
          </Text>
          <Text style={{ fontSize: 9, color: C.ink600, lineHeight: 1.5 }}>
            Visit blockid.au/dashboard to access your full interactive dashboard, Evidence Vault,
            cap table tools, and weekly SVI tracking. Upload verified evidence to boost your
            confidence multiplier and unlock higher scores.
          </Text>
        </View>

        {/* Footer CTA */}
        <View
          style={{
            marginTop: 20,
            alignItems: "center",
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: C.surface200,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "bold", color: C.ink800 }}>
            Valuation. Ownership. Execution. Growth.
          </Text>
          <Text style={{ fontSize: 9, color: C.brand600, marginTop: 4 }}>
            blockid.au
          </Text>
          <Text style={{ fontSize: 7, color: C.ink400, marginTop: 6 }}>
            Auschain PTY LTD | ABN 90 688 222 450 | This report is not financial advice.
          </Text>
        </View>

        <Footer pageNum={11} />
      </Page>
    </Document>
  );
}
