/**
 * Financial Projection PDF — 3-year P&L + burn + runway.
 *
 * Server-side rendering via @react-pdf/renderer. Consumes the
 * `FinancialProjectionOutput` shape from
 * `lib/agents/cfo-financial-projection.ts`.
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
import type { FinancialProjectionOutput } from "@/lib/agents/cfo-financial-projection";

const C = {
  ink900: "#0F172A",
  ink700: "#334155",
  ink500: "#64748B",
  ink400: "#94A3B8",
  surface200: "#E2E8F0",
  surface100: "#F1F5F9",
  brand600: "#2563EB",
  emerald700: "#047857",
  red700: "#B91C1C",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink700,
    backgroundColor: C.white,
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.surface200,
    paddingBottom: 10,
  },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600 },
  subtitle: { fontSize: 8, color: C.ink400, marginTop: 2 },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.surface200,
    paddingBottom: 3,
  },
  para: { fontSize: 9.5, color: C.ink700, lineHeight: 1.4, marginBottom: 6 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  kpi: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.surface200,
    borderRadius: 4,
    padding: 8,
    backgroundColor: C.surface100,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.ink500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 3 },
  table: { borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 },
  thRow: {
    flexDirection: "row",
    backgroundColor: C.surface100,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.surface200,
  },
  tdRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: C.surface200,
  },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink500, letterSpacing: 0.4 },
  td: { fontSize: 8, color: C.ink700 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: C.ink400,
  },
});

function fmtAud(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${Math.round(v).toLocaleString()}`;
}

const COL_W = [50, 65, 55, 55, 55, 55, 60];

export function FinancialProjectionPDF({
  data,
  email,
}: {
  data: FinancialProjectionOutput;
  email?: string;
}) {
  const today = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <Document title={`${data.startupName} — 3-Year Financial Projection`} author="BlockID.au">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>BlockID.au</Text>
            <Text style={s.subtitle}>3-Year Financial Projection</Text>
            <Text style={s.h1}>{data.startupName}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              Stage: {data.stage}
            </Text>
            <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
              {today}
            </Text>
            {email && (
              <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>
                {email}
              </Text>
            )}
          </View>
        </View>

        {/* KPI band */}
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Year 1 revenue</Text>
            <Text style={s.kpiValue}>{fmtAud(data.totals.revenueY1)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Year 3 revenue</Text>
            <Text style={s.kpiValue}>{fmtAud(data.totals.revenueY3)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Runway (mo)</Text>
            <Text
              style={{
                ...s.kpiValue,
                color: data.totals.runwayMonths < 6 ? C.red700 : C.emerald700,
              }}
            >
              {data.totals.runwayMonths >= 999 ? "∞" : data.totals.runwayMonths}
            </Text>
          </View>
        </View>

        {/* Assumptions narrative */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Assumptions</Text>
          <Text style={s.para}>{data.narrative.assumptions}</Text>
        </View>

        {/* Commentary */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Commentary</Text>
          <Text style={s.para}>{data.narrative.commentary}</Text>
        </View>

        {/* Quarterly table */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quarterly P&amp;L (AUD)</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={{ ...s.th, width: COL_W[0] }}>Quarter</Text>
              <Text style={{ ...s.th, width: COL_W[1], textAlign: "right" }}>Revenue</Text>
              <Text style={{ ...s.th, width: COL_W[2], textAlign: "right" }}>COGS</Text>
              <Text style={{ ...s.th, width: COL_W[3], textAlign: "right" }}>Gross</Text>
              <Text style={{ ...s.th, width: COL_W[4], textAlign: "right" }}>Opex</Text>
              <Text style={{ ...s.th, width: COL_W[5], textAlign: "right" }}>Net</Text>
              <Text style={{ ...s.th, width: COL_W[6], textAlign: "right" }}>Cash</Text>
            </View>
            {data.quarters.map((q) => (
              <View key={q.quarter} style={s.tdRow}>
                <Text style={{ ...s.td, width: COL_W[0], fontFamily: "Helvetica-Bold" }}>
                  {q.quarter}
                </Text>
                <Text style={{ ...s.td, width: COL_W[1], textAlign: "right" }}>
                  {fmtAud(q.revenue)}
                </Text>
                <Text style={{ ...s.td, width: COL_W[2], textAlign: "right" }}>
                  {fmtAud(q.cogs)}
                </Text>
                <Text style={{ ...s.td, width: COL_W[3], textAlign: "right" }}>
                  {fmtAud(q.grossProfit)}
                </Text>
                <Text style={{ ...s.td, width: COL_W[4], textAlign: "right" }}>
                  {fmtAud(q.opex)}
                </Text>
                <Text
                  style={{
                    ...s.td,
                    width: COL_W[5],
                    textAlign: "right",
                    color: q.netIncome < 0 ? C.red700 : C.emerald700,
                  }}
                >
                  {fmtAud(q.netIncome)}
                </Text>
                <Text style={{ ...s.td, width: COL_W[6], textAlign: "right" }}>
                  {fmtAud(q.cashBalance)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Investor takeaway */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Investor takeaway</Text>
          <Text style={s.para}>{data.narrative.investorTakeaway}</Text>
        </View>

        <Text style={s.footer}>
          Prepared by BlockID.au · Sources: {data.sources.slice(0, 2).join("; ")}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderFinancialProjectionPdf(
  data: FinancialProjectionOutput,
  email?: string,
): Promise<Buffer> {
  const buf = await renderToBuffer(<FinancialProjectionPDF data={data} email={email} />);
  return buf as Buffer;
}
