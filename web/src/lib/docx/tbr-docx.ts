// Trusted Business Report v3 — the DOCX surface (G27, investor-grade twin).
//
// Same 16 sections, same order as the web and the PDF
// (docs/design/tbr-v3-investor-report-spec.md § 2, wireframes W1–W7):
//
//   1 Dashboard · 2 Investment view · 3 Key points · 4 Valuation ·
//   5–12 the eight dimension chapters (identical § 3 anatomy) ·
//   13 Risk matrix · 14 90-day improvement plan · 15 Money on the table ·
//   16 Appendix (method · phase-gate matrix · score ledger · evidence
//   register · audit log · sources · data principle · disclaimer) ·
//   Evidence cited (footnotes, only when something is cited).
//
// Heading 1 = section, Heading 2 / 3 inside. Every table repeats its header
// row; callouts (verdict, takeaway, pending card, analyst synthesis) are
// single-cell shaded tables with a navy left rule; the four dashboard tiles
// are a 2×2 shaded table; the `dim_bars` chart and every chapter's primary
// visual go through the shared rasteriser (`report-visuals/png.ts`) and are
// embedded with `ImageRun` (SVG embed with a 1×1 PNG fallback when sharp is
// unavailable, so the file always opens).
//
// The view-models are the shared ones — `buildInvestmentView` (band A–D,
// conditions, reasons / risks, key points, risk matrix, plan, takeaways) and
// `buildDashboardView` (tiles, chart, footer) — read after
// `alignReportWithAssessmentCard`, so evidence confidence is the one number
// on every surface. Every v3 label comes from `lib/i18n/tbr-v3-strings.ts`
// (EN + VI); nothing v3 is hard-coded here.
//
// Free tier (`report.tier === "free"`): the `free-tier.ts` projection at
// `opts.level` plus the spec § 6 caps applied here — chapters 1–4 full, 5–8
// as compact cards, valuation range + method names / weights only, risk
// rows ≤ RISK_ROWS_FREE, plan steps ≤ PLAN_STEPS_FREE; the projection's
// `show.riskTable` / `show.appendixLedger` flags (level ≥ 3) drop the risk
// table (grid kept) and the ledger / register tables (counts kept).
//
// `svi-report-docx.ts` (AssembledReport → DOCX) stays for reports that
// have no ReportV2 at all (markdown-only fallback in /api/svi/docx).

import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { benchmarkLabel, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { hasCitationOrMarker, isMaterialClaim } from "@/lib/report-pipeline/claim-gate";
import { aud } from "@/lib/report-visuals";
import { visualToPng, type PngResult } from "@/lib/report-visuals/png";
import type { Band, DataState, VisualSpecV2 } from "@/lib/report-visuals/types";
import { projectForTier, type FreeTierProjection, type TrimLevel } from "@/lib/report-v2/free-tier";
import { isUnassessed, ledgerRowsFor, pendingLine } from "@/lib/report-v2/ledger-rows";
import { chapterCtaRows, evidenceRowsView, moneyEmptyState, planEvidenceRows, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import type { DimensionChapter, InvestmentView, ReportV2, RiskLevel } from "@/lib/report-v2/schema";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";
import { buildCitationIndex, citationEntries, createCitationIndex, parseCitations, stripCitationMarkers, type CitationIndex, type CitationSegment } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import { buildValuationView } from "@/lib/report-v2/valuation-view";
import { buildInvestmentView, chapterGaps, dimName, isAssessed, PLAN_STEPS_FREE, RISK_LEVELS_ASC, RISK_LEVELS_DESC, RISK_ROWS_FREE, riskGrid } from "@/lib/report-v2/investment-view";
import { buildDashboardView, type DashboardView } from "@/lib/report-v2/dashboard-view";
import { derivedLift } from "@/lib/svi-lift";
import { PDF_ENTITY_LINE, PDF_FINANCIAL_PROJECTION_DISCLAIMER, PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { defaultPreparedWith } from "@/lib/report-v2/prepared-with";
import { alignReportWithAssessmentCard, type AssessmentCardData, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { tbrDocxLocale, tbrDocxOutline, type TbrDocxLocale } from "./tbr-docx-outline";

export { tbrDocxOutline, TBR_DOCX_SECTION_IDS, type TbrDocxOutlineEntry } from "./tbr-docx-outline";

// ── Light palette (docs/design/unicorn-template.md · spec § 5) ─────────────

const INK = "1F2937";
const NAVY = "1B2A5E";
const CYAN = "0891B2";
const MUTED = "6B7280";
const FAINT = "9CA3AF";
const GRID = "E5E7EB";
const SUNKEN = "F7F8FA";
const FONT = "Calibri";
const MONO = "Consolas";

/** Usable width at A4 with 1-inch margins ≈ 6.27 in ≈ 602 px (docx uses px at 96 dpi). */
const CONTENT_PX = 600;
/** The same width in DXA (A4 11906 − 2 × 1440). */
const CONTENT_DXA = 9026;

// 1×1 transparent PNG — the mandatory fallback when an SVG is embedded directly.
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

function fmtDate(iso: string, locale: TbrDocxLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
}

// ── Paragraph helpers ───────────────────────────────────────────────────────

type Block = Paragraph | Table;

// G24-A: the document's footnote numbering, set once per `buildTbrDocx`
// right before the block list is assembled (that assembly is synchronous —
// no await between the assignment and the last `citedRuns` call).
let cites: CitationIndex = createCitationIndex([]);
let citeLocale: TbrDocxLocale = "en";
/** Numbered lists restart per instance; bumped for every numbered list emitted. */
let listInstance = 0;

const BULLETS = "tbr-bullets";
const NUMBERS = "tbr-numbers";

type RunOpts = { size?: number; color?: string; bold?: boolean; italics?: boolean; font?: string };

/**
 * Text runs for prose that may carry `[ev:<id>]` / `[unevidenced]` markers:
 * a footnote number as a superscript run (cyan), an admission as a muted
 * "(unverified)" run, an unknown id as nothing — the DOCX twin of
 * `<CitedText>`. Plain text yields one run. No raw marker ever survives.
 */
function citedRuns(text: string, opts: RunOpts = {}): TextRun[] {
  const base = { font: opts.font ?? FONT, size: opts.size ?? 20, color: opts.color ?? INK, bold: opts.bold, italics: opts.italics };
  const segs = parseCitations(text, cites);
  const cs = citationStrings(citeLocale);
  const out: TextRun[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg.kind === "text") {
      out.push(new TextRun({ ...base, text: seg.text }));
      continue;
    }
    if (seg.kind === "unevidenced") {
      out.push(new TextRun({ ...base, text: ` (${cs.unverified})`, color: MUTED, size: Math.max(12, (opts.size ?? 20) - 4), bold: false }));
      continue;
    }
    const group: Array<Extract<CitationSegment, { kind: "cite" }>> = [seg];
    while (i + 1 < segs.length && segs[i + 1]!.kind === "cite") group.push(segs[++i] as Extract<CitationSegment, { kind: "cite" }>);
    out.push(new TextRun({ ...base, text: group.map((c) => c.n).join(","), superScript: true, color: CYAN, bold: true }));
  }
  return out.length ? out : [new TextRun({ ...base, text: "" })];
}

function h1(text: string, no?: number | null): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    keepNext: true,
    children: [
      ...(typeof no === "number" ? [new TextRun({ text: `${no}  `, font: FONT, size: 18, color: FAINT })] : []),
      new TextRun({ text, font: FONT, size: 32, bold: true, color: NAVY }),
    ],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 }, keepNext: true, children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: INK })] });
}

