// Trusted Business Report v2 — the PDF surface (S-R4).
//
// One `ReportV2` in, one A4 document out, in the fixed page order of spec
// §A.1: cover (0) → executive (1) → 8 dimension chapters (2–9, DIM_ORDER) →
// valuation (10) → phase gates (11) → money on the table (12) → 90-day
// action plan (13) → appendix (14). Every visual is the react-pdf twin of
// the web SVG (`report-visuals/pdf.tsx`), so the PDF draws the same shapes
// from the same data; no model call, no score computed here (§A).
//
// Free tier: `report-v2/free-tier.ts` projects the document (chapters 6–9
// as cards with their a11y table, range-only valuation, top-3 money, 5
// steps) and `renderTbrPdf` enforces the 10-page budget on the RENDERED
// file (`page-count.ts`), stepping the trim level up until it fits.
//
// Print rules (§D.2): A4, 18 mm margins, charts ≤ 170 mm, body ≥ 9 pt, no
// chart split across pages (`wrap={false}`), footer "Trusted Business
// Report · {startup} · {date} · page x/y". Fonts: built-in Helvetica —
// nothing to bundle in the standalone release.
//
// The SVIAnalysis-based `svi-report-pdf.tsx` (dashboard export via
// /api/svi/pdf) and the first-analysis PDF are untouched; this file is the
// TBR surface behind /api/svi/report/pdf.

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { topBlockers } from "@/lib/growth/phase-gate";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { aud, BAND_COLOUR, INK } from "@/lib/report-visuals";
import { VisualPdf } from "@/lib/report-visuals/pdf";
import { pdfSafeText } from "@/lib/report-visuals/pdf-text";
import { setVisualPdfFont } from "@/lib/report-visuals/pdf";
import { HELVETICA, pdfFontsForLocale, vietnameseHyphenation, type PdfFontSet } from "@/lib/pdf/fonts";
import type { Band, DataState, VisualSpecV2 } from "@/lib/report-visuals/types";
import { levelForEstimate, MAX_TRIM_LEVEL, projectForTier, type FreeTierProjection, type TrimLevel } from "@/lib/report-v2/free-tier";
import { chapterPercentileSuffix, coverHero, coverPercentileLine } from "@/lib/report-v2/cover-hero";
import { coverLedgerCells, isUnassessed, ledgerRowsFor, pendingDimsLine, pendingLine } from "@/lib/report-v2/ledger-rows";
import { chapterCtaRows, coverEvidenceLine, emptyEvidenceLine, evidenceRowsView, moneyEmptyState, nextActionLine, pendingCtasHeading, planEvidenceRows, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { defaultPreparedWith } from "@/lib/report-v2/prepared-with";
import { DIM_ORDER, type DimensionChapter, type ExecutiveStructured, type ReportV2 } from "@/lib/report-v2/schema";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";
import { buildCitationIndex, citationEntries, createCitationIndex, parseCitations, type CitationIndex, type CitationSegment } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import { buildValuationView, CONNECTORS_HREF } from "@/lib/report-v2/valuation-view";
import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import { ASSESSMENT_CARD_PDF_TITLE, AssessmentCardPdf, assessmentCardSummaryLine } from "./assessment-card-pdf";
import { alignReportWithAssessmentCard, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { pdfPageCount } from "./page-count";

// ── Palette / styles ─────────────────────────────────────────────────────────

const C = {
  ink: INK.text,
  muted: INK.muted,
  faint: INK.faint,
  grid: INK.grid,
  surface: INK.surfaceAlt,
  brand: "#0072B2",
  brandSoft: "#EAF3FA",
};

const MM = 72 / 25.4;
const MARGIN = 18 * MM;

/**
 * Styles are built per font set (S-R5): Helvetica / Helvetica-Bold for
 * English, the registered Noto Sans (+ fontWeight 700) for Vietnamese.
 * `TbrReportPdf` swaps the module-level `s` / `t` before its children
 * evaluate — react-pdf renders the tree synchronously inside one
 * renderToBuffer call, so two documents never interleave.
 */
function makeStyles(f: PdfFontSet) {
  const bold = f.boldWeight === undefined ? { fontFamily: f.bold } : { fontFamily: f.bold, fontWeight: f.boldWeight };
  return StyleSheet.create({
  // No page-level lineHeight: react-pdf inherits it into SVG <Text> and the
  // twins then translate by a garbage offset ("unsupported number") — line
  // height lives on the text styles below instead.
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 14, paddingHorizontal: MARGIN, fontFamily: f.regular, fontSize: 9.5, color: C.ink },
  footer: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.faint },
  kicker: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.brand, ...bold },
  h1: { fontSize: 20, ...bold, color: C.ink, marginTop: 2 },
  h2: { fontSize: 14, ...bold, color: C.ink, marginBottom: 6, marginTop: 2 },
  h3: { fontSize: 10, ...bold, color: C.ink, marginTop: 8, marginBottom: 3 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.grid, paddingBottom: 4, marginBottom: 8 },
  sectionNo: { fontSize: 8, color: C.faint, ...bold, width: 22 },
  body: { fontSize: 9.5, lineHeight: 1.45 },
  small: { fontSize: 8, color: C.muted, lineHeight: 1.4 },
  tiny: { fontSize: 7.5, color: C.faint },
  bold: { ...bold },
  row: { flexDirection: "row" },
  box: { borderWidth: 1, borderColor: C.grid, borderRadius: 4, padding: 8, marginBottom: 8 },
  softBox: { backgroundColor: C.surface, borderRadius: 4, padding: 8, marginBottom: 8 },
  figure: { alignItems: "center", marginVertical: 6 },
  caption: { fontSize: 7.5, color: C.muted, marginTop: 2, textAlign: "center" },
  table: { borderWidth: 1, borderColor: C.grid, borderRadius: 3, marginBottom: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.grid, paddingVertical: 2.5, paddingHorizontal: 5 },
  th: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, ...bold },
  td: { fontSize: 8.5 },
  cell1: { flex: 1 },
  cell2: { flex: 2 },
  cell3: { flex: 3 },
  right: { textAlign: "right" },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  bulletMark: { width: 10, fontSize: 8.5 },
  bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.4 },
  pill: { fontSize: 7, ...bold, color: C.brand, backgroundColor: C.brandSoft, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginRight: 4 },
  score: { fontSize: 26, ...bold },
  });
}

const STYLES = { en: makeStyles(HELVETICA), vi: null as ReturnType<typeof makeStyles> | null };
let s = STYLES.en;
let tUnicode = false;
const t = (value: unknown): string => pdfSafeText(value, { unicode: tUnicode });

// G24-A: the document's footnote numbering + locale, swapped per document
// exactly like `s` / `t` above (one synchronous react-pdf tree at a time).
let cites: CitationIndex = createCitationIndex([]);
let citeLocale: "en" | "vi" = "en";

/** Point the module-level footnote index at this document (same swap discipline as `useFontSet`). */
function useCitations(report: ReportV2, locale: "en" | "vi"): CitationIndex {
  cites = buildCitationIndex(report);
  citeLocale = locale;
  return cites;
}

/**
 * Inline prose with its `[ev:<id>]` markers as superscript footnote numbers
 * and `[unevidenced]` as a muted "(unverified)" run — the PDF twin of
 * `<CitedText>`. Renders INSIDE a parent <Text> (nested runs).
 */
function Cited({ text }: { text: string }): React.ReactElement {
  const segs = parseCitations(text, cites);
  const cs = citationStrings(citeLocale);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg.kind === "text") {
      out.push(t(seg.text));
      continue;
    }
    if (seg.kind === "unevidenced") {
      out.push(
        <Text key={`u${i}`} style={{ color: C.muted, fontSize: 7 }}>
          {t(` (${cs.unverified})`)}
        </Text>,
      );
      continue;
    }
    const group: Array<Extract<CitationSegment, { kind: "cite" }>> = [seg];
    while (i + 1 < segs.length && segs[i + 1]!.kind === "cite") group.push(segs[++i] as Extract<CitationSegment, { kind: "cite" }>);
    out.push(
      <Text key={`c${i}`} style={{ fontSize: 6, color: C.brand, verticalAlign: "super" }}>
        {group.map((c) => c.n).join(",")}
      </Text>,
    );
  }
  return <>{out}</>;
}

