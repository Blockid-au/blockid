// Investor Pack Chapter 12 — "Evidence Completeness" section.
//
// Builds a structured text/markdown section summarising the startup's
// SVI evidence completeness across all 8 dimensions (FTV, MPC, PTD, TRE,
// CGH, IRI, LCO, SVM). Designed to be embedded in the investor pack PDF.
//
// Pure — deterministic computation from `DimensionCompletenessResult[]`.
// No AI calls, no network requests, no Supabase access. All content is
// derived from the evidence catalog and dimension completeness results
// passed in by the assembler.
//
// Disclosure (required on every render surface):
//   "Evidence completeness reflects self-declared and verified evidence
//    as of [date]. Score does not constitute an audit or guarantee."

import {
  type DimensionCompletenessResult,
  EVIDENCE_CATALOG,
} from "@/lib/svi-completeness";

// ─── Types ────────────────────────────────────────────────────────────────

export interface EvidenceCompletenessRow {
  /** Dimension key (e.g. "ftv", "mpc"). */
  dimension: string;
  /** Display label (e.g. "Founder & Team Value"). */
  label: string;
  /** Completeness percentage (0–100). */
  completenessPercent: number;
  /** Evidence items present vs total possible. */
  presentCount: number;
  totalCount: number;
  /** Qualitative band for this dimension. */
  status: "Strong" | "Developing" | "Needs Work";
}

export interface EvidenceCompletenessSection {
  /** Overall completeness % (simple average across all 8 dimensions). */
  overallPercent: number;
  /** Per-dimension rows — always 8 rows in canonical order. */
  rows: EvidenceCompletenessRow[];
  /** Human-readable interpretation line. */
  interpretation: string;
  /** Markdown/text block suitable for embedding in the investor pack PDF. */
  markdown: string;
  /** Required disclosure — must appear on every render surface. */
  disclosure: string;
  /** ISO timestamp of when this section was built. */
  asOfDate: string;
}

// ─── Canonical dimension metadata ─────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

/** Canonical order for display (mirrors SVI_13_CRITERIA in investor-pack.tsx). */
const DIMENSION_ORDER = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

// ─── Status thresholds ────────────────────────────────────────────────────

function statusFromPercent(pct: number): EvidenceCompletenessRow["status"] {
  if (pct >= 70) return "Strong";
  if (pct >= 40) return "Developing";
  return "Needs Work";
}

// ─── Disclosure constant ─────────────────────────────────────────────────

const EVIDENCE_COMPLETENESS_DISCLOSURE =
  "Evidence completeness reflects self-declared and verified evidence as of the report date. " +
  "Score does not constitute an audit, certification, or guarantee of accuracy. " +
  "General information only — not personal financial product advice under s766B Corporations Act 2001 (Cth).";

// ─── Interpretation builder ───────────────────────────────────────────────

/**
 * Generates a one-sentence interpretation: highlights the top-2 strongest
 * and top-2 dimensions with the most improvement potential.
 */
function buildInterpretation(
  overallPercent: number,
  rows: EvidenceCompletenessRow[],
): string {
  const sorted = [...rows].sort((a, b) => b.completenessPercent - a.completenessPercent);
  const strongest = sorted.slice(0, 2);
  const weakest = sorted.slice(-2).reverse();

  const strongestLabels = strongest
    .map((r) => r.dimension.toUpperCase())
    .join(" and ");
  const weakestLabels = weakest
    .map((r) => r.dimension.toUpperCase())
    .join(" and ");

  // Build sentence based on how spread the distribution is.
  if (strongest[0].completenessPercent === weakest[0].completenessPercent) {
    return (
      `Evidence completeness of ${overallPercent}% across 8 dimensions — ` +
      `all dimensions have similar coverage.`
    );
  }

  const improvementPhrase =
    weakest[0].completenessPercent < 40
      ? "have significant improvement potential"
      : "have improvement potential";

  return (
    `Evidence completeness of ${overallPercent}% across 8 dimensions. ` +
    `${strongestLabels} ${strongest.length > 1 ? "are" : "is"} strongest; ` +
    `${weakestLabels} ${weakest.length > 1 ? improvementPhrase : improvementPhrase.replace("have", "has")}.`
  );
}

// ─── Markdown renderer ───────────────────────────────────────────────────

function renderMarkdown(
  rows: EvidenceCompletenessRow[],
  overallPercent: number,
  interpretation: string,
  asOfDate: string,
): string {
  let md = "";
  md += `## Chapter 12 — Evidence Completeness\n\n`;
  md += `**Overall evidence completeness: ${overallPercent}%** across 8 SVI dimensions — as of ${asOfDate}.\n\n`;

  md += `| Dimension | Label | % Complete | Status |\n`;
  md += `|-----------|-------|-----------|--------|\n`;
  for (const row of rows) {
    md += `| ${row.dimension.toUpperCase()} | ${row.label} | ${row.completenessPercent}% (${row.presentCount}/${row.totalCount}) | ${row.status} |\n`;
  }
  md += `\n`;

  md += `_${interpretation}_\n\n`;
  md += `_${EVIDENCE_COMPLETENESS_DISCLOSURE}_\n`;

  return md;
}

// ─── Public entry point ──────────────────────────────────────────────────

/**
 * Build the Evidence Completeness section from per-dimension completeness
 * results. Pass `asOfDate` as a display string (e.g. "24 August 2026") or
 * leave undefined to default to the current UTC date.
 *
 * Returns a fully-typed `EvidenceCompletenessSection` with pre-rendered
 * markdown suitable for embedding directly in the investor pack PDF.
 *
 * Pure — never calls any AI or network resource.
 */
export function buildEvidenceCompletenessSection(
  dimensionResults: DimensionCompletenessResult[],
  asOfDate?: string,
): EvidenceCompletenessSection {
  const reportDate =
    asOfDate ??
    new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  // Build a lookup from provided results by dimension key.
  const resultByDim = new Map<string, DimensionCompletenessResult>();
  for (const r of dimensionResults) {
    resultByDim.set(r.dimension.toLowerCase(), r);
  }

  // Construct rows in canonical order. For any dimension missing from the
  // provided results, compute against an empty evidence set (0% complete).
  const rows: EvidenceCompletenessRow[] = DIMENSION_ORDER.map((dim) => {
    const result = resultByDim.get(dim);
    const catalog = EVIDENCE_CATALOG[dim] ?? [];
    const totalCount = catalog.length;

    if (result) {
      const pct = result.completenessPercent;
      return {
        dimension: dim,
        label: DIMENSION_LABELS[dim] ?? dim.toUpperCase(),
        completenessPercent: pct,
        presentCount: result.totalPresent,
        totalCount: result.totalPossible,
        status: statusFromPercent(pct),
      };
    }

    // Dimension not provided — treat as zero completeness.
    return {
      dimension: dim,
      label: DIMENSION_LABELS[dim] ?? dim.toUpperCase(),
      completenessPercent: 0,
      presentCount: 0,
      totalCount,
      status: "Needs Work",
    };
  });

  // Overall % = simple average across all 8 dimensions.
  const overallPercent =
    rows.length > 0
      ? Math.round(
          rows.reduce((sum, r) => sum + r.completenessPercent, 0) / rows.length,
        )
      : 0;

  const interpretation = buildInterpretation(overallPercent, rows);

  const markdown = renderMarkdown(rows, overallPercent, interpretation, reportDate);

  return {
    overallPercent,
    rows,
    interpretation,
    markdown,
    disclosure: EVIDENCE_COMPLETENESS_DISCLOSURE,
    asOfDate: reportDate,
  };
}
