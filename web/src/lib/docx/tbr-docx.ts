// Trusted Business Report v2 — the DOCX surface (S-R4).
//
// Same document, same chapter order as the web and the PDF (spec §A.1):
// cover → executive → 8 dimension chapters → valuation → phase gates →
// money → action plan → appendix. Every visual is the shared renderer's
// SVG rasterised to PNG once per process (`report-visuals/png.ts`, cached)
// and embedded with `ImageRun`; when the rasteriser is unavailable the SVG
// itself is embedded (`type: "svg"`, Word ≥ 2016) with a 1×1 PNG fallback
// so the file always opens. The a11y table travels with every primary
// visual on the free-tier card chapters (§D.2), exactly as in the PDF.
//
// Free tier uses the same projection as the PDF (`report-v2/free-tier.ts`)
// so the two exports carry identical content; DOCX has no page count to
// gate, so level 0 is used.
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
import { topBlockers } from "@/lib/growth/phase-gate";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { aud, BAND_COLOUR } from "@/lib/report-visuals";
import { visualToPng, type PngResult } from "@/lib/report-visuals/png";
import type { Band, DataState, VisualSpecV2 } from "@/lib/report-visuals/types";
import { projectForTier, type FreeTierProjection, type TrimLevel } from "@/lib/report-v2/free-tier";
import { chapterPercentileSuffix, coverHero, coverPercentileLine } from "@/lib/report-v2/cover-hero";
import { coverLedgerCells, isUnassessed, ledgerRowsFor, pendingDimsLine, pendingLine } from "@/lib/report-v2/ledger-rows";
import { chapterCtaRows, coverEvidenceLine, emptyEvidenceLine, evidenceRowsView, moneyEmptyState, nextActionLine, pendingCtasHeading, planEvidenceRows, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { DIM_ORDER, type DimensionChapter, type ExecutiveStructured, type ReportV2 } from "@/lib/report-v2/schema";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";
import { buildValuationView, CONNECTORS_HREF } from "@/lib/report-v2/valuation-view";
import { PDF_ENTITY_LINE, PDF_FINANCIAL_PROJECTION_DISCLAIMER, PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { defaultPreparedWith } from "@/lib/report-v2/prepared-with";
import { ASSESSMENT_CARD_PDF_TITLE, assessmentCardLines } from "@/lib/pdf/assessment-card-pdf";
import { alignReportWithAssessmentCard, type AssessmentCardData, type AssessmentCardOptions } from "@/lib/svi/assessment-card";

// ── Brand ───────────────────────────────────────────────────────────────────

const BRAND = "0072B2";
const INK = "1F2937";
const MUTED = "6B7280";
const FAINT = "9CA3AF";
const GRID = "E5E7EB";
const SURFACE = "F8FAFC";
const FONT = "Calibri";

/** Usable width at A4 with 1-inch margins ≈ 6.27 in ≈ 602 px (docx uses px at 96 dpi). */
const CONTENT_PX = 600;

// 1×1 transparent PNG — the mandatory fallback when an SVG is embedded directly.
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const bandLabel = (b: Band): string => (b === "strong" ? "Strong" : b === "developing" ? "Developing" : b === "early" ? "Early" : "Pending");
const stateLabel = (d: DataState): string => (d === "real" ? "real data" : d === "partial" ? "partial data" : d === "benchmark_only" ? "benchmark only" : "target, not actual");
const bandHex = (b: Band): string => BAND_COLOUR[b].replace("#", "");
const bandOf = (score: number): Band => (score >= 70 ? "strong" : score >= 40 ? "developing" : "early");
const WINDOW_LABEL = { this_week: "this week", "30d": "next 30 days", "90d": "next 90 days" } as const;

function fmtDate(iso: string, locale: "en" | "vi"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "long", year: "numeric" });
}

// ── Paragraph helpers ───────────────────────────────────────────────────────

type Block = Paragraph | Table;

function h1(text: string, no?: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      ...(no !== undefined ? [new TextRun({ text: `${no}  `, font: FONT, size: 18, color: FAINT })] : []),
      new TextRun({ text, font: FONT, size: 30, bold: true, color: INK }),
    ],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: INK })] });
}

function p(text: string, opts: { size?: number; color?: string; bold?: boolean; italics?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: opts.after ?? 80 },
    alignment: opts.align,
    children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, color: opts.color ?? INK, bold: opts.bold, italics: opts.italics })],
  });
}

function small(text: string, color = MUTED): Paragraph {
  return p(text, { size: 16, color, after: 60 });
}

function kicker(text: string): Paragraph {
  return p(text.toUpperCase(), { size: 14, color: BRAND, bold: true, after: 40 });
}