/** Point the module-level styles / text shim at the locale's font set (see makeStyles). */
function useFontSet(locale: "en" | "vi"): PdfFontSet {
  const fonts = pdfFontsForLocale(locale);
  if (fonts.unicode) {
    STYLES.vi ??= makeStyles(fonts);
    s = STYLES.vi;
  } else {
    s = STYLES.en;
  }
  tUnicode = fonts.unicode;
  setVisualPdfFont({ family: fonts.regular, unicode: fonts.unicode });
  return fonts;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const bandLabel = (b: Band): string => (b === "strong" ? "Strong" : b === "developing" ? "Developing" : b === "early" ? "Early" : "Pending");
const stateLabel = (d: DataState): string => (d === "real" ? "real data" : d === "partial" ? "partial data" : d === "benchmark_only" ? "benchmark only" : "target, not actual");
const bandColour = (b: Band): string => BAND_COLOUR[b];
const bandOf = (score: number): Band => (score >= 70 ? "strong" : score >= 40 ? "developing" : "early");
const WINDOW_LABEL = { this_week: "this week", "30d": "next 30 days", "90d": "next 90 days" } as const;

/** G19-S43 — a CTA row as print text: "<label> · <path> · +N SVI" (no live link needed on paper). */
function ctaText(row: EvidenceRowView): string {
  if (!row.cta) return row.label;
  return `${row.cta.label} · ${row.cta.href}${row.cta.liftLabel ? ` · ${row.cta.liftLabel}` : ""}`;
}

function fmtDate(iso: string, locale: "en" | "vi"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/** Section titles in render order — the same labels `tbrV2Toc` uses on the web. */
export const TBR_PDF_SECTION_TITLES = {
  cover: "Cover — Where / Worth / Next",
  executive: "Executive Summary",
  valuation: "Valuation",
  phaseGates: "Phase Gates — 13 Criteria × 12 Phases",
  money: "Money on the Table — Grants & Programs",
  actionPlan: "90-Day Action Plan",
  appendix: "Appendix — Method, Evidence & Auditor Log",
} as const;

/** The chapter sequence the PDF prints (parity check against the web TOC). */
export function tbrPdfOutline(report: ReportV2, locale: "en" | "vi" = "en"): Array<{ id: string; label: string }> {
  return [
    { id: "tbr-cover", label: TBR_PDF_SECTION_TITLES.cover },
    { id: "tbr-executive", label: TBR_PDF_SECTION_TITLES.executive },
    ...report.dimensions.map((d) => ({ id: `tbr-dim-${d.dim}`, label: locale === "vi" ? d.titleVi : d.title })),
    { id: "tbr-valuation", label: TBR_PDF_SECTION_TITLES.valuation },
    { id: "tbr-phase-gates", label: TBR_PDF_SECTION_TITLES.phaseGates },
    { id: "tbr-money", label: TBR_PDF_SECTION_TITLES.money },
    { id: "tbr-action-plan", label: TBR_PDF_SECTION_TITLES.actionPlan },
    { id: "tbr-appendix", label: TBR_PDF_SECTION_TITLES.appendix },
    // G24-A: the footnote list is a section only when the document cites something.
    ...(buildCitationIndex(report).size > 0 ? [{ id: "tbr-evidence-cited", label: citationStrings(locale).appendixTitle }] : []),
  ];
}

export { defaultPreparedWith };

// ── Small components ────────────────────────────────────────────────────────

function SectionHead({ no, title }: { no: string; title: string }) {
  return (
    <View style={s.sectionHead} minPresenceAhead={90}>
      <Text style={s.sectionNo}>{no}</Text>
      <Text style={s.h2}>{t(title)}</Text>
    </View>
  );
}

function Bullets({ title, items, mark }: { title: string; items: string[]; mark: string }) {
  if (!items.length) return null;
  return (
    <View style={{ flex: 1, marginRight: 6 }}>
      <Text style={s.th}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletMark}>{mark}</Text>
          <Text style={s.bulletText}>
            <Cited text={it} />
          </Text>
        </View>
      ))}
    </View>
  );
}

function Figure({ spec, widthPt, caption }: { spec: VisualSpecV2; widthPt?: number; caption?: string | null }) {
  return (
    <View style={s.figure} wrap={false}>
      <VisualPdf spec={spec} widthPt={widthPt} />
      {caption !== null && <Text style={s.caption}>{t(caption ?? `${spec.title} · ${stateLabel(spec.dataState)}`)}</Text>}
    </View>
  );
}

