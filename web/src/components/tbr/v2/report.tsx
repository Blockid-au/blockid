// <TbrReportV2> — renders a ReportV2 as the fixed v3 sequence (G27, spec § 2):
//
//    1 Dashboard          5–12 the 8 dimension chapters (DIM_ORDER, identical anatomy)
//    2 Investment view   13 Risk matrix
//    3 Key points        14 90-day improvement plan
//    4 Valuation         15 Money on the table
//                        16 Appendix (method · phase-gate matrix · ledger · register ·
//                           audit log · disclaimers) + Evidence cited (footnotes)
//
// Hook-free: used by the server /tbr/demo page and by the client TBR
// (`business-report-client.tsx`). Every derived block (verdict band,
// conditions, key points, risk matrix, plan, takeaways, dashboard tiles) is
// computed once here from the stored document + the Assessment Card
// (`investment-view.ts` / `dashboard-view.ts`) — one evidence-confidence
// number on every surface — so stored reports render v3 without regeneration.
//
// The 8 dimension chapters each carry exactly one primary `svg[role=img]`
// wrapped in `[data-tbr-primary=<dim>]` — the S-R1 exit check.

import type { TbrLocale, TbrStrings } from "@/lib/i18n/tbr-strings";
import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { buildCitationIndex } from "@/lib/report-v2/citations";
import { citationStrings } from "@/lib/report-v2/citation-strings";
import { buildDashboardView } from "@/lib/report-v2/dashboard-view";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { investmentViewFor } from "@/lib/report-v2/investment-view";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { cn } from "@/lib/utils";
import { Fragment } from "react";
import { TbrAppendix } from "./appendix";
import type { TbrAssessmentBenchmarks } from "./assessment";
import { TbrChapter } from "./chapter";
import { TbrDashboard } from "./dashboard";
import { TbrEvidenceCited } from "./evidence-cited";
import { TbrInvestmentView, TbrKeyPoints } from "./investment-view";
import { TbrMoney } from "./money";
import { TbrImprovementPlan, TbrRiskMatrix } from "./risk-matrix";
import { TBR_SURFACE_CLASS, TBR_V2_SECTION_IDS, type TbrUiLocale } from "./shared";
import { TbrUnlockRail, type TbrUnlockMode, type TbrUnlockOrderStatus } from "./unlock-rail";
import { TbrValuation } from "./valuation";

export { TBR_V2_SECTION_IDS };
export type { TbrUnlockMode, TbrUnlockOrderStatus, TbrUiLocale, TbrAssessmentBenchmarks };

/**
 * G16-B — how the reader relates to the paid report. Given only by the
 * founder TBR page; the public /tbr/demo and share pages leave it out and
 * render the document exactly as stored.
 */
export interface TbrUnlockProps {
  mode: TbrUnlockMode;
  /** buy: open the confirm-before-charge modal (credits + A$ shown first). */
  onUnlock?: () => void;
  /** purchased: the paid `report_orders` row to open. */
  orderId?: string | null;
  /** purchased (G19-S45): pending = still being written, legacy = pre-v2 markdown order, ready = default. */
  orderStatus?: TbrUnlockOrderStatus;
  /** included: where the plan-included report generates. */
  generateHref?: string;
}

/** Section titles the shell may override (kept for the founder page's `strings` prop; v3 titles come from tbr-v3-strings). */
export type TbrReportV2Strings = Pick<TbrStrings, "secCover" | "secExecutive" | "secValuation" | "secPhaseGates" | "secMoney" | "secActionPlan" | "secAppendix">;

export interface TbrReportV2Props {
  report: ReportV2;
  strings?: Partial<TbrReportV2Strings>;
  /** G19-S45: the UI locale the shell offers (EN / VI / ES / JA); chapter titles use titleVi for VI, English otherwise. */
  locale?: TbrLocale;
  upgradeHref?: string;
  /**
   * Slot rendered after the 8 chapters — the live Action Plan widget. G19-S44:
   * ONE to-do list per report, so the slot renders only when the document's
   * own 90-day plan (section 14) is empty.
   */
  afterChapters?: React.ReactNode;
  /** G19-S45 (D6): slot rendered right after the Investment view (the clarity survey on paid + share views). */
  afterExecutive?: React.ReactNode;
  /**
   * G16-B: on a FREE document, `mode: "buy"` turns every card chapter into a
   * locked preview and renders ONE unlock rail after the first of them;
   * `included` / `purchased` render the card chapters in full and place the
   * rail after the last chapter. Omitted → cards + link, no rail.
   */
  unlock?: TbrUnlockProps | null;
  /**
   * G21-P1-B: benchmark lines for the dashboard (`total`) and the chapters
   * (`dims`) — always with `n` and P1-C's publication label. Omitted → the
   * chapter's own stored n decides (never computed here).
   */
  benchmarks?: TbrAssessmentBenchmarks;
  /** G21 P1 post-ship review: whether the viewer can file a correction (founder workspace only). */
  canCorrect?: boolean;
}

/** The v3 section titles for a UI locale (EN / VI; ES / JA read EN). */
export function tbrV3SectionTitles(locale: TbrLocale = "en") {
  return getTbrV3Strings(locale).sec;
}