function bullets(title: string, items: string[], mark: string): Paragraph[] {
  if (!items.length) return [];
  return [kicker(title), ...items.map((it) => new Paragraph({ spacing: { after: 40 }, indent: { left: 240 }, children: [new TextRun({ text: `${mark} ${it}`, font: FONT, size: 18, color: INK })] }))];
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: GRID };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function table(header: string[], rows: string[][], widths?: number[]): Table {
  const cols = header.length;
  const w = widths ?? header.map(() => Math.floor(100 / cols));
  const mk = (cells: string[], isHead: boolean) =>
    new TableRow({
      tableHeader: isHead,
      children: cells.map(
        (text, i) =>
          new TableCell({
            borders: cellBorders,
            width: { size: w[i], type: WidthType.PERCENTAGE },
            shading: isHead ? { type: ShadingType.CLEAR, fill: SURFACE, color: "auto" } : undefined,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: isHead ? 14 : 16, bold: isHead, color: isHead ? MUTED : INK })] })],
          }),
      ),
    });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(header, true), ...rows.map((r) => mk(r, false))] });
}

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

/** Rasterise every visual of the (projected) report once, through the shared cache. */
export async function rasteriseReportVisuals(report: ReportV2, widthPx = CONTENT_PX * 2): Promise<TbrDocxImages> {
  const byId = new Map<string, PngResult>();
  let pngCount = 0;
  let svgCount = 0;
  const specs = allVisuals(report);
  // Bounded parallelism keeps a 30-visual report off the event loop's back.
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const spec = specs[next++];
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
  if (!img) return [small(`[chart ${spec.title} — not rendered]`)];
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

function a11yTable(spec: VisualSpecV2, max = 12): Block[] {
  const rows = (spec.a11y?.tableFallback ?? []).slice(0, max);
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  return [table(cols, rows.map((r) => cols.map((c) => String(r[c] ?? ""))))];
}

// ── Sections ────────────────────────────────────────────────────────────────

function cover(report: ReportV2, images: TbrDocxImages, locale: "en" | "vi", preparedWith: string): Block[] {
  const c = report.cover;
  const ring = c.visuals.find((v) => v.kind === "score_ring");
  const radar = c.visuals.find((v) => v.kind === "radar");
  const strip = c.visuals.find((v) => v.kind === "three_questions_strip");
  // G19-S44: the "current value" hero (same rule as web / PDF); one phase
  // vocabulary — no SVI stage label beside the 12-phase label.
  const hero = coverHero(report, locale);
  const s44 = getTbrStrings(locale).v2.s44;
  const out: Block[] = [
    kicker("Trusted Business Report · BlockID Startup Value Index"),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: c.startupName, font: FONT, size: 44, bold: true, color: INK })] }),
    small(`${c.sector} · Phase: ${GROWTH_PHASE_LABELS[c.phaseId][locale]} · ${fmtDate(report.generatedAt, locale)}${report.source !== "pipeline" ? (report.source === "fixture" ? " · demo data" : " · built from stored snapshot") : ""}`),
    h1("Cover — Where / Worth / Next", "0"),
    kicker(s44.currentValue),
    p(hero.headline, { bold: true, size: hero.pending ? 24 : 36 }),
  ];
  if (hero.subline) out.push(small(hero.subline));
  if (ring) out.push(...figure(ring, images, 200, null));
  out.push(p(`${hero.sviLabel} · ${bandLabel(c.svi.band)}${c.svi.deltaVsLast !== null ? ` · ${c.svi.deltaVsLast >= 0 ? "+" : ""}${c.svi.deltaVsLast} vs last snapshot` : ""}${coverPercentileLine(c.svi) !== null ? ` · ${coverPercentileLine(c.svi)}` : ""}`, { bold: true, color: bandHex(c.svi.band), align: AlignmentType.CENTER }));
  out.push(
    table(
      hero.showPctl ? ["Dimension", "Owner", "W", "Score", "p50", "Pctl"] : ["Dimension", "Owner", "W", "Score", "p50"],
      DIM_ORDER.map((d) => {
        const row = c.dims[d];
        const cells = [`${d.toUpperCase()} ${DIMENSION_OWNERS[d].title}`, DIMENSION_OWNERS[d].primary.toUpperCase(), String(row.weight), row.band === "pending" ? "—" : String(row.score), String(row.p50)];
        return hero.showPctl ? [...cells, row.percentile === null ? "—" : String(row.percentile)] : cells;
      }),
      hero.showPctl ? [40, 12, 10, 14, 12, 12] : [46, 14, 12, 16, 12],
    ),
  );
  if (strip) out.push(...figure(strip, images, CONTENT_PX, null));
  out.push(...coverLedger(report, locale));
  if (radar) out.push(...figure(radar, images, 340, radar.subtitle ?? null));
  out.push(kicker("Where · Worth · Next"), p(`Where: ${c.threeQuestions.where}`), p(`Worth: ${c.threeQuestions.worth}`), p(`Next: ${c.threeQuestions.next}`), small(preparedWith, FAINT));
  return out;
}

