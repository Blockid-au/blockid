/**
 * Listing readiness PDF (S29-A) — the ASX / Nasdaq checklist rendered from
 * the rows the pure checker (`lib/listing/readiness.ts`) produced for a
 * project, never a recompute in the template.
 *
 *   Entity block   the FOUNDER's company — name, ACN / ABN (or "not
 *                  supplied"), address when known. BlockID is never the
 *                  company on the page.
 *   Score          met ÷ (met + not_met) with not-confirmed and
 *                  confirm-current-rule counted separately.
 *   Rows           one card per rule: status, label, rule reference, basis
 *                  (what the status was computed from), next step.
 *   Sources        the published rule set + the as-at date per exchange.
 *   Footer         `LISTING_READINESS_NOTE` (indicator, not advice) +
 *                  AdviceDisclaimer; S21-A watermark when a label is given.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { C, Footer, HeaderBar } from "./svi-report-pdf";
import { PDF_THEME } from "./theme";
import { WatermarkLayer } from "./watermark";
import { AdviceDisclaimer } from "./advice-disclaimer";
import { longDate } from "@/lib/board-resolutions/build";
import { exchangeLabel, LISTING_READINESS_NOTE, statusLabel, type Exchange, type ReadinessRow, type ReadinessScore } from "@/lib/listing/readiness";
import type { ListingCompany } from "@/lib/listing/server";

export interface ListingReadinessPdfProps {
  company: ListingCompany;
  exchange: Exchange;
  rows: ReadinessRow[];
  score: ReadinessScore;
  /** YYYY-MM-DD the checklist was generated. */
  generatedAt: string;
  /** From `watermarkLabel()`; null → clean page. */
  watermark: string | null;
}

/** The standard PDF fonts have no ≥ / ≤ / → / − glyphs — swap them for ASCII so a threshold never prints as a stray letter. */
export function pdfSafe(text: string): string {
  return text.replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->").replace(/−/g, "-");
}

const STATUS_COLOR: Record<ReadinessRow["status"], { fg: string; bg: string }> = {
  met: { fg: C.emerald600, bg: C.emerald50 },
  not_met: { fg: C.red600, bg: PDF_THEME.bgDanger },
  not_confirmed: { fg: C.amber700, bg: C.amber50 },
  confirm_current_rule: { fg: C.brand700, bg: C.brand50 },
};

const st = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 60, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink800, backgroundColor: C.white },
  eyebrow: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.4, textTransform: "uppercase", color: C.brand700, marginBottom: 6 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 4 },
  sub: { fontSize: 8.5, color: C.ink600, marginBottom: 10, lineHeight: 1.4 },
  card: { borderWidth: 1, borderColor: C.surface200, borderRadius: 6, padding: 9, backgroundColor: C.surface50, marginBottom: 8 },
  kvLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase", color: C.ink500 },
  kvValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 2 },
  small: { fontSize: 7.5, color: C.ink500, lineHeight: 1.4 },
  scoreRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  scoreBox: { flex: 1, borderWidth: 1, borderColor: C.surface200, borderRadius: 6, padding: 7 },
  scoreNum: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink900 },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 8, marginBottom: 4 },
  row: { borderWidth: 1, borderColor: C.surface200, borderRadius: 5, padding: 7, marginBottom: 6 },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  badge: { fontSize: 6.5, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  rowLabel: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink900, lineHeight: 1.35 },
  rowRule: { fontSize: 7, color: C.ink500, marginTop: 2 },
  rowBasis: { fontSize: 8, color: C.ink700, marginTop: 3, lineHeight: 1.4 },
  rowNext: { fontSize: 8, color: C.brand700, marginTop: 3, lineHeight: 1.4 },
  note: { marginTop: 8, padding: 8, borderWidth: 1, borderColor: C.amber500, backgroundColor: C.amber50, borderRadius: 6, fontSize: 7, color: C.ink700, lineHeight: 1.4 },
});

function EntityBlock({ company }: { company: ListingCompany }) {
  return (
    <View style={st.card}>
      <Text style={st.kvLabel}>Company</Text>
      <Text style={st.kvValue}>{company.name}</Text>
      <Text style={st.small}>
        ACN {company.acn ?? "not supplied"} · ABN {company.abn ?? "not supplied"}
        {company.address ? ` · ${company.address}` : ""}
      </Text>
    </View>
  );
}

function ScoreStrip({ score }: { score: ReadinessScore }) {
  const cells: Array<[string, string]> = [
    ["Readiness", score.pct === null ? "—" : `${score.pct} %`],
    ["Met", String(score.met)],
    ["Not met", String(score.notMet)],
    ["Not confirmed", String(score.notConfirmed)],
    ["Confirm rule", String(score.confirmCurrentRule)],
  ];
  return (
    <View style={st.scoreRow}>
      {cells.map(([k, v]) => (
        <View key={k} style={st.scoreBox}>
          <Text style={st.kvLabel}>{k}</Text>
          <Text style={st.scoreNum}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function Row({ r }: { r: ReadinessRow }) {
  const c = STATUS_COLOR[r.status];
  return (
    <View style={st.row} wrap={false}>
      <View style={st.rowHead}>
        <Text style={[st.badge, { color: c.fg, backgroundColor: c.bg }]}>{statusLabel(r.status)}</Text>
        <Text style={st.rowLabel}>{pdfSafe(r.label)}</Text>
      </View>
      <Text style={st.rowRule}>
        {r.rule} · checked {longDate(r.asAt)}
      </Text>
      <Text style={st.rowBasis}>Basis: {pdfSafe(r.basis)}</Text>
      {r.nextStep ? <Text style={st.rowNext}>Next: {pdfSafe(r.nextStep)}</Text> : null}
    </View>
  );
}

export function ListingReadinessPDF({ company, exchange, rows, score, generatedAt, watermark }: ListingReadinessPdfProps) {
  const title = `Listing readiness — ${exchangeLabel(exchange)}`;
  const sources = Array.from(new Set(rows.map((r) => `${r.sourceRef} (checked ${longDate(r.asAt)})`)));
  return (
    <Document title={`${title} — ${company.name}`} author={company.name} subject="Listing readiness indicators" creator="BlockID.au">
      <Page size="A4" style={st.page}>
        <HeaderBar />
        <WatermarkLayer label={watermark} />
        <Text style={st.eyebrow}>Listing readiness · {exchange === "asx" ? "ASX" : "Nasdaq Capital Market"}</Text>
        <Text style={st.title}>{title}</Text>
        <Text style={st.sub}>
          Readiness indicators computed from the records on file on {longDate(generatedAt)}. Score = met ÷ (met + not met); rows that are not confirmed or need the current rule confirmed are counted separately and never as met.
        </Text>
        <EntityBlock company={company} />
        <ScoreStrip score={score} />
        <Text style={st.h2}>Checklist</Text>
        {rows.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        <Text style={st.h2}>Sources</Text>
        {sources.map((s, i) => (
          <Text key={i} style={st.small}>
            • {s}
          </Text>
        ))}
        <Text style={st.note}>{LISTING_READINESS_NOTE}</Text>
        <AdviceDisclaimer />
        <Text style={[st.small, { marginTop: 6 }]}>Generated {longDate(generatedAt)} · {rows.length} rows</Text>
        <Footer brandText={`${company.name} · Listing readiness`} />
      </Page>
    </Document>
  );
}

/** Render to bytes — what the PDF route uses. */
export async function renderListingReadinessPdf(props: ListingReadinessPdfProps): Promise<Buffer> {
  return renderToBuffer(<ListingReadinessPDF {...props} />);
}