export function TbrReportV2({ report: rawReport, locale = "en", upgradeHref, afterChapters, afterExecutive, unlock, benchmarks, canCorrect = false }: TbrReportV2Props) {
  const t = tbrV3SectionTitles(locale);
  // One evidence-confidence number: the card is built once and the verdict,
  // the tiles and the chapters all read the same value (review P1, 2026-09-20).
  const aligned = alignReportWithAssessmentCard(rawReport, {
    benchmark: benchmarks?.total ?? null,
    evidenceConfidence: benchmarks?.evidenceConfidence ?? null,
    unverifiedMaterialClaims: benchmarks?.unverifiedMaterialClaims ?? null,
  });
  const report = ensureExecutiveStructured(aligned.report);
  const structured = report.executive.structured!;
  const view = investmentViewFor(report, aligned.card, locale);
  const dashboard = buildDashboardView(report, aligned.card, view, locale, benchmarks?.dims);
  const free = report.tier === "free";
  const lockCards = free && unlock?.mode === "buy";
  const forceFull = free && Boolean(unlock) && unlock?.mode !== "buy";
  const paid = !free || forceFull;
  const railFor = (mode: TbrUnlockMode) => (
    <TbrUnlockRail mode={mode} chapterCount={report.dimensions.length} onUnlock={unlock?.onUnlock} orderId={unlock?.orderId} orderStatus={unlock?.orderStatus} generateHref={unlock?.generateHref} locale={locale} />
  );
  // The rail goes right after the FIRST locked chapter; when nothing is
  // locked (included / purchased / no card chapter) it follows the last one.
  const firstLockedIdx = lockCards ? report.dimensions.findIndex((ch) => ch.renderAs === "card") : -1;
  const railAfterIdx = free && unlock ? (firstLockedIdx >= 0 ? firstLockedIdx : report.dimensions.length - 1) : -1;
  // G24-A: one footnote numbering per document, pre-walked in reading order.
  const citations = buildCitationIndex(report);
  return (
    <div className={cn("space-y-12", TBR_SURFACE_CLASS)} data-tbr-version={report.schemaVersion} data-tbr-layout="v3" data-tbr-tier={report.tier} data-tbr-source={report.source} data-tbr-unlock={free && unlock ? unlock.mode : undefined} data-tbr-band={view.band}>
      <TbrDashboard report={report} view={dashboard} title={t.dashboard} locale={locale} />
      <TbrInvestmentView report={report} view={view} structured={structured} title={t.investmentView} locale={locale} citations={citations} />
      {afterExecutive}
      <TbrKeyPoints view={view} title={t.keyPoints} locale={locale} />
      <TbrValuation report={report} title={t.valuation} locale={locale} citations={citations} investment={view} />
      {report.dimensions.map((ch, i) => (
        <Fragment key={ch.dim}>
          <TbrChapter
            chapter={ch}
            index={i + 5}
            locale={locale}
            verificationLevel={report.cover.verification?.level ?? null}
            upgradeHref={upgradeHref}
            locked={Boolean(lockCards) && ch.renderAs === "card"}
            forceFull={forceFull}
            citations={citations}
            takeaway={view.takeaways[ch.dim]}
            benchmarkN={benchmarks?.dims?.[ch.dim]?.n ?? null}
            paid={paid}
          />
          {i === railAfterIdx && unlock && railFor(unlock.mode)}
        </Fragment>
      ))}
      <TbrRiskMatrix report={report} view={view} title={t.riskMatrix} locale={locale} />
      <TbrImprovementPlan report={report} view={view} title={t.improvementPlan} locale={locale} />
      {view.improvementPlan.length === 0 ? afterChapters : null}
      <TbrMoney report={report} title={t.money} locale={locale} />
      <TbrAppendix report={report} title={t.appendix} locale={locale} canCorrect={canCorrect} />
      <TbrEvidenceCited citations={citations} locale={locale} />
    </div>
  );
}

export interface TbrTocEntry {
  id: string;
  label: string;
}

/** TOC entries in render order (ids match the sections above). */
export function tbrV2Toc(report: ReportV2, _strings?: Partial<TbrReportV2Strings>, locale: TbrLocale = "en"): TbrTocEntry[] {
  const g = tbrV2TocGroups(report, locale);
  return [...g.overview, ...g.dimensions, ...g.closing];
}

/** The same entries grouped the way the founder shell lists them: overview (1–4) · dimensions (5–12) · closing (13–16). */
export function tbrV2TocGroups(report: ReportV2, locale: TbrLocale = "en"): { overview: TbrTocEntry[]; dimensions: TbrTocEntry[]; closing: TbrTocEntry[] } {
  const t = tbrV3SectionTitles(locale);
  // G24-A: the footnote list is a section only when the document cites something.
  const cited = buildCitationIndex(report).size > 0 ? [{ id: TBR_V2_SECTION_IDS.evidenceCited, label: citationStrings(locale).appendixTitle }] : [];
  return {
    overview: [
      { id: TBR_V2_SECTION_IDS.dashboard, label: t.dashboard },
      { id: TBR_V2_SECTION_IDS.investmentView, label: t.investmentView },
      { id: TBR_V2_SECTION_IDS.keyPoints, label: t.keyPoints },
      { id: TBR_V2_SECTION_IDS.valuation, label: t.valuation },
    ],
    dimensions: report.dimensions.map((d) => ({ id: TBR_V2_SECTION_IDS.dim(d.dim), label: locale === "vi" ? d.titleVi : d.title })),
    closing: [
      { id: TBR_V2_SECTION_IDS.riskMatrix, label: t.riskMatrix },
      { id: TBR_V2_SECTION_IDS.plan90d, label: t.improvementPlan },
      { id: TBR_V2_SECTION_IDS.money, label: t.money },
      { id: TBR_V2_SECTION_IDS.appendix, label: t.appendix },
      ...cited,
    ],
  };
}