/** G19-S41 — cover ledger strip + "N of 8 dimensions pending" (same cells as web / PDF). */
function coverLedger(report: ReportV2, locale: "en" | "vi"): Block[] {
  const cells = coverLedgerCells(report.cover, locale);
  const pending = pendingDimsLine(report.cover, locale);
  const out: Block[] = [];
  if (cells.length) {
    out.push(kicker(getTbrStrings(locale).ledger.coverTitle));
    out.push(small(cells.map((c) => `${c.label} ${c.value}`).join("  →  "), INK));
  }
  // G19-S43: "Evidence: mostly self-declared (×0.50)" beside the strip.
  const evidence = coverEvidenceLine(report.cover, locale);
  if (evidence) out.push(small(evidence, INK));
  if (pending) out.push(small(pending));
  return out;
}

/**
 * G21-P1-B — the Assessment Card twin: kicker + the two headline numbers
 * (SVI · Evidence Confidence) as one 2-column table, then the label · value
 * rows the PDF block prints. Same `AssessmentCardData` as the web card.
 */
function assessmentCard(data: AssessmentCardData): Block[] {
  const svi = data.svi === null ? "—" : `${data.svi} / 100`;
  const band = data.sviBand === "pending" ? "Pending" : data.sviBand;
  return [
    kicker(ASSESSMENT_CARD_PDF_TITLE),
    p(data.startupName, { size: 22, bold: true, after: 40 }),
    table(["SVI", "Evidence Confidence"], [[`${svi} · ${band}`, `${data.evidenceConfidence} % · ${data.verification.label}`]], [50, 50]),
    table(["Item", "Value"], assessmentCardLines(data).map((l) => [l.label, l.value]), [35, 65]),
  ];
}

/** G19-S43 — a CTA row as document text: "<label> · <path> · +N SVI". */
function ctaText(row: EvidenceRowView): string {
  if (!row.cta) return row.label;
  return `${row.cta.label} · ${row.cta.href}${row.cta.liftLabel ? ` · ${row.cta.liftLabel}` : ""}`;
}

/** G19-S41 — "How this score was built" table (ledger-rows.ts), or the single pending line. */
function scoreLedger(ch: DimensionChapter, locale: "en" | "vi", verificationLevel: number | null): Block[] {
  if (!ch.scoreBreakdown) return [];
  const strings = getTbrStrings(locale).ledger;
  const out: Block[] = [kicker(strings.title)];
  if (isUnassessed(ch)) {
    const line = pendingLine(ch, locale);
    // G19-S43: the pending line lists the chapter's CTA rows (label · path · +N SVI).
    const ctas = chapterCtaRows(ch, locale);
    out.push(small(`${line.text}${ctas.length ? ` ${pendingCtasHeading(locale)} ${ctas.map(ctaText).join("; ")}` : line.add ? ` ${line.add}` : ""}`, INK));
  } else {
    const rows = ledgerRowsFor(ch, locale, verificationLevel);
    out.push(
      table(
        [strings.thSignal, strings.thPoints, strings.thSource],
        rows.map((r) => [`${r.label}${r.adjustmentScale ? ` (${strings.adjustmentScale})` : ""}`, r.points, r.source]),
        [64, 12, 24],
      ),
    );
  }
  if (ch.scoreNote) out.push(small(`${strings.scoreNote}: ${ch.scoreNote}`));
  return out;
}

/** G19-S47: prose as ≤ 3-sentence paragraphs (markdown stripped) — the DOCX twin of `<Prose>`. */
function paragraphs(text: string, opts: { size?: number; color?: string; after?: number } = {}): Paragraph[] {
  return proseParagraphs(text).map((para) => p(para, { size: opts.size, color: opts.color, after: opts.after ?? 80 }));
}

const VERDICT_HEX: Record<ExecutiveStructured["verdict"]["label"], string> = {
  back: BAND_COLOUR.strong.replace("#", ""),
  back_with_conditions: BAND_COLOUR.developing.replace("#", ""),
  watch: BAND_COLOUR.early.replace("#", ""),
  not_yet: BAND_COLOUR.pending.replace("#", ""),
};

