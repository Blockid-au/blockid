// G21-P1-B — the Assessment Card and the dimension explainability grid on
// the ReportV2 web render. Hook-free like every v2 chapter. The card is an
// additive block between the cover and the executive summary (not a
// numbered TbrSection — the G19 chapter sequence and its 15 purpose lines
// are unchanged); the grid replaces the cover's plain dimension rows.
//
// Benchmarks are prop-driven: the report render passes none until the
// merging session wires P1-C's `benchmarkLabel(n)` through `benchmarks`.

import { AssessmentCard } from "@/components/svi/AssessmentCard";
import { DimensionExplainGrid } from "@/components/svi/DimensionExplainCard";
import type { DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { type AssessmentCardData, assessmentCardFromReport, type AssessmentBenchmark, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { dimensionExplainFromChapter } from "@/lib/svi/dimension-explain";
import { TBR_V2_SECTION_IDS, type TbrUiLocale } from "./shared";

export interface TbrAssessmentBenchmarks {
  total?: AssessmentBenchmark | null;
  dims?: Partial<Record<DimKey, AssessmentBenchmark>>;
  /** Server-loaded context (review P1): the stored evidence confidence + the claim-register count, so every surface prints the same numbers. */
  evidenceConfidence?: number | null;
  unverifiedMaterialClaims?: number | null;
}

export function TbrAssessmentCard({ report, locale = "en", benchmarks, options, data: prebuilt }: { report: ReportV2; locale?: TbrUiLocale; benchmarks?: TbrAssessmentBenchmarks; options?: Omit<AssessmentCardOptions, "benchmark">; data?: AssessmentCardData }) {
  const data = prebuilt ?? assessmentCardFromReport(report, {
    ...options,
    benchmark: benchmarks?.total ?? null,
    evidenceConfidence: options?.evidenceConfidence ?? benchmarks?.evidenceConfidence ?? null,
    unverifiedMaterialClaims: options?.unverifiedMaterialClaims ?? benchmarks?.unverifiedMaterialClaims ?? null,
  });
  return <AssessmentCard data={data} locale={locale} dimHref={(dim) => `#${TBR_V2_SECTION_IDS.dim(dim)}`} />;
}

/** The compact per-dimension cards the cover shows in place of its table rows. */
export function TbrDimensionExplainGrid({ report, locale = "en", benchmarks, className }: { report: ReportV2; locale?: TbrUiLocale; benchmarks?: TbrAssessmentBenchmarks; className?: string }) {
  const items = report.dimensions.map((ch) => {
    const d = dimensionExplainFromChapter(ch, { benchmark: benchmarks?.dims?.[ch.dim] ?? null });
    return locale === "vi" && ch.titleVi ? { ...d, title: ch.titleVi } : d;
  });
  return <DimensionExplainGrid items={items} locale={locale} variant="compact" hrefFor={(dim) => `#${TBR_V2_SECTION_IDS.dim(dim)}`} className={className} />;
}
