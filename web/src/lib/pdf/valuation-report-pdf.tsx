import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { VcValuationReport } from "@/lib/agents/cfo-valuation";

/* ─── Style ─────────────────────────────────────────────────────────────── */
const C = {
  brand700: "#1d4ed8",
  brand600: "#2563eb",
  brand100: "#dbeafe",
  ink900: "#0f172a",
  ink700: "#334155",
  ink600: "#475569",
  ink400: "#94a3b8",
  surface200: "#e2e8f0",
  surface100: "#f1f5f9",
  surface50: "#f8fafc",
  emerald700: "#047857",
  emerald50: "#ecfdf5",
  amber700: "#b45309",
  amber50: "#fffbeb",
  red700: "#b91c1c",
  red50: "#fef2f2",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page:         { fontFamily: "Helvetica", fontSize: 9, color: C.ink700, backgroundColor: C.white, paddingHorizontal: 40, paddingVertical: 36 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, borderBottomWidth: 1, borderBottomColor: C.surface200, paddingBottom: 12 },
  brandName:    { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brand600, letterSpacing: 0.5 },
  headerMeta:   { fontSize: 7.5, color: C.ink400, textAlign: "right", lineHeight: 1.6 },
  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink400, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.surface200 },
  row:          { flexDirection: "row", marginBottom: 4 },
  col2:         { flex: 1 },
  label:        { fontSize: 7.5, color: C.ink400, marginBottom: 2 },
  value:        { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink900 },
  valueSm:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink900 },
  badge:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pill:         { flexDirection: "row", gap: 3, alignItems: "center" },
  table:        { borderWidth: 0.5, borderColor: C.surface200, borderRadius: 4 },
  thRow:        { flexDirection: "row", backgroundColor: C.surface100, borderBottomWidth: 0.5, borderBottomColor: C.surface200, paddingHorizontal: 8, paddingVertical: 5 },
  tdRow:        { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.surface200, paddingHorizontal: 8, paddingVertical: 4 },
  th:           { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink600, textTransform: "uppercase", letterSpacing: 0.5 },
  td:           { fontSize: 8, color: C.ink700 },
  tdBold:       { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink900 },
  note:         { fontSize: 7.5, color: C.ink400, fontStyle: "italic", marginTop: 2 },
  footer:       { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  footerText:   { fontSize: 7, color: C.ink400 },
  blendBox:     { borderRadius: 8, padding: 12, borderWidth: 1, marginBottom: 12 },
  twoCol:       { flexDirection: "row", gap: 8 },
  halfCol:      { flex: 1 },
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${v.toFixed(0)}`;
}
function fmtPct(v: number): string { return `${v.toFixed(1)}%`; }
function fmtX(v: number): string { return `${v.toFixed(1)}x`; }

/* ─── Component ──────────────────────────────────────────────────────────── */
export function ValuationReportPDF({ report, email }: { report: VcValuationReport; email?: string }) {
  const { blended, market, methods, unitEconomics: u, injection: inj, projection, stage, sector } = report;
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const topMethods = [...methods].sort((a, b) => b.weight - a.weight).slice(0, 4);
  const proj12 = projection.filter((_, i) => [2, 5, 8, 11].includes(i));

  return (
    <Document title="BlockID — VC Valuation Report" author="BlockID.au">
      {/* ─── Page 1: Valuation Summary ─────────────────────────── */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>BlockID.au</Text>
            <Text style={{ fontSize: 8, color: C.ink400, marginTop: 2 }}>VC Valuation Report</Text>
          </View>
          <View>
            <Text style={s.headerMeta}>{today}</Text>
            <Text style={s.headerMeta}>Stage: {stage} · Sector: {sector}</Text>
            {email && <Text style={s.headerMeta}>{email}</Text>}
          </View>
        </View>

        {/* Blended Valuation */}
        <View style={[s.blendBox, { backgroundColor: C.brand100, borderColor: C.brand600 }]}>
          <Text style={[s.sectionTitle, { color: C.brand700, borderBottomColor: C.brand600 }]}>Blended Valuation</Text>
          <View style={s.twoCol}>
            <View style={s.halfCol}>
              <Text style={s.label}>Bear Case</Text>
              <Text style={s.value}>{fmtAud(blended.lowAud)}</Text>
            </View>
            <View style={s.halfCol}>
              <Text style={s.label}>Base Case</Text>
              <Text style={[s.value, { color: C.brand700, fontSize: 14 }]}>{fmtAud(blended.midAud)}</Text>
            </View>
            <View style={s.halfCol}>
              <Text style={s.label}>Bull Case</Text>
              <Text style={s.value}>{fmtAud(blended.highAud)}</Text>
            </View>
            <View style={s.halfCol}>
              <Text style={s.label}>Model Confidence</Text>
              <Text style={s.value}>{fmtPct(blended.confidence)}</Text>
            </View>
          </View>
        </View>

        {/* Market Sizing */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Market Sizing</Text>
          <View style={s.twoCol}>
            {[
              { label: "TAM", v: market.tamAud },
              { label: "SAM", v: market.samAud },
              { label: "SOM", v: market.somAud },
              { label: "CAGR", v: market.cagrPct, fmt: fmtPct },
            ].map((item) => (
              <View key={item.label} style={[s.halfCol, { marginBottom: 6 }]}>
                <Text style={s.label}>{item.label}</Text>
                <Text style={s.valueSm}>{item.fmt ? item.fmt(item.v) : fmtAud(item.v)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Valuation Methods */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Valuation Methods</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, { flex: 2 }]}>Method</Text>
              <Text style={[s.th, { flex: 1 }]}>Weight</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Low</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Mid</Text>
              <Text style={[s.th, { flex: 1.5 }]}>High</Text>
            </View>
            {topMethods.map((m) => (
              <View key={m.method} style={s.tdRow}>
                <Text style={[s.td, { flex: 2 }]}>{m.method}</Text>
                <Text style={[s.td, { flex: 1 }]}>{fmtPct(m.weight * 100)}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{fmtAud(m.lowAud)}</Text>
                <Text style={[s.tdBold, { flex: 1.5 }]}>{fmtAud(m.midAud)}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{fmtAud(m.highAud)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Unit Economics */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Unit Economics</Text>
          <View style={s.twoCol}>
            {[
              { label: "CAC", v: fmtAud(u.cacAud) },
              { label: "LTV", v: fmtAud(u.ltvAud) },
              { label: "LTV:CAC", v: fmtX(u.ltvCacRatio) },
              { label: "Gross Margin", v: fmtPct(u.grossMarginPct) },
              { label: "Rule of 40", v: String(u.ruleOf40) },
              { label: "CAC Payback", v: u.cacPaybackMonths != null ? `${u.cacPaybackMonths}mo` : "N/A" },
            ].map((item) => (
              <View key={item.label} style={[s.halfCol, { marginBottom: 6 }]}>
                <Text style={s.label}>{item.label}</Text>
                <Text style={s.valueSm}>{item.v}</Text>
              </View>
            ))}
          </View>
          <Text style={s.note}>Verdict: {u.verdict}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Confidential — BlockID.au · blockid.au</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ─── Page 2: Projections + Raise Plan ─────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brandName}>BlockID.au</Text>
          <Text style={s.headerMeta}>Projections &amp; Raise Plan</Text>
        </View>

        {/* 12-Month Projections Sample */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>36-Month Projections (quarterly snapshots)</Text>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, { flex: 0.6 }]}>Mo</Text>
              <Text style={[s.th, { flex: 1.3 }]}>MRR</Text>
              <Text style={[s.th, { flex: 1.3 }]}>Revenue</Text>
              <Text style={[s.th, { flex: 1.3 }]}>OPEX</Text>
              <Text style={[s.th, { flex: 1.3 }]}>EBITDA</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Cash Balance</Text>
            </View>
            {proj12.map((p) => (
              <View key={p.month} style={s.tdRow}>
                <Text style={[s.td, { flex: 0.6 }]}>{p.month}</Text>
                <Text style={[s.td, { flex: 1.3 }]}>{fmtAud(p.mrrAud)}</Text>
                <Text style={[s.td, { flex: 1.3 }]}>{fmtAud(p.revenueAud)}</Text>
                <Text style={[s.td, { flex: 1.3 }]}>{fmtAud(p.opexAud)}</Text>
                <Text style={[s.td, { flex: 1.3, color: p.ebitdaAud >= 0 ? C.emerald700 : C.red700 }]}>{fmtAud(p.ebitdaAud)}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{fmtAud(p.cashBalanceAud)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.note}>Full 36-month table available in CSV export on the valuation dashboard.</Text>
        </View>

        {/* Raise Plan */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Raise Plan</Text>
          <View style={[s.blendBox, { backgroundColor: C.surface50, borderColor: C.surface200 }]}>
            <View style={s.twoCol}>
              {[
                { label: "Raise Amount", v: fmtAud(inj.raiseAud) },
                { label: "Pre-Money", v: fmtAud(inj.preMoneyAud) },
                { label: "Post-Money", v: fmtAud(inj.postMoneyAud) },
                { label: "Dilution", v: fmtPct(inj.dilutionPct) },
                { label: "Runway Extension", v: `${inj.runwayExtensionMonths}mo` },
              ].map((item) => (
                <View key={item.label} style={[s.halfCol, { marginBottom: 6 }]}>
                  <Text style={s.label}>{item.label}</Text>
                  <Text style={s.valueSm}>{item.v}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.note, { marginTop: 6 }]}>Next Milestone: {inj.nextMilestone}</Text>
          </View>

          {/* Use of Funds table */}
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, { flex: 2 }]}>Use of Funds</Text>
              <Text style={[s.th, { flex: 1 }]}>Allocation %</Text>
              <Text style={[s.th, { flex: 1.5 }]}>AUD Amount</Text>
            </View>
            {inj.useOfFunds.map((f) => (
              <View key={f.category} style={s.tdRow}>
                <Text style={[s.td, { flex: 2 }]}>{f.category}</Text>
                <Text style={[s.td, { flex: 1 }]}>{fmtPct(f.pct)}</Text>
                <Text style={[s.tdBold, { flex: 1.5 }]}>{fmtAud(f.aud)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Disclaimer */}
        <View style={{ marginTop: 16, padding: 10, backgroundColor: C.surface50, borderRadius: 6, borderWidth: 0.5, borderColor: C.surface200 }}>
          <Text style={{ fontSize: 7, color: C.ink400, lineHeight: 1.5 }}>
            This report is generated algorithmically by BlockID.au using publicly available benchmark data (AVCAL, PitchBook, Bessemer, Cut Through Venture). It is for informational purposes only and does not constitute financial advice. Valuations are estimates based on the inputs provided and may differ materially from actual market outcomes. Consult a qualified financial advisor before making investment decisions.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Confidential — BlockID.au · blockid.au</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