/** A 2-column card table for the reason / gap groups (title · body · dim · lift per cell). */
function cardTable(items: Array<{ title: string; body: string; dim?: string; lift?: number }>, accentHex: string, locale: "en" | "vi"): Table {
  const s47 = getTbrStrings(locale).v2.s47;
  const cell = (it: (typeof items)[number] | null, index: number) =>
    new TableCell({
      borders: { ...cellBorders, left: { style: BorderStyle.SINGLE, size: 18, color: it ? accentHex : GRID } },
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: it
        ? [
            new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${String(index + 1).padStart(2, "0")}  ${it.title}`, font: FONT, size: 20, bold: true, color: INK })] }),
            p(it.body, { size: 17, color: INK, after: 40 }),
            ...(it.dim || typeof it.lift === "number"
              ? [
                  new Paragraph({
                    spacing: { after: 0 },
                    children: [
                      ...(it.dim ? [new TextRun({ text: `${it.dim.toUpperCase()} · ${locale === "vi" ? DIMENSION_OWNERS[it.dim as keyof typeof DIMENSION_OWNERS].titleVi : DIMENSION_OWNERS[it.dim as keyof typeof DIMENSION_OWNERS].shortLabel}`, font: FONT, size: 14, color: BRAND, bold: true })] : []),
                      ...(typeof it.lift === "number" ? [new TextRun({ text: `${it.dim ? "   " : ""}${s47.lift(it.lift)}`, font: FONT, size: 14, color: MUTED })] : []),
                    ],
                  }),
                ]
              : []),
          ]
        : [new Paragraph({ children: [] })],
    });
  const rows: TableRow[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(new TableRow({ children: [cell(items[i], i), cell(items[i + 1] ?? null, i + 1)] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function executive(report: ReportV2, images: TbrDocxImages, locale: "en" | "vi"): Block[] {
  // G19-S47: the structured sections (parsed on the fly for a pre-S47 row) — never the raw thesis.
  const e = ensureExecutiveStructured(report).executive;
  const x = e.structured!;
  const s47 = getTbrStrings(locale).v2.s47;
  const windowLabel = getTbrStrings(locale).v2.chapter.window;
  const phase = GROWTH_PHASE_LABELS[x.phaseNow.phaseId]?.[locale] ?? x.phaseNow.label;
  const confidencePct = Math.round(x.verdict.confidence * 100);
  const verdictHex = VERDICT_HEX[x.verdict.label];
  const out: Block[] = [
    pageBreak(),
    h1("Executive Summary", "1"),
    small(s47.purpose.executive),
    small(`CEO · ${getTbrStrings(locale).v2.s44.evidenceConfidence(Math.round(e.confidence * 100))}`),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: x.headline, font: FONT, size: 30, bold: true, color: INK })] }),
    ...x.summary.map((para) => p(para, { after: 100 })),
  ];
  if (x.keyInsight) {
    out.push(kicker(s47.keyInsight));
    out.push(new Paragraph({ spacing: { after: 120 }, indent: { left: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 8 } }, children: [new TextRun({ text: x.keyInsight, font: FONT, size: 20, color: INK })] }));
  }
  if (x.reasonsToBack.length) {
    out.push(kicker(s47.whyBack));
    out.push(cardTable(x.reasonsToBack, BAND_COLOUR.strong.replace("#", ""), locale));
    out.push(p("", { after: 60 }));
  }
  if (x.criticalGaps.length) {
    out.push(kicker(s47.whatMustChange));
    out.push(cardTable(x.criticalGaps, BAND_COLOUR.early.replace("#", ""), locale));
    out.push(p("", { after: 60 }));
  }
  if (x.benchmarks.length) {
    out.push(kicker(s47.benchmarks));
    out.push(
      new Paragraph({
        spacing: { after: 100 },
        children: x.benchmarks.map((b) => new TextRun({ text: `${b.dim.toUpperCase()} ${b.band === "pending" ? "—" : b.score} · ${bandLabel(b.band)}    `, font: FONT, size: 16, color: bandHex(b.band), bold: true })),
      }),
    );
  }
  out.push(kicker(`${s47.whereYouAre} · ${phase}`));
  out.push(p(`${s47.blocker}: ${x.phaseNow.blocker}`, { size: 18 }));
  out.push(p(`${s47.whatItTakes}: ${x.phaseNow.whatItTakes}`, { size: 18 }));
  out.push(...e.visuals.flatMap((v) => figure(v, images, CONTENT_PX, null)));
  out.push(
    new Paragraph({
      spacing: { before: 120, after: 40 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: verdictHex, space: 8 } },
      indent: { left: 240 },
      children: [
        new TextRun({ text: `${s47.verdict}: `, font: FONT, size: 20, bold: true, color: INK }),
        new TextRun({ text: s47.verdictLabel[x.verdict.label], font: FONT, size: 22, bold: true, color: verdictHex }),
        new TextRun({ text: `   ${s47.confidence(confidencePct)}`, font: FONT, size: 16, color: MUTED }),
      ],
    }),
  );
  out.push(new Paragraph({ spacing: { after: 120 }, indent: { left: 240 }, children: [new TextRun({ text: `${s47.condition}: ${x.verdict.condition ?? s47.noCondition}`, font: FONT, size: 18, color: INK })] }));
  if (x.actions.length) {
    out.push(kicker(s47.actions));
    x.actions.forEach((a, i) => {
      out.push(new Paragraph({ spacing: { after: 20 }, indent: { left: 240 }, children: [new TextRun({ text: `${i + 1}. ${a.title}`, font: FONT, size: 18, bold: true, color: INK })] }));
      out.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 480 }, children: [new TextRun({ text: `${a.detail}  (${windowLabel[a.window]}${a.dim ? ` · ${a.dim.toUpperCase()}` : ""})`, font: FONT, size: 16, color: MUTED })] }));
    });
  }
  out.push(auditLine(e.audit.grounded, e.audit.uncited, e.audit.revised));
  return out;
}

function auditLine(grounded: boolean, uncited: number, revised: boolean, frameworks?: string[]): Paragraph {
  return small(`Auditor: ${grounded ? "grounded" : "no citation in this chapter"}${uncited > 0 ? ` · ${uncited} uncited` : ""}${revised ? " · revised" : ""}${frameworks && frameworks.length ? ` · Frameworks: ${frameworks.slice(0, 4).join("; ")}` : ""}`, FAINT);
}

function chapterHeader(ch: DimensionChapter): Block[] {
  return [
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: ch.band === "pending" ? "—" : String(ch.score), font: FONT, size: 48, bold: true, color: bandHex(ch.band) }),
        new TextRun({ text: `/100   ${bandLabel(ch.band)} · weight ${ch.weight} · owner ${ch.ownerAgent.toUpperCase()}${ch.supportingAgents.length ? ` (with ${ch.supportingAgents.slice(0, 3).map((r) => r.toUpperCase()).join(", ")})` : ""}`, font: FONT, size: 18, color: MUTED }),
      ],
    }),
    small(`Stage p25 ${ch.benchmark.p25} · p50 ${ch.benchmark.p50} · p75 ${ch.benchmark.p75}${chapterPercentileSuffix(ch.benchmark)}${ch.degraded ? ` · deterministic card — ${ch.degradeReason ?? "owner call unavailable"}` : ""}`),
  ];
}

function chapter(ch: DimensionChapter, index: number, images: TbrDocxImages, locale: "en" | "vi", projection: FreeTierProjection, verificationLevel: number | null): Block[] {
  const title = locale === "vi" ? ch.titleVi : ch.title;
  const out: Block[] = [...(projection.free ? [] : [pageBreak()]), h1(title, String(index)), ...chapterHeader(ch)];
  if (projection.free && ch.renderAs === "card") {
    out.push(...paragraphs(ch.verdict));
    if (ch.gaps[0]) out.push(small(`▲ ${ch.gaps[0]}`));
    out.push(...figure(ch.primaryVisual, images, 360, `${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}`));
    out.push(...a11yTable(ch.primaryVisual, 8));
    out.push(p(`Unlock the full ${ch.title} chapter — upgrade at blockid.au/pricing`, { size: 16, color: BRAND }));
    return out;
  }
  // G19-S41: the ledger follows the evidence-table trim rule on the free tier (as in the PDF).
  if (projection.show.evidenceTables) out.push(...scoreLedger(ch, locale, verificationLevel));
  out.push(...figure(ch.primaryVisual, images, CONTENT_PX, `${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`));
  out.push(...paragraphs(ch.verdict));
  if (projection.show.evidenceTables) {
    out.push(kicker("Evidence"));
    // G19-S43: real rows first, then every missing input as a CTA row.
    const rows = evidenceRowsView(ch.evidence, locale);
    const empty = emptyEvidenceLine(locale);
    out.push(
      rows.length
        ? table(["Id", "Label", "Source", "Status", "Observed"], rows.slice(0, 12).map((e) => [e.evidence_id, e.cta ? ctaText(e) : e.label, e.source, e.statusLabel, e.observedAt]), [14, 44, 14, 14, 14])
        : small(`${empty.text} ${empty.ctaLabel} ${empty.href}`),
    );
  }
  for (const c of ch.criteria) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${c.title} — `, font: FONT, size: 22, bold: true, color: INK }), new TextRun({ text: String(c.score), font: FONT, size: 22, bold: true, color: bandHex(bandOf(c.score)) })] }));
    out.push(...paragraphs(c.verdict, { size: 16, color: INK, after: 60 }));
    if (projection.show.criterionDetail) {
      out.push(...bullets("Strengths", c.strengths.slice(0, 3), "+"), ...bullets("Gaps", c.gaps.slice(0, 3), "^"));
      if (c.nextAction) out.push(small(`Next: ${c.nextAction}`, BRAND));
    }
    out.push(small(`${c.quality} · ${c.agent.toUpperCase()} · ${c.grounded ? "grounded" : "uncited"}`, FAINT));
  }
  out.push(...bullets("Strengths", ch.strengths, "+"), ...bullets("Gaps", ch.gaps, "^"));
  out.push(kicker(`Next action (${WINDOW_LABEL[ch.nextAction.window]})`), p(nextActionLine(ch, locale)));
  if (projection.show.phaseLens && ch.phaseLens.whatMattersNow) out.push(small(`${GROWTH_PHASE_LABELS[ch.phaseLens.phaseId][locale]}: ${ch.phaseLens.whatMattersNow}`));
  for (const v of ch.secondaryVisuals) out.push(...figure(v, images, 360, `${v.title} · ${stateLabel(v.dataState)}`));
  out.push(auditLine(ch.audit.grounded, ch.audit.uncited, ch.audit.revised, ch.frameworks));
  return out;
}

