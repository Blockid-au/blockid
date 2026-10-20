// Server-side tier projection — G35 Pricing v5 wave P2 (docs/pricing-v5-plan.md
// §6.5, closes gap G6).
//
// Until P2 the free cut was made in the BROWSER: `GET /api/svi/report/[id]`
// handed the whole stored ReportV2 to the client and `report.tsx` decided
// which chapters to lock, so every locked chapter body sat in the JSON
// payload. Only the PDF / DOCX twins projected server-side (`free-tier.ts`).
// This module is the one cut every read path applies BEFORE serialising:
//
//   free      today's free semantics, identical on screen: the chapters whose
//             owner says `freeTier: "card"` (cgh, iri, lco, svm) keep only
//             what the compact / locked card renders — header metadata
//             (score, band, weight, benchmark), the verdict ≤ 40 words, the
//             primary visual, the takeaway, the next action — and lose their
//             BODIES (criterion verdicts / bullets / analysis / citations,
//             chapter strengths, secondary visuals, module outputs, evidence
//             values, ledger signal labels). tre / mpc / ftv / ptd stay full.
//   snapshot  Executive Summary, SVI + the 8-dimension radar data (cover dims,
//             chapter scores / bands / benchmarks), top 3 strengths + top 3
//             risks, evidence-confidence %, and an `upgrade` CTA marker.
//             Every chapter is metadata-only; valuation, risk matrix, plan,
//             money, appendix detail and key points are removed.
//   full      everything (all 16 sections) — the stored document, untouched.
//   verified  = full (the review badge is order / report metadata).
//
// One stored document, many projections: an upgrade (Snapshot → Full, Full →
// Verified) is a different projection of the SAME stored report — never a
// regeneration (plan §6.4.4).
//
// Derived blocks (investment view, risk matrix, improvement plan, takeaways)
// are computed from the FULL document before the cut and stored on the
// payload (`ensureInvestmentView`), so the free page renders exactly what it
// rendered before even though the bodies they were computed from are gone.
//
// Pure: no I/O. Client-safe (no server-only import), but only servers call it.

import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { assessmentCardFromReport, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { ensureInvestmentView, investmentLocale, takeawayFor } from "./investment-view";
import type { CriterionCard, DimensionChapter, InvestmentView, ReportAccessTier, ReportProjection, ReportV2, UnavailableValuationChapter } from "./schema";

export type { ReportAccessTier, ReportProjection };

export const REPORT_ACCESS_TIERS: readonly ReportAccessTier[] = ["free", "snapshot", "full", "verified"];

const TIER_RANK: Record<ReportAccessTier, number> = { free: 0, snapshot: 1, full: 2, verified: 3 };

export function isReportAccessTier(value: unknown): value is ReportAccessTier {
  return typeof value === "string" && (REPORT_ACCESS_TIERS as readonly string[]).includes(value);
}

/** The highest of the given tiers (nullish ignored); `fallback` when none is given. */
export function maxTier(tiers: ReadonlyArray<ReportAccessTier | null | undefined>, fallback: ReportAccessTier = "free"): ReportAccessTier {
  let best: ReportAccessTier | null = null;
  for (const t of tiers) if (t && (!best || TIER_RANK[t] > TIER_RANK[best])) best = t;
  return best ?? fallback;
}

/**
 * The fixed v3 section sequence (report.tsx): 1–4 overview, 5–12 the eight
 * dimension chapters, 13–16 closing. Ids are projection vocabulary (not DOM ids).
 */
export const PROJECTION_SECTION_IDS = {
  dashboard: "dashboard",
  investmentView: "investment_view",
  keyPoints: "key_points",
  valuation: "valuation",
  dim: (dim: DimKey) => `chapter:${dim}`,
  riskMatrix: "risk_matrix",
  improvementPlan: "improvement_plan",
  money: "money_on_the_table",
  appendix: "appendix",
} as const;

/** All 16 report sections in render order. */
export function reportSectionIds(): string[] {
  const s = PROJECTION_SECTION_IDS;
  return [s.dashboard, s.investmentView, s.keyPoints, s.valuation, ...DIM_ORDER.map((d) => s.dim(d)), s.riskMatrix, s.improvementPlan, s.money, s.appendix];
}

/** Sections a payload actually carries in full (16 for full / verified). */
export function availableSections(report: Pick<ReportV2, "projection">): string[] {
  const locked = new Set(report.projection?.lockedSections ?? []);
  return reportSectionIds().filter((id) => !locked.has(id));
}

/** Dimensions the free tier serves as cards (owner `freeTier: "card"`). */
export const FREE_CARD_DIMS: readonly DimKey[] = DIM_ORDER.filter((d) => DIMENSION_OWNERS[d].freeTier === "card");

/** Ledger signal label on a locked chapter (the schema needs a non-empty string). */
export const LOCKED_SIGNAL_LABEL = "In the full report";

const words = (s: string, n: number): string => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length <= n ? s.trim() : `${parts.slice(0, n).join(" ")}…`;
};

