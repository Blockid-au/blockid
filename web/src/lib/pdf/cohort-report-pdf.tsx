// BlockID Cohort Report PDF (G21 P2-C, 2026-09-20) — the react-pdf twin of
// `renderCohortReportHtml()` (lib/evaluations/cohort-report.ts), on the
// ic-memo-pdf.tsx pattern: built-in Helvetica (Noto Sans for `locale: "vi"`),
// A4, footer on every page with the operator + "not financial advice" +
// page x/y, page count read back from the bytes (page-count.ts).
//
// Page 1  cover tiles (n · scored · median SVI · median confidence) ·
//         cohort movement · median improvement per dimension · benchmark
// Page 2  evidence completion · outputs · strengths / gaps · human review
// Page 3+ startups (one line each) · reviewer signature · methodology ·
//         disclaimer
//
// Served by GET /api/reports/cohort?batch=<id>&format=pdf. The methodology
// paragraph is `COHORT_REPORT_METHODOLOGY` — no agent count (messaging § 11).

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { HELVETICA, pdfFontsForLocale, vietnameseHyphenation, type PdfFontSet } from "@/lib/pdf/fonts";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { INK } from "@/lib/report-visuals";
import { pdfSafeText as t } from "@/lib/report-visuals/pdf-text";
import { fmtReportDate, type CohortReportData, type CohortReportStartup } from "@/lib/evaluations/cohort-report";
import { COHORT_DECISION_LABELS, stageName } from "@/lib/evaluations/batch-shared";
import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import { pdfPageCount } from "./page-count";
import { PDF_THEME } from "./theme";

export const COHORT_REPORT_FOOTER = `Prepared with BlockID.au · ${LEGAL_ENTITY.operator} · not financial advice`;
export const COHORT_REPORT_PDF_TITLE = "BlockID Cohort Report";

const C = { ink: INK.text, muted: INK.muted, faint: INK.faint, grid: INK.grid, surface: INK.surfaceAlt, brand: PDF_THEME.navy };
const MM = 72 / 25.4;
const MARGIN = 16 * MM;

let fonts: PdfFontSet = HELVETICA;

function applyFonts(f: PdfFontSet) {
  fonts = f;
  for (const k of ["page", "body", "small", "tiny", "cell"] as const) (s[k] as { fontFamily?: string }).fontFamily = f.regular;
  for (const k of ["kicker", "h1", "h2", "h3", "tileV", "bold", "head"] as const) {
    const st = s[k] as { fontFamily?: string; fontWeight?: number };
    st.fontFamily = f.bold;
    if (f.boldWeight !== undefined) st.fontWeight = f.boldWeight;
    else delete st.fontWeight;
  }
}

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 12, paddingHorizontal: MARGIN, fontFamily: "Helvetica", fontSize: 9, color: C.ink },
  footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
  kicker: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.brand, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.grid, paddingBottom: 3 },
  h3: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  body: { fontSize: 9, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: C.muted, lineHeight: 1.35 },
  tiny: { fontSize: 7, color: C.faint },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  tiles: { flexDirection: "row", marginTop: 6, marginBottom: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 6, marginRight: 6 },
  tileV: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  tileL: { fontSize: 7, color: C.muted },
  table: { borderWidth: 1, borderColor: C.grid, borderRadius: 3, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.grid },
  head: { backgroundColor: C.surface, fontFamily: "Helvetica-Bold" },
  cell: { fontSize: 8, padding: 3, fontFamily: "Helvetica" },
  softBox: { backgroundColor: C.surface, borderRadius: 4, padding: 7, marginBottom: 6 },
  sig: { borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 8, marginTop: 8, flexDirection: "row", flexWrap: "wrap" },
  sigCell: { width: "50%", marginBottom: 4 },
  sigK: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
});