function valuation(report: ReportV2, images: TbrDocxImages, locale: "en" | "vi", projection: FreeTierProjection): Block[] {
  const v = report.valuation;
  const view = buildValuationView(v, locale);
  const vs = view.strings;
  const out: Block[] = [pageBreak(), h1("Valuation", "10")];
  if (report.cover.svi.band === "pending") {
    out.push(p(vs.pending));
    return out;
  }
  const rangeBars = v.visuals.find((x) => x.kind === "range_bars");
  const others = v.visuals.filter((x) => x !== rangeBars);
  out.push(small(`CFO · ${vs.confidence(view.confidencePct)}`));
  out.push(p(`${vs.consensus}: ${aud(v.consensus.lowAud)} – ${aud(v.consensus.midAud)} – ${aud(v.consensus.highAud)} (${vs.low.toLowerCase()} / ${vs.consensus.toLowerCase()} / ${vs.high.toLowerCase()})`, { bold: true }));
  if (rangeBars) out.push(...figure(rangeBars, images, CONTENT_PX, `${rangeBars.title} · ${stateLabel(rangeBars.dataState)}`));
  if (!projection.free) {
    // G19-S42 — inputs & assumptions, applicable methods only, unit economics,
    // cross-checks, consistency notes, ask only when stated (same rows as web / PDF).
    if (view.inputRows.length) {
      out.push(h2(vs.inputsTitle));
      out.push(table([vs.thInput, vs.thValue, vs.thSource], view.inputRows.map((r) => [r.label, r.value, vs.source[r.source]]), [30, 50, 20]));
    }
    if (view.noneApplicable) {
      out.push(small(`${vs.noneApplicable} ${vs.connectorsCta}: ${CONNECTORS_HREF}`));
    } else {
      out.push(h2(vs.methodsTitle));
      out.push(
        table(
          [vs.thMethod, vs.thWeight, vs.low, vs.consensus, vs.high, vs.thDerivation],
          view.methodRows.map((m) => [m.label, `${m.weightPct}%`, aud(m.lowAud), aud(m.midAud), aud(m.highAud), m.derivation ? `${m.derivation} — ${m.rationale}` : m.rationale]),
          [20, 10, 12, 12, 12, 34],
        ),
      );
      if (view.needRevenueLine) out.push(small(`${view.needRevenueLine} ${vs.connectorsCta}: ${CONNECTORS_HREF}`));
    }
    if (view.unitEconomics.length) {
      out.push(h2(vs.unitEconomicsTitle));
      out.push(small(view.unitEconomics.map((r) => `${r.label} ${r.value}`).join(" · ")));
    }
    out.push(small(`${vs.scenarios}: ${view.scenarioLine}`));
    if (view.askLine) out.push(small(view.askLine));
    out.push(small(`${view.sectorMultiplesTitle}: ${view.sectorMultiplesLine}`));
    out.push(small(view.comparablesLine));
    if (view.crossChecks.length) {
      out.push(h2(vs.crossChecksTitle));
      for (const c of view.crossChecks) out.push(small(`${c.label}: ${c.range}${c.n !== null ? ` (${vs.nLabel(c.n)})` : ""} — ${c.source} · ${vs.asOf(c.asOf)}`));
    }
    if (view.consistency.length) {
      out.push(h2(vs.consistencyTitle));
      for (const n of view.consistency) out.push(small(n));
    }
    if (v.narrative) out.push(...paragraphs(v.narrative));
    for (const x of others) out.push(...figure(x, images, 420, `${x.title} · ${stateLabel(x.dataState)}`));
  }
  out.push(auditLine(v.audit.grounded, v.audit.uncited, v.audit.revised));
  return out;
}

