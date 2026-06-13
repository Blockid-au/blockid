// Fundraising Readiness Report PDF — full multi-page report.
//
// Server-side rendering only — @react-pdf/renderer, no headless browser.
// Uses built-in Helvetica family for offline container compatibility.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SVISubScore } from "@/lib/svi-analysis";

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  // Ink / background
  ink950: "#0B1220",
  ink900: "#0F172A",
  ink800: "#172033",
  ink700: "#1F2A44",
  // Surface
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  // Brand (indigo)
  brand400: "#818CF8",
  brand500: "#6366F1",
  brand600: "#4F46E5",
  // Trust green
  green400: "#34D399",
  green500: "#10B981",
  green600: "#059669",
  // Amber
  amber400: "#FBBF24",
  amber500: "#F59E0B",
  // Red
  red400: "#F87171",
  red500: "#EF4444",
  // White
  white: "#FFFFFF",
};

// ── Data shape ────────────────────────────────────────────────────────────────

export interface FundraisingReportData {
  slug: string;
  shareUrl: string;
  companyName: string;
  email: string;
  createdAt: string; // ISO

  // SVI
  totalSVI: number;
  sviVersion: string;
  confidenceMultiplier: number; // 0.0–1.0
  stage: number;                // 0–7
  stageLabel: string;
  percentileRank?: number;

  // Sub-scores (8 SVI dimensions)
  dimensions: SVISubScore[];

  // Next actions
  nextActions: {
    priority: "P0" | "P1" | "P2";
    title: string;
    detail: string;
    impact: string;
  }[];

  // Evidence / data room
  evidenceGaps: {
    priority: "P0" | "P1" | "P2";
    label: string;
    action: string;
    impact: number;
    evidenceType: string;
  }[];

  evidenceCount: number;

  // Risk penalties
  riskPenalties: {
    label: string;
    points: number;
    reason: string;
  }[];

  // Cap table — optional fields from inputs
  capTableData?: {
    founders?: number;
    esopAllocated?: number;
    hasShareholdersAgreement?: boolean;
    targetRaiseAud?: number;
    valuationCapAud?: number;
  };

  // Proof / tamper-evidence
  proofHash?: string | null;

  // AI summary
  summary?: string | null;

  // v2 — Fundraising Checklist (data_room_checklist)
  fundraisingChecklist?: {
    label: string;
    category: string;
    status: "pending" | "in_progress" | "complete" | "not_applicable";
    priority: "P0" | "P1" | "P2";
    notes?: string | null;
  }[];