/** A criterion card reduced to what a locked row shows (key, title, score, quality) — no finding, bullets or citations. */
function criterionStub(c: CriterionCard): CriterionCard {
  return { key: c.key, title: c.title, score: c.score, quality: c.quality, verdict: "", strengths: [], gaps: [], nextAction: "", citations: [], grounded: c.grounded, agent: c.agent };
}

/**
 * The chapter body removed; header metadata kept. `card` = the free card
 * (verdict ≤ 40 words, primary visual, takeaway line, next action);
 * `metadata` = Snapshot (scores only). Gap / criterion text is gone from the
 * chapter — the derived blocks that quote it (risk matrix, plan, takeaways)
 * were computed before the cut and travel in `investmentView`.
 */
function lockChapter(ch: DimensionChapter, mode: "card" | "metadata"): DimensionChapter {
  const card = mode === "card";
  const out: DimensionChapter = {
    ...ch,
    renderAs: "card",
    verdict: card ? words(ch.verdict, 40) : "",
    secondaryVisuals: [],
    criteria: ch.criteria.map(criterionStub),
    strengths: [],
    gaps: [],
    evidence: ch.evidence.map(({ value: _value, ...row }) => row),
    modules: [],
    nextAction: card ? ch.nextAction : { title: "", window: ch.nextAction.window, expectedLift: 0 },
    phaseLens: card ? ch.phaseLens : { ...ch.phaseLens, whatMattersNow: "" },
    // Points + source stay (the Assessment Card's evidence confidence reads them); the label is the body.
    ...(ch.scoreBreakdown ? { scoreBreakdown: { ...ch.scoreBreakdown, signals: ch.scoreBreakdown.signals.map((s) => ({ ...s, signal: LOCKED_SIGNAL_LABEL })) } } : {}),
  };
  if (!card) delete out.investorTakeaway;
  return out;
}

const s = PROJECTION_SECTION_IDS;

/** Free: the card chapters lose their bodies; everything else is today's free document. */
function projectFree(source: ReportV2, opts: TierProjectionOptions): ReportV2 {
  const report = ensureInvestmentView(source, opts.assessment);
  const lockedDims = report.dimensions.filter((ch) => FREE_CARD_DIMS.includes(ch.dim)).map((ch) => ch.dim);
  const locked = new Set<DimKey>(lockedDims);
  const lockedCriteria = new Set(report.dimensions.filter((ch) => locked.has(ch.dim)).flatMap((ch) => ch.criteria.map((c) => c.key as string)));
  const projection: ReportProjection = {
    tier: "free",
    lockedSections: lockedDims.map((d) => s.dim(d)),
    lockedDims,
    upgrade: { to: "full", sku: "report_full" },
  };
  return {
    ...report,
    // A non-free stored document (e.g. the deck analyser's uncharged
    // "standard" snapshot, G16 P1-2) is served at the free cut too.
    tier: "free",
    dimensions: report.dimensions.map((ch) => (locked.has(ch.dim) ? lockChapter(ch, "card") : { ...ch, renderAs: "full" as const })),
    quality: {
      ...report.quality,
      consistencyIssues: report.quality.consistencyIssues.map((i) =>
        i.criteria.some((k) => lockedCriteria.has(k)) ? { type: i.type, severity: i.severity, description: "", criteria: i.criteria } : i,
      ),
    },
    appendix: {
      ...report.appendix,
      auditLog: report.appendix.auditLog.map((r) => (lockedCriteria.has(r.sectionId) ? { ...r, uncitedClaims: [], findings: [] } : r)),
    },
    projection,
  };
}

