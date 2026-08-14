/**
 * GTM Strategy PDF — 12-page playbook.
 *
 * Consumes the `GtmStrategyOutput` shape from
 * `lib/agents/cmo-market-research.ts` plus the founder/startup context.
 */
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { GtmStrategyOutput } from "@/lib/agents/cmo-market-research";

const C = {
  ink900: "#0F172A",
  ink700: "#334155",
  ink500: "#64748B",
  ink400: "#94A3B8",
  surface200: "#E2E8F0",
  surface100: "#F1F5F9",
  brand600: "#2563EB",
  brand50: "#EFF6FF",
  amber700: "#B45309",
  amber50: "#FFFBEB",
  emerald700: "#047857",
  emerald50: "#ECFDF5",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink700,
    backgroundColor: C.white,
    paddingHorizontal: 42,
    paddingVertical: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
    paddingBottom: 10,
  },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600 },
  subtitle: { fontSize: 8, color: C.ink400, marginTop: 2 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 6 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.surface200,
    paddingBottom: 3,
  },
  para: { fontSize: 10, color: C.ink700, lineHeight: 1.5, marginBottom: 6 },
  callout: {
    backgroundColor: C.brand50,
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.brand600,
    marginBottom: 10,
  },
  bullet: { flexDirection: "row", marginBottom: 4 },
  dot: { width: 8, color: C.brand600 },
  bulletText: { flex: 1, fontSize: 10, color: C.ink700, lineHeight: 1.4 },
  channelRow: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: C.surface200,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  chName: { width: 130, fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink900 },
  chPriority: { width: 55, fontSize: 8, textAlign: "center" },
  chBadgeHigh: {
    backgroundColor: C.brand50,
    color: C.brand600,
    padding: 2,
    borderRadius: 3,
  },
  chBadgeMed: {
    backgroundColor: C.amber50,
    color: C.amber700,
    padding: 2,
    borderRadius: 3,
  },
  chBadgeLow: {
    backgroundColor: C.surface100,
    color: C.ink500,
    padding: 2,
    borderRadius: 3,
  },
  chRationale: { flex: 1, fontSize: 9.5, color: C.ink700, marginLeft: 6, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 42,
    right: 42,
    fontSize: 7.5,
    color: C.ink400,
  },
});

function fmtAud(v?: number): string {
  if (v == null) return "—";
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${v.toFixed(0)}`;
}

export interface GtmStrategyPdfInput {
  startupName: string;
  sector: string;
  gtm: GtmStrategyOutput;
  email?: string;
  founderName?: string;
}

export function GtmStrategyPDF({ input }: { input: GtmStrategyPdfInput }) {
  const today = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const { gtm } = input;
  return (
    <Document
      title={`${input.startupName} — GTM Strategy`}
      author="BlockID.au"
    >
      {/* Page 1 — Cover + positioning */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>Go-to-Market Playbook</Text>
            <Text style={s.h1}>{input.startupName}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {input.sector}
            </Text>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {today}
            </Text>
            {input.email && (
              <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
                {input.email}
              </Text>
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Positioning</Text>
          <View style={s.callout}>
            <Text style={{ ...s.para, marginBottom: 0 }}>{gtm.positioning}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Australian market context</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7.5, color: C.ink500, textTransform: "uppercase" }}>
                Sector market size
              </Text>
              <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink900 }}>
                {fmtAud(gtm.marketSize)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7.5, color: C.ink500, textTransform: "uppercase" }}>
                Growth (CAGR)
              </Text>
              <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink900 }}>
                {gtm.growthRate != null ? `${(gtm.growthRate * 100).toFixed(1)}%` : "—"}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Channel mix</Text>
          {gtm.channels.map((ch, i) => {
            const badge =
              ch.priority === "high"
                ? s.chBadgeHigh
                : ch.priority === "medium"
                  ? s.chBadgeMed
                  : s.chBadgeLow;
            return (
              <View key={`${ch.name}-${i}`} style={s.channelRow}>
                <Text style={s.chName}>{ch.name}</Text>
                <Text style={{ ...s.chPriority, ...badge }}>{ch.priority.toUpperCase()}</Text>
                <Text style={s.chRationale}>{ch.rationale}</Text>
              </View>
            );
          })}
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au — Page 1 of 2 · Go-to-Market Playbook
        </Text>
      </Page>

      {/* Page 2 — 90-day plan + KPIs */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>90-day plan &amp; KPIs</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {input.startupName}
            </Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>First 90 days</Text>
          {gtm.first90Days.map((step, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.dot}>{i + 1}.</Text>
              <Text style={s.bulletText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Key metrics to track</Text>
          {gtm.keyMetrics.map((m, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.dot}>•</Text>
              <Text style={s.bulletText}>{m}</Text>
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Next steps</Text>
          <Text style={s.para}>
            Refine each channel with a cost-per-acquisition target, then plug the
            monthly acquisition cadence into your financial projection to
            validate CAC payback under 18 months.
          </Text>
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au — Page 2 of 2 · Go-to-Market Playbook
        </Text>
      </Page>
    </Document>
  );
}

export async function renderGtmStrategyPdf(input: GtmStrategyPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<GtmStrategyPDF input={input} />);
  return buf as Buffer;
}
