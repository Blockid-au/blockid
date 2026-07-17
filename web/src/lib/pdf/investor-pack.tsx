// Investor Pack v2 — one-click PDF template (T-1200 / T-1201).
//
// The v2 investor pack is the artefact that justifies the Growth/Scale
// tier upsell (per docs/goal-5b-investor-pack-v2.md). This file provides
// the top-level React-PDF Document, the `InvestorPackData` shape, and a
// server-side `renderInvestorPack(data)` helper that returns a Node
// Buffer suitable for streaming out of a Next.js route handler.
//
// Layout (in page order):
//   1. Cover page          — big startup name + SVI grade badge
//   2. Executive summary   — 3 paragraphs + opportunity + risk callouts
//   3. SVI 13-criteria     — table with per-criterion score + delta
//   4. Cap table snapshot  — shareholder / class / shares / % / value AUD
//   5. Traction chart      — hand-drawn SVG polyline of MRR history
//   6. One-page teaser     — condensed 4-quadrant view for LinkedIn share
//
// Every page carries a fixed regulatory footer:
//   "Not financial advice. …  v<version> · Auschain PTY LTD ACN … ABN …"
//
// This template renders correctly whether or not upstream data is present:
// missing sections show a "Data unavailable" placeholder rather than
// fabricated numbers (per Guardrails in the task brief).

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Polyline,
  Line,
  Circle,
  Rect,
  renderToBuffer,
} from "@react-pdf/renderer";

/* ─── Report version — read at module scope from content/reports/version.json.
 *     `require` is used so the JSON is inlined at build time (Node runtime). */
let REPORT_VERSION = "unversioned";
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const v = require("../../../content/reports/version.json") as { version?: string };
  if (v && typeof v.version === "string") REPORT_VERSION = v.version;
} catch {
  /* leave as unversioned; footer still renders */
}

/* ─── 13 SVI criteria (canonical order, hardcoded stub).
 *     Real values are pulled from svi_reports/svi_report_evidence in T-1202;
 *     until then, the assembler passes zero-scored rows through the same
 *     shape so the table always paints. */
export const SVI_13_CRITERIA: ReadonlyArray<{ id: string; label: string }> = [
  { id: "ftv", label: "Founder & Team Value" },
  { id: "mpc", label: "Market & Problem Clarity" },
  { id: "ptd", label: "Product & Technical Depth" },
  { id: "tre", label: "Traction & Revenue" },
  { id: "cgh", label: "Cap Table & Governance" },
  { id: "iri", label: "Investor Readiness" },
  { id: "lco", label: "Legal & Compliance" },
  { id: "svm", label: "Strategic Vision & Moat" },
  { id: "gtm", label: "Go-to-Market Strategy" },
  { id: "fin", label: "Financial Projections & Unit Economics" },
  { id: "rsk", label: "Risk Landscape" },
  { id: "brd", label: "Brand & Storytelling" },
  { id: "esg", label: "Ethics, Sustainability & Governance" },
];

/* ─── Public shapes ─────────────────────────────────────────────────────── */

export interface InvestorPackData {
  startup: {
    name: string;
    tagline?: string;
    sector?: string;
    asOfDate: string;
  };
  svi: {
    grade: string;
    score: number;
    delta30d?: number;
    criteria: Array<{ id: string; label: string; score: number; delta?: number }>;
  };
  capTable?: Array<{
    shareholder: string;
    class: string;
    shares: number;
    percentage: number;
    valueAud: number;
  }>;
  traction?: {
    mrrHistory: Array<{ month: string; mrrAud: number }>;
    targetAud?: number;
    raisedAud?: number;
    round?: string;
  };
  teaser?: {
    headline: string;
    oneliner: string;
    opportunity?: string;
    risk?: string;
  };
}

/* ─── Brand palette (mirrors svi-report-pdf.tsx) ────────────────────────── */
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
  emerald100: "#d1fae5",
  amber700: "#b45309",
  amber100: "#fef3c7",
  red600: "#dc2626",
  red100: "#fee2e2",
  white: "#ffffff",
} as const;

const AUSCHAIN_LINE =
  "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW";

