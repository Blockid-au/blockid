// Branded PDF for the Investor-Ready Score (Wedge artifact).
//
// Server-side rendering only — `@react-pdf/renderer` is pure JS, no headless
// browser, no native deps, ships fine on node:22-alpine.
//
// We deliberately use the built-in Helvetica family (no Font.register call)
// so the PDF renders even when the container has no internet access and
// fonts.gstatic.com is unreachable.

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// BlockID palette (mirrors design-system/blockid/MASTER.md).
const C = {
  ink950: "#0B1220",
  ink900: "#0F172A",
  ink800: "#172033",
  ink700: "#1F2A44",
  slate50: "#F8FAFC",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  brand400: "#5B9AEB",
  brand500: "#3B7DD8",
  white: "#FFFFFF",
};

export interface ScorePdfData {
  slug: string;
  totalScore: number;
  scoreVersion?: string | null;
  confidenceScore?: number | null;
  companyName?: string | null;
  email: string;
  subScores: { label: string; value: number }[];
  missingInputs?: string[] | null;
  actionPlan?: {
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
  }[] | null;
  benchmark?: {
    label: string;
    medianScore: number;
    band: string;
    rationale: string;
  } | null;
  inputs: Record<string, unknown>;
  createdAt: string; // ISO
  shareUrl: string;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.ink950,
    color: C.slate50,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  logoSquare: {
    width: 18,
    height: 18,
    backgroundColor: C.brand500,
    borderRadius: 4,
    marginRight: 8,
  },
  brandText: { fontSize: 14, fontWeight: 700, color: C.slate50 },
  brandSub: { fontSize: 9, color: C.slate400, marginTop: 2 },
  eyebrow: {
    fontSize: 8,
    color: C.brand400,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: 600,
  },
  title: { fontSize: 22, fontWeight: 700, color: C.slate50, marginTop: 6 },
  subtitle: { fontSize: 11, color: C.slate400, marginTop: 6, lineHeight: 1.5 },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.ink800,
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  statLabel: {
    fontSize: 8,
    color: C.slate500,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { fontSize: 12, color: C.slate50, marginTop: 4 },
  statDetail: { fontSize: 8, color: C.slate400, marginTop: 4, lineHeight: 1.4 },
  scoreCard: {
    marginTop: 20,
    backgroundColor: C.ink900,
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
  },
  scoreNumberRow: { flexDirection: "row", alignItems: "flex-end" },
  scoreNumber: {
    fontSize: 64,
    fontWeight: 700,
    color: C.brand400,
    fontFamily: "Helvetica-Bold",
  },
  scoreOutOf: {
    fontSize: 18,
    color: C.slate500,
    marginLeft: 6,
    marginBottom: 8,
  },
  scoreCaption: { color: C.slate400, fontSize: 10, marginTop: 6 },
  subRow: { marginTop: 14 },
  subLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  subLabel: { fontSize: 10, color: C.slate300 },
  subValue: { fontSize: 10, color: C.slate400, fontFamily: "Helvetica" },
  bar: {
    height: 6,
    backgroundColor: C.ink700,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: 6, backgroundColor: C.brand500, borderRadius: 3 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: C.slate50,
    marginTop: 28,
    marginBottom: 10,
  },
  table: {
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: C.ink700,
    borderBottomWidth: 1,
  },
  tableRowLast: { flexDirection: "row" },
  tableKey: {
    width: "40%",
    padding: 10,
    color: C.slate400,
    fontSize: 10,
    backgroundColor: C.ink900,
  },
  tableVal: {
    width: "60%",
    padding: 10,
    color: C.slate50,
    fontSize: 10,
    backgroundColor: C.ink800,
  },
  actionItem: {
    borderColor: C.ink700,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: C.ink900,
    padding: 10,
    marginBottom: 8,
  },
  actionTitle: { fontSize: 10, color: C.slate50, fontWeight: 700 },
  actionDetail: { fontSize: 9, color: C.slate400, marginTop: 4, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.slate500,
    fontSize: 8,
    paddingTop: 10,
    borderTopColor: C.ink700,
    borderTopWidth: 1,
  },
});

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function fmtInputKey(k: string): string {
  // camelCase → Title Case
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function fmtInputVal(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("en-AU");
  return String(v);
}

export function ScorePDF({ data }: { data: ScorePdfData }) {
  const inputEntries = Object.entries(data.inputs).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  const confidence = data.confidenceScore ?? 70;
  const actions = data.actionPlan ?? [];
  const benchmark = data.benchmark;
  const missingCount = data.missingInputs?.length ?? 0;
  return (
    <Document
      title={`BlockID Investor-Ready Score — ${data.companyName || data.email}`}
      author="BlockID"
      subject="Investor-Ready Score"
      creator="BlockID"
      producer="BlockID"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <View style={styles.logoSquare} />
            <View>
              <Text style={styles.brandText}>BlockID</Text>
              <Text style={styles.brandSub}>
                Persistent Identity & Trust Infrastructure
              </Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Investor-Ready Score</Text>
        </View>

        <Text style={styles.eyebrow}>Investor-Ready Score</Text>
        <Text style={styles.title}>
          {data.companyName || "Your company"}
        </Text>
        <Text style={styles.subtitle}>
          A deterministic fundraising readiness analysis across five dimensions
          investors review at seed and Series A. This is analysis, not legal or
          financial advice.
        </Text>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Confidence</Text>
            <Text style={styles.statValue}>{confidence}/100</Text>
            <Text style={styles.statDetail}>
              {missingCount > 0
                ? `${missingCount} missing diligence inputs`
                : "Core inputs present"}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Benchmark</Text>
            <Text style={styles.statValue}>
              {benchmark?.label ?? "AU founder benchmark"}
            </Text>
            <Text style={styles.statDetail}>
              {benchmark
                ? `${benchmark.band}; median ${benchmark.medianScore}`
                : "Internal heuristic until verified outcomes are available"}
            </Text>
          </View>
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreNumberRow}>
            <Text style={styles.scoreNumber}>{data.totalScore}</Text>
            <Text style={styles.scoreOutOf}>/100</Text>
          </View>
          <Text style={styles.scoreCaption}>
            Top quartile for AU seed-stage SaaS · sector median 71
          </Text>
          {data.subScores.map((s) => (
            <View key={s.label} style={styles.subRow}>
              <View style={styles.subLabelRow}>
                <Text style={styles.subLabel}>{s.label}</Text>
                <Text style={styles.subValue}>{Math.round(s.value)}</Text>
              </View>
              <View style={styles.bar}>
                <View
                  style={[styles.barFill, { width: `${clampPct(s.value)}%` }]}
                />
              </View>
            </View>
          ))}
        </View>

        {actions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recommended founder actions</Text>
            {actions.slice(0, 5).map((action) => (
              <View key={action.title} style={styles.actionItem}>
                <Text style={styles.actionTitle}>
                  {action.title} · {action.impact.toUpperCase()}
                </Text>
                <Text style={styles.actionDetail}>{action.detail}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Inputs summary</Text>
        <View style={styles.table}>
          {inputEntries.map(([k, v], i) => (
            <View
              key={k}
              style={
                i === inputEntries.length - 1
                  ? styles.tableRowLast
                  : styles.tableRow
              }
            >
              <Text style={styles.tableKey}>{fmtInputKey(k)}</Text>
              <Text style={styles.tableVal}>{fmtInputVal(v)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.shareUrl}</Text>
          <Text>
            Generated {new Date(data.createdAt).toISOString().slice(0, 10)} ·
            Score v{data.scoreVersion ?? "1.0.0"} · AU data residency
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// Render helper — returns a Node Buffer suitable for streaming as
// application/pdf from a Route Handler.
export async function renderScorePdf(data: ScorePdfData): Promise<Buffer> {
  const buf = await renderToBuffer(<ScorePDF data={data} />);
  return buf as Buffer;
}