function phaseGates(report: ReportV2, images: TbrDocxImages, locale: "en" | "vi", projection: FreeTierProjection): Block[] {
  const g = report.phaseGates;
  const currentRows = g.matrix.filter((m) => m.phase === g.current && m.required);
  const heat = g.visuals.find((v) => v.kind === "heat_map");
  const route = g.visuals.find((v) => v.kind === "route_map");
  const out: Block[] = [...(projection.free ? [] : [pageBreak()]), h1("Phase Gates — 13 Criteria × 12 Phases", "11"), small(`COO · Current phase: ${GROWTH_PHASE_LABELS[g.current][locale]}`)];
  if (route) out.push(...figure(route, images, CONTENT_PX, null));
  out.push(currentRows.length ? table(["Criterion (current phase)", "Quality", "Met"], currentRows.map((m) => [m.criterion.replace(/_/g, " "), m.quality, m.met ? "yes" : "no"]), [60, 20, 20]) : small("No required criteria on this phase."));
  if (!projection.free && heat) out.push(...figure(heat, images, CONTENT_PX, heat.subtitle ?? heat.title));
  for (const b of g.blockers.slice(0, 6)) out.push(small(`▲ ${b.detail}`));
  return out;
}

function money(report: ReportV2, images: TbrDocxImages, projection: FreeTierProjection, locale: "en" | "vi"): Block[] {
  const m = report.moneyOnTable;
  const rows = [...m.grants.map((g) => ({ ...g, kind: "grant" })), ...m.programs.map((pr) => ({ ...pr, kind: "program" }))].sort((a, b) => b.fit - a.fit).slice(0, projection.moneyLimit);
  const out: Block[] = [...(projection.free ? [] : [pageBreak()]), h1("Money on the Table — Grants & Programs", "12"), small(`CFO + CMO · ${m.grants.length + m.programs.length} matched · total ${aud(m.totalAud)}`)];
  // G19-S43: the empty state points at the grant profile (never "re-run").
  const empty = moneyEmptyState(report, locale);
  if (rows.length) out.push(table(["Grant / program", "Kind", "A$", "Deadline", "Fit"], rows.map((r) => [r.name, r.kind, r.amountAud === null ? "—" : aud(r.amountAud), r.deadline ?? "rolling", `${Math.round(r.fit)}%`]), [44, 12, 14, 18, 12]));
  else if (empty) out.push(small(`${empty.text} ${empty.ctaLabel} ${empty.href}`));
  for (const v of m.visuals) out.push(...figure(v, images, CONTENT_PX, `${v.title} · ${stateLabel(v.dataState)}`));
  return out;
}