function h3(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 140, after: 40 }, keepNext: true, children: [new TextRun({ text, font: FONT, size: 20, bold: true, color: INK })] });
}

function p(text: string, opts: RunOpts & { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: opts.after ?? 80, before: opts.before },
    alignment: opts.align,
    keepNext: opts.keepNext,
    children: citedRuns(text, opts),
  });
}

function small(text: string, color = MUTED): Paragraph {
  return p(text, { size: 16, color, after: 60 });
}

/** Uppercase label line (12 px, muted) above a block. */
function kicker(text: string, color = MUTED): Paragraph {
  return p(text.toUpperCase(), { size: 14, color, bold: true, after: 40, keepNext: true });
}

function bullet(text: string, opts: RunOpts = {}): Paragraph {
  return new Paragraph({ numbering: { reference: BULLETS, level: 0 }, spacing: { after: 40 }, children: citedRuns(text, { size: 18, ...opts }) });
}

function bulletList(items: string[], opts: RunOpts = {}): Paragraph[] {
  return items.map((it) => bullet(it, opts));
}

/** A numbered list that restarts at 1 (own numbering instance). */
function numberedList(items: string[], opts: RunOpts = {}): Paragraph[] {
  listInstance += 1;
  const instance = listInstance;
  return items.map((it) => new Paragraph({ numbering: { reference: NUMBERS, level: 0, instance }, spacing: { after: 40 }, children: citedRuns(it, { size: 18, ...opts }) }));
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: GRID };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const dxa = (pct: number): number => Math.round((CONTENT_DXA * pct) / 100);

interface TableOpts {
  /** Column widths in %, summing to 100. */
  widths?: number[];
  /** Right-aligned mono columns (indices). */
  numeric?: number[];
  /** Row indices (0 = first body row) rendered bold on a sunken fill (the valuation consensus row). */
  boldRows?: number[];
  /** Body font size (half-points). */
  size?: number;
}

/**
 * A data table: header row repeats on every page (`tableHeader`), sunken
 * header fill, zebra body rows, numeric columns right-aligned in mono,
 * dual DXA widths (table + every cell). Cells go through `citedRuns`, so a
 * footnote marker inside a cell renders as a superscript, never raw.
 */
function table(header: string[], rows: string[][], opts: TableOpts = {}): Table {
  const cols = header.length;
  const w = (opts.widths ?? header.map(() => 100 / cols)).map(dxa);
  const numeric = new Set(opts.numeric ?? []);
  const bold = new Set(opts.boldRows ?? []);
  const mk = (cells: string[], kind: "head" | "body", rowIndex: number) =>
    new TableRow({
      tableHeader: kind === "head",
      cantSplit: true,
      children: cells.map(
        (text, i) =>
          new TableCell({
            borders: cellBorders,
            width: { size: w[i]!, type: WidthType.DXA },
            shading: kind === "head" || bold.has(rowIndex) ? { type: ShadingType.CLEAR, fill: SUNKEN, color: "auto" } : rowIndex % 2 === 1 ? { type: ShadingType.CLEAR, fill: SUNKEN, color: "auto" } : undefined,
            margins: { top: 50, bottom: 50, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: numeric.has(i) && kind === "body" ? AlignmentType.RIGHT : undefined,
                children: citedRuns(text, {
                  size: kind === "head" ? 14 : (opts.size ?? 16),
                  bold: kind === "head" || bold.has(rowIndex),
                  color: kind === "head" ? MUTED : INK,
                  font: numeric.has(i) && kind === "body" ? MONO : FONT,
                }),
              }),
            ],
          }),
      ),
    });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: w,
    rows: [mk(header, "head", -1), ...rows.map((r, i) => mk(r, "body", i))],
  });
}

/**
 * A callout = one shaded cell with a 4 px left rule (spec § 5: takeaway =
 * navy, risk = bear, improve = warn, note = muted; body ink, never coloured
 * text). `paragraphs` are the cell's content.
 */
function callout(paragraphs: Paragraph[], rule: string = NAVY): Table {
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_DXA],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_DXA, type: WidthType.DXA },
            borders: { top: thinBorder, bottom: thinBorder, right: thinBorder, left: { style: BorderStyle.SINGLE, size: 24, color: rule } },
            shading: { type: ShadingType.CLEAR, fill: SUNKEN, color: "auto" },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: paragraphs.length ? paragraphs : [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
}

/** The running-footer note = the last sentence of the mandatory sub-line ("General information, not financial product advice."). */
const adviceNote = (t: TbrV3Strings): string => t.subline.trim().split(/(?<=\.)\s+/u).pop() ?? t.subline;

const spacer = (after = 100): Paragraph => new Paragraph({ spacing: { after }, children: [] });

const words = (s: string, n: number): string => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length <= n ? s.trim() : `${parts.slice(0, n).join(" ")}…`;
};

/** First sentence of a verdict, ≤ `max` words, markers kept (they render as footnotes). */
function oneLine(text: string, max: number): string {
  const first = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/u)[0] ?? "";
  // Never cut through a `[ev:…]` marker: count words on the marker-free text and re-attach the trailing markers.
  const clean = stripCitationMarkers(first);
  if (clean.split(/\s+/).filter(Boolean).length <= max) return first;
  const trailing = first.match(/(\s*\[(?:ev:[^\]]+|unevidenced|uncited)\])+\s*$/iu)?.[0] ?? "";
  return `${words(clean, max)}${trailing}`;
}

const normTitle = (s: string): string => stripCitationMarkers(s).trim().toLowerCase().replace(/[.;:,\s]+$/u, "");

// ── Visuals ─────────────────────────────────────────────────────────────────

export interface TbrDocxImages {
  /** Every visual id → rasterised result (png may be null → SVG embed). */
  byId: Map<string, PngResult>;
  pngCount: number;
  svgCount: number;
}

