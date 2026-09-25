import { buildInvestorScreening, investorScreeningStrings } from "@/lib/report-v2/investor-screening";
import { buildCriteriaSummary, criteriaSummaryStrings, CRITERIA_SUMMARY_ID } from "@/lib/report-v2/criteria-summary";
import { criterionDetailExport } from "./criterion-detail-export";
// Trusted Business Report v3 — the PDF surface (G27 PDF twin).
//
// One `ReportV2` in, one A4 document out, in the fixed 16-section order of
// docs/design/tbr-v3-investor-report-spec.md § 2:
//   1 Dashboard (page 1) → 2 Investment view (page 2) → 3 Key points →
//   4 Valuation → 5–12 the eight dimension chapters (identical § 3 anatomy)
//   → 13 Risk matrix → 14 90-day improvement plan → 15 Money on the table
//   → 16 Appendix (method, phase-gate matrix, score ledger, evidence
//   register, audit log, sources, data principle, disclaimers) → Evidence
//   cited (footnotes).
// Every new block is a pure derivation (`report-v2/investment-view.ts`,
// `report-v2/dashboard-view.ts`) from the stored document + the Assessment
// Card, so every stored report renders v3 on read; every visual is the
// react-pdf twin of the web SVG (`report-visuals/pdf.tsx`). No model call,
// no score computed here.
//
// Free tier: `report-v2/free-tier.ts` projects the document (chapters 5–8
// as locked compact cards, valuation range + method names / weights only,
// risk rows ≤ 5, plan ≤ 5, appendix counts only at level ≥ 3) and
// `renderTbrPdf` enforces the 10-page budget on the RENDERED file
// (`page-count.ts`), stepping the trim level up until it fits.
//
// Print rules (spec § 5): A4, 18 mm × 16 mm margins, dashboard = page 1,
// investment view = page 2, key points + valuation from page 3, each
// chapter / risk matrix / plan / money / appendix on a new page on the paid
// tiers; `minPresenceAhead` on every heading (no h2 / h3 as the last line
// of a page); tiles, tables, callouts and figures unbreakable where small;
// running footer "Startup Value Index · {startup} · {date} · p. X" + "Not
// financial advice.". Light template: ink #1F2937, navy #1B2A5E for kickers
// / accents / the takeaway rule, cyan #0891B2 as the single secondary
// accent, sunken #F7F8FA; band colours only as a dot — chip text stays ink.
// Fonts: built-in Helvetica (EN) / bundled Noto Sans (VI) — see fonts.ts.
//
// The SVIAnalysis-based `svi-report-pdf.tsx` (dashboard export via
// /api/svi/pdf) and the first-analysis PDF are untouched; this file is the
// TBR surface behind /api/svi/report/pdf.

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { benchmarkLabel, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { hasCitationOrMarker, isMaterialClaim } from "@/lib/report-pipeline/claim-gate";
import { aud, BAND_COLOUR, INK } from "@/lib/report-visuals";
import { VisualPdf, setVisualPdfFont } from "@/lib/report-visuals/pdf";
import { pdfSafeText } from "@/lib/report-visuals/pdf-text";
import { HELVETICA, pdfFontsForLocale, vietnameseHyphenation, type PdfFontSet } from "@/lib/pdf/fonts";
import type { Band, DataState, VisualSpecV2 } from "@/lib/report-visuals/types";
import { levelForEstimate, MAX_TRIM_LEVEL, projectForTier, type FreeTierProjection, type TrimLevel } from "@/lib/report-v2/free-tier";
import { coverPercentileLine } from "@/lib/report-v2/cover-hero";
import { coverLedgerCells, isUnassessed, ledgerRowsFor, pendingDimsLine, pendingLine } from "@/lib/report-v2/ledger-rows";
import { chapterCtaRows, coverEvidenceLine, emptyEvidenceLine, evidenceRowsView, moneyEmptyState, pendingCtasHeading, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { defaultPreparedWith } from "@/lib/report-v2/prepared-with";
import type { DimensionChapter, DimKey, InvestmentView, ReportV2, RiskLevel } from "@/lib/report-v2/schema";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { buildInvestmentView, chapterGaps, dimName, isAssessed, riskGrid, RISK_LEVELS_ASC, RISK_LEVELS_DESC } from "@/lib/report-v2/investment-view";
import { buildDashboardView, dashboardDate, type DashboardTile, type DashboardView } from "@/lib/report-v2/dashboard-view";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";
import { buildCitationIndex, citationEntries, createCitationIndex, parseCitations, stripCitationMarkers, type CitationIndex, type CitationSegment } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import { buildValuationView, CONNECTORS_HREF } from "@/lib/report-v2/valuation-view";
import { derivedLift } from "@/lib/svi-lift";
import { alignReportWithAssessmentCard, type AssessmentCardData, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { AdviceDisclaimer, PDF_ENTITY_LINE } from "./advice-disclaimer";
import { pdfPageCount } from "./page-count";
import { PDF_THEME } from "./theme";

// ── Palette / styles (light template, spec § 5) ─────────────────────────────

// G26: every colour from the one PDF theme (light paper, navy headings, ink body).
const C = {
  // G26 lane R: every colour from the one PDF theme (light paper, navy headings, ink body).
  ink: PDF_THEME.inkMuted,
  muted: INK.muted,
  faint: INK.faint,
  grid: INK.grid,
  sunken: PDF_THEME.sunken,
  navy: PDF_THEME.navy,
  navySoft: PDF_THEME.navySoft,
  cyan: PDF_THEME.cyan,
};

const MM = 72 / 25.4;
const MARGIN_Y = 18 * MM;
const MARGIN_X = 16 * MM;
/** A4 210 mm − 2 × 16 mm, in points (the widest a full-width table / figure may be). */
const CONTENT_WIDTH = Math.floor(210 * MM - 2 * MARGIN_X);
const CHART_WIDTH = Math.min(482, CONTENT_WIDTH);

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
    page: {
      paddingTop: MARGIN_Y,
      paddingBottom: MARGIN_Y + 14,
      paddingHorizontal: MARGIN_X,
      fontFamily: f.regular,
      fontSize: 9.5,
      color: C.ink,
    },
    footer: {
      position: "absolute",
      left: MARGIN_X,
      right: MARGIN_X,
      bottom: 22,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: C.faint,
    },
    kicker: {
      fontSize: 7.5,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: C.navy,
      ...bold,
    },
    h1: { fontSize: 20, ...bold, color: C.ink, marginTop: 2 },
    h2: { fontSize: 14, ...bold, color: C.ink },
    h3: { fontSize: 10, ...bold, color: C.ink, marginTop: 8, marginBottom: 3 },
    sectionHead: {
      flexDirection: "row",
      alignItems: "baseline",
      borderBottomWidth: 1,
      borderBottomColor: C.navy,
      paddingBottom: 4,
      marginBottom: 6,
      marginTop: 2,
    },
    sectionNo: { fontSize: 8, color: C.navy, ...bold, width: 22 },
    purpose: { fontSize: 8, color: C.muted, lineHeight: 1.4, marginBottom: 6 },
    body: { fontSize: 9.5, lineHeight: 1.45 },
    small: { fontSize: 8, color: C.muted, lineHeight: 1.4 },
    smallInk: { fontSize: 8, color: C.ink, lineHeight: 1.4 },
    tiny: { fontSize: 7.5, color: C.faint },
    bold: { ...bold },
    row: { flexDirection: "row" },
    box: {
      borderWidth: 1,
      borderColor: C.grid,
      borderRadius: 4,
      padding: 8,
      marginBottom: 8,
    },
    softBox: {
      backgroundColor: C.sunken,
      borderRadius: 4,
      padding: 8,
      marginBottom: 8,
    },
    callout: {
      backgroundColor: C.sunken,
      borderLeftWidth: 3,
      borderLeftColor: C.navy,
      borderRadius: 2,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginTop: 4,
      marginBottom: 8,
    },
    figure: { alignItems: "center", marginVertical: 6 },
    caption: {
      fontSize: 7.5,
      color: C.muted,
      marginTop: 2,
      textAlign: "center",
    },
    table: {
      borderWidth: 1,
      borderColor: C.grid,
      borderRadius: 3,
      marginBottom: 8,
    },
    tr: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: C.grid,
      paddingVertical: 2.5,
      paddingHorizontal: 5,
    },
    trHead: { backgroundColor: C.sunken },
    th: {
      fontSize: 7,
      color: C.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      ...bold,
    },
    td: { fontSize: 8.5, lineHeight: 1.3 },
    cell1: { flex: 1 },
    cell2: { flex: 2 },
    cell3: { flex: 3 },
    right: { textAlign: "right" },
    bullet: { flexDirection: "row", marginBottom: 1.5 },
    bulletMark: { width: 10, fontSize: 8.5 },
    bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.4 },
    /** Same face as `bulletText` without `flex: 1` — for a Text stacked in a column (flex:1 there collapses to zero height). */
    bulletBody: { fontSize: 8.5, lineHeight: 1.4 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 0.5,
      borderColor: C.grid,
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      marginRight: 4,
    },
    chipText: { fontSize: 7, color: C.ink, ...bold },
    dot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 3 },
    score: { fontSize: 24, ...bold, color: C.ink },
    tile: {
      flex: 1,
      backgroundColor: C.sunken,
      borderWidth: 0.5,
      borderColor: C.grid,
      borderRadius: 4,
      padding: 8,
      marginRight: 6,
      marginBottom: 6,
    },
    tileLabel: {
      fontSize: 6.5,
      color: C.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      ...bold,
    },
    tileValue: { fontSize: 20, color: C.ink, ...bold, marginTop: 2 },
    tileSub: { fontSize: 8, color: C.ink, marginTop: 1 },
    tileNote: { fontSize: 7.5, color: C.muted },
  });
}

