// <TbrReportV2> — renders a ReportV2 as the fixed chapter sequence from
// spec §A.1 (cover → executive → 8 dimension chapters → valuation → phase
// gates → money → action plan → appendix). Hook-free: used by the server
// /tbr/demo page and by the client TBR (`business-report-client.tsx`).
//
// The 8 dimension chapters each carry exactly one primary `svg[role=img]`
// wrapped in `[data-tbr-primary=<dim>]` — the S-R1 exit check.

import type { TbrStrings } from "@/lib/i18n/tbr-strings";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { TbrActionPlan } from "./action-plan";
import { TbrAppendix } from "./appendix";
import { TbrChapter } from "./chapter";
import { TbrCover } from "./cover";
import { TbrExecutive } from "./executive";
import { TbrMoney } from "./money";
import { TbrPhaseGates } from "./phase-gates";
import { TbrValuation } from "./valuation";
import { TBR_V2_SECTION_IDS } from "./shared";

export { TBR_V2_SECTION_IDS };

export type TbrReportV2Strings = Pick<TbrStrings, "secCover" | "secExecutive" | "secValuation" | "secPhaseGates" | "secMoney" | "secActionPlan" | "secAppendix">;

const EN: TbrReportV2Strings = {
  secCover: "Cover — Where / Worth / Next",
  secExecutive: "Executive Summary",
  secValuation: "Valuation",
  secPhaseGates: "Phase Gates — 13 Criteria × 12 Phases",
  secMoney: "Money on the Table — Grants & Programs",
  secActionPlan: "90-Day Action Plan",
  secAppendix: "Appendix — Method, Evidence & Auditor Log",
};

export interface TbrReportV2Props {
  report: ReportV2;
  strings?: Partial<TbrReportV2Strings>;
  locale?: "en" | "vi";
  upgradeHref?: string;
  /** Slot rendered after the 8 chapters (e.g. the live Action Plan widget). */
  afterChapters?: React.ReactNode;
}

export function TbrReportV2({ report, strings, locale = "en", upgradeHref, afterChapters }: TbrReportV2Props) {
  const t = { ...EN, ...strings };
  return (
    <div className="space-y-12" data-tbr-version={report.schemaVersion} data-tbr-tier={report.tier} data-tbr-source={report.source}>
      <TbrCover report={report} title={t.secCover} locale={locale} />
      <TbrExecutive report={report} title={t.secExecutive} locale={locale} />
      {report.dimensions.map((ch, i) => (
        <TbrChapter key={ch.dim} chapter={ch} index={i + 2} locale={locale} upgradeHref={upgradeHref} />
      ))}
      {afterChapters}
      <TbrValuation report={report} title={t.secValuation} />
      <TbrPhaseGates report={report} title={t.secPhaseGates} locale={locale} />
      <TbrMoney report={report} title={t.secMoney} />
      <TbrActionPlan report={report} title={t.secActionPlan} />
      <TbrAppendix report={report} title={t.secAppendix} />
    </div>
  );
}

/** TOC entries in render order (ids match the sections above). */
export function tbrV2Toc(report: ReportV2, strings?: Partial<TbrReportV2Strings>, locale: "en" | "vi" = "en"): Array<{ id: string; label: string }> {
  const t = { ...EN, ...strings };
  return [
    { id: TBR_V2_SECTION_IDS.cover, label: t.secCover },
    { id: TBR_V2_SECTION_IDS.executive, label: t.secExecutive },
    ...report.dimensions.map((d) => ({ id: TBR_V2_SECTION_IDS.dim(d.dim), label: locale === "vi" ? d.titleVi : d.title })),
    { id: TBR_V2_SECTION_IDS.valuation, label: t.secValuation },
    { id: TBR_V2_SECTION_IDS.phaseGates, label: t.secPhaseGates },
    { id: TBR_V2_SECTION_IDS.money, label: t.secMoney },
    { id: TBR_V2_SECTION_IDS.actionPlan, label: t.secActionPlan },
    { id: TBR_V2_SECTION_IDS.appendix, label: t.secAppendix },
  ];
}
