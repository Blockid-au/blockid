// Executive synthesis for /dashboard — G19-S44 (§0 row 4).
//
// A pure projection of the latest stored `svi_snapshots.report_v2` into the
// six things a founder asks first: Where (phase + one sentence), Worth (A$
// range + confidence), top-3 strengths, top-3 weaknesses, follow-ups (the
// 90-day plan's top-3 steps by lift) and data to add (the plan's top-3
// evidence CTAs, S43). NO new computation: every number is read from the
// report, so the dashboard and the TBR can never disagree (the colocated
// test compares the block props to the demo fixture).
//
// Client-safe, no I/O — the loader is `landing-data.ts:loadLatestReportV2`.

import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { GROWTH_PHASE_LABELS, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { coverHero } from "@/lib/report-v2/cover-hero";
import type { ActionStep, EvidenceRow, ReportV2 } from "@/lib/report-v2/schema";

/** The founder's report page (the same document the synthesis was read from). */
export const EXECUTIVE_SYNTHESIS_REPORT_HREF = "/workspace/reports/business";

export interface SynthesisFollowUp {
  title: string;
  day: 30 | 60 | 90;
  lift: number;
  dimension: string;
}

export interface SynthesisDataToAdd {
  label: string;
  /** Internal href from the S43 CTA row; the Evidence Hub when the row carries none. */
  href: string;
  lift: number | null;
  dims: string[];
}

export interface ExecutiveSynthesisData {
  reportId: string;
  snapshotId: string;
  generatedAt: string;
  /** From the report's own tier — a free document synthesises the free chapters only, and the block says so through the CTA. */
  tier: ReportV2["tier"];
  where: { phaseId: GrowthPhaseId; phaseLabel: string; sentence: string };
  worth: { pending: boolean; headline: string; subline: string; lowAud: number; highAud: number; confidencePct: number };
  svi: { total: number; band: ReportV2["cover"]["svi"]["band"]; deltaVsLast: number | null };
  strengths: string[];
  weaknesses: string[];
  followUps: SynthesisFollowUp[];
  dataToAdd: SynthesisDataToAdd[];
  reportHref: string;
}

/**
 * S43 lands `actionPlan.evidenceToAdd: EvidenceRow[]` with `cta {label, href,
 * lift}` on `missing` rows. Read structurally so a document stored before
 * S43 (or a build where the field is not yet in the contract) degrades to
 * an empty list instead of a type error.
 */
type EvidenceRowWithCta = EvidenceRow & { cta?: { label?: string; href?: string; lift?: number } };
function evidenceToAddOf(report: ReportV2): EvidenceRowWithCta[] {
  const plan = report.actionPlan as ReportV2["actionPlan"] & { evidenceToAdd?: unknown };
  return Array.isArray(plan.evidenceToAdd) ? (plan.evidenceToAdd as EvidenceRowWithCta[]) : [];
}

/** Top-N plan steps by expected lift (ties: earlier day first) — the same numbers chapter 13 prints. */
export function topFollowUps(steps: readonly ActionStep[], n = 3): SynthesisFollowUp[] {
  return [...steps]
    .sort((a, b) => b.expectedLift - a.expectedLift || a.day - b.day)
    .slice(0, n)
    .map((s) => ({ title: s.title, day: s.day, lift: s.expectedLift, dimension: s.dimension }));
}

export function synthesisFromReport(report: ReportV2, locale: TbrLocale | undefined = "en"): ExecutiveSynthesisData {
  const hero = coverHero(report, locale);
  const phaseId = report.cover.phaseId;
  const phaseLabel = GROWTH_PHASE_LABELS[phaseId][locale === "vi" ? "vi" : "en"];
  const dataToAdd: SynthesisDataToAdd[] = evidenceToAddOf(report)
    .filter((r) => r.status === "missing" || r.cta)
    .slice(0, 3)
    .map((r) => ({
      label: r.cta?.label?.trim() || r.label,
      href: r.cta?.href?.trim() || "/workspace/evidence",
      lift: typeof r.cta?.lift === "number" && Number.isFinite(r.cta.lift) ? r.cta.lift : null,
      dims: r.dims,
    }));
  return {
    reportId: report.reportId,
    snapshotId: report.snapshotId,
    generatedAt: report.generatedAt,
    tier: report.tier,
    where: { phaseId, phaseLabel, sentence: report.cover.threeQuestions.where },
    worth: { pending: hero.pending, headline: hero.headline, subline: hero.subline, lowAud: hero.lowAud, highAud: hero.highAud, confidencePct: hero.confidencePct },
    svi: { total: report.cover.svi.total, band: report.cover.svi.band, deltaVsLast: report.cover.svi.deltaVsLast },
    strengths: report.executive.strengths.slice(0, 3),
    weaknesses: report.executive.gaps.slice(0, 3),
    followUps: topFollowUps(report.actionPlan.steps, 3),
    dataToAdd,
    reportHref: EXECUTIVE_SYNTHESIS_REPORT_HREF,
  };
}

/** The block's labels in the founder's UI locale (EN / VI; ES / JA read EN). */
export function synthesisStrings(locale: TbrLocale | undefined) {
  return getTbrStrings(locale).v2.s44.dashboard;
}
