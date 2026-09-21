// tbr-docx-outline — G27: the 16-section v3 outline the DOCX twin emits, as
// ids + titles in order. The web TOC (`components/tbr/v2/shared.tsx`
// `TBR_V2_SECTION_IDS`) and the PDF outline use the same ids, so a deep link
// or a bookmark resolves to the same section on every surface.
//
// Pure (no docx import) so the route / tests can read the outline without
// building the document.

import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { buildCitationIndex, citationEntries } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import type { ReportV2 } from "@/lib/report-v2/schema";

export type TbrDocxLocale = "en" | "vi";

export interface TbrDocxOutlineEntry {
  /** Same ids as `TBR_V2_SECTION_IDS` (web) — `tbr-dashboard`, `tbr-dim-tre`, … */
  id: string;
  /** Heading 1 text as printed in the document. */
  title: string;
  /** 1-based section number (1 Dashboard … 16 Appendix; Evidence cited is unnumbered). */
  no: number | null;
}

export const TBR_DOCX_SECTION_IDS = {
  dashboard: "tbr-dashboard",
  investmentView: "tbr-investment-view",
  keyPoints: "tbr-key-points",
  valuation: "tbr-valuation",
  dim: (dim: string) => `tbr-dim-${dim}`,
  riskMatrix: "tbr-risk-matrix",
  plan90d: "tbr-plan-90d",
  money: "tbr-money",
  appendix: "tbr-appendix",
  evidenceCited: "tbr-evidence-cited",
} as const;

export function tbrDocxLocale(locale: string | undefined): TbrDocxLocale {
  return locale === "vi" ? "vi" : "en";
}

/**
 * Section ids + titles in v3 order (spec § 2). "Evidence cited" is listed
 * only when the document cites at least one register row (same rule as the
 * web TOC and the PDF).
 */
export function tbrDocxOutline(report: ReportV2, locale: string | undefined = report.locale): TbrDocxOutlineEntry[] {
  const loc = tbrDocxLocale(locale);
  const t = getTbrV3Strings(loc);
  const cited = citationEntries(buildCitationIndex(report)).length > 0;
  const out: TbrDocxOutlineEntry[] = [
    { id: TBR_DOCX_SECTION_IDS.dashboard, title: t.sec.dashboard, no: 1 },
    { id: TBR_DOCX_SECTION_IDS.investmentView, title: t.sec.investmentView, no: 2 },
    { id: TBR_DOCX_SECTION_IDS.keyPoints, title: t.sec.keyPoints, no: 3 },
    { id: TBR_DOCX_SECTION_IDS.valuation, title: t.sec.valuation, no: 4 },
    ...report.dimensions.map((d, i) => ({ id: TBR_DOCX_SECTION_IDS.dim(d.dim), title: loc === "vi" ? d.titleVi : d.title, no: 5 + i })),
    { id: TBR_DOCX_SECTION_IDS.riskMatrix, title: t.sec.riskMatrix, no: 13 },
    { id: TBR_DOCX_SECTION_IDS.plan90d, title: t.sec.improvementPlan, no: 14 },
    { id: TBR_DOCX_SECTION_IDS.money, title: t.sec.money, no: 15 },
    { id: TBR_DOCX_SECTION_IDS.appendix, title: t.sec.appendix, no: 16 },
  ];
  if (cited) out.push({ id: TBR_DOCX_SECTION_IDS.evidenceCited, title: citationStrings(loc).appendixTitle, no: null });
  return out;
}