/** The derived view without anything quoted from a chapter body; takeaways re-derived from the stripped chapters (score / band templates). */
function snapshotInvestmentView(view: InvestmentView, chapters: readonly DimensionChapter[]): InvestmentView {
  const locale = investmentLocale(view.locale);
  return {
    ...view,
    conditions: [],
    keyPoints: [],
    riskMatrix: [],
    improvementPlan: [],
    whatMovesIt: [],
    takeaways: Object.fromEntries(chapters.map((ch) => [ch.dim, takeawayFor(ch, locale)])) as InvestmentView["takeaways"],
  };
}

/** Snapshot: executive summary + scores + top 3 / top 3 + evidence confidence; every body removed. */
function projectSnapshot(source: ReportV2, opts: TierProjectionOptions): ReportV2 {
  const report = ensureInvestmentView(source, opts.assessment);
  const card = assessmentCardFromReport(report, opts.assessment ?? {});
  const view = report.investmentView!;
  const x = report.executive.structured;
  const plain = (t: string) => t.replace(/\[(?:ev:[^\]]*|unevidenced)\]/g, "").replace(/\s+/g, " ").trim();
  const valuation: UnavailableValuationChapter = {
    status: "unavailable",
    reason: "tier_locked",
    missingInputs: [],
    currency: "AUD",
    narrative: "The valuation chapter is part of the Full report.",
    audit: report.valuation.audit,
    visuals: [],
  };
  const projection: ReportProjection = {
    tier: "snapshot",
    lockedSections: [s.keyPoints, s.valuation, ...DIM_ORDER.map((d) => s.dim(d)), s.riskMatrix, s.improvementPlan, s.money, s.appendix],
    lockedDims: [...DIM_ORDER],
    upgrade: { to: "full", sku: "upgrade_snapshot_full" },
    evidenceConfidence: Math.max(0, Math.min(100, Math.round(card.evidenceConfidence))),
    highlights: {
      strengths: view.reasons.slice(0, 3).map((p) => plain(p.text)),
      risks: view.risks.slice(0, 3).map((p) => plain(p.text)),
    },
  };
  const dimensions = report.dimensions.map((ch) => lockChapter(ch, "metadata"));
  return {
    ...report,
    tier: "free",
    cover: { ...report.cover, threeQuestions: { ...report.cover.threeQuestions, worth: "" } },
    executive: {
      ...report.executive,
      strengths: report.executive.strengths.slice(0, 3),
      gaps: report.executive.gaps.slice(0, 3),
      ...(x ? { structured: { ...x, reasonsToBack: x.reasonsToBack.slice(0, 3), criticalGaps: x.criticalGaps.slice(0, 3), actions: [] } } : {}),
    },
    dimensions,
    valuation,
    phaseGates: { current: report.phaseGates.current, matrix: [], blockers: [], visuals: [] },
    moneyOnTable: { grants: [], programs: [], totalAud: 0, visuals: [] },
    actionPlan: { horizonDays: 90, steps: [], visuals: [], evidenceToAdd: [] },
    appendix: {
      method: report.appendix.method,
      dataPrinciple: report.appendix.dataPrinciple,
      disclaimer: report.appendix.disclaimer,
      evidenceRegister: [],
      auditLog: [],
      comparablesN: report.appendix.comparablesN,
      comparablesWithMultiplesN: report.appendix.comparablesWithMultiplesN,
      sourcesDated: [],
    },
    quality: { ...report.quality, consistencyIssues: [] },
    investmentView: snapshotInvestmentView(view, dimensions),
    projection,
  };
}

export interface TierProjectionOptions {
  /**
   * The Assessment Card context the page renders with (stored evidence
   * confidence, benchmark, unverified claims). Pass the same options the
   * renderer gets so the stored investment view matches and is reused.
   */
  assessment?: AssessmentCardOptions;
}

/**
 * The stored report cut to what `tier` may see. `full` / `verified` return
 * the SAME object (nothing is removed); `free` / `snapshot` return a new
 * document carrying `projection` metadata. Idempotent: projecting an already
 * projected payload at the same tier changes nothing a reader can see.
 */
export function projectReportForTier(report: ReportV2, tier: ReportAccessTier, opts: TierProjectionOptions = {}): ReportV2 {
  if (tier === "full" || tier === "verified") return report;
  return tier === "snapshot" ? projectSnapshot(report, opts) : projectFree(report, opts);
}

/**
 * Share / email readers know no buyer: a stored document is served at the
 * tier it was generated for — `free` documents at the free cut, anything
 * generated for a paying caller (standard / premium / investor memo) in full.
 */