function fmtDelta(d: number | null): string {
  if (d == null) return "—";
  if (d === 0) return "±0";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

function num(v: number | null | undefined, digits = 0): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

function Footer({ cohort }: { cohort: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(`${COHORT_REPORT_FOOTER} · ${cohort}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `page ${pageNumber}/${totalPages}`} />
    </View>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileV}>{t(v)}</Text>
      <Text style={s.tileL}>{t(l)}</Text>
    </View>
  );
}

function Table({ head, rows, widths }: { head: string[]; rows: string[][]; widths: number[] }) {
  return (
    <View style={s.table}>
      <View style={[s.tr, s.head]}>
        {head.map((h, i) => (
          <Text key={h} style={[s.cell, { width: `${widths[i]}%`, fontFamily: fonts.bold, ...(fonts.boldWeight !== undefined ? { fontWeight: fonts.boldWeight } : {}), textAlign: i === 0 ? "left" : "right" }]}>
            {t(h)}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {r.map((c, i) => (
            <Text key={i} style={[s.cell, { width: `${widths[i]}%`, textAlign: i === 0 ? "left" : "right" }]}>
              {t(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function startupLine(x: CohortReportStartup): string {
  if (x.svi == null) return x.status === "failed" ? "scoring failed" : "not scored yet";
  const parts = [`SVI ${Math.round(x.svi)}`, `confidence ${x.confidence == null ? "—" : `${Math.round(x.confidence)} %`}`, `L${Math.max(0, Math.min(5, x.verification))}`, stageName(x.stage), fmtDelta(x.delta)];
  if (x.decision) parts.push(`${COHORT_DECISION_LABELS[x.decision]}${x.assessmentStatus === "submitted" ? "" : " (draft)"}`);
  if (x.shortlisted) parts.push("shortlisted");
  const tail: string[] = [];
  if (x.topStrength) tail.push(`strongest on ${x.topStrength}`);
  if (x.topGap) tail.push(`biggest gap ${x.topGap}`);
  return `${parts.join(" · ")}${tail.length ? ` — ${tail.join(", ")}` : ""}`;
}

export function CohortReportPdf({ data }: { data: CohortReportData }) {
  const m = data.movement;
  const cover = data.cover;
  return (
    <Document title={`${COHORT_REPORT_PDF_TITLE} — ${cover.cohortName}`} author="BlockID.au" subject="BlockID Cohort Report" creator="BlockID.au">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{t(`${COHORT_REPORT_PDF_TITLE} · ${cover.periodLabel}`)}</Text>
        <Text style={s.h1}>{t(cover.cohortName)}</Text>
        {cover.programName ? <Text style={s.body}>{t(`Prepared by ${cover.programName}`)}</Text> : null}
        <Text style={s.small}>{t(`Generated ${fmtReportDate(cover.generatedAt)} · ${cover.n} startup${cover.n === 1 ? "" : "s"} · ${cover.scored} scored on one rubric · Startup Value Index v${cover.methodologyVersion}`)}</Text>
        <Text style={s.small}>{t(cover.entity)}</Text>

        <Text style={s.h2}>Cohort movement</Text>
        <View style={s.tiles}>
          <Tile v={m.first?.medianSvi == null ? "—" : String(m.first.medianSvi)} l={`Median SVI · first${m.first ? ` (${fmtReportDate(m.first.takenAt)}, n = ${m.first.n})` : ""}`} />
          <Tile v={m.latest?.medianSvi == null ? "—" : String(m.latest.medianSvi)} l={`Median SVI · latest${m.latest ? ` (n = ${m.latest.n})` : ""}`} />
          <Tile v={fmtDelta(m.delta)} l="Δ median SVI" />
          <Tile v={m.latest?.medianConfidence == null ? "—" : `${m.latest.medianConfidence} %`} l="Median evidence confidence" />
        </View>
        {m.note ? <Text style={s.small}>{t(m.note)}</Text> : null}

        <Text style={s.h2}>Median improvement per dimension</Text>
        <Table head={["Dimension", "First", "Latest", "Δ"]} widths={[46, 18, 18, 18]} rows={data.dimensionImprovement.map((r) => [r.label, num(r.first, 1), num(r.latest, 1), fmtDelta(r.delta)])} />

        <Text style={s.h2}>Benchmark</Text>
        <Text style={s.body}>{t(data.benchmarkLine)}</Text>
        <Text style={s.small}>{t(`${data.cohortMedianLine} — the cohort's own figure, shown for context; it is not a benchmark.`)}</Text>

        <View break>
          <Text style={s.h2}>Evidence completion</Text>
          <Text style={s.small}>Share of scored startups with at least a document on file (L3 or higher) for each dimension.</Text>
          <Table head={["Dimension", "Startups", "Share"]} widths={[56, 22, 22]} rows={data.evidenceCompletion.map((r) => [r.label, `${r.count} of ${cover.scored}`, `${r.pct} %`])} />

          <Text style={s.h2}>Outputs</Text>
          <View style={s.tiles}>
            <Tile v={String(data.outputs.decisions.proceed)} l="Proceed" />
            <Tile v={String(data.outputs.decisions.track)} l="Track" />
            <Tile v={String(data.outputs.decisions.pass)} l="Pass" />
            <Tile v={String(data.outputs.decisions.undecided)} l="No submitted decision" />
          </View>
          <View style={s.tiles}>
            <Tile v={String(data.outputs.shortlisted)} l="Shortlisted" />
            <Tile v={String(data.outputs.dossiers)} l="BlockID Dossiers produced" />
            <Tile v={String(data.outputs.letters)} l="Feedback letters sent" />
            <Tile v={String(cover.scored)} l="Startups scored" />
          </View>

          <Text style={s.h2}>Across the cohort</Text>
          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.h3}>Top strengths</Text>
              {data.strengths.length === 0 ? <Text style={s.small}>No scored startup yet.</Text> : data.strengths.map((x) => <Text key={x.label} style={s.body}>{t(`• ${x.label} — ${x.count} startup${x.count === 1 ? "" : "s"}`)}</Text>)}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.h3}>Top gaps</Text>
              {data.gaps.length === 0 ? <Text style={s.small}>No scored startup yet.</Text> : data.gaps.map((x) => <Text key={x.label} style={s.body}>{t(`• ${x.label} — ${x.count} startup${x.count === 1 ? "" : "s"}`)}</Text>)}
            </View>
          </View>

          <Text style={s.h2}>Human review</Text>
          <View style={s.softBox}>
            <Text style={s.body}>{t(data.humanReview.sentence)}</Text>
          </View>
        </View>

        <View break>
          <Text style={s.h2}>Startups</Text>
          {data.startups.length === 0 ? <Text style={s.small}>No startup in this cohort yet.</Text> : null}
          {data.startups.map((x) => (
            <Text key={x.itemId} style={[s.body, { marginBottom: 2 }]} wrap={false}>
              {t(`${x.name} — ${startupLine(x)}`)}
            </Text>
          ))}

          <Text style={s.h2}>Reviewer signature</Text>
          <View style={s.sig} wrap={false}>
            <View style={s.sigCell}>
              <Text style={s.sigK}>Reviewer</Text>
              <Text style={s.body}>{t(data.signature.name || "____________________")}</Text>
            </View>
            <View style={s.sigCell}>
              <Text style={s.sigK}>Role</Text>
              <Text style={s.body}>{t(data.signature.role)}</Text>
            </View>
            <View style={s.sigCell}>
              <Text style={s.sigK}>Date</Text>
              <Text style={s.body}>{t(data.signature.date)}</Text>
            </View>
            <View style={s.sigCell}>
              <Text style={s.sigK}>Methodology</Text>
              <Text style={s.body}>{t(`Startup Value Index v${data.signature.methodologyVersion}`)}</Text>
            </View>
          </View>

          <Text style={s.h3}>Methodology</Text>
          <Text style={s.small}>{t(`${data.methodology} ${data.weightsNote} "Δ" compares each startup's SVI with its previous score on the platform.`)}</Text>
          <Text style={[s.small, { marginTop: 4 }]}>{t(data.disclaimer)}</Text>
          <AdviceDisclaimer variant="general" />
          <Text style={[s.tiny, { marginTop: 3 }]}>{t(`${PDF_ENTITY_LINE} · generated ${fmtReportDate(cover.generatedAt)}`)}</Text>
        </View>
        <Footer cohort={cover.cohortName} />
      </Page>
    </Document>
  );
}

export interface RenderCohortReportResult {
  buffer: Buffer;
  pages: number;
}

export async function renderCohortReportPdf(data: CohortReportData, opts: { locale?: "en" | "vi" } = {}): Promise<RenderCohortReportResult> {
  const f = pdfFontsForLocale(opts.locale ?? "en");
  applyFonts(f);
  const vi = opts.locale === "vi";
  if (vi) Font.registerHyphenationCallback(vietnameseHyphenation);
  let buffer: Uint8Array;
  try {
    buffer = await renderToBuffer(<CohortReportPdf data={data} />);
  } finally {
    if (vi) Font.registerHyphenationCallback((w) => [w]);
    applyFonts(HELVETICA);
  }
  return { buffer: Buffer.from(buffer), pages: pdfPageCount(buffer) };
}