function actionPlan(report: ReportV2, images: TbrDocxImages, projection: FreeTierProjection, locale: "en" | "vi"): Block[] {
  const a = report.actionPlan;
  const s43 = getTbrS43Strings(locale);
  const out: Block[] = [...(projection.free ? [] : [pageBreak()]), h1("90-Day Action Plan", "13"), small(`COO · ${a.steps.length} steps · ${a.horizonDays} days`)];
  out.push(
    a.steps.length
      ? table(["Day", "Step", "Owner", "Dimension", "Lift"], a.steps.map((st) => [String(st.day), st.title, st.ownerAgent.toUpperCase(), DIMENSION_OWNERS[st.dimension].shortLabel, `+${st.expectedLift} SVI${st.evidenceToAdd ? ` · ${s43.source[st.evidenceToAdd] ?? st.evidenceToAdd}` : ""}`]), [8, 48, 10, 18, 16])
      : small("No steps yet — the plan is derived from the weakest chapters once they are scored."),
  );
  // G19-S43: the engine's P0 / P1 evidence gaps as CTA lines.
  const planEvidence = planEvidenceRows(report, locale);
  if (planEvidence.rows.length) out.push(kicker(planEvidence.title), ...planEvidence.rows.map((r) => small(`• ${ctaText(r)}`, INK)));
  for (const v of a.visuals) out.push(...figure(v, images, CONTENT_PX, null));
  return out;
}