/* ─── Styles ────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink800,
    backgroundColor: C.white,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: C.brand600,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
    paddingTop: 6,
  },
  footerLead: {
    fontSize: 7,
    color: C.ink600,
    lineHeight: 1.3,
  },
  footerLine: {
    fontSize: 6.5,
    color: C.ink400,
    marginTop: 2,
    lineHeight: 1.3,
  },
  h1: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 4,
  },
  h1Sub: { fontSize: 10, color: C.ink500, marginBottom: 14 },
  h2: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.ink800,
    marginTop: 14,
    marginBottom: 6,
  },
  bodyPara: {
    fontSize: 10,
    color: C.ink700,
    lineHeight: 1.55,
    marginBottom: 8,
  },
  label: {
    fontSize: 7.5,
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: C.brand50,
    color: C.brand700,
    borderRadius: 999,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 2,
  },
  gradeBadge: {
    borderWidth: 1.5,
    borderColor: C.brand600,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  gradeLetter: {
    fontSize: 40,
    fontFamily: "Helvetica-Bold",
    color: C.brand700,
    lineHeight: 1,
  },
  gradeScore: {
    fontSize: 9,
    color: C.ink500,
    marginTop: 4,
  },
  callout: {
    borderLeftWidth: 3,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: C.surface50,
  },
  calloutLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.surface100,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.surface200,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableCell: {
    fontSize: 9,
    color: C.ink700,
  },
  placeholderBox: {
    padding: 14,
    backgroundColor: C.surface50,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderStyle: "dashed",
    borderRadius: 6,
  },
  placeholderText: {
    fontSize: 9,
    color: C.ink500,
    fontStyle: "italic",
    textAlign: "center",
  },
  quadrantBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 6,
    padding: 10,
    backgroundColor: C.surface50,
    minHeight: 90,
  },
});

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function formatAud(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function formatDelta(d?: number): string {
  if (d === undefined || d === null || !Number.isFinite(d)) return "—";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}`;
}

function deltaColor(d?: number): string {
  if (d === undefined || d === null || !Number.isFinite(d)) return C.ink400;
  if (d > 0) return C.emerald600;
  if (d < 0) return C.red600;
  return C.ink500;
}

function scoreBarColor(score: number): string {
  if (score >= 70) return C.emerald600;
  if (score >= 50) return C.brand600;
  if (score >= 35) return C.amber700;
  return C.red600;
}

/* ─── Shared components ─────────────────────────────────────────────────── */

function HeaderBar() {
  return <View style={s.headerBar} fixed />;
}

function RegulatoryFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLead}>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Not financial advice.</Text>{" "}
        General information only. Seek independent counsel. This is not an offer of
        securities.
      </Text>
      <Text style={s.footerLine}>
        Investor Pack v2 · report template {REPORT_VERSION} · {AUSCHAIN_LINE}
        {"  "}
        <Text
          render={({ pageNumber, totalPages }) =>
            `· page ${pageNumber} / ${totalPages}`
          }
        />
      </Text>
    </View>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <View style={s.placeholderBox}>
      <Text style={s.placeholderText}>{label}</Text>
    </View>
  );
}

/* ─── 1. Cover page ─────────────────────────────────────────────────────── */