function allVisuals(report: ReportV2): VisualSpecV2[] {
  return [
    ...report.cover.visuals,
    ...report.executive.visuals,
    ...report.dimensions.flatMap((d) => [d.primaryVisual, ...d.secondaryVisuals]),
    ...report.valuation.visuals,
    ...report.phaseGates.visuals,
    ...report.moneyOnTable.visuals,
    ...report.actionPlan.visuals,
  ];
}

/**
 * Rasterise every visual of the (projected) report once, through the shared
 * cache. `extra` = specs built at render time (the dashboard `dim_bars`
 * chart) that are not stored on the document.
 */
export async function rasteriseReportVisuals(report: ReportV2, widthPx = CONTENT_PX * 2, extra: VisualSpecV2[] = []): Promise<TbrDocxImages> {
  const byId = new Map<string, PngResult>();
  let pngCount = 0;
  let svgCount = 0;
  const specs = [...allVisuals(report), ...extra];
  // Bounded parallelism keeps a 30-visual report off the event loop's back.
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const spec = specs[next++]!;
      if (byId.has(spec.id)) continue;
      const r = await visualToPng(spec, { width: widthPx });
      byId.set(spec.id, r);
      if (r.png) pngCount += 1;
      else svgCount += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, specs.length)) }, worker));
  return { byId, pngCount, svgCount };
}

function figure(spec: VisualSpecV2, images: TbrDocxImages, widthPx: number, caption: string | null): Block[] {
  const img = images.byId.get(spec.id);
  if (!img) return [small(`[${spec.title}]`)];
  const width = Math.min(widthPx, CONTENT_PX);
  const height = Math.max(24, Math.round((width * img.height) / img.width));
  const run = img.png
    ? new ImageRun({ type: "png", data: img.png, transformation: { width, height }, altText: { title: spec.a11y.title, description: spec.a11y.description, name: spec.id } })
    : new ImageRun({
        type: "svg",
        data: Buffer.from(img.svg, "utf8"),
        transformation: { width, height },
        fallback: { type: "png", data: BLANK_PNG },
        altText: { title: spec.a11y.title, description: spec.a11y.description, name: spec.id },
      });
  const out: Block[] = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, keepNext: caption !== null, children: [run] })];
  if (caption !== null) out.push(p(caption, { size: 15, color: MUTED, align: AlignmentType.CENTER, after: 120 }));
  return out;
}

// ── Context ─────────────────────────────────────────────────────────────────

interface Ctx {
  report: ReportV2;
  /** The free-tier projection of `report` (identity on paid tiers). */
  r: ReportV2;
  projection: FreeTierProjection;
  card: AssessmentCardData;
  view: InvestmentView;
  dash: DashboardView;
  images: TbrDocxImages;
  locale: TbrDocxLocale;
  t: TbrV3Strings;
  prepared: string;
  free: boolean;
}

const stateLabel = (ctx: Ctx, d: DataState): string => getTbrStrings(ctx.locale).v2.state[d];
const bandWord = (ctx: Ctx, b: Band): string => getTbrStrings(ctx.locale).v2.band[b];
const phaseLabel = (ctx: Ctx, id: DimensionChapter["phaseLens"]["phaseId"]): string => GROWTH_PHASE_LABELS[id]?.[ctx.locale] ?? id;

/** G19-S43 — a CTA row as document text: "<label> · <path> · +N SVI". */
function ctaText(row: EvidenceRowView): string {
  if (!row.cta) return row.label;
  return `${row.cta.label} · ${row.cta.href}${row.cta.liftLabel ? ` · ${row.cta.liftLabel}` : ""}`;
}

// ── 1 Dashboard ─────────────────────────────────────────────────────────────

function tileCell(tile: DashboardView["tiles"][number]): TableCell {
  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: tile.label.toUpperCase(), font: FONT, size: 14, bold: true, color: MUTED })] }),
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: tile.value, font: MONO, size: 40, bold: true, color: NAVY })] }),
    new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: tile.sub, font: FONT, size: 17, color: INK })] }),
  ];
  if (tile.note) children.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: tile.note, font: FONT, size: 15, color: MUTED })] }));
  return new TableCell({
    width: { size: CONTENT_DXA / 2, type: WidthType.DXA },
    borders: cellBorders,
    shading: { type: ShadingType.CLEAR, fill: SUNKEN, color: "auto" },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    children,
  });
}

/** The four stat tiles as a 2×2 shaded table (SVI · Evidence / Verdict · Valuation). */
function tiles(ctx: Ctx): Table {
  const [a, b, c, d] = ctx.dash.tiles;
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_DXA / 2, CONTENT_DXA / 2],
    rows: [
      new TableRow({ cantSplit: true, children: [tileCell(a), tileCell(b)] }),
      new TableRow({ cantSplit: true, children: [tileCell(c), tileCell(d)] }),
    ],
  });
}

function dashboard(ctx: Ctx): Block[] {
  const { r, card, dash, t, locale } = ctx;
  const c = r.cover;
  const phase = GROWTH_PHASE_LABELS[c.phaseId][locale];
  const sourceNote = r.source === "pipeline" ? "" : r.source === "fixture" ? " · demo" : " · snapshot";
  const out: Block[] = [
    h1(t.sec.dashboard, 1),
    kicker("Startup Value Index · Trusted Business Report", CYAN),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: c.startupName, font: FONT, size: 44, bold: true, color: INK })] }),
    p(`${card.verification.label} · ${c.stageLabel} · ${c.sector} · ${phase}`, { size: 18, after: 20 }),
    small(`${fmtDate(r.generatedAt, locale)} · ${dash.footer.methodology}${sourceNote}`),
    small(t.purpose.dashboard),
    spacer(60),
    tiles(ctx),
    spacer(120),
    kicker(dash.chart.title),
    ...figure(dash.chart, ctx.images, CONTENT_PX, dash.chartCaption),
    small(dash.legend.join(" · ")),
  ];
  const footer = [
    dash.footer.topStrength ? `${t.topStrength}: ${dash.footer.topStrength}` : null,
    dash.footer.topGap ? `${t.topGap}: ${dash.footer.topGap}` : null,
    dash.footer.unverified,
    dash.footer.lastUpdated,
    dash.footer.methodology,
  ].filter((x): x is string => x !== null);
  out.push(spacer(60), p(footer.join("  ·  "), { size: 16, before: 60 }), small(ctx.view.subline, FAINT));
  return out;
}

// ── 2 Investment view ───────────────────────────────────────────────────────