function appendix(report: ReportV2, projection: FreeTierProjection, preparedWith: string, locale: "en" | "vi"): Block[] {
  const a = report.appendix;
  const grounded = a.auditLog.filter((l) => l.grounded).length;
  const out: Block[] = [pageBreak(), h1("Appendix — Method, Evidence & Auditor Log", "14"), h2("Method"), small(a.method, INK), h2("Data principle"), small(a.dataPrinciple, INK), h2("Evidence register")];
  // G19-S43: missing inputs are CTA rows (label · path · +N SVI).
  const register = evidenceRowsView(a.evidenceRegister, locale);
  out.push(
    register.length
      ? table(["Id", "Label", "Source", "Status", "Dims"], register.map((e) => [e.evidence_id, e.cta ? ctaText(e) : e.label, e.source, e.statusLabel, e.dims.join(" ")]), [14, 44, 14, 14, 14])
      : small(projection.free && projection.level >= 3 ? "The evidence register is included in the paid report." : "No evidence rows were attached to this snapshot."),
  );
  out.push(h2("Auditor log"), small(`${a.auditLog.length} sections audited · ${grounded} grounded · ${a.auditLog.filter((l) => l.revised).length} revised · report quality ${Math.round(report.quality.score)} · grounded share ${Math.round(report.quality.groundedShare * 100)}%`, INK));
  if (report.quality.degradedSections.length) out.push(small(`Degraded sections: ${report.quality.degradedSections.join(", ")}`));
  out.push(h2("Sources"), small(`AU comparables: ${a.comparablesN} raises, ${a.comparablesWithMultiplesN} with multiples.${a.sourcesDated.length ? " " + a.sourcesDated.map((x) => `${x.label} (${x.date})`).join(" · ") : ""}`, INK));
  if (projection.free) out.push(small(`Free tier (${report.pageBudget.free}-page budget) omits: ${projection.dropped.join(", ")}.`));
  out.push(small(preparedWith, FAINT), small(a.disclaimer), small(`${PDF_FINANCIAL_PROJECTION_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`), small(PDF_ENTITY_LINE, FAINT));
  return out;
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
}

/** Build the DOCX; `generateTbrDocx` is the Buffer-only convenience the route uses. */
export async function buildTbrDocx(rawReport: ReportV2, opts: TbrDocxOptions = {}): Promise<TbrDocxResult> {
  // One evidence-confidence number across the card and the executive line (review P1).
  const aligned = alignReportWithAssessmentCard(rawReport, opts.assessment ?? {});
  const report = aligned.report;
  // G19-S45: the fixed-layout twins carry EN / VI fonts + strings; ES / JA documents render with the English labels.
  const raw = opts.locale ?? report.locale ?? "en";
  const locale: "en" | "vi" = raw === "vi" ? "vi" : "en";
  const projection = projectForTier(report, opts.level ?? 0);
  const r = projection.report;
  const images = opts.images ?? (await rasteriseReportVisuals(r));
  const prepared = opts.preparedWith?.trim() || defaultPreparedWith(report);

  const children: Block[] = [
    ...cover(r, images, locale, prepared),
    // G21-P1-B: the Assessment Card — additive, above the executive summary.
    ...assessmentCard(aligned.card),
    ...executive(r, images, locale),
    ...r.dimensions.flatMap((ch, i) => chapter(ch, i + 2, images, locale, projection, r.cover.verification?.level ?? null)),
    ...valuation(r, images, locale, projection),
    ...phaseGates(r, images, locale, projection),
    ...money(r, images, projection, locale),
    ...actionPlan(r, images, projection, locale),
    ...appendix(r, projection, prepared, locale),
  ];

  const doc = new Document({
    creator: "BlockID.au",
    title: `Trusted Business Report — ${r.cover.startupName}`,
    description: "Trusted Business Report v2 (BlockID Startup Value Index)",
    styles: {
      paragraphStyles: [
        { id: "Normal", name: "Normal", run: { font: FONT, size: 20, color: INK }, paragraph: { spacing: { after: 80, line: 264 } } },
        { id: "Heading1", name: "heading 1", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 30, bold: true, color: INK }, paragraph: { spacing: { before: 240, after: 120 } } },
        { id: "Heading2", name: "heading 2", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 22, bold: true, color: INK }, paragraph: { spacing: { before: 160, after: 60 } } },
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
                children: [new TextRun({ text: "BlockID.au", font: FONT, size: 16, color: BRAND, bold: true }), new TextRun({ text: `  |  Trusted Business Report · ${r.cover.startupName}`, font: FONT, size: 16, color: MUTED })],
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
                  new TextRun({ text: `Trusted Business Report · ${r.cover.startupName} · ${fmtDate(r.generatedAt, locale)} · page `, font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
                  new TextRun({ text: "/", font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED }),
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
  return { buffer, images: { png: images.pngCount, svg: images.svgCount }, sections: 15 };
}

export async function generateTbrDocx(report: ReportV2, opts: TbrDocxOptions = {}): Promise<Buffer> {
  return (await buildTbrDocx(report, opts)).buffer;
}