function CoverPage({ data }: { data: InvestorPackData }) {
  const { startup, svi } = data;
  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <View style={{ marginTop: 60 }}>
        <Text style={s.label}>Investor Pack · Prepared by BlockID.au</Text>
        <Text style={{ fontSize: 32, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 8 }}>
          {startup.name || "Untitled startup"}
        </Text>
        {startup.tagline && (
          <Text style={{ fontSize: 13, color: C.ink600, marginTop: 6, lineHeight: 1.4 }}>
            {startup.tagline}
          </Text>
        )}
        {startup.sector && <Text style={s.chip}>{startup.sector.toUpperCase()}</Text>}
        <Text style={{ fontSize: 9, color: C.ink500, marginTop: 6 }}>
          As of {startup.asOfDate}
        </Text>
      </View>

      <View style={{ marginTop: 40, flexDirection: "row", alignItems: "center", gap: 24 }}>
        <View style={s.gradeBadge}>
          <Text style={s.gradeLetter}>{svi.grade || "—"}</Text>
          <Text style={s.gradeScore}>{Math.round(svi.score)} / 1000</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>BlockID SVI Grade</Text>
          <Text style={{ fontSize: 11, color: C.ink700, marginTop: 4, lineHeight: 1.5 }}>
            The BlockID Startup Viability Index (SVI) grades AU startups against
            13 evaluation criteria — from founder capability to legal posture.
            The grade shown here is the current composite; the following pages
            break it down criterion by criterion and place it against the
            company&apos;s cap table and traction.
          </Text>
          {typeof svi.delta30d === "number" && Number.isFinite(svi.delta30d) && (
            <Text style={{ fontSize: 9, color: deltaColor(svi.delta30d), marginTop: 6 }}>
              30-day change: {formatDelta(svi.delta30d)}
            </Text>
          )}
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 80, left: 48, right: 48 }}>
        <Text style={{ fontSize: 8, color: C.ink500, lineHeight: 1.5 }}>
          Prepared for investor review only. Confidential. Distribution outside
          the intended recipient requires prior written consent from the issuing
          company.
        </Text>
      </View>
      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 2. Executive summary ──────────────────────────────────────────────── */