function investmentView(ctx: Ctx): Block[] {
  const { r, view, t, locale } = ctx;
  const x = ensureExecutiveStructured(r).executive.structured!;
  const s47 = getTbrStrings(locale).v2.s47;
  const out: Block[] = [pageBreak(), h1(t.sec.investmentView, 2), small(t.purpose.investmentView)];
  out.push(
    callout([
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${view.band} · `, font: MONO, size: 36, bold: true, color: NAVY }),
          new TextRun({ text: view.bandLabel.toUpperCase(), font: FONT, size: 26, bold: true, color: INK }),
        ],
      }),
      p(view.bandWording, { size: 20, bold: true, after: 40 }),
      p(view.convictionLine, { size: 17, color: MUTED, after: 60 }),
      p(view.subline, { size: 16, italics: true, color: INK, after: 0 }),
    ]),
    spacer(120),
  );
  for (const para of x.summary) out.push(...proseParagraphs(para).map((s) => p(s, { after: 100 })));
  // Conditions (B / C), the evidence CTAs (D), or "no conditions" (A).
  if (view.band === "D") {
    out.push(h2(t.evidenceCtas));
    out.push(...(view.evidenceCtas.length ? bulletList(view.evidenceCtas.map((c) => `${c.label} · ${c.href}${typeof c.lift === "number" ? ` · ${t.lift(c.lift)}` : ""}`)) : [small(t.noConditions)]));
  } else {
    out.push(h2(t.conditions));
    out.push(...(view.conditions.length ? numberedList(view.conditions.map((c) => c.text)) : [p(t.noConditions, { size: 18 })]));
  }
  // Why back / what weighs against (3 + 3).
  const pointLine = (pt: InvestmentView["reasons"][number]) => `${pt.text}${pt.dim ? `  (${dimName(pt.dim, locale)}${typeof pt.score === "number" ? ` · ${pt.score}/100` : ""})` : ""}${typeof pt.lift === "number" ? `  ${t.lift(pt.lift)}` : ""}`;
  if (view.reasons.length) out.push(h2(t.whyBack), ...numberedList(view.reasons.map(pointLine)));
  if (view.risks.length) out.push(h2(t.whatWeighsAgainst), ...numberedList(view.risks.map(pointLine)));
  // Where you are.
  const phase = GROWTH_PHASE_LABELS[x.phaseNow.phaseId]?.[locale] ?? x.phaseNow.label;
  out.push(h2(`${t.whereYouAre} · ${phase}`));
  out.push(p(`${t.blocker}: ${x.phaseNow.blocker}`, { size: 18 }));
  out.push(p(`${t.whatItTakes}: ${x.phaseNow.whatItTakes}`, { size: 18 }));
  // Analyst synthesis — only when the CEO agent's label disagrees with the rubric band.
  if (view.analystSynthesis) {
    out.push(spacer(60), callout([p(`${t.analystSynthesis} · ${s47.verdictLabel[view.analystSynthesis.label]}: ${view.analystSynthesis.text}`, { size: 17, italics: true, after: 0 })], MUTED));
  }
  return out;
}

// ── 3 Key points ────────────────────────────────────────────────────────────

function keyPoints(ctx: Ctx): Block[] {
  const { view, t } = ctx;
  return [pageBreak(), h1(t.sec.keyPoints, 3), small(t.purpose.keyPoints), ...bulletList(view.keyPoints, { size: 19 })];
}

// ── 4 Valuation ─────────────────────────────────────────────────────────────

function valuation(ctx: Ctx): Block[] {
  const { r, view, t, locale, free } = ctx;
  const v = r.valuation;
  const vv = buildValuationView(v, locale);
  const vs = vv.strings;
  const out: Block[] = [h1(t.sec.valuation, 4)];
  if (r.cover.svi.band === "pending") {
    out.push(p(vs.pending));
    return out;
  }
  out.push(small(`CFO · ${vs.confidence(vv.confidencePct)}`));
  // Range line: low · mid · high (+ ask).
  const range = [`${t.rangeLow} ${aud(v.consensus.lowAud)}`, `${t.rangeMid} ${aud(v.consensus.midAud)}`, `${t.rangeHigh} ${aud(v.consensus.highAud)}`];
  if (v.ask) range.push(`${t.rangeAsk} ${aud(v.ask.preMoneyAud)} (${t.askChip[v.ask.verdict]})`);
  out.push(kicker(t.rangeTitle), p(range.join("  ·  "), { size: 22, bold: true, font: MONO, after: 100 }));
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  if (rangeBars) out.push(...figure(rangeBars, ctx.images, CONTENT_PX, `${rangeBars.title} · ${stateLabel(ctx, rangeBars.dataState)}`));
  // Methods table — every method with its applicable flag; a bold consensus row closes it.
  out.push(h2(vs.methodsTitle));
  const rows = v.methods.map((m) => {
    const applicable = m.applicable;
    return [
      vs.method[m.method] ?? m.method,
      applicable ? t.yes : t.no,
      applicable ? `${Math.round(m.weight * 100)} %` : "0",
      // Spec § 5: rationale only (the S42 derivation formula strings carry sector medians without an n, so they stay off this surface).
      ...(free ? [] : [applicable ? aud(m.lowAud) : "—", applicable ? aud(m.midAud) : "—", applicable ? aud(m.highAud) : "—", m.rationale]),
    ];
  });
  const consensus = free ? [t.consensusRow, "", `${vv.methodRows.reduce((acc, m) => acc + m.weightPct, 0)} %`] : [t.consensusRow, "", "100 %", aud(v.consensus.lowAud), aud(v.consensus.midAud), aud(v.consensus.highAud), ""];
  rows.push(consensus);
  out.push(
    free
      ? table([vs.thMethod, t.thApplicable, vs.thWeight], rows, { widths: [60, 20, 20], numeric: [2], boldRows: [rows.length - 1] })
      : table([vs.thMethod, t.thApplicable, vs.thWeight, vs.low, vs.consensus, vs.high, vs.thRationale], rows, { widths: [18, 8, 8, 11, 11, 11, 33], numeric: [2, 3, 4, 5], boldRows: [rows.length - 1], size: 15 }),
  );
  if (vv.needRevenueLine) out.push(small(vv.needRevenueLine));
  if (free) return out;
  // What moves it.
  if (view.whatMovesIt.length) out.push(h2(t.whatMovesIt), ...bulletList(view.whatMovesIt));
  // Inputs, unit economics, cross-checks (with n + as-of), consistency notes, narrative.
  if (vv.inputRows.length) {
    out.push(h2(vs.inputsTitle));
    out.push(table([vs.thInput, vs.thValue, vs.thSource], vv.inputRows.map((row) => [row.label, row.value, vs.source[row.source]]), { widths: [30, 50, 20] }));
  }
  if (vv.unitEconomics.length) out.push(h2(vs.unitEconomicsTitle), small(vv.unitEconomics.map((row) => `${row.label} ${row.value}`).join(" · "), INK));
  out.push(small(`${vs.scenarios}: ${vv.scenarioLine}`));
  if (vv.askLine) out.push(small(vv.askLine, INK));
  out.push(small(`${vv.sectorMultiplesTitle}: ${vv.sectorMultiplesLine}`), small(vv.comparablesLine));
  if (vv.crossChecks.length) {
    out.push(h2(vs.crossChecksTitle));
    out.push(table([vs.thMethod, vs.thValue, "n", vs.thSource], vv.crossChecks.map((cc) => [cc.label, cc.range, cc.n !== null ? vs.nLabel(cc.n) : "—", `${cc.source} · ${vs.asOf(cc.asOf)}`]), { widths: [30, 24, 14, 32] }));
  }
  if (vv.consistency.length) out.push(h2(vs.consistencyTitle), ...vv.consistency.map((n) => small(n, INK)));
  if (v.narrative) out.push(...proseParagraphs(v.narrative).map((para) => p(para)));
  for (const x of v.visuals.filter((s) => s !== rangeBars)) out.push(...figure(x, ctx.images, 420, `${x.title} · ${stateLabel(ctx, x.dataState)}`));
  out.push(auditLine(ctx, "cfo", v.audit.grounded, v.audit.uncited, v.audit.revised));
  return out;
}

// ── 5–12 Dimension chapters (spec § 3 anatomy) ──────────────────────────────

function auditLine(ctx: Ctx, owner: string, grounded: boolean, uncited: number, revised: boolean, frameworks?: string[]): Paragraph {
  const a = getTbrStrings(ctx.locale).v2.audit;
  return small(
    `${owner.toUpperCase()} · ${grounded ? a.grounded : a.notAudited}${uncited > 0 ? ` · ${a.uncited(uncited)}` : ""}${revised ? ` · ${a.revised}` : ""} · llm-auditor${frameworks && frameworks.length ? ` · ${a.frameworks}: ${frameworks.slice(0, 4).join("; ")}` : ""}`,
    FAINT,
  );
}

/** Benchmark line via publication-rules: n ≥ 10 → median + band + percentile; n < 10 → "not enough…"; absent → "no published cohort". */
function benchmarkLine(ctx: Ctx, ch: DimensionChapter): string {
  const { t } = ctx;
  const n = ch.benchmark.n;
  if (typeof n !== "number") return t.benchNone;
  if (!mayShowPercentile(n)) return t.benchNotEnough(n);
  const label = benchmarkLabel(n).replace(/ \(n = \d+\)$/, "");
  const base = t.benchLine(ch.benchmark.p50, n, label, ch.benchmark.p25, ch.benchmark.p75);
  return ch.benchmark.percentile === null ? base : `${base} · ${t.benchPercentile(ch.benchmark.percentile)}`;
}

function floorLine(ctx: Ctx, ch: DimensionChapter): string {
  const phase = phaseLabel(ctx, ch.phaseLens.phaseId);
  return typeof ch.phaseLens.floor === "number" ? ctx.t.floorChip(phase, ch.phaseLens.floor, ch.phaseLens.floorMet !== false) : ctx.t.noFloor(phase);
}

function chapterHeader(ctx: Ctx, ch: DimensionChapter, index: number, pending: boolean): Block[] {
  const { t } = ctx;
  return [
    kicker(t.dimKicker(index + 1, ch.weight)),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: pending ? "—" : String(ch.score), font: MONO, size: 48, bold: true, color: NAVY }),
        new TextRun({ text: " / 100", font: MONO, size: 22, color: MUTED }),
        new TextRun({ text: `    ● ${bandWord(ctx, pending ? "pending" : ch.band)}`, font: FONT, size: 20, bold: true, color: INK }),
      ],
    }),
    small(`${benchmarkLine(ctx, ch)} · ${floorLine(ctx, ch)}${ch.degraded ? ` · ${ch.degradeReason ?? "deterministic card"}` : ""}`),
  ];
}

function takeaway(ctx: Ctx, ch: DimensionChapter): Block[] {
  return [spacer(60), callout([kicker(ctx.t.takeawayTitle, NAVY), p(ctx.view.takeaways[ch.dim], { size: 19, after: 0 })]), spacer(60)];
}

/** The one pending card: `t.pendingCard` + CTA rows, then the pending takeaway. */
function pendingChapter(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t, locale } = ctx;
  const ctas = chapterCtaRows(ch, locale);
  const lines: Paragraph[] = [p(t.pendingCard, { size: 18, after: ctas.length ? 60 : 0 })];
  if (ctas.length) {
    lines.push(p(t.pendingAdd, { size: 16, bold: true, after: 20 }));
    for (const row of ctas) lines.push(p(`▸ ${ctaText(row)}`, { size: 16, after: 20 }));
  }
  return [callout(lines, MUTED), ...takeaway(ctx, ch)];
}

/** Free tier 5–8: score · band · verdict · takeaway, then the unlock line. */
function compactChapter(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t } = ctx;
  return [...proseParagraphs(ch.verdict).map((para) => p(para)), ...takeaway(ctx, ch), small(t.lockedCard, CYAN)];
}

/** Evidence used ≤ 5 rows: label · confidence rung · status · footnote no.; ids never printed. */
function evidenceUsed(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t, locale } = ctx;
  const cs = citationStrings(locale);
  const s43 = getTbrS43Strings(locale);
  const real = ch.evidence.filter((e) => e.status !== "missing");
  if (!real.length) return [];
  const rows = real.slice(0, 5).map((e) => [e.label, e.confidence ? s43.evidenceLevel[e.confidence] : cs.levelUnrated, cs.status({ status: e.status }), cites.peek(e.evidence_id) ? String(cites.peek(e.evidence_id)!.n) : "—"]);
  const out: Block[] = [h3(t.evidenceUsed), table([cs.th.label, cs.th.level, cs.th.source, cs.th.n], rows, { widths: [50, 22, 16, 12], numeric: [3] })];
  if (real.length > 5) out.push(small(t.moreInRegister(real.length - 5)));
  return out;
}

/** Strengths ≤ 3 (chapter + criteria, de-duplicated); risks / gaps ≤ 3 via `chapterGaps` with the unverified chip. */
function strengthsAndGaps(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t } = ctx;
  const seen = new Set<string>();
  const strengths: string[] = [];
  for (const s of [...ch.strengths, ...ch.criteria.flatMap((c) => c.strengths)]) {
    const key = normTitle(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    strengths.push(s);
    if (strengths.length >= 3) break;
  }
  const ids = ch.evidence.map((e) => e.evidence_id);
  const gaps = chapterGaps(ch)
    .slice(0, 3)
    .map((g) => (isMaterialClaim(g) && !hasCitationOrMarker(g, ids) ? `${g} (${t.unverified})` : g));
  const out: Block[] = [];
  if (strengths.length) out.push(h3(t.strengths), ...bulletList(strengths));
  if (gaps.length) out.push(h3(t.risksGaps), ...bulletList(gaps));
  return out;
}

/** What to improve ≤ 3 rows: nextAction → criteria nextAction → evidence CTAs, de-duplicated by title. */
function whatToImprove(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t, locale } = ctx;
  const s43 = getTbrS43Strings(locale);
  type Row = { action: string; lift: string; window: string; evidence: string };
  const rows: Row[] = [];
  const seen = new Set<string>();
  const push = (row: Row) => {
    const key = normTitle(row.action);
    if (!key || seen.has(key) || rows.length >= 3) return;
    seen.add(key);
    rows.push(row);
  };
  push({ action: ch.nextAction.title, lift: t.lift(ch.nextAction.expectedLift), window: t.window[ch.nextAction.window], evidence: ch.nextAction.evidenceToAdd ? (s43.source[ch.nextAction.evidenceToAdd] ?? ch.nextAction.evidenceToAdd) : "—" });
  for (const c of ch.criteria) if (c.nextAction.trim()) push({ action: c.nextAction, lift: t.lift(derivedLift(ch.weight, c.score)), window: t.window["30d"], evidence: "—" });
  for (const row of chapterCtaRows(ch, locale)) push({ action: row.cta!.label, lift: row.cta!.liftLabel || "—", window: t.window.this_week, evidence: row.source });
  if (!rows.length) return [];
  return [h3(t.whatToImprove), table([t.thAction, t.thLift, t.thWindow, t.thEvidence], rows.map((r) => [r.action, r.lift, r.window, r.evidence]), { widths: [50, 12, 16, 22], numeric: [1] })];
}

function criteriaTable(ctx: Ctx, ch: DimensionChapter): Block[] {
  const { t, locale } = ctx;
  if (!ch.criteria.length) return [];
  const quality = getTbrStrings(locale).v2.s47.quality;
  const out: Block[] = [
    h3(t.criteria),
    table([t.thCriterion, t.thScore, t.thQuality, t.thVerdict], ch.criteria.map((c) => [c.title, String(c.score), quality[c.quality] ?? c.quality, oneLine(c.verdict, 20)]), { widths: [26, 10, 14, 50], numeric: [1] }),
  ];
  if (ctx.free) out.push(small(t.fullCardsPaid));
  return out;
}

function chapter(ctx: Ctx, ch: DimensionChapter, index: number): Block[] {
  const { locale, free } = ctx;
  const title = locale === "vi" ? ch.titleVi : ch.title;
  const pending = !isAssessed(ch) || ch.band === "pending";
  const out: Block[] = [pageBreak(), h1(title, 5 + index), ...chapterHeader(ctx, ch, index, pending)];
  if (pending) {
    out.push(...pendingChapter(ctx, ch));
    out.push(auditLine(ctx, ch.ownerAgent, ch.audit.grounded, ch.audit.uncited, ch.audit.revised, ch.frameworks));
    return out;
  }
  if (free && ch.renderAs === "card") {
    out.push(...compactChapter(ctx, ch));
    out.push(auditLine(ctx, ch.ownerAgent, ch.audit.grounded, ch.audit.uncited, ch.audit.revised));
    return out;
  }
  // 2 Verdict
  out.push(h3(ctx.t.verdict), ...proseParagraphs(ch.verdict).map((para) => p(para)));
  // 3 Evidence used
  out.push(...evidenceUsed(ctx, ch));
  // 4 Strengths · 5 Risks / gaps
  out.push(...strengthsAndGaps(ctx, ch));
  // 6 Criteria
  out.push(...criteriaTable(ctx, ch));
  // 7 What to improve
  out.push(...whatToImprove(ctx, ch));
  // 8 Investor takeaway
  out.push(...takeaway(ctx, ch));
  // Primary visual kept (the ledger moves to the appendix).
  out.push(...figure(ch.primaryVisual, ctx.images, CONTENT_PX, `${ch.primaryVisual.title} · ${stateLabel(ctx, ch.primaryVisual.dataState)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`));
  for (const v of ch.secondaryVisuals) out.push(...figure(v, ctx.images, 360, `${v.title} · ${stateLabel(ctx, v.dataState)}`));
  if (ctx.projection.show.phaseLens && ch.phaseLens.whatMattersNow) out.push(small(`${phaseLabel(ctx, ch.phaseLens.phaseId)}: ${ch.phaseLens.whatMattersNow}`));
  // 10 Audit line
  out.push(auditLine(ctx, ch.ownerAgent, ch.audit.grounded, ch.audit.uncited, ch.audit.revised, ch.frameworks));
  return out;
}

// ── 13 Risk matrix ──────────────────────────────────────────────────────────

function riskMatrix(ctx: Ctx): Block[] {
  const { view, t, locale, free } = ctx;
  const rows = view.riskMatrix.slice(0, free ? RISK_ROWS_FREE : view.riskMatrix.length);
  const out: Block[] = [pageBreak(), h1(t.sec.riskMatrix, 13), small(t.purpose.riskMatrix)];
  if (!rows.length) return [...out, p(t.noRisks, { size: 18 })];
  const grid = riskGrid(rows);
  const lv = (l: RiskLevel) => t.level[l];
  out.push(
    kicker(t.riskGridCaption),
    table(
      [`${t.likelihood} \\ ${t.impact}`, ...RISK_LEVELS_ASC.map(lv)],
      RISK_LEVELS_DESC.map((like) => [lv(like), ...RISK_LEVELS_ASC.map((imp) => String(grid[like][imp]))]),
      { widths: [40, 20, 20, 20], numeric: [1, 2, 3] },
    ),
  );
  // Free tier level ≥ 3 keeps the grid and drops the table (`free-tier.ts` `show.riskTable`).
  if (ctx.projection.show.riskTable) {
    out.push(
      spacer(120),
      table(
        [t.thRisk, t.likelihood, t.impact, t.thMitigation],
        rows.map((row) => [`${row.text}${row.dim ? ` (${dimName(row.dim, locale)})` : ""}`, lv(row.likelihood), lv(row.impact), row.mitigation]),
        { widths: [44, 12, 12, 32] },
      ),
    );
  }
  return out;
}

// ── 14 90-day improvement plan ──────────────────────────────────────────────

function improvementPlan(ctx: Ctx): Block[] {
  const { r, view, t, locale, free } = ctx;
  const steps = view.improvementPlan.slice(0, free ? PLAN_STEPS_FREE : view.improvementPlan.length);
  const out: Block[] = [h1(t.sec.improvementPlan, 14), small(t.purpose.improvementPlan)];
  if (!steps.length) return [...out, p(t.planEmpty, { size: 18 })];
  out.push(
    table(
      ["#", t.thAction, t.thLift, t.thWindow, t.thDim, t.thEvidence],
      steps.map((s) => [String(s.rank), s.title, t.lift(s.expectedLift), t.window[s.window], dimName(s.dim, locale), s.evidenceToAdd ?? "—"]),
      { widths: [5, 41, 10, 12, 16, 16], numeric: [0, 2] },
    ),
    small(t.planNote),
  );
  // G19-S43: the engine's P0 / P1 evidence gaps as CTA lines (kept from the v2 plan).
  const planEvidence = planEvidenceRows(r, locale);
  if (planEvidence.rows.length) out.push(kicker(planEvidence.title), ...planEvidence.rows.map((row) => small(`▸ ${ctaText(row)}`, INK)));
  return out;
}

// ── 15 Money on the table ───────────────────────────────────────────────────

function money(ctx: Ctx): Block[] {
  const { r, t, locale, projection } = ctx;
  const m = r.moneyOnTable;
  const s = getTbrStrings(locale).v2;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((pr) => ({ ...pr, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, projection.moneyLimit);
  const out: Block[] = [pageBreak(), h1(t.sec.money, 15), small(`CFO + CMO · ${m.grants.length + m.programs.length} · ${aud(m.totalAud)}`)];
  // G19-S43: the empty state points at the grant profile (never "re-run").
  const empty = moneyEmptyState(r, locale);
  if (rows.length) out.push(table([s.s47.th.label, s.s47.th.source, "A$", s.s47.th.status, "%"], rows.map((row) => [row.name, row.kind, row.amountAud === null ? "—" : aud(row.amountAud), row.deadline ?? "—", `${Math.round(row.fit)}%`]), { widths: [44, 12, 14, 18, 12], numeric: [2, 4] }));
  else if (empty) out.push(small(`${empty.text} ${empty.ctaLabel} ${empty.href}`));
  for (const v of m.visuals) out.push(...figure(v, ctx.images, CONTENT_PX, `${v.title} · ${stateLabel(ctx, v.dataState)}`));
  return out;
}

// ── 16 Appendix ─────────────────────────────────────────────────────────────

/** Phase-gate matrix: the current phase's required criteria + the per-dimension floors row. */
function phaseGateMatrix(ctx: Ctx): Block[] {
  const { r, t, locale } = ctx;
  const g = r.phaseGates;
  const s = getTbrStrings(locale).v2;
  const quality = s.s47.quality;
  const currentRows = g.matrix.filter((m) => m.phase === g.current && m.required);
  const out: Block[] = [h2(t.phaseGateMatrix), small(`${phaseLabel(ctx, g.current)}`, INK)];
  out.push(currentRows.length ? table([t.thCriterion, t.thQuality, "✓"], currentRows.map((m) => [m.criterion.replace(/_/g, " "), quality[m.quality] ?? m.quality, m.met ? t.yes : t.no]), { widths: [60, 24, 16] }) : small(s.executive.noBlockers));
  const floors = r.dimensions.filter((ch) => typeof ch.phaseLens.floor === "number");
  if (floors.length) {
    out.push(spacer(80));
    out.push(table([t.thDim, phaseLabel(ctx, g.current), t.thScore, "✓"], floors.map((ch) => [dimName(ch.dim, locale), String(ch.phaseLens.floor), isAssessed(ch) ? String(ch.score) : "—", ch.phaseLens.floorMet === false ? t.no : t.yes]), { widths: [46, 18, 18, 18], numeric: [1, 2] }));
  }
  for (const b of g.blockers.slice(0, 6)) out.push(small(`▲ ${b.detail}`));
  return out;
}

/** Score ledger tables per chapter (existing ledger rows) — spec § 3 item 9 moved here. */
function scoreLedgers(ctx: Ctx): Block[] {
  const { r, t, locale } = ctx;
  const strings = getTbrStrings(locale).ledger;
  const level = r.cover.verification?.level ?? null;
  const out: Block[] = [h2(t.scoreLedger)];
  for (const ch of r.dimensions) {
    if (!ch.scoreBreakdown) continue;
    out.push(h3(locale === "vi" ? ch.titleVi : ch.title));
    if (isUnassessed(ch)) {
      out.push(small(pendingLine(ch, locale).text, INK));
    } else {
      const rows = ledgerRowsFor(ch, locale, level);
      out.push(table([strings.thSignal, strings.thPoints, strings.thSource], rows.map((row) => [`${row.label}${row.adjustmentScale ? ` (${strings.adjustmentScale})` : ""}`, row.points, row.source]), { widths: [64, 12, 24], numeric: [1] }));
    }
    if (ch.scoreNote) out.push(small(`${strings.scoreNote}: ${ch.scoreNote}`));
  }
  return out;
}

function appendix(ctx: Ctx): Block[] {
  const { r, t, locale, free, projection, prepared } = ctx;
  const a = r.appendix;
  const s = getTbrStrings(locale).v2;
  const grounded = a.auditLog.filter((l) => l.grounded).length;
  const out: Block[] = [pageBreak(), h1(t.sec.appendix, 16), h2(s.appendix.method), small(a.method, INK), ...phaseGateMatrix(ctx)];
  // Free tier level ≥ 3: counts only (`free-tier.ts` `show.appendixLedger`) — the ledger tables + the register are in the paid view.
  if (!projection.show.appendixLedger) {
    out.push(h2(s.appendix.evidenceRegister), small(t.countsOnly(ctx.report.appendix.evidenceRegister.length, ctx.report.appendix.auditLog.length), INK));
  } else {
    out.push(...scoreLedgers(ctx));
    out.push(h2(s.appendix.evidenceRegister));
    // G19-S43: missing inputs are CTA rows (label · path · +N SVI). Ids are printed here, and only here.
    const register = evidenceRowsView(a.evidenceRegister, locale);
    out.push(register.length ? table([s.s47.th.id, s.s47.th.label, s.s47.th.source, s.s47.th.status, s.s47.th.dims], register.map((e) => [e.evidence_id, e.cta ? ctaText(e) : e.label, e.source, e.statusLabel, e.dims.join(" ")]), { widths: [16, 42, 14, 14, 14], size: 14 }) : small(s.appendix.noEvidence));
    out.push(h2(s.appendix.auditorLog), small(`${a.auditLog.length} · ${grounded} ${s.appendix.grounded} · ${a.auditLog.filter((l) => l.revised).length} ${s.appendix.revised} · ${s.appendix.quality(Math.round(r.quality.score), Math.round(r.quality.groundedShare * 100))}`, INK));
    if (r.quality.degradedSections.length) out.push(small(s.appendix.degraded(r.quality.degradedSections.join(", "))));
  }
  out.push(h2(s.appendix.sources), small(`${s.appendix.comparables(a.comparablesN, a.comparablesWithMultiplesN)}${a.sourcesDated.length ? " " + a.sourcesDated.map((x) => `${x.label} (${x.date})`).join(" · ") : ""}`, INK));
  if (free) out.push(small(`Free tier (${r.pageBudget.free}-page budget) omits: ${projection.dropped.join(", ")}.`));
  out.push(h2(s.appendix.dataPrinciple), small(a.dataPrinciple, INK));
  out.push(small(prepared, FAINT), small(a.disclaimer), small(`${PDF_FINANCIAL_PROJECTION_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`), small(PDF_ENTITY_LINE, FAINT));
  return out;
}

/** G24-A: "Evidence cited" — the footnote list (n · label · level · source · date); empty when nothing is cited. */
function evidenceCited(ctx: Ctx): Block[] {
  const rows = citationEntries(cites);
  if (rows.length === 0) return [];
  const cs = citationStrings(ctx.locale);
  return [
    pageBreak(),
    h1(cs.appendixTitle, null),
    small(cs.appendixPurpose),
    table([cs.th.n, cs.th.label, cs.th.level, cs.th.source, cs.th.date], rows.map((e) => [String(e.n), `${e.label}  ${e.id}`, cs.level(e), cs.source(e), cs.date(e)]), { widths: [6, 46, 18, 18, 12], numeric: [0], size: 14 }),
  ];
}

// ── Document ────────────────────────────────────────────────────────────────

export interface TbrDocxOptions {
  preparedWith?: string | null;
  locale?: "en" | "vi";
  /** Free-tier trim level (mirrors the PDF's; DOCX has no page gate so 0 is the default). */
  level?: TrimLevel;
  /** Pre-rasterised images (tests / a caller that already built them for the email). */
  images?: TbrDocxImages;
  /** Assessment Card context from `loadAssessmentContext` (review P1: one number on every surface). */
  assessment?: AssessmentCardOptions;
}

export interface TbrDocxResult {
  buffer: Buffer;
  /** How the visuals were embedded. */
  images: { png: number; svg: number };
  sections: number;
  /** The section ids / titles in order (same ids as the web TOC and the PDF outline). */
  outline: ReturnType<typeof tbrDocxOutline>;
}

/** Build the DOCX; `generateTbrDocx` is the Buffer-only convenience the route uses. */
export async function buildTbrDocx(rawReport: ReportV2, opts: TbrDocxOptions = {}): Promise<TbrDocxResult> {
  // One evidence-confidence number across the card, the investment view and the dashboard (review P1).
  const aligned = alignReportWithAssessmentCard(rawReport, opts.assessment ?? {});
  const report = aligned.report;
  // G19-S45: the fixed-layout twins carry EN / VI strings; ES / JA documents render with the English labels.
  const locale = tbrDocxLocale(opts.locale ?? report.locale);
  const view = buildInvestmentView(report, aligned.card, locale);
  const dash = buildDashboardView(report, aligned.card, view, locale);
  const projection = projectForTier(report, opts.level ?? 0);
  const r = projection.report;
  // The dashboard chart is built at render time, so a caller's pre-rasterised set may lack it.
  let images = opts.images ?? (await rasteriseReportVisuals(r, undefined, [dash.chart]));
  if (!images.byId.has(dash.chart.id)) {
    const chart = await rasteriseReportVisuals({ ...r, cover: { ...r.cover, visuals: [] }, executive: { ...r.executive, visuals: [] }, dimensions: [], valuation: { ...r.valuation, visuals: [] }, phaseGates: { ...r.phaseGates, visuals: [] }, moneyOnTable: { ...r.moneyOnTable, visuals: [] }, actionPlan: { ...r.actionPlan, visuals: [] } }, undefined, [dash.chart]);
    images = { byId: new Map([...images.byId, ...chart.byId]), pngCount: images.pngCount + chart.pngCount, svgCount: images.svgCount + chart.svgCount };
  }
  const prepared = opts.preparedWith?.trim() || defaultPreparedWith(report);
  // G24-A: one footnote numbering per document, walked over the FULL text
  // (not the free-tier projection) so web, PDF and DOCX print the same numbers.
  cites = buildCitationIndex(report);
  citeLocale = locale;
  listInstance = 0;

  const ctx: Ctx = { report, r, projection, card: aligned.card, view, dash, images, locale, t: getTbrV3Strings(locale), prepared, free: projection.free };
  const children: Block[] = [
    ...dashboard(ctx),
    ...investmentView(ctx),
    ...keyPoints(ctx),
    ...valuation(ctx),
    ...r.dimensions.flatMap((ch, i) => chapter(ctx, ch, i)),
    ...riskMatrix(ctx),
    ...improvementPlan(ctx),
    ...money(ctx),
    ...appendix(ctx),
    ...evidenceCited(ctx),
  ];
  const outline = tbrDocxOutline(report, locale);

  const doc = new Document({
    creator: "BlockID.au",
    title: `Trusted Business Report — ${r.cover.startupName}`,
    description: "Trusted Business Report v3 (BlockID Startup Value Index)",
    styles: {
      paragraphStyles: [
        { id: "Normal", name: "Normal", run: { font: FONT, size: 20, color: INK }, paragraph: { spacing: { after: 80, line: 264 } } },
        { id: "Heading1", name: "heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 0 } },
        { id: "Heading2", name: "heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true, outlineLevel: 1 } },
        { id: "Heading3", name: "heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 20, bold: true, color: INK }, paragraph: { spacing: { before: 140, after: 40 }, keepNext: true, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: BULLETS, levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 240 } } } }] },
        { reference: NUMBERS, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 280 } } } }] },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "BlockID.au", font: FONT, size: 16, color: NAVY, bold: true }), new TextRun({ text: `  |  Startup Value Index · ${r.cover.startupName}`, font: FONT, size: 16, color: MUTED })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `Startup Value Index · ${r.cover.startupName} · ${fmtDate(r.generatedAt, locale)} · p. `, font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
                  new TextRun({ text: "/", font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED }),
                  new TextRun({ text: `  ·  ${adviceNote(ctx.t)}`, font: FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = Buffer.from(await Packer.toBuffer(doc));
  return { buffer, images: { png: images.pngCount, svg: images.svgCount }, sections: outline.length, outline };
}

export async function generateTbrDocx(report: ReportV2, opts: TbrDocxOptions = {}): Promise<Buffer> {
  return (await buildTbrDocx(report, opts)).buffer;
}