export function tierForStoredDocument(report: Pick<ReportV2, "tier">): ReportAccessTier {
  return report.tier === "free" ? "free" : "full";
}

// ── Persisted v1 state (dim_results / criterion_results) ───────────────────

interface PersistedDimLike {
  markdown: string | null;
  insights: string[];
}
interface PersistedCriterionLike {
  primary_dimension: string;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
}
export interface PersistedStateLike {
  dimStates: Record<string, PersistedDimLike>;
  criterionStates?: PersistedCriterionLike[] | null;
}

/**
 * The v1 snapshot state the TBR page lifts through the adapter when no
 * ReportV2 is stored — same cut: free strips the card dimensions' narrative
 * (markdown → its first 40 words, insights, criterion findings), snapshot
 * strips every dimension. full / verified: unchanged (same object).
 */
export function projectPersistedForTier<T extends PersistedStateLike>(state: T, tier: ReportAccessTier): T {
  if (tier === "full" || tier === "verified") return state;
  const locked = new Set<string>(tier === "snapshot" ? DIM_ORDER : FREE_CARD_DIMS);
  const dimStates = Object.fromEntries(
    Object.entries(state.dimStates).map(([k, d]) => [
      k,
      locked.has(k) ? { ...d, markdown: tier === "snapshot" || !d.markdown ? null : words(d.markdown, 40), insights: [] } : d,
    ]),
  ) as T["dimStates"];
  const criterionStates = state.criterionStates
    ? state.criterionStates.map((c) => (locked.has(String(c.primary_dimension).toLowerCase()) ? { ...c, verdict: "", strengths: [], gaps: [], next_action: "" } : c))
    : state.criterionStates;
  return { ...state, dimStates, ...(state.criterionStates !== undefined ? { criterionStates } : {}) };
}

// ── Guard helper (tests + defensive checks) ────────────────────────────────

/**
 * Paths of locked-section body content still present in a projected payload
 * (empty = clean). Walks the chapters `projection.lockedDims` names and, for
 * a snapshot, the closing sections.
 */
export function lockedBodyLeaks(report: ReportV2): string[] {
  const p = report.projection;
  if (!p) return [];
  const leaks: string[] = [];
  const lockedDims = new Set(p.lockedDims);
  for (const ch of report.dimensions) {
    if (!lockedDims.has(ch.dim)) continue;
    const at = `dimensions.${ch.dim}`;
    if (ch.strengths.length) leaks.push(`${at}.strengths`);
    if (ch.secondaryVisuals.length) leaks.push(`${at}.secondaryVisuals`);
    if (ch.modules.length) leaks.push(`${at}.modules`);
    if (ch.evidence.some((e) => e.value !== undefined)) leaks.push(`${at}.evidence.value`);
    if (ch.scoreBreakdown?.signals.some((sg) => sg.signal !== LOCKED_SIGNAL_LABEL)) leaks.push(`${at}.scoreBreakdown.signals.signal`);
    if (ch.verdict.trim().split(/\s+/).filter(Boolean).length > 40) leaks.push(`${at}.verdict`);
    ch.criteria.forEach((c, i) => {
      if (c.verdict || c.strengths.length || c.gaps.length || c.nextAction || c.citations.length) leaks.push(`${at}.criteria.${i}`);
      if (c.detailedAnalysis || c.researchCoverage) leaks.push(`${at}.criteria.${i}.analysis`);
    });
    if (p.tier === "snapshot" && (ch.verdict || ch.gaps.length || ch.nextAction.title || ch.investorTakeaway)) leaks.push(`${at}.summary`);
  }
  if (p.tier === "snapshot") {
    if (report.valuation.status !== "unavailable") leaks.push("valuation");
    if (report.moneyOnTable.grants.length || report.moneyOnTable.programs.length) leaks.push("moneyOnTable");
    if (report.actionPlan.steps.length || report.actionPlan.evidenceToAdd?.length) leaks.push("actionPlan");
    if (report.phaseGates.matrix.length || report.phaseGates.blockers.length) leaks.push("phaseGates");
    if (report.appendix.evidenceRegister.length || report.appendix.auditLog.length || report.appendix.publicResearch || report.appendix.marketResearch) leaks.push("appendix");
    const v = report.investmentView;
    if (v && (v.riskMatrix.length || v.improvementPlan.length || v.keyPoints.length || v.conditions.length)) leaks.push("investmentView");
  }
  return leaks;
}