const STYLES = {
  en: makeStyles(HELVETICA),
  vi: null as ReturnType<typeof makeStyles> | null,
};
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
      <Text key={`c${i}`} style={{ fontSize: 6, color: C.cyan, verticalAlign: "super" }}>
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

type Loc = "en" | "vi";

const BAND_WORD: Record<Loc, Record<Band, string>> = {
  en: {
    strong: "Strong",
    developing: "Developing",
    early: "Early",
    pending: "Pending",
  },
  vi: {
    strong: "Mạnh",
    developing: "Đang phát triển",
    early: "Sớm",
    pending: "Chưa đánh giá",
  },
};
const bandLabel = (b: Band, locale: Loc): string => BAND_WORD[locale][b];
const stateLabel = (d: DataState): string => (d === "real" ? "real data" : d === "partial" ? "partial data" : d === "benchmark_only" ? "benchmark only" : "target, not actual");
const bandColour = (b: Band): string => BAND_COLOUR[b];
const bandOf = (score: number): Band => (score >= 70 ? "strong" : score >= 40 ? "developing" : "early");

/** G19-S43 — a CTA row as print text: "<label> · <path> · +N SVI" (no live link needed on paper). */
function ctaText(row: EvidenceRowView): string {
  if (!row.cta) return row.label;
  return `${row.cta.label} · ${row.cta.href}${row.cta.liftLabel ? ` · ${row.cta.liftLabel}` : ""}`;
}

function fmtDate(iso: string, locale: Loc): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function normTitle(text: string): string {
  return stripCitationMarkers(text)
    .trim()
    .toLowerCase()
    .replace(/[.;:,\s]+$/u, "");
}

/**
 * Word cap that never leaves a half `[ev:…]` marker behind: a text within
 * the cap keeps its markers (footnotes render); a longer one is stripped
 * first, then cut.
 */
function capWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (stripCitationMarkers(clean).split(/\s+/).filter(Boolean).length <= max) return clean;
  const parts = stripCitationMarkers(clean).replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean);
  return `${parts.slice(0, max).join(" ")}…`;
}

/** First sentence, ≤ `max` words, marker-safe (the criteria mini-table's one-line verdict). */
function oneLine(text: string, max = 20): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.+?[.!?])(\s|$)/u);
  const first = m ? m[1]! : clean;
  return capWords(first, max);
}

/** De-duplicated bullets (chapter first, then the criteria cards), each ≤ `wordCap` words, ≤ `max` rows. */
function mergedBullets(chapter: readonly string[], cards: readonly string[], max: number, wordCap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of [...chapter, ...cards]) {
    const key = normTitle(b);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(capWords(b, wordCap));
    if (out.length >= max) break;
  }
  return out;
}

/** A material claim with no citation / admission marker → the `unverified` chip (spec § 3). */
function isUnverifiedClaim(text: string, ids: readonly string[]): boolean {
  return isMaterialClaim(text) && !hasCitationOrMarker(text, ids as string[]);
}

interface ImproveRow {
  action: string;
  lift: number;
  window: "this_week" | "30d" | "90d";
  evidence: string | null;
}

/**
 * "What to improve" — 1–3 rows: the chapter's next action first, then the
 * criteria next actions (lift from the one lift model), then the chapter's
 * evidence CTAs; de-duplicated by normalised title (spec § 3 item 7).
 */
function chapterImprovements(ch: DimensionChapter, locale: Loc): ImproveRow[] {
  const s43 = getTbrS43Strings(locale);
  const seen = new Set<string>();
  const rows: ImproveRow[] = [];
  const push = (title: string, lift: number, window: ImproveRow["window"], evidence: string | null) => {
    const action = capWords(stripCitationMarkers(title), 18).replace(/[.;:]+$/u, "");
    const key = normTitle(action);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({ action, lift, window, evidence });
  };
  push(ch.nextAction.title, ch.nextAction.expectedLift, ch.nextAction.window, ch.nextAction.evidenceToAdd ? (s43.source[ch.nextAction.evidenceToAdd] ?? ch.nextAction.evidenceToAdd) : null);
  for (const c of ch.criteria) if (c.nextAction) push(c.nextAction, derivedLift(ch.weight, c.score), "30d", null);
  const ctas = ch.evidence.filter((e) => e.status === "missing" && e.cta).sort((a, b) => (b.cta?.lift ?? 0) - (a.cta?.lift ?? 0));
  for (const e of ctas) push(e.cta!.label, e.cta!.lift ?? 0, "this_week", s43.source[e.source] ?? e.source);
  return rows.slice(0, 3);
}

/** Benchmark line via the publication rules: n ≥ 10 → median + band + rank; n < 10 → "not enough"; no n → "no published cohort". */
function benchmarkLine(ch: DimensionChapter, t3: TbrV3Strings): string {
  const n = ch.benchmark.n;
  if (typeof n !== "number") return t3.benchNone;
  if (!mayShowPercentile(n)) return t3.benchNotEnough(n);
  const label = benchmarkLabel(n).replace(/ \(n = \d+\)$/, "");
  const line = t3.benchLine(ch.benchmark.p50, n, label, ch.benchmark.p25, ch.benchmark.p75);
  return ch.benchmark.percentile === null ? line : `${line} · ${t3.benchPercentile(ch.benchmark.percentile)}`;
}

/** Section ids — the web TOC (`tbrV2Toc`) uses the same ids so the two outlines agree. */
export const TBR_PDF_SECTION_IDS = {
  dashboard: "tbr-dashboard",
  investmentView: "tbr-investment-view",
  keyPoints: "tbr-key-points",
  valuation: "tbr-valuation",
  dim: (d: DimKey): string => `tbr-dim-${d}`,
  riskMatrix: "tbr-risk-matrix",
  plan: "tbr-plan-90d",
  money: "tbr-money",
  appendix: "tbr-appendix",
  evidenceCited: "tbr-evidence-cited",
} as const;

/** Section titles in render order (EN) — the v3 labels every surface shares (`tbr-v3-strings.ts` `sec`). */
export const TBR_PDF_SECTION_TITLES = getTbrV3Strings("en").sec;

/** The section sequence the PDF prints (parity check against the web TOC). */
export function tbrPdfOutline(report: ReportV2, locale: Loc = "en"): Array<{ id: string; label: string }> {
  const sec = getTbrV3Strings(locale).sec;
  return [
    { id: TBR_PDF_SECTION_IDS.dashboard, label: sec.dashboard },
    { id: TBR_PDF_SECTION_IDS.investmentView, label: sec.investmentView },
    { id: TBR_PDF_SECTION_IDS.keyPoints, label: sec.keyPoints },
    { id: TBR_PDF_SECTION_IDS.valuation, label: sec.valuation },
    { id: CRITERIA_SUMMARY_ID, label: criteriaSummaryStrings(locale).title },
    ...report.dimensions.map((d) => ({
      id: TBR_PDF_SECTION_IDS.dim(d.dim),
      label: locale === "vi" ? d.titleVi : d.title,
    })),
    { id: TBR_PDF_SECTION_IDS.riskMatrix, label: sec.riskMatrix },
    { id: TBR_PDF_SECTION_IDS.plan, label: sec.improvementPlan },
    { id: TBR_PDF_SECTION_IDS.money, label: sec.money },
    { id: TBR_PDF_SECTION_IDS.appendix, label: sec.appendix },
    // G24-A: the footnote list is a section only when the document cites something.
    ...(buildCitationIndex(report).size > 0
      ? [
          {
            id: TBR_PDF_SECTION_IDS.evidenceCited,
            label: citationStrings(locale).appendixTitle,
          },
        ]
      : []),
  ];
}

export { defaultPreparedWith };

// ── Small components ────────────────────────────────────────────────────────

/** `presence`: points that must follow on the same page (a chapter heading keeps its header box + first lines with it). */
function SectionHead({ no, title, purpose, presence = 140 }: { no: string; title: string; purpose?: string; presence?: number }) {
  // NB react-pdf applies minPresenceAhead only to a child with previous siblings — a section root carries its own.
  return (
    <View minPresenceAhead={presence}>
      <View style={s.sectionHead}>
        <Text style={s.sectionNo}>{no}</Text>
        <Text style={s.h2}>{t(title)}</Text>
      </View>
      {purpose ? <Text style={s.purpose}>{t(purpose)}</Text> : null}
    </View>
  );
}

/** An h3 that never ends a page (spec § 5 `h3 { break-after: avoid }`). */
function H3({ children, presence = 70 }: { children: string; presence?: number }) {
  return (
    <View minPresenceAhead={presence}>
      <Text style={s.h3}>{t(children)}</Text>
    </View>
  );
}