/** The a11y table under a chart (§D.2 — printed where the chart is the only carrier of numbers). */
function A11yTable({ spec, max = 12 }: { spec: VisualSpecV2; max?: number }) {
  const rows = (spec.a11y?.tableFallback ?? []).slice(0, max);
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <View style={s.table} wrap={false}>
      <View style={s.tr}>
        {cols.map((c) => (
          <Text key={c} style={[s.th, s.cell1]}>
            {t(c)}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr}>
          {cols.map((c) => (
            <Text key={c} style={[s.td, s.cell1]}>
              {t(String(r[c] ?? ""))}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Pill({ children }: { children: string }) {
  return <Text style={s.pill}>{t(children).toUpperCase()}</Text>;
}

function Footer({ report, locale }: { report: ReportV2; locale: "en" | "vi" }) {
  const left = `Trusted Business Report · ${t(report.cover.startupName)} · ${fmtDate(report.generatedAt, locale)}`;
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `page ${pageNumber}/${totalPages}`} />
    </View>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function Cover({ report, locale, preparedWith }: { report: ReportV2; locale: "en" | "vi"; preparedWith: string }) {
  const c = report.cover;
  const ring = c.visuals.find((v) => v.kind === "score_ring");
  const radar = c.visuals.find((v) => v.kind === "radar");
  const strip = c.visuals.find((v) => v.kind === "three_questions_strip");
  // G19-S44: the "current value" hero (same rule as the web cover / dashboard);
  // one phase vocabulary — no SVI stage label beside the 12-phase label.
  const hero = coverHero(report, locale);
  const s44 = getTbrStrings(locale).v2.s44;
  return (
    <View>
      <Text style={s.kicker}>Trusted Business Report · BlockID Startup Value Index</Text>
      <Text style={s.h1}>{t(c.startupName)}</Text>
      <Text style={[s.small, { marginBottom: 8 }]}>
        {t(`${c.sector} · Phase: ${GROWTH_PHASE_LABELS[c.phaseId][locale]} · ${fmtDate(report.generatedAt, locale)}`)}
        {report.source !== "pipeline" ? (report.source === "fixture" ? " · demo data" : " · built from stored snapshot") : ""}
      </Text>
      <SectionHead no="0" title={TBR_PDF_SECTION_TITLES.cover} />
      <View style={s.row}>
        <View style={{ width: 170 }}>
          <Text style={s.th}>{t(s44.currentValue)}</Text>
          <Text style={[s.bold, { fontSize: hero.pending ? 10 : 16, color: C.ink }]}>{t(hero.headline)}</Text>
          {hero.subline ? <Text style={s.tiny}>{t(hero.subline)}</Text> : null}
          <View style={{ alignItems: "center", marginTop: 4 }}>
            {ring && <VisualPdf spec={ring} widthPt={100} hideBadge />}
            <Text style={[s.bold, { color: bandColour(c.svi.band), fontSize: 10 }]}>{`${hero.sviLabel} · ${bandLabel(c.svi.band)}`}</Text>
            {c.svi.deltaVsLast !== null && <Text style={s.tiny}>{`${c.svi.deltaVsLast >= 0 ? "+" : ""}${c.svi.deltaVsLast} vs last snapshot`}</Text>}
            {/* G21 P1 review: the rank only with its cohort size (score-governance § 7). */}
            {coverPercentileLine(c.svi) !== null && <Text style={s.tiny}>{coverPercentileLine(c.svi)!}</Text>}
          </View>
        </View>
        <View style={{ flex: 1, paddingLeft: 10 }}>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, s.cell3]}>Dimension</Text>
              <Text style={[s.th, s.cell1]}>Owner</Text>
              <Text style={[s.th, s.cell1, s.right]}>W</Text>
              <Text style={[s.th, s.cell1, s.right]}>Score</Text>
              <Text style={[s.th, s.cell1, s.right]}>p50</Text>
              {hero.showPctl && <Text style={[s.th, s.cell1, s.right]}>Pctl</Text>}
            </View>
            {DIM_ORDER.map((d) => {
              const row = c.dims[d];
              return (
                <View key={d} style={s.tr}>
                  <Text style={[s.td, s.cell3]}>{t(`${d.toUpperCase()} ${DIMENSION_OWNERS[d].title}`)}</Text>
                  <Text style={[s.td, s.cell1]}>{DIMENSION_OWNERS[d].primary.toUpperCase()}</Text>
                  <Text style={[s.td, s.cell1, s.right]}>{String(row.weight)}</Text>
                  <Text style={[s.td, s.cell1, s.right, s.bold, { color: bandColour(row.band) }]}>{row.band === "pending" ? "—" : String(row.score)}</Text>
                  <Text style={[s.td, s.cell1, s.right]}>{String(row.p50)}</Text>
                  {hero.showPctl && <Text style={[s.td, s.cell1, s.right]}>{row.percentile === null ? "—" : String(row.percentile)}</Text>}
                </View>
              );
            })}
          </View>
        </View>
      </View>
      {strip && <Figure spec={strip} caption={null} />}
      <CoverLedger report={report} locale={locale} />
      {radar && <Figure spec={radar} widthPt={230} caption={radar.subtitle ?? null} />}
      <View style={s.softBox} wrap={false}>
        <Text style={s.th}>Where · Worth · Next</Text>
        <Text style={s.body}>
          {t("Where: ")}
          <Cited text={c.threeQuestions.where} />
        </Text>
        <Text style={s.body}>
          {t("Worth: ")}
          <Cited text={c.threeQuestions.worth} />
        </Text>
        <Text style={s.body}>
          {t("Next: ")}
          <Cited text={c.threeQuestions.next} />
        </Text>
      </View>
      <Text style={s.tiny}>{t(preparedWith)}</Text>
    </View>
  );
}

/** G19-S41 — cover ledger strip + "N of 8 dimensions pending" (same cells as the web cover). */
function CoverLedger({ report, locale }: { report: ReportV2; locale: "en" | "vi" }) {
  const cells = coverLedgerCells(report.cover, locale);
  const pending = pendingDimsLine(report.cover, locale);
  // G19-S43: "Evidence: mostly self-declared (×0.50)" beside the strip.
  const evidence = coverEvidenceLine(report.cover, locale);
  if (cells.length === 0 && !pending && !evidence) return null;
  const strings = getTbrStrings(locale).ledger;
  // No ledger strip (adapter / fixture documents): the evidence line alone is
  // one plain line, not a boxed block — a box here pushed the free-tier cover
  // onto a second page.
  if (cells.length === 0 && !pending && evidence) return <Text style={[s.small, { marginTop: 2 }]}>{t(evidence)}</Text>;
  return (
    <View style={[s.softBox, { marginTop: 4 }]} wrap={false}>
      {cells.length > 0 && <Text style={s.th}>{t(strings.coverTitle)}</Text>}
      {cells.length > 0 && <Text style={s.small}>{t(cells.map((c) => `${c.label} ${c.value}`).join("  →  "))}</Text>}
      {evidence && <Text style={s.small}>{t(evidence)}</Text>}
      {pending && <Text style={s.small}>{t(pending)}</Text>}
    </View>
  );
}

/**
 * G19-S41 — "How this score was built": the same rows as the web chapter
 * (ledger-rows.ts). Unassessed chapters get the single pending line.
 */
function ScoreLedger({ ch, locale, verificationLevel }: { ch: DimensionChapter; locale: "en" | "vi"; verificationLevel: number | null }) {
  if (!ch.scoreBreakdown) return null;
  const strings = getTbrStrings(locale).ledger;
  const rows = ledgerRowsFor(ch, locale, verificationLevel);
  const pending = isUnassessed(ch) ? pendingLine(ch, locale) : null;
  const pendingCtas = pending ? chapterCtaRows(ch, locale) : [];
  return (
    <View style={s.table} wrap={false}>
      <View style={s.tr}>
        <Text style={[s.th, s.cell3]}>{t(strings.title)}</Text>
        {!pending && <Text style={[s.th, s.cell1, s.right]}>{t(strings.thPoints)}</Text>}
        {!pending && <Text style={[s.th, s.cell1]}>{t(strings.thSource)}</Text>}
      </View>
      {pending ? (
        <View style={s.tr}>
          {/* G19-S43: the pending line links the chapter's CTA rows (label · path · +N SVI). */}
          <Text style={[s.td, s.small]}>{t(`${pending.text}${pendingCtas.length ? ` ${pendingCtasHeading(locale)} ${pendingCtas.map(ctaText).join("; ")}` : pending.add ? ` ${pending.add}` : ""}`)}</Text>
        </View>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={s.tr}>
            <Text style={[s.td, s.cell3, ...(r.kind !== "signal" ? [s.bold] : [])]}>{t(`${r.label}${r.adjustmentScale ? ` (${strings.adjustmentScale})` : ""}`)}</Text>
            <Text style={[s.td, s.cell1, s.right]}>{t(r.points)}</Text>
            <Text style={[s.td, s.cell1, s.tiny]}>{t(r.source)}</Text>
          </View>
        ))
      )}
      {ch.scoreNote ? (
        <View style={s.tr}>
          <Text style={[s.td, s.small]}>
            {t(`${strings.scoreNote}: `)}
            <Cited text={ch.scoreNote} />
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type PdfStyle = ReturnType<typeof makeStyles>[keyof ReturnType<typeof makeStyles>];

/** G19-S47: body prose as ≤ 3-sentence paragraphs (markdown stripped) — the PDF twin of `<Prose>`. */
function Paragraphs({ text, style, gap = 4 }: { text: string; style?: PdfStyle; gap?: number }) {
  const paras = proseParagraphs(text);
  if (!paras.length) return null;
  return (
    <View>
      {paras.map((p, i) => (
        <Text key={i} style={[s.body, ...(style ? [style] : []), { marginBottom: i === paras.length - 1 ? 0 : gap }]}>
          <Cited text={p} />
        </Text>
      ))}
    </View>
  );
}

const VERDICT_COLOUR: Record<ExecutiveStructured["verdict"]["label"], string> = { back: BAND_COLOUR.strong, back_with_conditions: BAND_COLOUR.developing, watch: BAND_COLOUR.early, not_yet: BAND_COLOUR.pending };

/** One reason / gap card in a 2-column table cell (G19-S47 PDF twin). */
function ExecCard({ title, body, dim, lift, index, colour, locale }: { title: string; body: string; dim?: string; lift?: number; index: number; colour: string; locale: "en" | "vi" }) {
  const s47 = getTbrStrings(locale).v2.s47;
  const dimLabel = dim ? (locale === "vi" ? DIMENSION_OWNERS[dim as keyof typeof DIMENSION_OWNERS].titleVi : DIMENSION_OWNERS[dim as keyof typeof DIMENSION_OWNERS].shortLabel) : null;
  return (
    <View style={[s.box, { flex: 1, marginRight: 6, borderLeftWidth: 3, borderLeftColor: colour }]} wrap={false}>
      <Text style={[s.h3, { marginTop: 0 }]}>
        {t(`${String(index + 1).padStart(2, "0")}  `)}
        <Cited text={title} />
      </Text>
      <Text style={s.small}>
        <Cited text={body} />
      </Text>
      {(dimLabel || typeof lift === "number") && (
        <View style={[s.row, { marginTop: 4 }]}>
          {dimLabel ? <Pill>{`${dim!.toUpperCase()} · ${dimLabel}`}</Pill> : null}
          {typeof lift === "number" ? <Text style={s.tiny}>{t(s47.lift(lift))}</Text> : null}
        </View>
      )}
    </View>
  );
}

/** Cards laid out as 2-column rows (the last odd card spans one column). */
function ExecCardRows({ items, colour, locale }: { items: Array<{ title: string; body: string; dim?: string; lift?: number }>; colour: string; locale: "en" | "vi" }) {
  const rows: Array<typeof items> = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri} style={s.row}>
          {row.map((it, ci) => (
            <ExecCard key={ci} title={it.title} body={it.body} dim={it.dim} lift={it.lift} index={ri * 2 + ci} colour={colour} locale={locale} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1, marginRight: 6 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function Executive({ report, locale, compact = false }: { report: ReportV2; locale: "en" | "vi"; compact?: boolean }) {
  // G19-S47: the structured sections (parsed on the fly for a pre-S47 row) — never the raw thesis.
  // `compact` (free tier at trim level ≥ 3): reasons / gaps as one-line bullets instead of card tables.
  const e = ensureExecutiveStructured(report).executive;
  const x = e.structured!;
  const s47 = getTbrStrings(locale).v2.s47;
  const windowLabel = getTbrStrings(locale).v2.chapter.window;
  const phase = GROWTH_PHASE_LABELS[x.phaseNow.phaseId]?.[locale] ?? x.phaseNow.label;
  const confidencePct = Math.round(x.verdict.confidence * 100);
  const verdictColour = VERDICT_COLOUR[x.verdict.label];
  return (
    <View break>
      <SectionHead no="1" title={TBR_PDF_SECTION_TITLES.executive} />
      <Text style={[s.small, { marginBottom: 6 }]}>{t(s47.purpose.executive)}</Text>
      <View style={s.row}>
        <Pill>ceo</Pill>
        <Text style={s.tiny}>{t(getTbrStrings(locale).v2.s44.evidenceConfidence(Math.round(e.confidence * 100)))}</Text>
      </View>
      <Text style={[s.h1, { fontSize: 16, marginTop: 6, marginBottom: 6 }]}>
        <Cited text={x.headline} />
      </Text>
      {x.summary.map((p, i) => (
        <Text key={i} style={[s.body, { marginBottom: 5 }]}>
          <Cited text={p} />
        </Text>
      ))}
      {x.keyInsight ? (
        <View style={[s.softBox, { borderLeftWidth: 3, borderLeftColor: C.brand, marginTop: 4 }]} wrap={false}>
          <Text style={s.th}>{t(s47.keyInsight)}</Text>
          <Text style={s.body}>
            <Cited text={x.keyInsight} />
          </Text>
        </View>
      ) : null}
      {compact ? (
        <View style={s.row} wrap={false}>
          <Bullets title={s47.whyBack} items={x.reasonsToBack.map((r) => `${r.title} — ${r.body}`)} mark="+" />
          <Bullets title={s47.whatMustChange} items={x.criticalGaps.map((g) => `${g.title} — ${g.body}`)} mark="^" />
        </View>
      ) : (
        <>
          {x.reasonsToBack.length > 0 && (
            <View>
              <Text style={[s.th, { marginTop: 6, marginBottom: 4, color: BAND_COLOUR.strong }]}>{t(s47.whyBack)}</Text>
              <ExecCardRows items={x.reasonsToBack} colour={BAND_COLOUR.strong} locale={locale} />
            </View>
          )}
          {x.criticalGaps.length > 0 && (
            <View>
              <Text style={[s.th, { marginTop: 4, marginBottom: 4, color: BAND_COLOUR.early }]}>{t(s47.whatMustChange)}</Text>
              <ExecCardRows items={x.criticalGaps} colour={BAND_COLOUR.early} locale={locale} />
            </View>
          )}
        </>
      )}
      {x.benchmarks.length > 0 && (
        <View style={[s.row, { flexWrap: "wrap", marginTop: 2, marginBottom: 6 }]} wrap={false}>
          <Text style={[s.th, { marginRight: 6 }]}>{t(s47.benchmarks)}</Text>
          {x.benchmarks.map((b) => (
            <Text key={b.dim} style={[s.tiny, { marginRight: 8, color: bandColour(b.band) }]}>
              {t(`${b.dim.toUpperCase()} ${b.band === "pending" ? "—" : b.score} · ${bandLabel(b.band)}`)}
            </Text>
          ))}
        </View>
      )}
      <View style={s.box} wrap={false}>
        <View style={s.row}>
          <Text style={[s.th, { marginRight: 6 }]}>{t(s47.whereYouAre)}</Text>
          <Pill>{phase}</Pill>
        </View>
        <Text style={[s.small, { marginTop: 4 }]}>
          <Text style={s.bold}>{t(`${s47.blocker}: `)}</Text>
          <Cited text={x.phaseNow.blocker} />
        </Text>
        <Text style={s.small}>
          <Text style={s.bold}>{t(`${s47.whatItTakes}: `)}</Text>
          <Cited text={x.phaseNow.whatItTakes} />
        </Text>
        {e.visuals.map((v) => (
          <Figure key={v.id} spec={v} caption={null} />
        ))}
      </View>
      <View style={[s.box, { borderLeftWidth: 3, borderLeftColor: verdictColour }]} wrap={false}>
        <View style={[s.row, { alignItems: "center" }]}>
          <Text style={[s.th, { marginRight: 6 }]}>{t(s47.verdict)}</Text>
          <Text style={[s.bold, { fontSize: 11, color: verdictColour, marginRight: 8 }]}>{t(s47.verdictLabel[x.verdict.label])}</Text>
          <Text style={s.tiny}>{t(s47.confidence(confidencePct))}</Text>
        </View>
        <View style={{ height: 4, backgroundColor: C.grid, borderRadius: 2, marginTop: 4, marginBottom: 4 }}>
          <View style={{ width: `${Math.max(2, Math.min(100, confidencePct))}%`, height: 4, backgroundColor: verdictColour, borderRadius: 2 }} />
        </View>
        <Text style={s.small}>
          <Text style={s.bold}>{t(`${s47.condition}: `)}</Text>
          <Cited text={x.verdict.condition ?? s47.noCondition} />
        </Text>
      </View>
      {x.actions.length > 0 && (
        <View>
          <Text style={[s.th, { marginBottom: 3 }]}>{t(s47.actions)}</Text>
          {x.actions.map((a, i) => (
            <View key={i} style={s.bullet} wrap={false}>
              <Text style={[s.bulletMark, s.bold, { color: C.brand }]}>{String(i + 1)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.bulletText, s.bold]}>
                  <Cited text={a.title} />
                </Text>
                <Text style={s.small}>
                  <Cited text={a.detail} />
                </Text>
                <Text style={s.tiny}>{t(`${windowLabel[a.window]}${a.dim ? ` · ${a.dim.toUpperCase()}` : ""}`)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <AuditLine grounded={e.audit.grounded} uncited={e.audit.uncited} revised={e.audit.revised} />
    </View>
  );
}

function AuditLine({ grounded, uncited, revised, frameworks }: { grounded: boolean; uncited: number; revised: boolean; frameworks?: string[] }) {
  return (
    <Text style={[s.tiny, { marginTop: 4 }]}>
      {t(`Auditor: ${grounded ? "grounded" : "no citation in this chapter"}${uncited > 0 ? ` · ${uncited} uncited` : ""}${revised ? " · revised" : ""}${frameworks && frameworks.length ? ` · Frameworks: ${frameworks.slice(0, 4).join("; ")}` : ""}`)}
    </Text>
  );
}

function ChapterHeader({ ch }: { ch: DimensionChapter }) {
  return (
    <View style={[s.box, s.row, { alignItems: "center" }]} wrap={false} minPresenceAhead={120}>
      <View style={{ width: 70 }}>
        <Text style={[s.score, { color: bandColour(ch.band) }]}>{ch.band === "pending" ? "—" : String(ch.score)}</Text>
        <Text style={s.tiny}>/100</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={[s.row, { alignItems: "center", marginBottom: 2 }]}>
          <Text style={[s.bold, { color: bandColour(ch.band), fontSize: 9, marginRight: 6 }]}>{bandLabel(ch.band)}</Text>
          <Text style={[s.small, { marginRight: 6 }]}>{`weight ${ch.weight} · owner`}</Text>
          <Pill>{ch.ownerAgent}</Pill>
          {ch.supportingAgents.slice(0, 3).map((r) => (
            <Text key={r} style={[s.tiny, { marginRight: 3 }]}>
              {r.toUpperCase()}
            </Text>
          ))}
        </View>
        <Text style={s.small}>
          {t(`Stage p25 ${ch.benchmark.p25} · p50 ${ch.benchmark.p50} · p75 ${ch.benchmark.p75}${chapterPercentileSuffix(ch.benchmark)}`)}
        </Text>
        {ch.degraded && <Text style={s.tiny}>{t(`Deterministic card — ${ch.degradeReason ?? "owner call unavailable"}`)}</Text>}
      </View>
    </View>
  );
}

function Chapter({ ch, index, locale, projection, verificationLevel }: { ch: DimensionChapter; index: number; locale: "en" | "vi"; projection: FreeTierProjection; verificationLevel: number | null }) {
  const title = locale === "vi" ? ch.titleVi : ch.title;
  if (projection.free && ch.renderAs === "card") {
    return (
      <View>
        <SectionHead no={String(index)} title={title} />
        <ChapterHeader ch={ch} />
        <View style={s.row} wrap={false}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Paragraphs text={ch.verdict} />
            {ch.gaps[0] && (
              <Text style={[s.small, { marginTop: 4 }]}>
                {"^ "}
                <Cited text={ch.gaps[0]} />
              </Text>
            )}
            <Text style={[s.tiny, { marginTop: 6, color: C.brand }]}>{t(`Unlock the full ${ch.title} chapter — upgrade at blockid.au/pricing`)}</Text>
          </View>
          <View style={{ width: 200 }}>
            <Figure spec={ch.primaryVisual} widthPt={190} />
          </View>
        </View>
        <A11yTable spec={ch.primaryVisual} max={8} />
      </View>
    );
  }
  const showCriterionDetail = projection.show.criterionDetail;
  const evidenceRows = evidenceRowsView(ch.evidence, locale);
  const emptyEvidence = emptyEvidenceLine(locale);
  return (
    <View>
      <SectionHead no={String(index)} title={title} />
      <ChapterHeader ch={ch} />
      {/* G19-S41: the ledger follows the evidence-table trim rule on the free tier. */}
      {projection.show.evidenceTables && <ScoreLedger ch={ch} locale={locale} verificationLevel={verificationLevel} />}
      <Figure spec={ch.primaryVisual} widthPt={Math.min(482, 420)} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
      <View style={{ marginBottom: 6 }}>
        <Paragraphs text={ch.verdict} />
      </View>

      {projection.show.evidenceTables && (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell1]}>Evidence</Text>
            <Text style={[s.th, s.cell3]}>Label</Text>
            <Text style={[s.th, s.cell1]}>Source</Text>
            <Text style={[s.th, s.cell1]}>Status</Text>
            <Text style={[s.th, s.cell1]}>Observed</Text>
          </View>
          {evidenceRows.length > 0 ? (
            // G19-S43: real rows first, then every missing input as a CTA row (label · path · +N SVI).
            evidenceRows.slice(0, 12).map((e) => (
              <View key={e.evidence_id} style={s.tr}>
                <Text style={[s.td, s.cell1, s.tiny]}>{t(e.evidence_id)}</Text>
                <Text style={[s.td, s.cell3, ...(e.cta ? [{ color: C.brand }] : [])]}>{t(e.cta ? ctaText(e) : e.label)}</Text>
                <Text style={[s.td, s.cell1]}>{t(e.source)}</Text>
                <Text style={[s.td, s.cell1]}>{t(e.statusLabel)}</Text>
                <Text style={[s.td, s.cell1]}>{t(e.observedAt)}</Text>
              </View>
            ))
          ) : (
            <View style={s.tr}>
              <Text style={[s.td, s.small]}>{t(`${emptyEvidence.text} ${emptyEvidence.ctaLabel} ${emptyEvidence.href}`)}</Text>
            </View>
          )}
        </View>
      )}

      {ch.criteria.map((c) => (
        <View key={c.key} style={s.box} wrap={false}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={[s.bold, { fontSize: 9.5 }]}>{t(c.title)}</Text>
            <Text style={[s.bold, { color: bandColour(bandOf(c.score)) }]}>{String(c.score)}</Text>
          </View>
          <Paragraphs text={c.verdict} style={s.small} gap={2} />
          {showCriterionDetail && (c.strengths.length > 0 || c.gaps.length > 0) && (
            <View style={[s.row, { marginTop: 3 }]} wrap={false}>
              <Bullets title="Strengths" items={c.strengths.slice(0, 3)} mark="+" />
              <Bullets title="Gaps" items={c.gaps.slice(0, 3)} mark="^" />
            </View>
          )}
          {showCriterionDetail && c.nextAction ? (
            <Text style={[s.small, { color: C.brand, marginTop: 2 }]}>
              {"Next: "}
              <Cited text={c.nextAction} />
            </Text>
          ) : null}
          <Text style={s.tiny}>{t(`${c.quality} · ${c.agent.toUpperCase()} · ${c.grounded ? "grounded" : "uncited"}`)}</Text>
        </View>
      ))}

      <View style={[s.row, { marginBottom: 6 }]} wrap={false}>
        <Bullets title="Strengths" items={ch.strengths} mark="+" />
        <Bullets title="Gaps" items={ch.gaps} mark="^" />
      </View>
      <View style={[s.softBox, { borderLeftWidth: 2, borderLeftColor: C.brand }]} wrap={false}>
        <Text style={s.th}>{`Next action (${WINDOW_LABEL[ch.nextAction.window]})`}</Text>
        <Text style={s.body}>
          <Cited text={nextActionLine(ch, locale)} />
        </Text>
      </View>
      {projection.show.phaseLens && ch.phaseLens.whatMattersNow ? (
        <Text style={s.small}>
          {t(`${GROWTH_PHASE_LABELS[ch.phaseLens.phaseId][locale]}: `)}
          <Cited text={ch.phaseLens.whatMattersNow} />
        </Text>
      ) : null}
      {ch.secondaryVisuals.length > 0 && (
        <View style={[s.row, { flexWrap: "wrap", justifyContent: "space-around" }]}>
          {ch.secondaryVisuals.map((v) => (
            <Figure key={v.id} spec={v} widthPt={230} caption={`${v.title} · ${stateLabel(v.dataState)}`} />
          ))}
        </View>
      )}
      <AuditLine grounded={ch.audit.grounded} uncited={ch.audit.uncited} revised={ch.audit.revised} frameworks={ch.frameworks} />
    </View>
  );
}

function Valuation({ report, locale, projection }: { report: ReportV2; locale: "en" | "vi"; projection: FreeTierProjection }) {
  const v = report.valuation;
  const view = buildValuationView(v, locale);
  const vs = view.strings;
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  if (report.cover.svi.band === "pending") {
    return (
      <View>
        <SectionHead no="10" title={TBR_PDF_SECTION_TITLES.valuation} />
        <Text style={s.body}>{t(vs.pending)}</Text>
      </View>
    );
  }
  return (
    <View>
      <SectionHead no="10" title={TBR_PDF_SECTION_TITLES.valuation} />
      <View style={[s.row, { marginBottom: 6 }]}>
        <Pill>cfo</Pill>
        <Text style={s.tiny}>{t(vs.confidence(view.confidencePct))}</Text>
      </View>
      <View style={[s.row, { marginBottom: 6 }]} wrap={false}>
        {(["lowAud", "midAud", "highAud"] as const).map((k) => (
          <View key={k} style={[s.softBox, { flex: 1, marginRight: 6 }]}>
            <Text style={s.th}>{t(k === "lowAud" ? vs.low : k === "midAud" ? vs.consensus : vs.high)}</Text>
            <Text style={[s.bold, { fontSize: 14 }]}>{aud(v.consensus[k])}</Text>
          </View>
        ))}
      </View>
      {rangeBars && <Figure spec={rangeBars} widthPt={440} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState)}`} />}
      {!projection.free && (
        <View>
          {view.inputRows.length > 0 && (
            <View>
              <Text style={s.h3}>{t(vs.inputsTitle)}</Text>
              <View style={s.table}>
                <View style={s.tr}>
                  <Text style={[s.th, s.cell2]}>{t(vs.thInput)}</Text>
                  <Text style={[s.th, s.cell3]}>{t(vs.thValue)}</Text>
                  <Text style={[s.th, s.cell1]}>{t(vs.thSource)}</Text>
                </View>
                {view.inputRows.map((r) => (
                  <View key={r.key} style={s.tr}>
                    <Text style={[s.td, s.cell2]}>{t(r.label)}</Text>
                    <Text style={[s.td, s.cell3]}>{t(r.value)}</Text>
                    <Text style={[s.td, s.cell1, s.tiny]}>{t(vs.source[r.source])}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {view.noneApplicable ? (
            <Text style={s.small}>{t(`${vs.noneApplicable} ${vs.connectorsCta}: ${CONNECTORS_HREF}`)}</Text>
          ) : (
            <View>
              <Text style={s.h3}>{t(vs.methodsTitle)}</Text>
              <View style={s.table}>
                <View style={s.tr}>
                  <Text style={[s.th, s.cell2]}>{t(vs.thMethod)}</Text>
                  <Text style={[s.th, s.cell1, s.right]}>{t(vs.thWeight)}</Text>
                  <Text style={[s.th, s.cell1, s.right]}>{t(vs.low)}</Text>
                  <Text style={[s.th, s.cell1, s.right]}>{t(vs.consensus)}</Text>
                  <Text style={[s.th, s.cell1, s.right]}>{t(vs.high)}</Text>
                  <Text style={[s.th, s.cell3]}>{t(vs.thDerivation)}</Text>
                </View>
                {view.methodRows.map((m) => (
                  <View key={m.method} style={s.tr}>
                    <Text style={[s.td, s.cell2]}>{t(m.label)}</Text>
                    <Text style={[s.td, s.cell1, s.right]}>{`${m.weightPct}%`}</Text>
                    <Text style={[s.td, s.cell1, s.right]}>{aud(m.lowAud)}</Text>
                    <Text style={[s.td, s.cell1, s.right]}>{aud(m.midAud)}</Text>
                    <Text style={[s.td, s.cell1, s.right]}>{aud(m.highAud)}</Text>
                    <Text style={[s.td, s.cell3, s.tiny]}>{t(m.derivation ? `${m.derivation} — ${m.rationale}` : m.rationale)}</Text>
                  </View>
                ))}
              </View>
              {view.needRevenueLine && <Text style={s.small}>{t(`${view.needRevenueLine} ${vs.connectorsCta}: ${CONNECTORS_HREF}`)}</Text>}
            </View>
          )}
          {view.unitEconomics.length > 0 && (
            <View>
              <Text style={s.h3}>{t(vs.unitEconomicsTitle)}</Text>
              <Text style={s.small}>{t(view.unitEconomics.map((r) => `${r.label} ${r.value}`).join(" · "))}</Text>
            </View>
          )}
          <Text style={s.small}>{t(`${vs.scenarios}: ${view.scenarioLine}`)}</Text>
          {view.askLine && <Text style={s.small}>{t(view.askLine)}</Text>}
          <Text style={s.small}>{t(`${view.sectorMultiplesTitle}: ${view.sectorMultiplesLine}`)}</Text>
          <Text style={s.small}>{t(view.comparablesLine)}</Text>
          {view.crossChecks.length > 0 && (
            <View>
              <Text style={s.h3}>{t(vs.crossChecksTitle)}</Text>
              {view.crossChecks.map((c, i) => (
                <Text key={i} style={s.small}>{t(`${c.label}: ${c.range}${c.n !== null ? ` (${vs.nLabel(c.n)})` : ""} — ${c.source} · ${vs.asOf(c.asOf)}`)}</Text>
              ))}
            </View>
          )}
          {view.consistency.length > 0 && (
            <View>
              <Text style={s.h3}>{t(vs.consistencyTitle)}</Text>
              {view.consistency.map((n, i) => (
                <Text key={i} style={s.small}>{t(n)}</Text>
              ))}
            </View>
          )}
          {v.narrative ? (
            <View style={{ marginTop: 6 }}>
              <Paragraphs text={v.narrative} />
            </View>
          ) : null}
          {others.map((x) => (
            <Figure key={x.id} spec={x} widthPt={300} caption={`${x.title} · ${stateLabel(x.dataState)}`} />
          ))}
        </View>
      )}
      <AuditLine grounded={v.audit.grounded} uncited={v.audit.uncited} revised={v.audit.revised} />
    </View>
  );
}

function PhaseGates({ report, locale, projection }: { report: ReportV2; locale: "en" | "vi"; projection: FreeTierProjection }) {
  const g = report.phaseGates;
  const currentRows = g.matrix.filter((m) => m.phase === g.current && m.required);
  const heat = g.visuals.find((v) => v.kind === "heat_map");
  const route = g.visuals.find((v) => v.kind === "route_map");
  return (
    <View>
      <SectionHead no="11" title={TBR_PDF_SECTION_TITLES.phaseGates} />
      <View style={[s.row, { marginBottom: 4 }]}>
        <Pill>coo</Pill>
        <Text style={s.small}>{t(`Current phase: ${GROWTH_PHASE_LABELS[g.current][locale]}`)}</Text>
      </View>
      {route && <Figure spec={route} caption={null} />}
      <View style={s.table}>
        <View style={s.tr}>
          <Text style={[s.th, s.cell2]}>Criterion (current phase)</Text>
          <Text style={[s.th, s.cell1]}>Quality</Text>
          <Text style={[s.th, s.cell1]}>Met</Text>
        </View>
        {currentRows.length ? (
          currentRows.map((m) => (
            <View key={m.criterion} style={s.tr}>
              <Text style={[s.td, s.cell2]}>{t(m.criterion.replace(/_/g, " "))}</Text>
              <Text style={[s.td, s.cell1]}>{t(m.quality)}</Text>
              <Text style={[s.td, s.cell1]}>{m.met ? "yes" : "no"}</Text>
            </View>
          ))
        ) : (
          <View style={s.tr}>
            <Text style={[s.td, s.small]}>No required criteria on this phase.</Text>
          </View>
        )}
      </View>
      {!projection.free && heat && <Figure spec={heat} widthPt={470} caption={heat.subtitle ?? heat.title} />}
      {g.blockers.slice(0, 6).map((b) => (
        <Text key={`${b.code}-${b.subject}`} style={s.small}>
          {t(`^ ${b.detail}`)}
        </Text>
      ))}
    </View>
  );
}

function Money({ report, projection, locale }: { report: ReportV2; projection: FreeTierProjection; locale: "en" | "vi" }) {
  const m = report.moneyOnTable;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((p) => ({ ...p, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, projection.moneyLimit);
  // G19-S43: the empty state points at the grant profile (never "re-run").
  const empty = moneyEmptyState(report, locale);
  return (
    <View>
      <SectionHead no="12" title={TBR_PDF_SECTION_TITLES.money} />
      <View style={[s.row, { marginBottom: 4 }]}>
        <Pill>cfo</Pill>
        <Pill>cmo</Pill>
        <Text style={s.small}>{t(`${m.grants.length + m.programs.length} matched · total ${aud(m.totalAud)}`)}</Text>
      </View>
      {rows.length > 0 ? (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell3]}>Grant / program</Text>
            <Text style={[s.th, s.cell1]}>Kind</Text>
            <Text style={[s.th, s.cell1, s.right]}>A$</Text>
            <Text style={[s.th, s.cell1]}>Deadline</Text>
            <Text style={[s.th, s.cell1, s.right]}>Fit</Text>
          </View>
          {rows.map((r) => (
            <View key={`${r.kind}-${r.id}`} style={s.tr}>
              <Text style={[s.td, s.cell3]}>{t(r.name)}</Text>
              <Text style={[s.td, s.cell1]}>{r.kind}</Text>
              <Text style={[s.td, s.cell1, s.right]}>{r.amountAud === null ? "—" : aud(r.amountAud)}</Text>
              <Text style={[s.td, s.cell1]}>{t(r.deadline ?? "rolling")}</Text>
              <Text style={[s.td, s.cell1, s.right]}>{`${Math.round(r.fit)}%`}</Text>
            </View>
          ))}
        </View>
      ) : empty ? (
        <Text style={s.small}>{t(`${empty.text} ${empty.ctaLabel} ${empty.href}`)}</Text>
      ) : null}
      {m.visuals.map((v) => (
        <Figure key={v.id} spec={v} widthPt={420} caption={`${v.title} · ${stateLabel(v.dataState)}`} />
      ))}
    </View>
  );
}

function ActionPlan({ report, locale }: { report: ReportV2; locale: "en" | "vi" }) {
  const p = report.actionPlan;
  const cols: Array<30 | 60 | 90> = [30, 60, 90];
  // G19-S43: the engine's P0 / P1 evidence gaps as CTA lines + catalogue source labels.
  const planEvidence = planEvidenceRows(report, locale);
  const s43 = getTbrS43Strings(locale);
  return (
    <View>
      <SectionHead no="13" title={TBR_PDF_SECTION_TITLES.actionPlan} />
      <View style={[s.row, { marginBottom: 4 }]}>
        <Pill>coo</Pill>
        <Text style={s.small}>{`${p.steps.length} steps · ${p.horizonDays} days`}</Text>
      </View>
      {p.steps.length > 0 ? (
        <View style={s.row} wrap={false}>
          {cols.map((day) => (
            <View key={day} style={[s.box, { flex: 1, marginRight: 6 }]}>
              <Text style={s.th}>{`Day ${day}`}</Text>
              {p.steps
                .filter((st) => st.day === day)
                .map((st, i) => (
                  <View key={i} style={{ marginBottom: 4 }}>
                    <Text style={[s.td, s.bold]}>{t(st.title)}</Text>
                    <Text style={s.tiny}>{t(`${st.ownerAgent.toUpperCase()} · ${DIMENSION_OWNERS[st.dimension].shortLabel} · +${st.expectedLift} SVI${st.evidenceToAdd ? ` · ${s43.source[st.evidenceToAdd] ?? st.evidenceToAdd}` : ""}`)}</Text>
                  </View>
                ))}
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.small}>No steps yet — the plan is derived from the weakest chapters once they are scored.</Text>
      )}
      {planEvidence.rows.length > 0 && (
        <View style={s.softBox} wrap={false}>
          <Text style={s.th}>{t(planEvidence.title)}</Text>
          {planEvidence.rows.map((r) => (
            <Text key={r.evidence_id} style={s.small}>{t(`• ${ctaText(r)}`)}</Text>
          ))}
        </View>
      )}
      {p.visuals.map((v) => (
        <Figure key={v.id} spec={v} widthPt={440} caption={null} />
      ))}
    </View>
  );
}

function Appendix({ report, projection, preparedWith, locale }: { report: ReportV2; projection: FreeTierProjection; preparedWith: string; locale: "en" | "vi" }) {
  const a = report.appendix;
  const grounded = a.auditLog.filter((l) => l.grounded).length;
  return (
    <View>
      <SectionHead no="14" title={TBR_PDF_SECTION_TITLES.appendix} />
      <Text style={s.h3}>Method</Text>
      <Text style={s.small}>{t(a.method)}</Text>
      <Text style={s.h3}>Data principle</Text>
      <Text style={s.small}>{t(a.dataPrinciple)}</Text>
      <Text style={s.h3}>Evidence register</Text>
      {a.evidenceRegister.length > 0 ? (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell1]}>Id</Text>
            <Text style={[s.th, s.cell3]}>Label</Text>
            <Text style={[s.th, s.cell1]}>Source</Text>
            <Text style={[s.th, s.cell1]}>Status</Text>
            <Text style={[s.th, s.cell1]}>Dims</Text>
          </View>
          {/* G19-S43: missing inputs are CTA rows (label · path · +N SVI). */}
          {evidenceRowsView(a.evidenceRegister, locale).map((e) => (
            <View key={e.evidence_id} style={s.tr}>
              <Text style={[s.td, s.cell1, s.tiny]}>{t(e.evidence_id)}</Text>
              <Text style={[s.td, s.cell3, ...(e.cta ? [{ color: C.brand }] : [])]}>{t(e.cta ? ctaText(e) : e.label)}</Text>
              <Text style={[s.td, s.cell1]}>{t(e.source)}</Text>
              <Text style={[s.td, s.cell1]}>{t(e.statusLabel)}</Text>
              <Text style={[s.td, s.cell1]}>{e.dims.join(" ")}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.small}>{projection.free && projection.level >= 3 ? "The evidence register is included in the paid report." : "No evidence rows were attached to this snapshot."}</Text>
      )}
      <Text style={s.h3}>Auditor log</Text>
      <Text style={s.small}>{t(`${a.auditLog.length} sections audited · ${grounded} grounded · ${a.auditLog.filter((l) => l.revised).length} revised · report quality ${Math.round(report.quality.score)} · grounded share ${Math.round(report.quality.groundedShare * 100)}%`)}</Text>
      {report.quality.degradedSections.length > 0 && <Text style={s.small}>{t(`Degraded sections: ${report.quality.degradedSections.join(", ")}`)}</Text>}
      <Text style={s.h3}>Sources</Text>
      <Text style={s.small}>{t(`AU comparables: ${a.comparablesN} raises, ${a.comparablesWithMultiplesN} with multiples.${a.sourcesDated.length ? " " + a.sourcesDated.map((x) => `${x.label} (${x.date})`).join(" · ") : ""}`)}</Text>
      {projection.free && <Text style={[s.small, { marginTop: 4 }]}>{t(`Free tier (${report.pageBudget.free}-page budget) omits: ${projection.dropped.join(", ")}.`)}</Text>}
      <Text style={[s.tiny, { marginTop: 6 }]}>{t(preparedWith)}</Text>
      <Text style={[s.small, { marginTop: 6 }]}>{t(a.disclaimer)}</Text>
      <AdviceDisclaimer variant="financial" />
      <Text style={[s.tiny, { marginTop: 3 }]}>{PDF_ENTITY_LINE}</Text>
    </View>
  );
}

/** G24-A: "Evidence cited" — the footnote list (n · label · level · source · date); omitted when nothing is cited. */
function EvidenceCited({ locale }: { locale: "en" | "vi" }) {
  const rows = citationEntries(cites);
  if (rows.length === 0) return null;
  const cs = citationStrings(locale);
  return (
    <View>
      <SectionHead no="15" title={cs.appendixTitle} />
      <Text style={[s.small, { marginBottom: 6 }]}>{t(cs.appendixPurpose)}</Text>
      <View style={s.table}>
        <View style={s.tr}>
          <Text style={[s.th, { width: 18 }]}>{t(cs.th.n)}</Text>
          <Text style={[s.th, s.cell3]}>{t(cs.th.label)}</Text>
          <Text style={[s.th, s.cell1]}>{t(cs.th.level)}</Text>
          <Text style={[s.th, s.cell1]}>{t(cs.th.source)}</Text>
          <Text style={[s.th, s.cell1]}>{t(cs.th.date)}</Text>
        </View>
        {rows.map((e) => (
          <View key={e.id} style={s.tr} wrap={false}>
            <Text style={[s.td, s.bold, { width: 18, color: C.brand }]}>{String(e.n)}</Text>
            <Text style={[s.td, s.cell3]}>{t(`${e.label}  ${e.id}`)}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.level(e))}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.source(e))}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.date(e))}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Document ────────────────────────────────────────────────────────────────

export interface TbrPdfProps {
  report: ReportV2;
  /** Trim level for the free tier (paid tiers ignore it). */
  level?: TrimLevel;
  /** "Prepared with <model via provider>" — kept verbatim when the caller has it. */
  preparedWith?: string | null;
  locale?: "en" | "vi";
  /** Server-loaded Assessment Card context (stored evidence confidence, claim count, benchmark) — same numbers as the web card. */
  assessment?: AssessmentCardOptions;
}

export function TbrReportPdf({ report: rawReport, level = 0, preparedWith, locale, assessment }: TbrPdfProps) {
  // One evidence-confidence number across the card and the executive line (review P1).
  const aligned = alignReportWithAssessmentCard(rawReport, assessment ?? {});
  const report = aligned.report;
  // G19-S45: EN / VI font sets + strings only; ES / JA documents render with the English labels.
  const rawLoc = locale ?? report.locale ?? "en";
  const loc: "en" | "vi" = rawLoc === "vi" ? "vi" : "en";
  const fonts = useFontSet(loc);
  const projection = projectForTier(report, level);
  const r = projection.report;
  // G24-A: one footnote numbering per document — walked over the FULL text
  // (not the free-tier projection) so web, PDF and DOCX print the same numbers.
  const citations = useCitations(report, loc);
  const prepared = preparedWith?.trim() || defaultPreparedWith(report);
  const body: ReactNode[] = [];
  body.push(<Cover key="cover" report={r} locale={loc} preparedWith={prepared} />);
  // G21-P1-B: the compact Assessment Card twin — additive, above the executive summary (same builder as the web card).
  const card = aligned.card;
  if (projection.free && projection.level >= MAX_TRIM_LEVEL) {
    // The last trim step keeps the card as one plain line (the padded free fixture sits exactly on the 10-page budget).
    body.push(<Text key="assessment" style={s.tiny}>{t(`${ASSESSMENT_CARD_PDF_TITLE}: ${assessmentCardSummaryLine(card)}`)}</Text>);
  } else {
    body.push(<AssessmentCardPdf key="assessment" data={card} font={fonts} unicode={fonts.unicode} slim={projection.free && projection.level >= 2} />);
  }
  body.push(<Executive key="exec" report={r} locale={loc} compact={projection.free && projection.level >= 3} />);
  r.dimensions.forEach((ch, i) => {
    body.push(
      <View key={ch.dim} break={!projection.free}>
        <Chapter ch={ch} index={i + 2} locale={loc} projection={projection} verificationLevel={report.cover.verification?.level ?? null} />
      </View>,
    );
  });
  body.push(
    <View key="val" break>
      <Valuation report={r} locale={loc} projection={projection} />
    </View>,
  );
  body.push(
    <View key="gates" break={!projection.free}>
      <PhaseGates report={r} locale={loc} projection={projection} />
    </View>,
  );
  body.push(
    <View key="money" break={!projection.free}>
      <Money report={r} projection={projection} locale={loc} />
    </View>,
  );
  body.push(
    <View key="plan" break={!projection.free}>
      <ActionPlan report={r} locale={loc} />
    </View>,
  );
  body.push(
    <View key="appx" break>
      <Appendix report={r} projection={projection} preparedWith={prepared} locale={loc} />
    </View>,
  );
  if (citations.size > 0) {
    body.push(
      <View key="cited" break>
        <EvidenceCited locale={loc} />
      </View>,
    );
  }
  return (
    <Document title={`Trusted Business Report — ${r.cover.startupName}`} author="BlockID.au" subject="Trusted Business Report v2" creator="BlockID.au">
      <Page size="A4" style={s.page}>
        {body}
        <Footer report={r} locale={loc} />
      </Page>
    </Document>
  );
}

export interface RenderTbrPdfOptions {
  preparedWith?: string | null;
  locale?: "en" | "vi";
  /** Assessment Card context from `loadAssessmentContext` (review P1: one number on every surface). */
  assessment?: AssessmentCardOptions;
  /** Override the free budget (tests). */
  maxPages?: number;
}

export interface RenderTbrPdfResult {
  buffer: Buffer;
  pages: number;
  level: TrimLevel;
  /** true when the free tier still exceeds the budget at MAX_TRIM_LEVEL (never seen with the fixtures; logged, not thrown). */
  overBudget: boolean;
}

/**
 * Render a ReportV2 to PDF. Free tier: start at the level the page ESTIMATE
 * needs, then read the REAL page count back and step up until ≤ budget.
 */
// react-pdf has no "unregister"; its default hyphenator is `hyphen/en` with soft hyphens — re-register that.
let defaultHyphenationImpl: ((word: string) => string[]) | null = null;
function defaultHyphenation(word: string): string[] {
  if (!defaultHyphenationImpl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const hyphen = require("hyphen/en") as { hyphenateSync: (w: string, o?: { hyphenChar?: string }) => string };
      defaultHyphenationImpl = (w: string) => hyphen.hyphenateSync(w, { hyphenChar: "\u00ad" }).split("\u00ad");
    } catch {
      defaultHyphenationImpl = (w: string) => [w];
    }
  }
  return defaultHyphenationImpl(word);
}

export async function renderTbrPdf(report: ReportV2, opts: RenderTbrPdfOptions = {}): Promise<RenderTbrPdfResult> {
  const free = report.tier === "free";
  const maxPages = opts.maxPages ?? report.pageBudget.free;
  let level: TrimLevel = free ? levelForEstimate(report) : 0;
  // Hyphenation is a process-global react-pdf setting: switch it off for the
  // duration of a Vietnamese render only, and restore the default after
  // (W5 review — a VI render used to leave every later EN PDF unhyphenated).
  const vi = opts.locale === "vi";
  if (vi) Font.registerHyphenationCallback(vietnameseHyphenation);
  let buffer: Uint8Array;
  let pages: number;
  try {
    buffer = await renderToBuffer(<TbrReportPdf report={report} level={level} preparedWith={opts.preparedWith} locale={opts.locale} assessment={opts.assessment} />);
    pages = pdfPageCount(buffer);
    while (free && pages > maxPages && level < MAX_TRIM_LEVEL) {
      level = (level + 1) as TrimLevel;
      buffer = await renderToBuffer(<TbrReportPdf report={report} level={level} preparedWith={opts.preparedWith} locale={opts.locale} assessment={opts.assessment} />);
      pages = pdfPageCount(buffer);
    }
  } finally {
    if (vi) Font.registerHyphenationCallback(defaultHyphenation);
  }
  const overBudget = free && pages > maxPages;
  if (overBudget && process.env.NODE_ENV !== "test") console.warn(`[tbr-pdf] free report ${report.reportId} still ${pages} pages at trim level ${level} (budget ${maxPages})`);
  return { buffer: Buffer.from(buffer), pages, level, overBudget };
}