function ExecutiveSummaryPage({ data }: { data: InvestorPackData }) {
  const { startup, svi, traction, teaser } = data;

  const p1 = teaser?.oneliner
    ? teaser.oneliner
    : `${startup.name} is a ${startup.sector || "technology"} company operating in the Australian market. This pack summarises the current state of the business — team, product, traction, cap table, and legal posture — as sourced from the BlockID workspace.`;

  const deltaCopy =
    typeof svi.delta30d === "number" && Number.isFinite(svi.delta30d)
      ? `The BlockID SVI grade is currently ${svi.grade || "—"} (${Math.round(svi.score)}/1000), a change of ${formatDelta(svi.delta30d)} points over the last 30 days.`
      : `The BlockID SVI grade is currently ${svi.grade || "—"} (${Math.round(svi.score)}/1000).`;

  const target = traction?.targetAud;
  const raised = traction?.raisedAud;
  const round = traction?.round;
  const raiseCopy =
    typeof target === "number" && typeof raised === "number"
      ? `Fundraise status: ${round ? `${round} round — ` : ""}${formatAud(raised)} raised against a ${formatAud(target)} target.`
      : "Fundraise status: no active raise on record — connect this pack to a live round in the workspace to surface progress.";

  const opportunity = teaser?.opportunity || "Opportunity data unavailable — add a market-opportunity note in the workspace.";
  const risk = teaser?.risk || "Risk register unavailable — add a risk note in the workspace.";

  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Executive summary</Text>
      <Text style={s.h1Sub}>One-page briefing for the reviewing investor</Text>

      <Text style={s.bodyPara}>{p1}</Text>
      <Text style={s.bodyPara}>{deltaCopy}</Text>
      <Text style={s.bodyPara}>{raiseCopy}</Text>

      <View
        style={[
          s.callout,
          { borderLeftColor: C.emerald600, backgroundColor: C.emerald100 },
        ]}
      >
        <Text style={[s.calloutLabel, { color: C.emerald600 }]}>Opportunity</Text>
        <Text style={{ fontSize: 9.5, color: C.ink700, lineHeight: 1.5 }}>
          {opportunity}
        </Text>
      </View>

      <View
        style={[
          s.callout,
          { borderLeftColor: C.amber700, backgroundColor: C.amber100 },
        ]}
      >
        <Text style={[s.calloutLabel, { color: C.amber700 }]}>Risk</Text>
        <Text style={{ fontSize: 9.5, color: C.ink700, lineHeight: 1.5 }}>
          {risk}
        </Text>
      </View>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 3. SVI 13-criteria breakdown ─────────────────────────────────────── */

function SviCriteriaPage({ data }: { data: InvestorPackData }) {
  // Merge canonical stub with any supplied scores so the table is always
  // 13 rows and never surfaces fabricated numbers.
  const supplied = new Map(
    data.svi.criteria.map((row) => [row.id, row] as const),
  );
  const rows = SVI_13_CRITERIA.map((canon) => {
    const hit = supplied.get(canon.id);
    return {
      id: canon.id,
      label: hit?.label ?? canon.label,
      score: hit?.score,
      delta: hit?.delta,
    };
  });

  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>SVI 13-criteria breakdown</Text>
      <Text style={s.h1Sub}>Per-criterion score and 30-day delta</Text>

      <View style={{ borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 }}>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, { width: "10%" }]}>ID</Text>
          <Text style={[s.tableHeaderCell, { width: "52%" }]}>Criterion</Text>
          <Text style={[s.tableHeaderCell, { width: "20%", textAlign: "right" }]}>
            Score / 100
          </Text>
          <Text style={[s.tableHeaderCell, { width: "18%", textAlign: "right" }]}>
            Δ 30d
          </Text>
        </View>
        {rows.map((row, i) => {
          const scoreText =
            typeof row.score === "number" && Number.isFinite(row.score)
              ? Math.round(row.score).toString()
              : "—";
          const scoreColorVal =
            typeof row.score === "number" && Number.isFinite(row.score)
              ? scoreBarColor(row.score)
              : C.ink400;
          return (
            <View
              key={row.id}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text
                style={[
                  s.tableCell,
                  { width: "10%", fontFamily: "Helvetica-Bold", color: C.ink500 },
                ]}
              >
                {row.id.toUpperCase()}
              </Text>
              <Text style={[s.tableCell, { width: "52%" }]}>{row.label}</Text>
              <Text
                style={[
                  s.tableCell,
                  {
                    width: "20%",
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold",
                    color: scoreColorVal,
                  },
                ]}
              >
                {scoreText}
              </Text>
              <Text
                style={[
                  s.tableCell,
                  {
                    width: "18%",
                    textAlign: "right",
                    color: deltaColor(row.delta),
                  },
                ]}
              >
                {formatDelta(row.delta)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text
        style={{
          marginTop: 10,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        Criteria that show &ldquo;—&rdquo; are not yet populated for this
        project. Add evidence in the BlockID workspace to complete the
        breakdown.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 4. Cap table snapshot ─────────────────────────────────────────────── */

function CapTablePage({ data }: { data: InvestorPackData }) {
  const rows = data.capTable ?? [];
  const hasData = rows.length > 0;

  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Cap table snapshot</Text>
      <Text style={s.h1Sub}>Shareholders, class, holdings and indicative value</Text>

      {!hasData && (
        <Placeholder label="Cap-table data unavailable — connect a cap table in the BlockID workspace to populate this section." />
      )}

      {hasData && (
        <View
          style={{
            borderWidth: 0.5,
            borderColor: C.surface200,
            borderRadius: 4,
          }}
        >
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: "34%" }]}>Shareholder</Text>
            <Text style={[s.tableHeaderCell, { width: "18%" }]}>Class</Text>
            <Text style={[s.tableHeaderCell, { width: "16%", textAlign: "right" }]}>
              Shares
            </Text>
            <Text style={[s.tableHeaderCell, { width: "12%", textAlign: "right" }]}>
              %
            </Text>
            <Text style={[s.tableHeaderCell, { width: "20%", textAlign: "right" }]}>
              Value (AUD)
            </Text>
          </View>
          {rows.map((row, i) => (
            <View
              key={`${row.shareholder}-${i}`}
              style={[
                s.tableRow,
                { backgroundColor: i % 2 === 0 ? C.white : C.surface50 },
              ]}
            >
              <Text style={[s.tableCell, { width: "34%", fontFamily: "Helvetica-Bold", color: C.ink800 }]}>
                {row.shareholder}
              </Text>
              <Text style={[s.tableCell, { width: "18%", color: C.ink600 }]}>
                {row.class}
              </Text>
              <Text style={[s.tableCell, { width: "16%", textAlign: "right" }]}>
                {row.shares.toLocaleString("en-AU")}
              </Text>
              <Text style={[s.tableCell, { width: "12%", textAlign: "right" }]}>
                {row.percentage.toFixed(2)}%
              </Text>
              <Text
                style={[
                  s.tableCell,
                  { width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold", color: C.brand700 },
                ]}
              >
                {formatAud(row.valueAud)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          marginTop: 12,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          lineHeight: 1.4,
        }}
      >
        Values shown are indicative only, based on the most recent valuation
        snapshot in the BlockID workspace. They are not an offer, a
        solicitation, or a warranty of the market price of any security.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 5. Traction chart page ────────────────────────────────────────────── */

function TractionPage({ data }: { data: InvestorPackData }) {
  const series = data.traction?.mrrHistory ?? [];
  const hasData = series.length >= 2;

  const chartW = 460;
  const chartH = 190;
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const padB = 28;

  let polyline = "";
  let dots: Array<[number, number, string, number]> = [];
  let maxY = 0;
  let minY = 0;

  if (hasData) {
    const values = series.map((p) => Math.max(0, p.mrrAud));
    maxY = Math.max(...values, 1);
    minY = Math.min(...values, 0);
    const usableW = chartW - padL - padR;
    const usableH = chartH - padT - padB;
    const stepX = series.length > 1 ? usableW / (series.length - 1) : 0;
    const scaleY = (v: number) =>
      padT + usableH - ((v - minY) / (maxY - minY || 1)) * usableH;

    const points = series.map((p, i) => {
      const x = padL + i * stepX;
      const y = scaleY(p.mrrAud);
      return [x, y, p.month, p.mrrAud] as [number, number, string, number];
    });
    polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    dots = points;
  }

  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>Traction</Text>
      <Text style={s.h1Sub}>Monthly recurring revenue (AUD)</Text>

      {!hasData && (
        <Placeholder label="MRR history unavailable — connect Stripe or upload a financial snapshot in the BlockID workspace to populate this chart." />
      )}

      {hasData && (
        <View
          style={{
            marginTop: 4,
            padding: 8,
            borderWidth: 0.5,
            borderColor: C.surface200,
            borderRadius: 6,
            backgroundColor: C.white,
          }}
        >
          <Svg width={chartW} height={chartH}>
            {/* Baseline */}
            <Line
              x1={padL}
              y1={chartH - padB}
              x2={chartW - padR}
              y2={chartH - padB}
              stroke={C.surface200}
              strokeWidth={0.8}
            />
            {/* Left axis */}
            <Line
              x1={padL}
              y1={padT}
              x2={padL}
              y2={chartH - padB}
              stroke={C.surface200}
              strokeWidth={0.8}
            />
            {/* Y-axis label — max */}
            <Text
              x={padL - 4}
              y={padT + 4}
              style={{ fontSize: 7, color: C.ink500 }}
              textAnchor="end"
            >
              {formatAud(maxY)}
            </Text>
            <Text
              x={padL - 4}
              y={chartH - padB + 1}
              style={{ fontSize: 7, color: C.ink500 }}
              textAnchor="end"
            >
              {formatAud(minY)}
            </Text>

            {/* Series polyline */}
            <Polyline
              points={polyline}
              stroke={C.brand600}
              strokeWidth={1.6}
              fill="none"
            />

            {/* Dots + x-labels every N */}
            {dots.map(([x, y, month], i) => {
              const showLabel =
                dots.length <= 8 ||
                i === 0 ||
                i === dots.length - 1 ||
                i % Math.ceil(dots.length / 6) === 0;
              return (
                <React.Fragment key={`p-${i}`}>
                  <Circle cx={x} cy={y} r={2.2} fill={C.brand700} />
                  {showLabel && (
                    <Text
                      x={x}
                      y={chartH - padB + 12}
                      style={{ fontSize: 6.5, color: C.ink500 }}
                      textAnchor="middle"
                    >
                      {month}
                    </Text>
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      )}

      {hasData && (
        <Text
          style={{
            marginTop: 10,
            fontSize: 8,
            color: C.ink500,
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          Series length: {series.length} datapoints. First point{" "}
          {series[0]?.month}: {formatAud(series[0]?.mrrAud ?? 0)}. Latest point{" "}
          {series[series.length - 1]?.month}:{" "}
          {formatAud(series[series.length - 1]?.mrrAud ?? 0)}.
        </Text>
      )}

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── 6. One-page teaser ────────────────────────────────────────────────── */

function OnePageTeaserPage({ data }: { data: InvestorPackData }) {
  const { startup, svi, teaser, traction } = data;
  const headline = teaser?.headline || startup.tagline || startup.name;
  const oneliner =
    teaser?.oneliner ||
    `${startup.name} — one-page teaser generated by BlockID.au for investor distribution.`;
  const latestMrr =
    traction?.mrrHistory && traction.mrrHistory.length
      ? traction.mrrHistory[traction.mrrHistory.length - 1]
      : null;

  return (
    <Page size="A4" style={s.page}>
      <HeaderBar />
      <Text style={s.h1}>One-page teaser</Text>
      <Text style={s.h1Sub}>Shareable summary — LinkedIn / warm-intro friendly</Text>

      <View
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 6,
          backgroundColor: C.brand50,
          borderLeftWidth: 3,
          borderLeftColor: C.brand600,
        }}
      >
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900 }}>
          {headline}
        </Text>
        <Text style={{ fontSize: 10, color: C.ink700, marginTop: 4, lineHeight: 1.5 }}>
          {oneliner}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <View style={s.quadrantBox}>
          <Text style={s.label}>SVI Grade</Text>
          <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: C.brand700, marginTop: 4 }}>
            {svi.grade || "—"}
          </Text>
          <Text style={{ fontSize: 8, color: C.ink500, marginTop: 2 }}>
            {Math.round(svi.score)} / 1000
          </Text>
        </View>
        <View style={s.quadrantBox}>
          <Text style={s.label}>Latest MRR</Text>
          <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 4 }}>
            {latestMrr ? formatAud(latestMrr.mrrAud) : "—"}
          </Text>
          <Text style={{ fontSize: 8, color: C.ink500, marginTop: 2 }}>
            {latestMrr ? latestMrr.month : "Data unavailable"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={s.quadrantBox}>
          <Text style={[s.label, { color: C.emerald600 }]}>Opportunity</Text>
          <Text style={{ fontSize: 9, color: C.ink700, marginTop: 4, lineHeight: 1.5 }}>
            {teaser?.opportunity || "Add an opportunity note in the workspace."}
          </Text>
        </View>
        <View style={s.quadrantBox}>
          <Text style={[s.label, { color: C.amber700 }]}>Key risk</Text>
          <Text style={{ fontSize: 9, color: C.ink700, marginTop: 4, lineHeight: 1.5 }}>
            {teaser?.risk || "Add a risk note in the workspace."}
          </Text>
        </View>
      </View>

      <Text
        style={{
          marginTop: 16,
          fontSize: 8,
          color: C.ink500,
          fontStyle: "italic",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Built on BlockID.au — the Australian startup viability index.
      </Text>

      <RegulatoryFooter />
    </Page>
  );
}

/* ─── Top-level document ────────────────────────────────────────────────── */

export const InvestorPackPdf: React.FC<{ data: InvestorPackData }> = ({ data }) => (
  <Document
    title={`Investor Pack — ${data.startup.name}`}
    author="BlockID.au"
    creator="BlockID.au Investor Pack v2"
    producer="Auschain PTY LTD"
    subject="Startup investor pack"
  >
    <CoverPage data={data} />
    <ExecutiveSummaryPage data={data} />
    <SviCriteriaPage data={data} />
    <CapTablePage data={data} />
    <TractionPage data={data} />
    <OnePageTeaserPage data={data} />
  </Document>
);

/* ─── Server helper ─────────────────────────────────────────────────────── */

/**
 * Render the investor pack to a Node Buffer. Callers (route handlers,
 * email pipeline, share-link creator in T-1206) can stream this out as
 * `application/pdf` directly.
 */
export async function renderInvestorPack(data: InvestorPackData): Promise<Buffer> {
  return renderToBuffer(<InvestorPackPdf data={data} />);
}

export default InvestorPackPdf;
