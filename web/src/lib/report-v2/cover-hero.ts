// G19-S44 — the cover "current value" hero, computed once for every surface
// (web cover, PDF, DOCX, dashboard executive synthesis) so they show the same
// A$ range, the same pending rule and the same percentile column decision.
//
// Client-safe, no I/O.

import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { aud } from "@/lib/report-visuals";
import { mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { DIM_ORDER, type DimensionChapter, type ReportV2 } from "./schema";

/** Below this consensus confidence the headline is "valuation pending", not a number. */
export const COVER_VALUATION_MIN_CONFIDENCE = 0.3;

/** Is the valuation range worth showing as the headline? Nothing scored, or confidence < 30 % → pending. */
export function coverValuationPending(report: Pick<ReportV2, "valuation" | "cover">): boolean {
  return report.cover.svi.band === "pending" || !(report.valuation.consensus.confidence >= COVER_VALUATION_MIN_CONFIDENCE);
}

/** True when at least one cover row carries a percentile — otherwise the Pctl column hides (no "—" column). */
export function coverHasPercentiles(cover: Pick<ReportV2["cover"], "dims">): boolean {
  return DIM_ORDER.some((d) => typeof cover.dims[d]?.percentile === "number");
}

// ── G21 P1 review: the percentile lines, gated once for PDF / DOCX / e-mail ──
// A rank reaches a document only beside its cohort size and only when that
// size clears the publication floor (score-governance § 7).

/** The cover rank + n — "72th percentile (n=40)" — or null when unpublished. */
export function coverPercentileLine(svi: Pick<ReportV2["cover"]["svi"], "cohortPercentile" | "cohortN">): string | null {
  if (svi.cohortPercentile === null || typeof svi.cohortN !== "number" || !mayShowPercentile(svi.cohortN)) return null;
  return `${svi.cohortPercentile}th percentile (n=${svi.cohortN})`;
}

/** " · you: 72th percentile (n = 40)" for a chapter header, or "" when the chapter has no published rank. */
export function chapterPercentileSuffix(b: DimensionChapter["benchmark"]): string {
  if (b.percentile === null || typeof b.n !== "number" || !mayShowPercentile(b.n)) return "";
  return ` · you: ${b.percentile}th percentile (n = ${b.n})`;
}

export interface CoverHero {
  pending: boolean;
  /** "A$6.0M – A$9.8M" when not pending. */
  rangeLabel: string | null;
  lowAud: number;
  highAud: number;
  midAud: number;
  confidencePct: number;
  /** The localised headline: the range, or the pending sentence. */
  headline: string;
  /** "pre-money, directional · confidence 85%" (empty when pending). */
  subline: string;
  sviLabel: string;
  showPctl: boolean;
}

export function coverHero(report: Pick<ReportV2, "valuation" | "cover">, locale: TbrLocale | undefined): CoverHero {
  const s = getTbrStrings(locale).v2.s44;
  const v = report.valuation.consensus;
  const pending = coverValuationPending(report);
  const confidencePct = Math.round((Number.isFinite(v.confidence) ? v.confidence : 0) * 100);
  const rangeLabel = pending ? null : `${aud(v.lowAud)} – ${aud(v.highAud)}`;
  return {
    pending,
    rangeLabel,
    lowAud: v.lowAud,
    highAud: v.highAud,
    midAud: v.midAud,
    confidencePct,
    headline: rangeLabel ?? s.valuationPending,
    subline: pending ? "" : `${s.preMoney} · ${s.valuationConfidence(confidencePct)}`,
    sviLabel: s.sviTotal(report.cover.svi.total),
    showPctl: coverHasPercentiles(report.cover),
  };
}