  // v2 — Comparable AU raises at this stage (from benchmarks.ts)
  comparableRaises?: {
    stageLabel: string;
    typicalArrAud: { p25: number; p50: number; p75: number };
    typicalBurnAud: { p25: number; p50: number; p75: number };
    typicalRunwayMonths: { p25: number; p50: number; p75: number };
    typicalGrowthMonthPct: { p25: number; p50: number; p75: number };
    notes?: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function scoreColor(v: number): string {
  if (v >= 75) return C.green500;
  if (v >= 50) return C.brand500;
  if (v >= 35) return C.amber500;
  return C.red400;
}

function impactBadgeColor(priority: "P0" | "P1" | "P2"): string {
  if (priority === "P0") return C.red400;
  if (priority === "P1") return C.amber500;
  return C.slate400;
}

function fmtCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

function confidenceLabel(m: number): string {
  const pct = Math.round(m * 100);
  if (pct >= 80) return "High";
  if (pct >= 50) return "Medium";
  return "Low";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Cover page
  coverPage: {
    backgroundColor: C.ink950,
    color: C.slate50,
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 10,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  coverLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  coverLogoSquare: {
    width: 22,
    height: 22,
    backgroundColor: C.brand500,
    borderRadius: 5,
  },
  coverBrandText: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.slate50,
  },
  coverBrandSub: {
    fontSize: 9,
    color: C.slate400,
    marginTop: 2,
  },
  coverHero: {
    marginTop: 80,
  },
  coverEyebrow: {
    fontSize: 9,
    color: C.brand400,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    lineHeight: 1.25,
  },
  coverSubtitle: {
    fontSize: 13,
    color: C.slate400,
    marginTop: 10,
    lineHeight: 1.5,
  },
  coverDivider: {
    marginTop: 48,
    height: 1,
    backgroundColor: C.ink700,
  },
  coverMeta: {
    marginTop: 24,
    flexDirection: "row",
    gap: 32,
  },
  coverMetaItem: {},
  coverMetaLabel: {
    fontSize: 8,
    color: C.slate500,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  coverMetaValue: {
    fontSize: 11,
    color: C.slate300,
    marginTop: 3,
  },
  coverFooter: {
    marginTop: "auto",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.ink700,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverFooterLeft: {},
  coverFooterRight: {},
  coverFooterText: {
    fontSize: 8,
    color: C.slate500,
  },
  coverWatermark: {
    fontSize: 7,
    color: C.ink700,
    marginTop: 4,
  },
  // ── Interior pages
  page: {
    backgroundColor: C.slate50,
    color: C.ink900,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.slate200,
    marginBottom: 20,
  },
  pageHeaderBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageHeaderLogoSquare: {
    width: 12,
    height: 12,
    backgroundColor: C.brand500,
    borderRadius: 3,
  },
  pageHeaderBrandText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.ink800,
  },
  pageHeaderRight: {
    fontSize: 8,
    color: C.slate400,
  },
  sectionEyebrow: {
    fontSize: 8,
    color: C.brand500,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 14,
  },
  sectionBody: {
    fontSize: 10,
    color: C.slate500,
    lineHeight: 1.5,
    marginBottom: 16,
  },
  // ── Score card
  scoreCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 10,
    padding: 20,
    marginBottom: 14,
  },
  scoreNumberRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  scoreNumber: {
    fontSize: 56,
    fontFamily: "Helvetica-Bold",
    color: C.brand500,
  },
  scoreOutOf: {
    fontSize: 20,
    color: C.slate400,
    marginLeft: 4,
    marginBottom: 6,
  },
  scoreLabel: {
    fontSize: 9,
    color: C.slate400,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  // Gauge bar
  gaugeTrack: {
    marginTop: 12,
    height: 10,
    backgroundColor: C.slate200,
    borderRadius: 5,
    overflow: "hidden",
  },
  gaugeFill: {
    height: 10,
    borderRadius: 5,
  },
  gaugeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  gaugeLabel: {
    fontSize: 7,
    color: C.slate400,
  },
  // Stat pills row
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  statPill: {
    flex: 1,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 8,
    padding: 10,
  },
  statLabel: {
    fontSize: 7,
    color: C.slate400,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginTop: 3,
  },
  statDetail: {
    fontSize: 7,
    color: C.slate400,
    marginTop: 3,
    lineHeight: 1.4,
  },
  // ── Dimension table
  dimTable: {
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 6,
  },
  dimHeader: {
    flexDirection: "row",
    backgroundColor: C.ink900,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dimHeaderCell: {
    fontSize: 7,
    color: C.slate400,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  dimRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.slate200,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: C.white,
  },
  dimRowAlt: {
    backgroundColor: C.slate50,
  },
  dimCellLabel: {
    width: "28%",
    fontSize: 9,
    color: C.ink800,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.3,
  },
  dimCellScore: {
    width: "12%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  dimCellBar: {
    width: "20%",
    paddingTop: 3,
  },
  dimBarTrack: {
    height: 5,
    backgroundColor: C.slate200,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  dimBarFill: {
    height: 5,
    borderRadius: 2.5,
  },
  dimCellEvidence: {
    width: "15%",
    fontSize: 8,
    color: C.slate500,
  },
  dimCellRationale: {
    width: "25%",
    fontSize: 8,
    color: C.slate500,
    lineHeight: 1.3,
  },
  // ── Action items
  actionCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    gap: 10,
  },
  actionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionBadgeText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink900,
    marginBottom: 3,
  },
  actionDetail: {
    fontSize: 8.5,
    color: C.slate500,
    lineHeight: 1.4,
  },
  actionImpact: {
    fontSize: 7,
    color: C.slate400,
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },
  // ── Cap table
  capTableCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  capRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.slate200,
  },
  capRowLast: {
    flexDirection: "row",
  },
  capKey: {
    width: "45%",
    padding: 10,
    fontSize: 9,
    color: C.slate500,
    backgroundColor: C.slate50,
  },
  capVal: {
    width: "55%",
    padding: 10,
    fontSize: 9,
    color: C.ink800,
    fontFamily: "Helvetica-Bold",
  },
  placeholder: {
    backgroundColor: C.slate100,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 9,
    color: C.slate400,
    lineHeight: 1.4,
    fontStyle: "italic",
  },
  // ── Checklist
  checklistItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.slate200,
  },
  checklistItemLast: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
  },
  checkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
    marginTop: 1,
  },
  checkLabel: {
    fontSize: 9,
    color: C.ink800,
    flex: 1,
    lineHeight: 1.4,
  },
  checkStatus: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    width: 60,
    textAlign: "right",
  },
  // ── Proof section
  proofCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  proofRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  proofLabel: {
    fontSize: 9,
    color: C.slate400,
    width: 80,
  },
  proofValue: {
    fontSize: 9,
    color: C.ink800,
    flex: 1,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.3,
  },
  proofHashText: {
    fontSize: 7.5,
    color: C.slate400,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  // ── Disclaimer
  disclaimerBox: {
    backgroundColor: C.slate100,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 8.5,
    color: C.slate400,
    lineHeight: 1.5,
  },
  // ── Footer (fixed)
  footer: {
    position: "absolute",
    bottom: 20,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.slate200,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: C.slate400,
  },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({ company, reportDate }: { company: string; reportDate: string }) {
  return (
    <View style={s.pageHeader} fixed>
      <View style={s.pageHeaderBrand}>
        <View style={s.pageHeaderLogoSquare} />
        <Text style={s.pageHeaderBrandText}>BlockID</Text>
      </View>
      <Text style={s.pageHeaderRight}>
        {company} · Fundraising Readiness Report · {reportDate}
      </Text>
    </View>
  );
}

function PageFooter({ shareUrl }: { shareUrl: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{shareUrl}</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

// ── Cover page ────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  return (
    <Page size="A4" style={s.coverPage}>
      {/* Logo */}
      <View style={s.coverLogoRow}>
        <View style={s.coverLogoSquare} />
        <View>
          <Text style={s.coverBrandText}>BlockID</Text>
          <Text style={s.coverBrandSub}>AI-Powered Startup Intelligence · AU Data Residency</Text>
        </View>
      </View>

      {/* Hero */}
      <View style={s.coverHero}>
        <Text style={s.coverEyebrow}>Fundraising Readiness Report</Text>
        <Text style={s.coverTitle}>{data.companyName}</Text>
        <Text style={s.coverSubtitle}>
          A comprehensive AI-powered analysis of your startup&apos;s fundraising readiness
          across eight dimensions. Designed for sharing with investors during due diligence.
        </Text>
      </View>

      {/* Divider + meta */}
      <View style={s.coverDivider} />
      <View style={s.coverMeta}>
        <View style={s.coverMetaItem}>
          <Text style={s.coverMetaLabel}>Generated</Text>
          <Text style={s.coverMetaValue}>{reportDate}</Text>
        </View>
        <View style={s.coverMetaItem}>
          <Text style={s.coverMetaLabel}>Stage</Text>
          <Text style={s.coverMetaValue}>{data.stageLabel}</Text>
        </View>
        <View style={s.coverMetaItem}>
          <Text style={s.coverMetaLabel}>SVI Score</Text>
          <Text style={s.coverMetaValue}>{data.totalSVI}</Text>
        </View>
        <View style={s.coverMetaItem}>
          <Text style={s.coverMetaLabel}>Confidence</Text>
          <Text style={s.coverMetaValue}>
            {confidenceLabel(data.confidenceMultiplier)} ({Math.round(data.confidenceMultiplier * 100)}%)
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={s.coverFooter}>
        <View style={s.coverFooterLeft}>
          <Text style={s.coverFooterText}>blockid.au</Text>
          <Text style={s.coverWatermark}>Not financial or legal advice.</Text>
        </View>
        <View style={s.coverFooterRight}>
          <Text style={s.coverFooterText}>Report ID: {data.slug}</Text>
          <Text style={s.coverFooterText}>v{data.sviVersion}</Text>
        </View>
      </View>
    </Page>
  );
}

// ── Page 2 — Investor-Ready Score ─────────────────────────────────────────────

function ScorePage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const confidencePct = Math.round(data.confidenceMultiplier * 100);
  // SVI is open-ended (base 100); clamp gauge to max 200 for display
  const gaugeMax = 200;
  const gaugePct = clampPct((data.totalSVI / gaugeMax) * 100);

  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      <Text style={s.sectionEyebrow}>Section 1</Text>
      <Text style={s.sectionTitle}>Investor-Ready Score</Text>
      <Text style={s.sectionBody}>
        The Startup Value Index (SVI) is an open-ended composite score starting
        at a baseline of 100 and adjusting up or down based on eight evidence
        dimensions. A score above your stage benchmark indicates above-median
        fundraising readiness.
      </Text>

      {/* Score card */}
      <View style={s.scoreCard}>
        <View style={s.scoreNumberRow}>
          <Text style={s.scoreNumber}>{data.totalSVI}</Text>
          <Text style={s.scoreOutOf}>SVI</Text>
        </View>
        <Text style={s.scoreLabel}>Startup Value Index · {data.stageLabel}</Text>

        {/* Gauge bar */}
        <View style={s.gaugeTrack}>
          <View
            style={[
              s.gaugeFill,
              {
                width: `${gaugePct}%`,
                backgroundColor: C.brand500,
              },
            ]}
          />
        </View>
        <View style={s.gaugeLabels}>
          <Text style={s.gaugeLabel}>0</Text>
          <Text style={s.gaugeLabel}>50</Text>
          <Text style={s.gaugeLabel}>100 (baseline)</Text>
          <Text style={s.gaugeLabel}>150</Text>
          <Text style={s.gaugeLabel}>200+</Text>
        </View>
      </View>

      {/* Stat pills */}
      <View style={s.statRow}>
        <View style={s.statPill}>
          <Text style={s.statLabel}>Confidence</Text>
          <Text style={[s.statValue, { color: confidencePct >= 70 ? C.green500 : C.amber500 }]}>
            {confidenceLabel(data.confidenceMultiplier)}
          </Text>
          <Text style={s.statDetail}>{confidencePct}% evidence quality</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statLabel}>Stage</Text>
          <Text style={s.statValue}>{data.stageLabel}</Text>
          <Text style={s.statDetail}>Stage {data.stage + 1} of 8</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statLabel}>Percentile</Text>
          <Text style={s.statValue}>
            {data.percentileRank
              ? data.percentileRank >= 75
                ? `Top ${100 - data.percentileRank}%`
                : `${data.percentileRank}th`
              : "—"}
          </Text>
          <Text style={s.statDetail}>Within stage cohort</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statLabel}>Dimensions</Text>
          <Text style={s.statValue}>{data.dimensions.length}</Text>
          <Text style={s.statDetail}>{data.evidenceCount} evidence items</Text>
        </View>
      </View>

      {/* AI summary */}
      {data.summary && (
        <View style={[s.scoreCard, { marginTop: 14 }]}>
          <Text style={[s.sectionEyebrow, { marginBottom: 6 }]}>AI Summary</Text>
          <Text style={{ fontSize: 9.5, color: C.slate500, lineHeight: 1.5 }}>
            {data.summary}
          </Text>
        </View>
      )}

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── Page 3 — Sub-score Breakdown ──────────────────────────────────────────────

function DimensionsPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      <Text style={s.sectionEyebrow}>Section 2</Text>
      <Text style={s.sectionTitle}>Sub-score Breakdown</Text>
      <Text style={s.sectionBody}>
        Eight dimensions scored 0–100. Each dimension includes evidence items
        verified at various confidence levels and a rationale statement.
      </Text>

      <View style={s.dimTable}>
        {/* Header */}
        <View style={s.dimHeader}>
          <Text style={[s.dimHeaderCell, { width: "28%" }]}>Dimension</Text>
          <Text style={[s.dimHeaderCell, { width: "12%" }]}>Score</Text>
          <Text style={[s.dimHeaderCell, { width: "20%" }]}>Gauge</Text>
          <Text style={[s.dimHeaderCell, { width: "15%" }]}>Evidence</Text>
          <Text style={[s.dimHeaderCell, { width: "25%" }]}>Rationale</Text>
        </View>

        {data.dimensions.map((dim, i) => {
          const fillColor = scoreColor(dim.value);
          const isLast = i === data.dimensions.length - 1;
          return (
            <View
              key={dim.key}
              style={[s.dimRow, i % 2 === 1 ? s.dimRowAlt : {}, isLast ? { borderTopWidth: 0 } : {}]}
            >
              <Text style={s.dimCellLabel}>{dim.label}</Text>
              <Text style={[s.dimCellScore, { color: fillColor }]}>
                {Math.round(dim.value)}
              </Text>
              <View style={s.dimCellBar}>
                <View style={s.dimBarTrack}>
                  <View
                    style={[
                      s.dimBarFill,
                      { width: `${clampPct(dim.value)}%`, backgroundColor: fillColor },
                    ]}
                  />
                </View>
              </View>
              <Text style={s.dimCellEvidence}>
                {dim.evidence.length > 0 ? dim.evidence[0] : "—"}
              </Text>
              <Text style={s.dimCellRationale}>
                {dim.rationale || (dim.gaps[0] ? `Gap: ${dim.gaps[0]}` : "—")}
              </Text>
            </View>
          );
        })}
      </View>

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── Page 4 — Founder Action Plan ──────────────────────────────────────────────

function ActionPlanPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const actions = data.nextActions.slice(0, 5);
  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      <Text style={s.sectionEyebrow}>Section 3</Text>
      <Text style={s.sectionTitle}>Founder Action Plan</Text>
      <Text style={s.sectionBody}>
        Top recommended actions to improve your fundraising readiness score.
        P0 items are critical before investor meetings; P1 items should be
        addressed in the next 30 days; P2 items are nice-to-have.
      </Text>

      {actions.length === 0 && (
        <View style={s.placeholder}>
          <Text style={s.placeholderText}>
            No priority actions identified. Complete your evidence submissions in
            the BlockID dashboard to generate personalised recommendations.
          </Text>
        </View>
      )}

      {actions.map((action, i) => (
        <View key={i} style={s.actionCard}>
          <View
            style={[
              s.actionBadge,
              { backgroundColor: impactBadgeColor(action.priority) },
            ]}
          >
            <Text style={s.actionBadgeText}>{action.priority}</Text>
          </View>
          <View style={s.actionContent}>
            <Text style={s.actionTitle}>{action.title}</Text>
            <Text style={s.actionDetail}>{action.detail}</Text>
            <Text style={s.actionImpact}>Impact: {action.impact}</Text>
          </View>
        </View>
      ))}

      {/* Evidence gaps */}
      {data.evidenceGaps.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { fontSize: 12, marginTop: 16, marginBottom: 8 }]}>
            Evidence Gaps to Close
          </Text>
          {data.evidenceGaps.slice(0, 5).map((gap, i) => (
            <View key={i} style={s.actionCard}>
              <View
                style={[
                  s.actionBadge,
                  { backgroundColor: impactBadgeColor(gap.priority) },
                ]}
              >
                <Text style={s.actionBadgeText}>{gap.priority}</Text>
              </View>
              <View style={s.actionContent}>
                <Text style={s.actionTitle}>{gap.label}</Text>
                <Text style={s.actionDetail}>{gap.action}</Text>
                <Text style={s.actionImpact}>
                  +{gap.impact} SVI pts potential · Evidence type: {gap.evidenceType}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── Page 5 — Cap Table & Data Room ────────────────────────────────────────────

function CapTablePage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const cap = data.capTableData;

  const dataRoomItems: { label: string; present: boolean }[] = [
    {
      label: "Shareholders Agreement",
      present: cap?.hasShareholdersAgreement ?? false,
    },
    { label: "ESOP / Option Pool", present: (cap?.esopAllocated ?? 0) > 0 },
    { label: "Financial Model", present: false },
    { label: "Pitch Deck", present: false },
    {
      label: "Target Raise & Valuation Cap",
      present:
        (cap?.targetRaiseAud ?? 0) > 0 || (cap?.valuationCapAud ?? 0) > 0,
    },
    { label: "Audited Financials", present: false },
    { label: "Board Minutes / Governance Records", present: false },
    { label: "IP / Patent Documentation", present: false },
  ];

  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      {/* Cap table */}
      <Text style={s.sectionEyebrow}>Section 4</Text>
      <Text style={s.sectionTitle}>Cap Table Summary</Text>

      {cap ? (
        <View style={s.capTableCard}>
          {cap.founders != null && (
            <View style={s.capRow}>
              <Text style={s.capKey}>Number of founders</Text>
              <Text style={s.capVal}>{cap.founders}</Text>
            </View>
          )}
          {cap.esopAllocated != null && (
            <View style={s.capRow}>
              <Text style={s.capKey}>ESOP / option pool</Text>
              <Text style={s.capVal}>{cap.esopAllocated}% allocated</Text>
            </View>
          )}
          {cap.hasShareholdersAgreement != null && (
            <View style={s.capRow}>
              <Text style={s.capKey}>Shareholders Agreement</Text>
              <Text
                style={[
                  s.capVal,
                  { color: cap.hasShareholdersAgreement ? C.green500 : C.red400 },
                ]}
              >
                {cap.hasShareholdersAgreement ? "In place" : "Not confirmed"}
              </Text>
            </View>
          )}
          {cap.targetRaiseAud != null && cap.targetRaiseAud > 0 && (
            <View style={s.capRow}>
              <Text style={s.capKey}>Target raise</Text>
              <Text style={s.capVal}>{fmtCurrency(cap.targetRaiseAud)} AUD</Text>
            </View>
          )}
          {cap.valuationCapAud != null && cap.valuationCapAud > 0 && (
            <View style={s.capRowLast}>
              <Text style={s.capKey}>Valuation / cap</Text>
              <Text style={s.capVal}>{fmtCurrency(cap.valuationCapAud)} AUD</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={s.placeholder}>
          <Text style={s.placeholderText}>
            Complete your cap table in the BlockID dashboard to display
            founder percentages, investor allocations, and vesting schedules here.
          </Text>
        </View>
      )}

      {/* Data room checklist */}
      <Text style={[s.sectionTitle, { fontSize: 12, marginTop: 20, marginBottom: 8 }]}>
        Data Room Checklist
      </Text>
      <Text style={[s.sectionBody, { marginBottom: 10 }]}>
        Standard investor due diligence documents. Items marked as present were
        confirmed during score submission. Remaining items should be uploaded
        before sharing this report with investors.
      </Text>

      <View>
        {dataRoomItems.map((item, i) => {
          const isLast = i === dataRoomItems.length - 1;
          return (
            <View key={i} style={isLast ? s.checklistItemLast : s.checklistItem}>
              <View
                style={[
                  s.checkDot,
                  {
                    backgroundColor: item.present ? C.green500 : C.slate300,
                  },
                ]}
              />
              <Text style={s.checkLabel}>{item.label}</Text>
              <Text
                style={[
                  s.checkStatus,
                  { color: item.present ? C.green500 : C.slate400 },
                ]}
              >
                {item.present ? "Present" : "Missing"}
              </Text>
            </View>
          );
        })}
      </View>

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── Page 6 — Proof & Disclaimer ───────────────────────────────────────────────

function ProofPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const hasProof = Boolean(data.proofHash);

  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      {/* Proof status */}
      <Text style={s.sectionEyebrow}>Section 5</Text>
      <Text style={s.sectionTitle}>Tamper-Evident Proof Status</Text>

      <View style={s.proofCard}>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>Status</Text>
          <Text style={[s.proofValue, { color: hasProof ? C.green500 : C.amber500 }]}>
            {hasProof ? "Proof exists for this score" : "Proof not yet generated"}
          </Text>
        </View>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>Report ID</Text>
          <Text style={s.proofValue}>{data.slug}</Text>
        </View>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>Score version</Text>
          <Text style={s.proofValue}>{data.sviVersion}</Text>
        </View>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>Generated</Text>
          <Text style={s.proofValue}>{data.createdAt}</Text>
        </View>
        {data.proofHash && (
          <View style={s.proofRow}>
            <Text style={s.proofLabel}>Proof hash</Text>
            <Text style={s.proofHashText}>{data.proofHash}</Text>
          </View>
        )}
        {!hasProof && (
          <View style={{ marginTop: 6 }}>
            <Text style={[s.proofHashText, { color: C.slate400 }]}>
              Generate a tamper-evident proof in your BlockID dashboard to anchor
              this report to an immutable record investors can independently verify.
            </Text>
          </View>
        )}
      </View>

      {/* Risk factors */}
      {data.riskPenalties.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { fontSize: 12, marginBottom: 8 }]}>
            Risk Penalties Applied
          </Text>
          {data.riskPenalties.map((risk, i) => (
            <View key={i} style={s.actionCard}>
              <View style={[s.actionBadge, { backgroundColor: C.red500 }]}>
                <Text style={s.actionBadgeText}>−{risk.points}</Text>
              </View>
              <View style={s.actionContent}>
                <Text style={s.actionTitle}>{risk.label}</Text>
                <Text style={s.actionDetail}>{risk.reason}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Disclaimer */}
      <Text style={[s.sectionTitle, { fontSize: 12, marginTop: 20, marginBottom: 8 }]}>
        Important Disclaimer
      </Text>
      <View style={s.disclaimerBox}>
        <Text style={s.disclaimerText}>
          This report is generated by artificial intelligence and is provided for
          informational purposes only. It does not constitute financial advice,
          investment advice, legal advice, or a recommendation to buy, sell, or
          hold any security or financial instrument.{"\n\n"}
          The Startup Value Index (SVI) is an internal heuristic developed by
          BlockID. It is not a credit rating, valuation, or guarantee of investment
          suitability. Investors and founders should conduct their own independent
          due diligence before making any investment or business decision.{"\n\n"}
          BlockID Pty Ltd (ABN — see blockid.au) accepts no liability for decisions
          made on the basis of this report. All data is stored in Australian data
          centres in compliance with Australian Privacy Act 1988 obligations.{"\n\n"}
          BlockID Startup Index™ is a proprietary methodology of BlockID Pty Ltd.
          Unauthorised reproduction or distribution of this report is prohibited.
        </Text>
      </View>

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── v2 — Page: Fundraising Checklist ──────────────────────────────────────────

function FundraisingChecklistPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const items = data.fundraisingChecklist ?? [];
  const total = items.length;
  const complete = items.filter((i) => i.status === "complete").length;
  const completionPct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const statusColor = (status: string) =>
    status === "complete"
      ? C.green500
      : status === "in_progress"
        ? C.amber500
        : status === "not_applicable"
          ? C.slate400
          : C.red400;

  const statusLabel = (status: string) =>
    status === "complete"
      ? "Complete"
      : status === "in_progress"
        ? "In progress"
        : status === "not_applicable"
          ? "N/A"
          : "Missing";

  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      <Text style={s.sectionEyebrow}>Section 5</Text>
      <Text style={s.sectionTitle}>Fundraising Checklist</Text>
      <Text style={s.disclaimerText}>
        Every document and artefact a typical AU investor will ask for before
        committing. Source: your live data_room_checklist; fall back to the
        BlockID stage-appropriate default if no checklist exists.
      </Text>

      <View style={[s.proofCard, { marginBottom: 14 }]}>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>Completion</Text>
          <Text style={[s.proofValue, { color: scoreColor(completionPct) }]}>
            {complete} / {total} items · {completionPct}%
          </Text>
        </View>
        <View style={s.proofRow}>
          <Text style={s.proofLabel}>P0 missing</Text>
          <Text style={[s.proofValue, { color: C.red400 }]}>
            {items.filter((i) => i.priority === "P0" && i.status !== "complete").length}
          </Text>
        </View>
      </View>

      {items.length === 0 && (
        <Text style={[s.disclaimerText, { marginBottom: 12 }]}>
          No checklist items recorded yet — head to /workspace/data-room to
          start tracking your fundraising readiness items.
        </Text>
      )}

      {items.map((item, i) => (
        <View key={i} style={s.actionCard}>
          <View
            style={[
              s.actionBadge,
              { backgroundColor: impactBadgeColor(item.priority) },
            ]}
          >
            <Text style={s.actionBadgeText}>{item.priority}</Text>
          </View>
          <View style={s.actionContent}>
            <Text style={s.actionTitle}>
              {item.label}{" "}
              <Text style={{ color: C.slate400, fontSize: 9 }}>
                · {item.category}
              </Text>
            </Text>
            <Text style={[s.actionDetail, { color: statusColor(item.status) }]}>
              {statusLabel(item.status)}
              {item.notes ? ` — ${item.notes}` : ""}
            </Text>
          </View>
        </View>
      ))}

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── v2 — Page: AU Comparable Raises ───────────────────────────────────────────

function ComparableRaisesPage({ data }: { data: FundraisingReportData }) {
  const reportDate = data.createdAt.slice(0, 10);
  const cmp = data.comparableRaises;

  if (!cmp) {
    return (
      <Page size="A4" style={s.page}>
        <PageHeader company={data.companyName} reportDate={reportDate} />
        <Text style={s.sectionEyebrow}>Section 6</Text>
        <Text style={s.sectionTitle}>AU Comparable Raises</Text>
        <Text style={s.disclaimerText}>
          Comparable AU raise data unavailable for your stage.
        </Text>
        <PageFooter shareUrl={data.shareUrl} />
      </Page>
    );
  }

  const row = (label: string, band: { p25: number; p50: number; p75: number }, fmt: (n: number) => string) => (
    <View style={s.proofRow}>
      <Text style={s.proofLabel}>{label}</Text>
      <Text style={s.proofValue}>
        p25 {fmt(band.p25)} · p50 {fmt(band.p50)} · p75 {fmt(band.p75)}
      </Text>
    </View>
  );

  return (
    <Page size="A4" style={s.page}>
      <PageHeader company={data.companyName} reportDate={reportDate} />

      <Text style={s.sectionEyebrow}>Section 6</Text>
      <Text style={s.sectionTitle}>AU Comparable Raises — {cmp.stageLabel}</Text>
      <Text style={s.disclaimerText}>
        Where you sit relative to anonymised Australian startups at the same
        stage. Data sourced from the BlockID benchmarks dataset (pre-seed →
        Series B+).
      </Text>

      <View style={s.proofCard}>
        {row("ARR (AUD)", cmp.typicalArrAud, fmtCurrency)}
        {row("Monthly burn (AUD)", cmp.typicalBurnAud, fmtCurrency)}
        {row("Runway (months)", cmp.typicalRunwayMonths, (n) => `${n.toFixed(0)} mo`)}
        {row("Growth / month (%)", cmp.typicalGrowthMonthPct, (n) => `${n.toFixed(0)}%`)}
      </View>

      {cmp.notes && (
        <View style={s.disclaimerBox}>
          <Text style={s.disclaimerText}>{cmp.notes}</Text>
        </View>
      )}

      <PageFooter shareUrl={data.shareUrl} />
    </Page>
  );
}

// ── Document root ─────────────────────────────────────────────────────────────

export function FundraisingReportPDF({ data }: { data: FundraisingReportData }) {
  const companyDisplay = data.companyName || data.email;
  return (
    <Document
      title={`BlockID Fundraising Readiness Report — ${companyDisplay}`}
      author="BlockID"
      subject="Fundraising Readiness Report"
      creator="BlockID"
      producer="BlockID"
    >
      <CoverPage data={data} />
      <ScorePage data={data} />
      <DimensionsPage data={data} />
      <ActionPlanPage data={data} />
      <FundraisingChecklistPage data={data} />
      <ComparableRaisesPage data={data} />
      <CapTablePage data={data} />
      <ProofPage data={data} />
    </Document>
  );
}

// Render helper — returns a Node Buffer suitable for streaming as application/pdf.
export async function renderFundraisingReport(
  data: FundraisingReportData,
): Promise<Buffer> {
  const buf = await renderToBuffer(<FundraisingReportPDF data={data} />);
  return buf as Buffer;
}