/** `column`: the list sits in a column (no `flex: 1` — in a column container flex:1 collapses the block to zero height). */
function Bullets({ title, items, mark, column = false }: { title: string; items: string[]; mark: string; column?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={column ? { marginRight: 6 } : { flex: 1, marginRight: 6 }}>
      <Text style={s.th}>{t(title)}</Text>
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

/**
 * A bordered table whose header row never ends a page alone. react-pdf
 * honours `minPresenceAhead` only on a child that has a previous sibling, so
 * a zero-height spacer leads the table and the caption / header rows carry
 * the presence rule (a `wrap={false}` group at a page boundary mis-measures).
 */
function Table({ caption, header, rows, children, style }: { caption?: string; header: ReactNode; rows: ReactNode[]; children?: ReactNode; style?: Record<string, unknown> }) {
  return (
    <View style={[s.table, ...(style ? [style as never] : [])]}>
      <View style={{ height: 0 }} />
      {caption ? (
        <View style={[s.tr, s.trHead, { paddingVertical: 3 }]} minPresenceAhead={56}>
          <Text style={[s.th, { color: C.navy }]}>{t(caption)}</Text>
        </View>
      ) : null}
      <View minPresenceAhead={40}>{header}</View>
      {rows}
      {children}
    </View>
  );
}

/** Label + dot chip — the dot carries the band colour, the text stays ink (spec § 5). */
function Chip({ label, colour }: { label: string; colour?: string }) {
  return (
    <View style={s.chip}>
      {colour ? <View style={[s.dot, { backgroundColor: colour }]} /> : null}
      <Text style={s.chipText}>{t(label)}</Text>
    </View>
  );
}

/** Navy left-rule callout (takeaway / key insight); body ink, never coloured text. */
function Callout({ title, children, colour = C.navy }: { title: string; children: ReactNode; colour?: string }) {
  return (
    <View style={[s.callout, { borderLeftColor: colour }]} wrap={false}>
      <Text style={[s.th, { marginBottom: 2 }]}>{t(title)}</Text>
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

function Footer({ startup, date }: { startup: string; date: string }) {
  const left = `Startup Value Index · ${t(startup)} · ${date}`;
  return (
    <View style={s.footer} fixed>
      <Text render={({ pageNumber }) => `${left} · p. ${pageNumber}`} />
      <Text>Not financial advice.</Text>
    </View>
  );
}

function AuditLine({ owner, grounded, uncited, revised, frameworks }: { owner?: string; grounded: boolean; uncited: number; revised: boolean; frameworks?: string[] }) {
  return (
    <Text style={[s.tiny, { marginTop: 4 }]}>
      {t(
        `${owner ? `${owner.toUpperCase()} · ` : ""}Auditor: ${grounded ? "grounded" : "no citation in this chapter"}${uncited > 0 ? ` · ${uncited} uncited` : ""}${revised ? " · revised" : ""} · llm-auditor${frameworks && frameworks.length ? ` · Frameworks: ${frameworks.slice(0, 4).join("; ")}` : ""}`,
      )}
    </Text>
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

// ── 1 · Dashboard ───────────────────────────────────────────────────────────

function StatTile({ tile, last }: { tile: DashboardTile; last?: boolean }) {
  return (
    <View style={[s.tile, ...(last ? [{ marginRight: 0 }] : [])]}>
      <Text style={s.tileLabel}>{t(tile.label)}</Text>
      <Text style={s.tileValue}>{t(tile.value)}</Text>
      <View style={[s.row, { alignItems: "center" }]}>
        {tile.band ? <View style={[s.dot, { backgroundColor: bandColour(tile.band) }]} /> : null}
        <Text style={s.tileSub}>{t(tile.sub)}</Text>
      </View>
      {tile.note ? <Text style={s.tileNote}>{t(tile.note.replace(/\s*↓$/u, ""))}</Text> : null}
    </View>
  );
}

function Dashboard({ report, card, dash, view, locale, preparedWith, screening }: { screening: ReturnType<typeof buildInvestorScreening>; report: ReportV2; card: AssessmentCardData; dash: DashboardView; view: InvestmentView; locale: Loc; preparedWith: string }) {
  const c = report.cover;
  const t3 = dash.strings;
  const phase = GROWTH_PHASE_LABELS[c.phaseId]?.[locale] ?? c.phaseId;
  const verification = c.verification?.label ?? card.verification.label;
  const source = report.source !== "pipeline" ? (report.source === "fixture" ? "demo data" : "built from stored snapshot") : "";
  // G19-S43: "Evidence: mostly self-declared (×0.50)" — the one evidence line under the tiles.
  const evidence = coverEvidenceLine(c, locale);
  const pending = pendingDimsLine(c, locale);
  return (
    <View>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end" }]}>
        <Text style={s.kicker}>Startup Value Index · Trusted Business Report</Text>
        <Text style={s.tiny}>{t(`${dashboardDate(report.generatedAt, locale)} · ${dash.footer.methodology}`)}</Text>
      </View>
      <Text style={s.h1}>{t(c.startupName)}</Text>
      <View
        style={[
          s.row,
          {
            alignItems: "center",
            marginTop: 4,
            marginBottom: 2,
            flexWrap: "wrap",
          },
        ]}
      >
        <Chip label={verification} colour={c.verification?.abnVerified ? BAND_COLOUR.strong : C.grid} />
        <Chip label={c.stageLabel} />
        <Chip label={c.sector} />
        <Chip label={phase} />
      </View>
      {source ? <Text style={s.tiny}>{t(source)}</Text> : null}
      <SectionHead no="1" title={t3.sec.dashboard} purpose={t3.purpose.dashboard} />
      <View wrap={false}>
        <View style={s.row}>
          <StatTile tile={dash.tiles[0]} />
          <StatTile tile={dash.tiles[1]} last />
        </View>
        <View style={s.row}>
          <StatTile tile={dash.tiles[2]} />
          <StatTile tile={dash.tiles[3]} last />
        </View>
      </View>
      <View style={[s.figure, { marginTop: 2 }]} wrap={false}>
        <Text style={[s.th, { alignSelf: "flex-start", marginBottom: 2 }]}>{t(t3.chartTitle)}</Text>
        <VisualPdf spec={dash.chart} widthPt={CHART_WIDTH} hideBadge />
        <Text style={s.caption}>{t(dash.chartCaption)}</Text>
        <Text style={s.caption}>{t(dash.legend.join("  ·  "))}</Text>
      </View>
      <View style={s.softBox} wrap={false}>
        <Text style={s.smallInk}>
          {dash.footer.topStrength ? <Text style={s.bold}>{t(`${t3.topStrength}  `)}</Text> : null}
          {dash.footer.topStrength ? t(`${dash.footer.topStrength}   ·   `) : null}
          {dash.footer.topGap ? <Text style={s.bold}>{t(`${t3.topGap}  `)}</Text> : null}
          {dash.footer.topGap ? t(dash.footer.topGap) : null}
        </Text>
        {/* G21 P1 review: the cohort rank prints only with its n (`coverPercentileLine` is null otherwise). */}
        <Text style={s.small}>{t([dash.footer.unverified, dash.footer.lastUpdated, dash.footer.methodology, evidence, pending, coverPercentileLine(c.svi)].filter(Boolean).join(" · "))}</Text>
        <Text style={[s.tiny, { marginTop: 3 }]}>{t(view.subline)}</Text>
      </View>
      <View style={{ marginTop: 4 }} wrap={false}>
        <Text style={[s.smallInk, s.bold]}>{t(investorScreeningStrings(locale).title)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {screening.signals.map(signal => <Text key={signal.key} style={[s.tiny, { width: "50%", marginTop: 2 }]}>{t(`${signal.label}: ${signal.statusLabel}`)}</Text>)}
        </View>
        <Text style={[s.tiny, { marginTop: 3 }]}>{t(screening.scopeNote)}</Text>
        {screening.questions.slice(0, 3).map((question, i) => <Text key={question.signalKey} style={[s.tiny, { marginTop: 2 }]}>{t(`${i + 1}. ${question.text}`)}</Text>)}
      </View>
      <Text style={s.tiny}>{t(preparedWith)}</Text>
    </View>
  );
}

// ── 2 · Investment view ─────────────────────────────────────────────────────

function PointList({ title, items, mark, locale }: { title: string; items: InvestmentView["reasons"]; mark: string; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  // Every item is ONE <Text> (nested runs + "\n") in a column box — never `bulletText` (flex: 1) here:
  // in a column container flex:1 collapses the line to zero height and the items print on top of each other.
  return (
    <View style={[s.box, { flex: 1, marginRight: 6 }]} wrap={false}>
      <Text style={s.th}>{t(title)}</Text>
      {items.length === 0 ? <Text style={s.small}>—</Text> : null}
      {items.map((it, i) => {
        const meta = [it.dim ? `${it.dim.toUpperCase()} · ${dimName(it.dim, locale)}${typeof it.score === "number" ? ` ${it.score}/100` : ""}` : null, typeof it.lift === "number" ? t3.lift(it.lift) : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <Text key={i} style={[s.bulletBody, { marginTop: 3 }]}>
            <Text style={[s.bold, { color: C.navy }]}>{`${mark} ${String(i + 1).padStart(2, "0")}  `}</Text>
            <Cited text={it.text} />
            {meta ? <Text style={s.tiny}>{t(`\n${meta}`)}</Text> : null}
          </Text>
        );
      })}
    </View>
  );
}

function InvestmentViewSection({ report, view, locale }: { report: ReportV2; view: InvestmentView; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  const s47 = getTbrStrings(locale).v2.s47;
  const e = ensureExecutiveStructured(report).executive;
  const x = e.structured!;
  const phase = GROWTH_PHASE_LABELS[x.phaseNow.phaseId]?.[locale] ?? x.phaseNow.label;
  return (
    <View break>
      <SectionHead no="2" title={t3.sec.investmentView} purpose={t3.purpose.investmentView} />
      <View style={s.callout} wrap={false}>
        <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
          <Text style={[s.bold, { fontSize: 13, color: C.ink }]}>{t(`${view.band} · ${view.bandLabel.toUpperCase()}`)}</Text>
          <Text style={s.smallInk}>{t(view.convictionLine)}</Text>
        </View>
        <Text style={[s.body, s.bold, { marginTop: 2 }]}>{t(view.bandWording)}</Text>
        <Text style={[s.small, { marginTop: 2 }]}>{t(view.subline)}</Text>
      </View>
      {x.headline ? (
        <Text style={[s.bold, { fontSize: 12, marginBottom: 4 }]}>
          <Cited text={x.headline} />
        </Text>
      ) : null}
      {x.summary.map((p, i) => (
        <Text key={i} style={[s.body, { marginBottom: 4 }]}>
          <Cited text={p} />
        </Text>
      ))}
      {view.band === "D" ? (
        <View wrap={false}>
          <H3>{t3.evidenceCtas}</H3>
          {view.evidenceCtas.length === 0 ? <Text style={s.small}>—</Text> : null}
          {view.evidenceCtas.map((cta, i) => (
            <View key={i} style={s.bullet}>
              <Text style={[s.bulletMark, s.bold, { color: C.navy }]}>{String(i + 1)}</Text>
              <Text style={s.bulletText}>{t(`${cta.label} · ${cta.href}${typeof cta.lift === "number" ? ` · ${t3.lift(cta.lift)}` : ""}`)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View wrap={false}>
          <H3>{t3.conditions}</H3>
          {view.conditions.length === 0 ? <Text style={s.small}>{t(t3.noConditions)}</Text> : null}
          {view.conditions.map((cnd, i) => (
            <View key={i} style={s.bullet}>
              <Text style={[s.bulletMark, s.bold, { color: C.navy }]}>{String(i + 1)}</Text>
              <Text style={s.bulletText}>
                <Cited text={cnd.text} />
              </Text>
            </View>
          ))}
        </View>
      )}
      {/* No wrap={false} on the ROW: react-pdf then mis-measures the flex:1 boxes inside it (the boxes carry it). */}
      <View style={[s.row, { marginTop: 6 }]}>
        <PointList title={t3.whyBack} items={view.reasons} mark="+" locale={locale} />
        <PointList title={t3.whatWeighsAgainst} items={view.risks} mark="^" locale={locale} />
      </View>
      <View style={s.box} wrap={false}>
        <View style={[s.row, { alignItems: "center" }]}>
          <Text style={[s.th, { marginRight: 6 }]}>{t(t3.whereYouAre)}</Text>
          <Chip label={phase} />
        </View>
        <Text style={[s.smallInk, { marginTop: 4 }]}>
          <Text style={s.bold}>{t(`${t3.blocker}: `)}</Text>
          <Cited text={x.phaseNow.blocker} />
        </Text>
        <Text style={s.smallInk}>
          <Text style={s.bold}>{t(`${t3.whatItTakes}: `)}</Text>
          <Cited text={x.phaseNow.whatItTakes} />
        </Text>
      </View>
      {view.analystSynthesis ? (
        <View style={[s.softBox, { borderLeftWidth: 2, borderLeftColor: C.muted }]} wrap={false}>
          <Text style={s.th}>{t(`${t3.analystSynthesis} · ${s47.verdictLabel[view.analystSynthesis.label]}`)}</Text>
          <Text style={s.smallInk}>
            <Cited text={view.analystSynthesis.text} />
          </Text>
        </View>
      ) : null}
      <AuditLine owner="ceo" grounded={e.audit.grounded} uncited={e.audit.uncited} revised={e.audit.revised} />
    </View>
  );
}

// ── 3 · Key points ──────────────────────────────────────────────────────────

function KeyPoints({ view, locale }: { view: InvestmentView; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  return (
    <View break>
      <SectionHead no="3" title={t3.sec.keyPoints} purpose={t3.purpose.keyPoints} />
      <View style={s.softBox} wrap={false}>
        {view.keyPoints.map((p, i) => (
          <View key={i} style={[s.bullet, { marginBottom: 3 }]}>
            <Text style={[s.bulletMark, s.bold, { color: C.navy, width: 14 }]}>{`${i + 1}.`}</Text>
            <Text style={[s.bulletText, { fontSize: 9.5 }]}>
              <Cited text={p} />
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 4 · Valuation ───────────────────────────────────────────────────────────

function ValuationSection({ report, view, locale, projection }: { report: ReportV2; view: InvestmentView; locale: Loc; projection: FreeTierProjection }) {
  const v = report.valuation;
  if (v.status === "unavailable") return (
    <View><SectionHead no="4" title={getTbrV3Strings(locale).sec.valuation} /><Text style={s.body}>{t(v.narrative)}</Text></View>
  );
  const vv = buildValuationView(v, locale);
  const vs = vv.strings;
  const t3 = getTbrV3Strings(locale);
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  if (report.cover.svi.band === "pending") {
    return (
      <View>
        <SectionHead no="4" title={t3.sec.valuation} />
        <Text style={s.body}>{t(vs.pending)}</Text>
      </View>
    );
  }
  const ask = v.ask ? `${t3.rangeAsk} ${aud(v.ask.preMoneyAud)} · ${t3.askChip[v.ask.verdict]}` : null;
  const weightSum = Math.round(v.methods.filter((m) => m.applicable).reduce((a, m) => a + m.weight, 0) * 100);
  return (
    <View minPresenceAhead={160}>
      <SectionHead no="4" title={t3.sec.valuation} />
      <View style={[s.row, { marginBottom: 4, alignItems: "center" }]}>
        <Chip label="cfo" />
        <Text style={s.tiny}>{t(vs.confidence(vv.confidencePct))}</Text>
      </View>
      <View wrap={false}>
        <Text style={s.th}>{t(t3.rangeTitle)}</Text>
        <View style={[s.row, { marginBottom: 2 }]}>
          {(["lowAud", "midAud", "highAud"] as const).map((k, i) => (
            <View key={k} style={[s.tile, { paddingVertical: 6 }, ...(i === 2 ? [{ marginRight: 0 }] : [])]}>
              <Text style={s.tileLabel}>{t(k === "lowAud" ? t3.rangeLow : k === "midAud" ? t3.rangeMid : t3.rangeHigh)}</Text>
              <Text style={[s.tileValue, { fontSize: 16 }]}>{aud(v.consensus[k])}</Text>
            </View>
          ))}
        </View>
        {ask ? <Text style={s.small}>{t(ask)}</Text> : null}
      </View>
      {rangeBars && !projection.free && <Figure spec={rangeBars} widthPt={420} caption={`${rangeBars.title} · ${stateLabel(rangeBars.dataState)}`} />}
      {vv.noneApplicable ? (
        <Text style={s.small}>{t(`${vs.noneApplicable} ${vs.connectorsCta}: ${CONNECTORS_HREF}`)}</Text>
      ) : (
        <>
          <H3>{vs.methodsTitle}</H3>
          <Table
            header={
              <View style={[s.tr, s.trHead]}>
                <Text style={[s.th, s.cell2]}>{t(vs.thMethod)}</Text>
                <Text style={[s.th, { width: 54 }]}>{t(t3.thApplicable)}</Text>
                <Text style={[s.th, { width: 40 }, s.right]}>{t(vs.thWeight)}</Text>
                {!projection.free && <Text style={[s.th, s.cell1, s.right]}>{t(t3.rangeLow)}</Text>}
                {!projection.free && <Text style={[s.th, s.cell1, s.right]}>{t(t3.rangeMid)}</Text>}
                {!projection.free && <Text style={[s.th, s.cell1, s.right]}>{t(t3.rangeHigh)}</Text>}
                {!projection.free && <Text style={[s.th, s.cell3, { paddingLeft: 6 }]}>{t(vs.thDerivation)}</Text>}
              </View>
            }
            rows={v.methods.map((m) => (
              <View key={m.method} style={s.tr} wrap={false}>
                <Text style={[s.td, s.cell2]}>{t(vs.method[m.method])}</Text>
                <Text style={[s.td, { width: 54 }]}>{t(m.applicable ? t3.yes : t3.no)}</Text>
                <Text style={[s.td, { width: 40 }, s.right]}>{`${Math.round(m.weight * 100)} %`}</Text>
                {!projection.free && <Text style={[s.td, s.cell1, s.right]}>{m.applicable ? aud(m.lowAud) : "—"}</Text>}
                {!projection.free && <Text style={[s.td, s.cell1, s.right]}>{m.applicable ? aud(m.midAud) : "—"}</Text>}
                {!projection.free && <Text style={[s.td, s.cell1, s.right]}>{m.applicable ? aud(m.highAud) : "—"}</Text>}
                {!projection.free && <Text style={[s.td, s.cell3, s.tiny, { paddingLeft: 6 }]}>{t(m.applicable && v.derivation?.[m.method] ? `${v.derivation[m.method]} — ${m.rationale}` : m.rationale)}</Text>}
              </View>
            ))}
          >
            <View style={[s.tr, s.trHead]} wrap={false}>
              <Text style={[s.td, s.bold, s.cell2]}>{t(t3.consensusRow)}</Text>
              <Text style={[s.td, { width: 54 }]}> </Text>
              <Text style={[s.td, s.bold, { width: 40 }, s.right]}>{`${weightSum} %`}</Text>
              {!projection.free && <Text style={[s.td, s.bold, s.cell1, s.right]}>{aud(v.consensus.lowAud)}</Text>}
              {!projection.free && <Text style={[s.td, s.bold, s.cell1, s.right]}>{aud(v.consensus.midAud)}</Text>}
              {!projection.free && <Text style={[s.td, s.bold, s.cell1, s.right]}>{aud(v.consensus.highAud)}</Text>}
              {!projection.free && <Text style={[s.td, s.cell3, s.tiny, { paddingLeft: 6 }]}>{t(vs.confidence(vv.confidencePct))}</Text>}
              {projection.free && <Text style={[s.td, s.bold, s.cell3, { paddingLeft: 6 }]}>{`${aud(v.consensus.lowAud)} – ${aud(v.consensus.highAud)}`}</Text>}
            </View>
          </Table>
          {vv.needRevenueLine && <Text style={s.small}>{t(`${vv.needRevenueLine} ${vs.connectorsCta}: ${CONNECTORS_HREF}`)}</Text>}
        </>
      )}
      {view.whatMovesIt.length > 0 && (
        <View wrap={false}>
          <H3>{t3.whatMovesIt}</H3>
          {view.whatMovesIt.map((m, i) => (
            <View key={i} style={s.bullet}>
              <Text style={[s.bulletMark, { color: C.navy }]}>{">"}</Text>
              <Text style={s.bulletText}>{t(m)}</Text>
            </View>
          ))}
        </View>
      )}
      {!projection.free && (
        <View>
          {vv.inputRows.length > 0 && (
            <>
              <H3>{vs.inputsTitle}</H3>
              <Table
                header={
                  <View style={[s.tr, s.trHead]}>
                    <Text style={[s.th, s.cell2]}>{t(vs.thInput)}</Text>
                    <Text style={[s.th, s.cell3]}>{t(vs.thValue)}</Text>
                    <Text style={[s.th, s.cell1]}>{t(vs.thSource)}</Text>
                  </View>
                }
                rows={vv.inputRows.map((r) => (
                  <View key={r.key} style={s.tr}>
                    <Text style={[s.td, s.cell2]}>{t(r.label)}</Text>
                    <Text style={[s.td, s.cell3]}>{t(r.value)}</Text>
                    <Text style={[s.td, s.cell1, s.tiny]}>{t(vs.source[r.source])}</Text>
                  </View>
                ))}
              />
            </>
          )}
          {vv.unitEconomics.length > 0 && (
            <View wrap={false}>
              <H3>{vs.unitEconomicsTitle}</H3>
              <Text style={s.small}>{t(vv.unitEconomics.map((r) => `${r.label} ${r.value}`).join(" · "))}</Text>
            </View>
          )}
          <Text style={s.small}>{t(`${vs.scenarios}: ${vv.scenarioLine}`)}</Text>
          {vv.askLine && <Text style={s.small}>{t(vv.askLine)}</Text>}
          <Text style={s.small}>{t(`${vv.sectorMultiplesTitle}: ${vv.sectorMultiplesLine}`)}</Text>
          <Text style={s.small}>{t(vv.comparablesLine)}</Text>
          {vv.crossChecks.length > 0 && (
            <View wrap={false}>
              <H3>{vs.crossChecksTitle}</H3>
              {vv.crossChecks.map((c, i) => (
                <Text key={i} style={s.small}>
                  {t(`${c.label}: ${c.range}${c.n !== null ? ` (${vs.nLabel(c.n)})` : ""} — ${c.source} · ${vs.asOf(c.asOf)}`)}
                </Text>
              ))}
            </View>
          )}
          {vv.consistency.length > 0 && (
            <View wrap={false}>
              <H3>{vs.consistencyTitle}</H3>
              {vv.consistency.map((n, i) => (
                <Text key={i} style={s.small}>
                  {t(n)}
                </Text>
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
      <AuditLine owner="cfo" grounded={v.audit.grounded} uncited={v.audit.uncited} revised={v.audit.revised} />
    </View>
  );
}

// ── 5–12 · Dimension chapters (spec § 3 anatomy) ────────────────────────────

function ChapterHeader({ ch, index, locale }: { ch: DimensionChapter; index: number; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  const pending = !isAssessed(ch) || ch.band === "pending";
  const band: Band = pending ? "pending" : ch.band;
  const phase = GROWTH_PHASE_LABELS[ch.phaseLens.phaseId]?.[locale] ?? ch.phaseLens.phaseId;
  const floor = typeof ch.phaseLens.floor === "number" ? t3.floorChip(phase, ch.phaseLens.floor, ch.phaseLens.floorMet !== false) : t3.noFloor(phase);
  return (
    <View style={[s.box, s.row, { alignItems: "center" }]} wrap={false}>
      <View style={{ width: 84 }}>
        <Text style={s.score}>{pending ? "—" : String(ch.score)}</Text>
        <Text style={s.tiny}>/ 100</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.tiny, { marginBottom: 2 }]}>{t(t3.dimKicker(index, ch.weight))}</Text>
        <View style={[s.row, { alignItems: "center", marginBottom: 3, flexWrap: "wrap" }]}>
          <Chip label={bandLabel(band, locale)} colour={pending ? C.grid : bandColour(band)} />
          <Chip label={floor} />
          <Chip label={ch.ownerAgent} />
        </View>
        <Text style={s.small}>{t(benchmarkLine(ch, t3))}</Text>
        {ch.degraded && <Text style={s.tiny}>{t(`Deterministic card — ${ch.degradeReason ?? "owner call unavailable"}`)}</Text>}
      </View>
    </View>
  );
}

/** Rows 3 + 7 of the anatomy in one right-hand rail: evidence used (≤ 5, no ids) + what to improve (1–3). */
function ChapterRail({ ch, locale }: { ch: DimensionChapter; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  const s43 = getTbrS43Strings(locale);
  const real = evidenceRowsView(ch.evidence, locale).filter((e) => e.status !== "missing");
  const shown = real.slice(0, 5);
  const more = real.length - shown.length;
  const empty = emptyEvidenceLine(locale);
  const improve = chapterImprovements(ch, locale);
  return (
    <View style={{ width: 200, paddingLeft: 8 }}>
      <Text style={s.th}>{t(t3.evidenceUsed)}</Text>
      {shown.length === 0 ? <Text style={s.small}>{t(`${empty.text} ${empty.ctaLabel} ${empty.href}`)}</Text> : null}
      {shown.map((e, i) => {
        const raw = ch.evidence.find((r) => r.evidence_id === e.evidence_id);
        const rung = raw?.confidence ? (s43.evidenceLevel[raw.confidence] ?? raw.confidence) : "—";
        const n = cites.peek(e.evidence_id)?.n;
        return (
          <Text key={i} style={[s.smallInk, { marginTop: 2 }]}>
            {t(`${e.label} · ${rung} · ${e.statusLabel}`)}
            {typeof n === "number" ? <Text style={{ fontSize: 6, color: C.cyan, verticalAlign: "super" }}>{String(n)}</Text> : null}
          </Text>
        );
      })}
      {more > 0 ? <Text style={[s.tiny, { marginTop: 2 }]}>{t(t3.moreInRegister(more))}</Text> : null}
      <Text style={[s.th, { marginTop: 8 }]}>{t(t3.whatToImprove)}</Text>
      {improve.map((r, i) => (
        <View key={i} style={{ marginTop: 2 }}>
          <Text style={s.smallInk}>{t(`> ${r.action}`)}</Text>
          <Text style={s.tiny}>{t([r.lift > 0 ? t3.lift(r.lift) : null, t3.window[r.window], r.evidence ? `${t3.thEvidence}: ${r.evidence}` : null].filter(Boolean).join(" · "))}</Text>
        </View>
      ))}
    </View>
  );
}

function PendingCard({ ch, locale, view }: { ch: DimensionChapter; locale: Loc; view: InvestmentView }) {
  const t3 = getTbrV3Strings(locale);
  const ctas = chapterCtaRows(ch, locale);
  return (
    <View>
      <View style={s.softBox} wrap={false}>
        <Text style={s.body}>{t(t3.pendingCard)}</Text>
        {ctas.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            <Text style={[s.smallInk, s.bold]}>{t(t3.pendingAdd)}</Text>
            {ctas.map((r, i) => (
              <Text key={i} style={s.smallInk}>
                {t(`• ${ctaText(r)}`)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Callout title={t3.takeawayTitle}>
        <Cited text={view.takeaways[ch.dim]} />
      </Callout>
    </View>
  );
}

function Chapter({ ch, index, locale, projection, view }: { ch: DimensionChapter; index: number; locale: Loc; projection: FreeTierProjection; view: InvestmentView }) {
  const t3 = getTbrV3Strings(locale);
  const title = locale === "vi" ? ch.titleVi : ch.title;
  const no = String(index + 4);
  const pending = !isAssessed(ch) || ch.band === "pending";

  // Free tier: chapters 5–8 as locked compact cards (score · band · verdict ≤ 40 words · takeaway).
  if (projection.free && ch.renderAs === "card") {
    return (
      <View>
        <SectionHead no={no} title={title} presence={220} />
        <ChapterHeader ch={ch} index={index} locale={locale} />
        {pending ? (
          <PendingCard ch={ch} locale={locale} view={view} />
        ) : (
          <View wrap={false}>
            <Text style={s.body}>
              <Cited text={capWords(ch.verdict, 40)} />
            </Text>
            <Callout title={t3.takeawayTitle}>
              <Cited text={view.takeaways[ch.dim]} />
            </Callout>
          </View>
        )}
        <Text style={s.tiny}>{t(t3.lockedCard)}</Text>
        <Text style={[s.tiny, { color: C.cyan, marginBottom: 6 }]}>{t(`Unlock the full ${ch.title} chapter — upgrade at blockid.au/pricing`)}</Text>
      </View>
    );
  }

  if (pending) {
    return (
      <View>
        <SectionHead no={no} title={title} presence={220} />
        <ChapterHeader ch={ch} index={index} locale={locale} />
        <PendingCard ch={ch} locale={locale} view={view} />
        <AuditLine owner={ch.ownerAgent} grounded={ch.audit.grounded} uncited={ch.audit.uncited} revised={ch.audit.revised} />
      </View>
    );
  }

  const ids = ch.evidence.map((e) => e.evidence_id);
  const strengths = mergedBullets(
    ch.strengths,
    ch.criteria.flatMap((c) => c.strengths),
    3,
    25,
  );
  const gaps = chapterGaps(ch)
    .slice(0, 3)
    .map((g) => capWords(g, 25));
  const showCards = projection.show.criterionDetail && !projection.free;
  return (
    <View>
      <SectionHead no={no} title={title} presence={220} />
      <ChapterHeader ch={ch} index={index} locale={locale} />
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.th}>{t(t3.verdict)}</Text>
          <Paragraphs text={ch.verdict} />
          {strengths.length > 0 && (
            <View style={{ marginTop: 6 }} wrap={false}>
              <Bullets title={t3.strengths} items={strengths} mark="+" column />
            </View>
          )}
          {gaps.length > 0 && (
            <View style={{ marginTop: 6 }} wrap={false}>
              <Text style={s.th}>{t(t3.risksGaps)}</Text>
              {gaps.map((g, i) => (
                <View key={i} style={s.bullet}>
                  <Text style={s.bulletMark}>^</Text>
                  <Text style={s.bulletText}>
                    <Cited text={g} />
                    {isUnverifiedClaim(g, ids) ? <Text style={{ color: C.muted, fontSize: 7 }}>{t(` · ${t3.unverified}`)}</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <ChapterRail ch={ch} locale={locale} />
      </View>
      {/* The primary visual is the one optional slot (spec § 3): paid tiers keep it; the free 10-page budget carries the dashboard chart instead. */}
      {!projection.free && (
        <Figure spec={ch.primaryVisual} widthPt={320} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
      )}
      {ch.criteria.length > 0 && (
        <View>
          <Table
            caption={t3.criteria}
            header={
              <View style={[s.tr, s.trHead]}>
                <Text style={[s.th, s.cell2]}>{t(t3.thCriterion)}</Text>
                <Text style={[s.th, { width: 36 }, s.right]}>{t(t3.thScore)}</Text>
                <Text style={[s.th, { width: 56, paddingLeft: 6 }]}>{t(t3.thQuality)}</Text>
                <Text style={[s.th, s.cell3, { paddingLeft: 6 }]}>{t(t3.thVerdict)}</Text>
              </View>
            }
            rows={ch.criteria.map((c) => (
              <View key={c.key} style={s.tr} wrap={false}>
                <Text style={[s.td, s.cell2]}>{t(c.title)}</Text>
                <View
                  style={[
                    s.row,
                    {
                      width: 36,
                      justifyContent: "flex-end",
                      alignItems: "center",
                    },
                  ]}
                >
                  <View style={[s.dot, { backgroundColor: bandColour(bandOf(c.score)) }]} />
                  <Text style={[s.td, s.bold]}>{String(c.score)}</Text>
                </View>
                <Text style={[s.td, { width: 56, paddingLeft: 6 }]}>{t(c.quality)}</Text>
                <Text style={[s.td, s.cell3, { paddingLeft: 6 }]}>
                  <Cited text={oneLine(c.verdict, 20)} />
                </Text>
              </View>
            ))}
          />
          {showCards && ch.criteria.map((c) => {
            const detail = criterionDetailExport(c, [...ch.evidence, ...projection.report.appendix.evidenceRegister], locale);
            if (!detail) return null;
            return (
              <View key={`analysis-${c.key}`} style={{ marginTop: 8, marginBottom: 8 }}>
                <Text style={[s.smallInk, s.bold]} minPresenceAhead={45}>{t(`${c.title}: ${detail.heading}`)}</Text>
                <Text style={[s.tiny, { marginBottom: 5 }]}>{t(detail.disclosure)}</Text>
                {detail.paragraphs.map((paragraph, index) => <Text key={index} style={[s.body, { marginBottom: 5 }]}>{t(paragraph)}</Text>)}
                {detail.quotes.length > 0 && <Text style={[s.smallInk, s.bold]} minPresenceAhead={25}>{t(detail.sourcesHeading)}</Text>}
                {detail.quotes.map((quote, index) => <Text key={index} style={[s.tiny, { marginBottom: 4 }]}>{t(quote)}</Text>)}
              </View>
            );
          })}
          {showCards ? (
            ch.criteria.map((c) =>
              c.strengths.length > 0 || c.gaps.length > 0 || c.nextAction ? (
                <View key={c.key} style={[s.softBox, { paddingVertical: 5 }]} wrap={false}>
                  <Text style={[s.smallInk, s.bold]}>{t(`${c.title} · ${c.score}/100 · ${c.quality}`)}</Text>
                  {(c.strengths.length > 0 || c.gaps.length > 0) && (
                    <View style={[s.row, { marginTop: 2 }]}>
                      <Bullets title={t3.strengths} items={c.strengths.slice(0, 3).map((x) => capWords(x, 25))} mark="+" />
                      <Bullets title={t3.risksGaps} items={c.gaps.slice(0, 3).map((x) => capWords(x, 25))} mark="^" />
                    </View>
                  )}
                  {c.nextAction ? (
                    <Text style={[s.smallInk, { marginTop: 2 }]}>
                      <Text style={s.bold}>{t(`${t3.whatToImprove}: `)}</Text>
                      <Cited text={c.nextAction} />
                    </Text>
                  ) : null}
                </View>
              ) : null,
            )
          ) : (
            <Text style={[s.tiny, { marginTop: -4, marginBottom: 4 }]}>{t(t3.fullCardsPaid)}</Text>
          )}
        </View>
      )}
      <Callout title={t3.takeawayTitle}>
        <Cited text={view.takeaways[ch.dim]} />
      </Callout>
      <Text style={s.tiny}>{t(`${t3.howBuilt}: ${t3.scoreLedger} — ${t3.sec.appendix.split(" — ")[0]}`)}</Text>
      <AuditLine owner={ch.ownerAgent} grounded={ch.audit.grounded} uncited={ch.audit.uncited} revised={ch.audit.revised} frameworks={ch.frameworks} />
    </View>
  );
}

// ── 13 · Risk matrix ────────────────────────────────────────────────────────

function RiskMatrix({ view, locale, projection }: { view: InvestmentView; locale: Loc; projection: FreeTierProjection }) {
  const t3 = getTbrV3Strings(locale);
  const grid = riskGrid(view.riskMatrix);
  const cell = (lk: RiskLevel, im: RiskLevel) => grid[lk][im];
  return (
    <View break={!projection.free} minPresenceAhead={160}>
      <SectionHead no="13" title={t3.sec.riskMatrix} purpose={t3.purpose.riskMatrix} />
      <View style={[s.row, { alignItems: "flex-start" }]} wrap={false}>
        <View style={[s.table, { width: 250, marginRight: 10 }]}>
          <View style={[s.tr, s.trHead]}>
            <Text style={[s.th, s.cell2]}>{t(`${t3.likelihood} \\ ${t3.impact}`)}</Text>
            {RISK_LEVELS_ASC.map((im) => (
              <Text key={im} style={[s.th, s.cell1, s.right]}>
                {t(t3.level[im])}
              </Text>
            ))}
          </View>
          {RISK_LEVELS_DESC.map((lk) => (
            <View key={lk} style={s.tr}>
              <Text style={[s.td, s.cell2]}>{t(t3.level[lk])}</Text>
              {RISK_LEVELS_ASC.map((im) => (
                <Text key={im} style={[s.td, s.cell1, s.right, ...(lk === "high" && im === "high" && cell(lk, im) > 0 ? [s.bold] : [])]}>
                  {String(cell(lk, im))}
                </Text>
              ))}
            </View>
          ))}
        </View>
        <Text style={[s.small, { flex: 1, marginTop: 4 }]}>{t(t3.riskGridCaption)}</Text>
      </View>
      {view.riskMatrix.length === 0 ? (
        <Text style={s.small}>{t(t3.noRisks)}</Text>
      ) : projection.show.riskTable ? (
        <Table
          header={
            <View style={[s.tr, s.trHead]}>
              <Text style={[s.th, s.cell3]}>{t(t3.thRisk)}</Text>
              <Text style={[s.th, s.cell1]}>{t(t3.likelihood)}</Text>
              <Text style={[s.th, s.cell1]}>{t(t3.impact)}</Text>
              <Text style={[s.th, s.cell2]}>{t(t3.thMitigation)}</Text>
            </View>
          }
          rows={view.riskMatrix.map((r) => (
            <View key={r.id} style={s.tr} wrap={false}>
              <Text style={[s.td, s.cell3, { paddingRight: 6 }, ...(r.likelihood === "high" && r.impact === "high" ? [s.bold] : [])]}>
                {t(r.dim ? `${dimName(r.dim, locale)} · ` : "")}
                <Cited text={r.text} />
              </Text>
              <Text style={[s.td, s.cell1]}>{t(t3.level[r.likelihood])}</Text>
              <Text style={[s.td, s.cell1]}>{t(t3.level[r.impact])}</Text>
              <Text style={[s.td, s.cell2, s.small]}>{t(r.mitigation)}</Text>
            </View>
          ))}
        />
      ) : (
        <Text style={s.tiny}>{t(t3.lockedCard)}</Text>
      )}
    </View>
  );
}

// ── 14 · 90-day improvement plan ────────────────────────────────────────────

function ImprovementPlan({ view, locale, projection }: { view: InvestmentView; locale: Loc; projection: FreeTierProjection }) {
  const t3 = getTbrV3Strings(locale);
  return (
    <View break={!projection.free} minPresenceAhead={160}>
      <SectionHead no="14" title={t3.sec.improvementPlan} purpose={t3.purpose.improvementPlan} />
      {view.improvementPlan.length === 0 ? (
        <Text style={s.small}>{t(t3.planEmpty)}</Text>
      ) : (
        <Table
          header={
            <View style={[s.tr, s.trHead]}>
              <Text style={[s.th, { width: 16 }]}>#</Text>
              <Text style={[s.th, s.cell3]}>{t(t3.thAction)}</Text>
              <Text style={[s.th, { width: 44 }, s.right]}>{t(t3.thLift)}</Text>
              <Text style={[s.th, { width: 52, paddingLeft: 6 }]}>{t(t3.thWindow)}</Text>
              <Text style={[s.th, { width: 96, paddingLeft: 6 }]}>{t(t3.thDim)}</Text>
              <Text style={[s.th, s.cell2, { paddingLeft: 6 }]}>{t(t3.thEvidence)}</Text>
            </View>
          }
          rows={view.improvementPlan.map((st) => (
            <View key={st.rank} style={s.tr} wrap={false}>
              <Text style={[s.td, s.bold, { width: 16, color: C.navy }]}>{String(st.rank)}</Text>
              <Text style={[s.td, s.cell3]}>
                <Cited text={st.title} />
              </Text>
              <Text style={[s.td, { width: 44 }, s.right]}>{t(t3.lift(st.expectedLift))}</Text>
              <Text style={[s.td, { width: 52, paddingLeft: 6 }]}>{t(t3.window[st.window])}</Text>
              <Text style={[s.td, { width: 96, paddingLeft: 6 }]}>{t(dimName(st.dim, locale))}</Text>
              <Text style={[s.td, s.cell2, s.small, { paddingLeft: 6 }]}>{t(st.evidenceToAdd ?? (st.href ? st.href : "—"))}</Text>
            </View>
          ))}
        />
      )}
      <Text style={s.small}>{t(t3.planNote)}</Text>
    </View>
  );
}

// ── 15 · Money on the table ─────────────────────────────────────────────────

function Money({ report, projection, locale }: { report: ReportV2; projection: FreeTierProjection; locale: Loc }) {
  const t3 = getTbrV3Strings(locale);
  const m = report.moneyOnTable;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((p) => ({ ...p, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, projection.moneyLimit);
  // G19-S43: the empty state points at the grant profile (never "re-run").
  const empty = moneyEmptyState(report, locale);
  return (
    <View break={!projection.free} minPresenceAhead={140}>
      <SectionHead no="15" title={t3.sec.money} />
      <View style={[s.row, { marginBottom: 4, alignItems: "center" }]}>
        <Chip label="cfo" />
        <Chip label="cmo" />
        <Text style={s.small}>{t(`${m.grants.length + m.programs.length} matched · total ${aud(m.totalAud)}`)}</Text>
      </View>
      {rows.length > 0 ? (
        <Table
          header={
            <View style={[s.tr, s.trHead]}>
              <Text style={[s.th, s.cell3]}>Grant / program</Text>
              <Text style={[s.th, s.cell1]}>Kind</Text>
              <Text style={[s.th, s.cell1, s.right]}>A$</Text>
              <Text style={[s.th, s.cell1, { paddingLeft: 6 }]}>Deadline</Text>
              <Text style={[s.th, s.cell1, s.right]}>Fit</Text>
            </View>
          }
          rows={rows.map((r) => (
            <View key={`${r.kind}-${r.id}`} style={s.tr} wrap={false}>
              <Text style={[s.td, s.cell3]}>{t(r.name)}</Text>
              <Text style={[s.td, s.cell1]}>{r.kind}</Text>
              <Text style={[s.td, s.cell1, s.right]}>{r.amountAud === null ? "—" : aud(r.amountAud)}</Text>
              <Text style={[s.td, s.cell1, { paddingLeft: 6 }]}>{t(r.deadline ?? "rolling")}</Text>
              <Text style={[s.td, s.cell1, s.right]}>{`${Math.round(r.fit)}%`}</Text>
            </View>
          ))}
        />
      ) : empty ? (
        <Text style={s.small}>{t(`${empty.text} ${empty.ctaLabel} ${empty.href}`)}</Text>
      ) : null}
      {/* The money chart is paid content on the PDF (the free 10-page budget carries the dashboard chart). */}
      {!projection.free &&
        m.visuals.map((v) => (
          <Figure key={v.id} spec={v} widthPt={420} caption={`${v.title} · ${stateLabel(v.dataState)}`} />
        ))}
    </View>
  );
}

// ── 16 · Appendix ───────────────────────────────────────────────────────────

/**
 * G19-S41 — "How this score was built": the same rows as the web chapter
 * (ledger-rows.ts). Unassessed chapters get the single pending line.
 */
function ScoreLedger({ ch, locale, verificationLevel }: { ch: DimensionChapter; locale: Loc; verificationLevel: number | null }) {
  if (!ch.scoreBreakdown) return null;
  const strings = getTbrStrings(locale).ledger;
  const rows = ledgerRowsFor(ch, locale, verificationLevel);
  const pending = isUnassessed(ch) ? pendingLine(ch, locale) : null;
  const pendingCtas = pending ? chapterCtaRows(ch, locale) : [];
  const title = locale === "vi" ? ch.titleVi : ch.title;
  return (
    <View style={s.table} wrap={false}>
      <View style={[s.tr, s.trHead]}>
        <Text style={[s.th, s.cell3]}>{t(`${title} — ${strings.title}`)}</Text>
        {!pending && <Text style={[s.th, s.cell1, s.right]}>{t(strings.thPoints)}</Text>}
        {!pending && <Text style={[s.th, s.cell1, { paddingLeft: 6 }]}>{t(strings.thSource)}</Text>}
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
            <Text style={[s.td, s.cell1, s.tiny, { paddingLeft: 6 }]}>{t(r.source)}</Text>
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

/** G19-S41 — the SVI ledger strip (base → dims → stage → penalties → total) — now in the appendix. */
function CoverLedger({ report, locale }: { report: ReportV2; locale: Loc }) {
  const cells = coverLedgerCells(report.cover, locale);
  if (cells.length === 0) return null;
  const strings = getTbrStrings(locale).ledger;
  return (
    <View style={s.softBox} wrap={false}>
      <Text style={s.th}>{t(strings.coverTitle)}</Text>
      <Text style={s.smallInk}>{t(cells.map((c) => `${c.label} ${c.value}`).join("  →  "))}</Text>
    </View>
  );
}

function Appendix({ report, projection, preparedWith, locale, verificationLevel }: { report: ReportV2; projection: FreeTierProjection; preparedWith: string; locale: Loc; verificationLevel: number | null }) {
  const t3 = getTbrV3Strings(locale);
  const a = report.appendix;
  const g = report.phaseGates;
  const currentRows = g.matrix.filter((m) => m.phase === g.current && m.required);
  const heat = g.visuals.find((v) => v.kind === "heat_map");
  const floors = report.dimensions.filter((ch) => typeof ch.phaseLens.floor === "number").map((ch) => `${ch.dim.toUpperCase()} ${ch.phaseLens.floor} ${ch.phaseLens.floorMet === false ? "✗" : "✓"}`);
  const grounded = a.auditLog.filter((l) => l.grounded).length;
  const showLedger = projection.show.appendixLedger;
  const countsOnly = projection.free && projection.level >= 3;
  return (
    <View break={!projection.free} minPresenceAhead={140}>
      <SectionHead no="16" title={t3.sec.appendix} />
      <H3>Method</H3>
      <Text style={s.small}>{t(a.method)}</Text>

      <H3>{t3.phaseGateMatrix}</H3>
      <Text style={[s.small, { marginBottom: 3 }]}>{t(`Current phase: ${GROWTH_PHASE_LABELS[g.current][locale]}`)}</Text>
      <View style={s.table} wrap={false}>
        <View style={[s.tr, s.trHead]}>
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
        <View style={[s.tr, s.trHead]}>
          <Text style={[s.td, s.bold, s.cell2]}>Floors</Text>
          <Text style={[s.td, { flex: 2 }]}>{t(floors.length ? floors.join(" · ") : "—")}</Text>
        </View>
      </View>
      {g.blockers.slice(0, 6).map((b) => (
        <Text key={`${b.code}-${b.subject}`} style={s.small}>
          {t(`^ ${b.detail}`)}
        </Text>
      ))}
      {!projection.free && heat && <Figure spec={heat} widthPt={CHART_WIDTH} caption={heat.subtitle ?? heat.title} />}

      {showLedger && (
        <>
          <H3 presence={130}>{t3.scoreLedger}</H3>
          <CoverLedger report={report} locale={locale} />
          {report.dimensions
            .filter((ch) => !(projection.free && ch.renderAs === "card"))
            .map((ch) => (
              <ScoreLedger key={ch.dim} ch={ch} locale={locale} verificationLevel={verificationLevel} />
            ))}
        </>
      )}

      <H3>Evidence register</H3>
      {countsOnly ? (
        <Text style={s.small}>{t(t3.countsOnly(a.evidenceRegister.length, a.auditLog.length))}</Text>
      ) : a.evidenceRegister.length > 0 ? (
        <Table
          header={
            <View style={[s.tr, s.trHead]}>
              <Text style={[s.th, s.cell1]}>Id</Text>
              <Text style={[s.th, s.cell3]}>Label</Text>
              <Text style={[s.th, s.cell1]}>Source</Text>
              <Text style={[s.th, s.cell1]}>Status</Text>
              <Text style={[s.th, s.cell1]}>Dims</Text>
            </View>
          }
          rows={
            /* G19-S43: missing inputs are CTA rows (label · path · +N SVI). */
            evidenceRowsView(a.evidenceRegister, locale).map((e) => (
              <View key={e.evidence_id} style={s.tr} wrap={false}>
                <Text style={[s.td, s.cell1, s.tiny]}>{t(e.evidence_id)}</Text>
                <Text style={[s.td, s.cell3, ...(e.cta ? [{ color: C.cyan }] : [])]}>{t(e.cta ? ctaText(e) : e.label)}</Text>
                <Text style={[s.td, s.cell1]}>{t(e.source)}</Text>
                <Text style={[s.td, s.cell1]}>{t(e.statusLabel)}</Text>
                <Text style={[s.td, s.cell1]}>{e.dims.join(" ")}</Text>
              </View>
            ))
          }
        />
      ) : (
        <Text style={s.small}>No evidence rows were attached to this snapshot.</Text>
      )}
      <H3>Auditor log</H3>
      <Text style={s.small}>
        {t(
          `${a.auditLog.length} sections audited · ${grounded} grounded · ${a.auditLog.filter((l) => l.revised).length} revised · report quality ${Math.round(report.quality.score)} · grounded share ${Math.round(report.quality.groundedShare * 100)}%`,
        )}
      </Text>
      {report.quality.degradedSections.length > 0 && <Text style={s.small}>{t(`Degraded sections: ${report.quality.degradedSections.join(", ")}`)}</Text>}
      <H3>Sources</H3>
      <Text style={s.small}>
        {t(`AU comparables: ${a.comparablesN} raises, ${a.comparablesWithMultiplesN} with multiples.${a.sourcesDated.length ? " " + a.sourcesDated.map((x) => `${x.label} (${x.date})`).join(" · ") : ""}`)}
      </Text>
      {projection.free && <Text style={[s.small, { marginTop: 4 }]}>{t(`Free tier (${report.pageBudget.free}-page budget) omits: ${projection.dropped.join(", ")}.`)}</Text>}
      <H3>Data principle</H3>
      <Text style={s.small}>{t(a.dataPrinciple)}</Text>
      <Text style={[s.tiny, { marginTop: 6 }]}>{t(preparedWith)}</Text>
      <Text style={[s.small, { marginTop: 6 }]}>{t(a.disclaimer)}</Text>
      <AdviceDisclaimer variant="financial" />
      <Text style={[s.tiny, { marginTop: 3 }]}>{PDF_ENTITY_LINE}</Text>
    </View>
  );
}

/** G24-A: "Evidence cited" — the footnote list (n · label · level · source · date); omitted when nothing is cited. */
function EvidenceCited({ locale }: { locale: Loc }) {
  const rows = citationEntries(cites);
  if (rows.length === 0) return null;
  const cs = citationStrings(locale);
  return (
    <View>
      <SectionHead no="" title={cs.appendixTitle} />
      <Text style={[s.small, { marginBottom: 6 }]}>{t(cs.appendixPurpose)}</Text>
      <Table
        header={
          <View style={[s.tr, s.trHead]}>
            <Text style={[s.th, { width: 18 }]}>{t(cs.th.n)}</Text>
            <Text style={[s.th, s.cell3]}>{t(cs.th.label)}</Text>
            <Text style={[s.th, s.cell1]}>{t(cs.th.level)}</Text>
            <Text style={[s.th, s.cell1]}>{t(cs.th.source)}</Text>
            <Text style={[s.th, s.cell1]}>{t(cs.th.date)}</Text>
          </View>
        }
        rows={rows.map((e) => (
          <View key={e.id} style={s.tr} wrap={false}>
            <Text style={[s.td, s.bold, { width: 18, color: C.cyan }]}>{String(e.n)}</Text>
            <Text style={[s.td, s.cell3]}>{t(`${e.label}  ${e.id}`)}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.level(e))}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.source(e))}</Text>
            <Text style={[s.td, s.cell1]}>{t(cs.date(e))}</Text>
          </View>
        ))}
      />
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
  locale?: Loc;
  /** Server-loaded Assessment Card context (stored evidence confidence, claim count, benchmark) — same numbers as the web card. */
  assessment?: AssessmentCardOptions;
}

export function TbrReportPdf({ report: rawReport, level = 0, preparedWith, locale, assessment }: TbrPdfProps) {
  // One evidence-confidence number across the card, the dashboard and the investment view (review P1).
  const aligned = alignReportWithAssessmentCard(rawReport, assessment ?? {});
  // G19-S45: EN / VI font sets + strings only; ES / JA documents render with the English labels.
  const rawLoc = locale ?? aligned.report.locale ?? "en";
  const loc: Loc = rawLoc === "vi" ? "vi" : "en";
  useFontSet(loc);
  // G27: the investment view + dashboard are built from the FULL aligned document (never the trimmed projection),
  // then the free-tier projection caps the risk rows / plan steps it prints.
  const view = buildInvestmentView(aligned.report, aligned.card, loc);
  const full: ReportV2 = { ...aligned.report, investmentView: view };
  const projection = projectForTier(full, level);
  const r = projection.report;
  const pv = r.investmentView ?? view;
  const dash = buildDashboardView(aligned.report, aligned.card, view, loc);
  // G24-A: one footnote numbering per document — walked over the FULL text
  // (not the free-tier projection) so web, PDF and DOCX print the same numbers.
  const citations = useCitations(aligned.report, loc);
  const prepared = preparedWith?.trim() || defaultPreparedWith(aligned.report);
  const verificationLevel = aligned.report.cover.verification?.level ?? null;
  const body: ReactNode[] = [];
  body.push(<Dashboard key="dash" screening={buildInvestorScreening(aligned.report, loc, projection.free)} report={r} card={aligned.card} dash={dash} view={pv} locale={loc} preparedWith={prepared} />);
  body.push(<InvestmentViewSection key="iv" report={r} view={pv} locale={loc} />);
  body.push(<KeyPoints key="kp" view={pv} locale={loc} />);
  body.push(<ValuationSection key="val" report={r} view={pv} locale={loc} projection={projection} />);
  const criteriaText = criteriaSummaryStrings(loc);
  body.push(<View key="criteria-summary" break={!projection.free} minPresenceAhead={120}>
    <SectionHead no="" title={criteriaText.title} />
    {buildCriteriaSummary(aligned.report, loc, projection.free).map(row => <View key={row.key} wrap={false} style={{ marginBottom: 5 }}>
      <Text style={s.body}>{t(`${row.title}: `)}<Cited text={row.finding} /></Text>
      <Text style={s.small}>{t(`${criteriaText.score}: ${row.score ?? "—"} · ${criteriaText.evidence}: ${row.evidenceCount ?? "—"}`)}</Text>
    </View>)}
  </View>);
  r.dimensions.forEach((ch, i) => {
    body.push(
      <View key={ch.dim} break={!projection.free} minPresenceAhead={projection.free ? 110 : 220}>
        <Chapter ch={ch} index={i + 1} locale={loc} projection={projection} view={pv} />
      </View>,
    );
  });
  body.push(<RiskMatrix key="risk" view={pv} locale={loc} projection={projection} />);
  body.push(<ImprovementPlan key="plan" view={pv} locale={loc} projection={projection} />);
  body.push(<Money key="money" report={r} projection={projection} locale={loc} />);
  body.push(<Appendix key="appx" report={r} projection={projection} preparedWith={prepared} locale={loc} verificationLevel={verificationLevel} />);
  if (citations.size > 0) {
    body.push(
      <View key="cited" break={!projection.free} minPresenceAhead={120}>
        <EvidenceCited locale={loc} />
      </View>,
    );
  }
  return (
    <Document title={`Trusted Business Report — ${r.cover.startupName}`} author="BlockID.au" subject="Trusted Business Report v3" creator="BlockID.au">
      <Page size="A4" style={s.page}>
        {body}
        <Footer startup={r.cover.startupName} date={fmtDate(r.generatedAt, loc)} />
      </Page>
    </Document>
  );
}

export interface RenderTbrPdfOptions {
  preparedWith?: string | null;
  locale?: Loc;
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

// react-pdf has no "unregister"; its default hyphenator is `hyphen/en` with soft hyphens — re-register that.
let defaultHyphenationImpl: ((word: string) => string[]) | null = null;
function defaultHyphenation(word: string): string[] {
  if (!defaultHyphenationImpl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const hyphen = require("hyphen/en") as {
        hyphenateSync: (w: string, o?: { hyphenChar?: string }) => string;
      };
      defaultHyphenationImpl = (w: string) => hyphen.hyphenateSync(w, { hyphenChar: "­" }).split("­");
    } catch {
      defaultHyphenationImpl = (w: string) => [w];
    }
  }
  return defaultHyphenationImpl(word);
}

/**
 * Render a ReportV2 to PDF. Free tier: start at the level the page ESTIMATE
 * needs, then read the REAL page count back and step up until ≤ budget.
 */
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
