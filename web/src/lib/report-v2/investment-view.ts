// investment-view — G27: the deterministic investor-grade layer over a
// ReportV2 (docs/design/tbr-v3-investor-report-spec.md § 4). Pure derivation
// from the stored document + the Assessment Card, so every stored report
// renders v3 on read with no pipeline change and no migration.
//
//   buildInvestmentView(report, card, locale)
//     → verdict band A–D (first-match rubric), conviction, conditions in the
//       fixed order, 3 reasons / 3 risks, 5 key points, risk matrix
//       (likelihood × impact), 90-day plan ranked by lift ÷ effort, per-
//       dimension investor takeaways, "what moves the valuation", and the
//       CEO agent's own label as "Analyst synthesis" when it disagrees.
//   ensureInvestmentView(report, opts)
//     → the same document with `investmentView` present (aligned with the
//       Assessment Card so EC is the one number on every surface).
//   investmentViewFor(report, card, locale)
//     → the stored block when it matches the locale, else a fresh build
//       (the web renders in the UI locale, which may differ from the stored one).
//
// Never-say safe by construction: every string comes from
// `lib/i18n/tbr-v3-strings.ts`; benchmark deltas print only with n ≥ 10
// (`publication-rules.ts`); lifts are printed as the catalogue gives them.
// Pure: no I/O, no React, client-safe.

import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { hasCitationOrMarker, isMaterialClaim } from "@/lib/report-pipeline/claim-gate";
import { aud } from "@/lib/report-visuals/svg";
import { bandFor } from "@/lib/report-visuals/palette";
import type { Band } from "@/lib/report-visuals/types";
import { derivedLift } from "@/lib/svi-lift";
import { alignReportWithAssessmentCard, type AssessmentCardData, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import { stripCitationMarkers } from "./citations";
import { coverValuationPending } from "./cover-hero";
import { ensureExecutiveStructured } from "./executive-structure";
import type {
  ActionWindow,
  DimensionChapter,
  EvidenceCta,
  ExecutiveVerdictLabel,
  ImprovementStep,
  InvestmentBand,
  InvestmentCondition,
  InvestmentConviction,
  InvestmentPoint,
  InvestmentView,
  ReportV2,
  RiskLevel,
  RiskMatrixRow,
} from "./schema";

export type InvestmentLocale = "en" | "vi";

/** Effort per action window (spec § 4.5). */
export const WINDOW_EFFORT: Record<ActionWindow, 1 | 2 | 3> = { this_week: 1, "30d": 2, "90d": 3 };
/** Impact tiers on `weight/100 × max(0, p50 − score)` (spec § 4.4). */
export const IMPACT_HIGH = 6;
export const IMPACT_MEDIUM = 2;
/** Conviction tiers on evidence confidence (spec § 4). */
export const CONVICTION_MEDIUM = 50;
export const CONVICTION_HIGH = 70;
/** Row caps: the builder keeps ≤ 8 risk rows and ≤ 10 plan steps; the free projection trims further. */
export const RISK_ROWS_MAX = 8;
export const PLAN_STEPS_MAX = 10;
export const RISK_ROWS_FREE = 5;
export const PLAN_STEPS_FREE = 5;

/** A ↔ back, B ↔ back_with_conditions, C ↔ watch / not_yet, D ↔ not_yet (spec § 4). */
export const BAND_TO_EXECUTIVE: Record<InvestmentBand, readonly ExecutiveVerdictLabel[]> = {
  A: ["back"],
  B: ["back_with_conditions"],
  C: ["watch", "not_yet"],
  D: ["not_yet"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function investmentLocale(locale: string | undefined): InvestmentLocale {
  return locale === "vi" ? "vi" : "en";
}

/** Localised short dimension name for a sentence ("Traction & Revenue" / the VI chapter title). */
export function dimName(dim: DimKey, locale: InvestmentLocale): string {
  const o = DIMENSION_OWNERS[dim];
  return locale === "vi" ? o.titleVi : o.shortLabel;
}

export function isAssessed(ch: Pick<DimensionChapter, "band" | "scoreBreakdown">): boolean {
  return ch.scoreBreakdown ? ch.scoreBreakdown.assessed : ch.band !== "pending";
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

function words(s: string, max: number): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length <= max ? s.trim() : `${parts.slice(0, max).join(" ")}…`;
}

/** Marker-free, single-spaced, no trailing period — for a clause inside a template. */
function clause(text: string, max = 14): string {
  const clean = stripCitationMarkers(text).replace(/\s+/g, " ").trim().replace(/[.;:]+$/u, "");
  return words(clean, max);
}

function normTitle(text: string): string {
  return stripCitationMarkers(text).trim().toLowerCase().replace(/[.;:,\s]+$/u, "");
}

/** The benchmark n a chapter may publish against (null below the floor / absent). */
function publishedN(ch: DimensionChapter): number | null {
  const n = ch.benchmark.n;
  return typeof n === "number" && mayShowPercentile(n) ? n : null;
}

/** Σ weight × score over assessed dims, renormalised; null when nothing is assessed. */
export function compositeScore(chapters: readonly DimensionChapter[]): number | null {
  let w = 0;
  let acc = 0;
  for (const ch of chapters) {
    if (!isAssessed(ch)) continue;
    w += ch.weight;
    acc += ch.weight * ch.score;
  }
  return w > 0 ? Math.round(acc / w) : null;
}

/** Likelihood = the dimension's evidence status (missing → high, partial / stale → medium, evidenced → low). */
export function dimLikelihood(ch: Pick<DimensionChapter, "evidence">): RiskLevel {
  if (ch.evidence.some((e) => e.status === "evidenced")) return "low";
  if (ch.evidence.some((e) => e.status === "partial" || e.status === "stale")) return "medium";
  return "high";
}

/** Impact tier on weight/100 × max(0, p50 − score). */
export function dimImpact(ch: Pick<DimensionChapter, "weight" | "score" | "benchmark">): RiskLevel {
  const v = (ch.weight / 100) * Math.max(0, ch.benchmark.p50 - ch.score);
  return v >= IMPACT_HIGH ? "high" : v >= IMPACT_MEDIUM ? "medium" : "low";
}

const LEVEL_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

export function convictionFor(ec: number): InvestmentConviction {
  return ec >= CONVICTION_HIGH ? "high" : ec >= CONVICTION_MEDIUM ? "medium" : "low";
}

/**
 * Every gap a chapter carries: its own bullets first, then the criterion
 * cards' (the adapter keeps chapter-level bullets only where they add to the
 * cards, so the cards hold most of them), de-duplicated, marker-free.
 */
export function chapterGaps(ch: Pick<DimensionChapter, "gaps" | "criteria">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of [...ch.gaps, ...ch.criteria.flatMap((c) => c.gaps)]) {
    const key = normTitle(g);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** First letter lower-cased unless the first word is an acronym / code ("MRR", "A$1.2M"). */
function lowerFirst(s: string): string {
  const first = s.split(/\s/)[0] ?? "";
  if (/^[A-Z0-9$&][A-Z0-9$&.,-]*$/.test(first) && first.length > 1) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Top gap clause for a chapter: first gap → nextAction title → "" (marker-free, ≤ 14 words, sentence-internal). */
function topGapClause(ch: DimensionChapter): string {
  const g = chapterGaps(ch)[0];
  const text = g ? clause(g) : clause(ch.nextAction.title);
  return text ? lowerFirst(text) : "";
}

/** The deterministic takeaway line (spec § 4.3); an LLM line wins only when it passes the claim gate. */
export function takeawayFor(ch: DimensionChapter, locale: InvestmentLocale, t: TbrV3Strings = getTbrV3Strings(locale)): string {
  const llm = ch.investorTakeaway?.trim();
  if (llm && llm.split(/\s+/).length <= 25) {
    const ids = ch.evidence.map((e) => e.evidence_id);
    if (!isMaterialClaim(llm) || hasCitationOrMarker(llm, ids)) return llm;
  }
  const name = dimName(ch.dim, locale);
  if (!isAssessed(ch) || ch.band === "pending") return t.takeawayPending(name);
  const gap = topGapClause(ch) || name;
  if (ch.band === "strong") {
    const n = publishedN(ch);
    return n === null ? t.takeawayStrongNoBench(name, ch.score) : t.takeawayStrong(name, ch.score, signed(ch.score - ch.benchmark.p50), n);
  }
  if (ch.band === "developing") return t.takeawayDeveloping(name, ch.score, gap);
  return t.takeawayEarly(name, gap);
}

// ── Rubric ───────────────────────────────────────────────────────────────────

export interface RubricInputs {
  ec: number;
  pending: number;
  band: Band;
  floorMisses: number;
  blockers: number;
  unverified: number;
  ask: "aligned" | "above_consensus" | "below_consensus" | null;
}

/** First match wins (spec § 4). Returns the band + the rule that fired. */
export function verdictBand(i: RubricInputs): { band: InvestmentBand; rule: string } {
  if (i.pending >= 3) return { band: "D", rule: "D:pending" };
  if (i.ec < 30) return { band: "D", rule: "D:ec" };
  if (i.band === "early") return { band: "C", rule: "C:band" };
  if (i.floorMisses >= 2) return { band: "C", rule: "C:floors" };
  if (i.ec < 50 && i.band !== "strong") return { band: "C", rule: "C:ec" };
  if (i.band === "developing") return { band: "B", rule: "B:band" };
  if (i.floorMisses === 1) return { band: "B", rule: "B:floor" };
  if (i.ec < 70) return { band: "B", rule: "B:ec" };
  if (i.unverified >= 1) return { band: "B", rule: "B:unverified" };
  if (i.ask === "above_consensus") return { band: "B", rule: "B:ask" };
  if (i.blockers >= 1) return { band: "B", rule: "B:blocker" };
  return { band: "A", rule: "A" };
}

// ── Builder ──────────────────────────────────────────────────────────────────

const REVENUE_METHODS = new Set(["revenue_multiple", "dcf_proxy", "comparables", "risk_factor_summation"]);

export function buildInvestmentView(rawReport: ReportV2, card: AssessmentCardData, localeIn: string | undefined = rawReport.locale): InvestmentView {
  const locale = investmentLocale(localeIn);
  const t = getTbrV3Strings(locale);
  const s43 = getTbrS43Strings(locale);
  const report = ensureExecutiveStructured(rawReport);
  const x = report.executive.structured!;
  const chapters = report.dimensions;
  const byDim = new Map(chapters.map((c) => [c.dim, c] as const));
  const phaseLabel = (id: DimensionChapter["phaseLens"]["phaseId"]) => GROWTH_PHASE_LABELS[id]?.[locale] ?? id;

  const ec = Math.max(0, Math.min(100, Math.round(card.evidenceConfidence)));
  const pending = chapters.filter((c) => !isAssessed(c)).length;
  const composite = compositeScore(chapters);
  const compositeBand: Band = composite === null ? "pending" : bandFor(composite);
  const floorMisses = chapters.filter((c) => c.phaseLens.floorMet === false).map((c) => c.dim);
  const blockers = report.phaseGates.blockers.length;
  const unverified = Math.max(0, Math.round(card.unverifiedMaterialClaims));
  const ask = report.valuation.ask?.verdict ?? null;
  const { band, rule } = verdictBand({ ec, pending, band: compositeBand, floorMisses: floorMisses.length, blockers, unverified, ask });
  const conviction = convictionFor(ec);

  // Conditions (B / C only, fixed order, ≤ 3).
  const conditions: InvestmentCondition[] = [];
  if (band === "B" || band === "C") {
    for (const dim of floorMisses) {
      const ch = byDim.get(dim)!;
      if (typeof ch.phaseLens.floor === "number") conditions.push({ kind: "floor", dim, text: words(t.condFloor(dimName(dim, locale), phaseLabel(ch.phaseLens.phaseId), ch.phaseLens.floor, ch.score), 20) });
    }
    if (unverified >= 1) conditions.push({ kind: "unverified", text: t.condUnverified(unverified) });
    if (ask === "above_consensus" && report.valuation.ask) {
      conditions.push({ kind: "ask", text: words(t.condAsk(Math.round(report.valuation.ask.gapPct), aud(report.valuation.consensus.lowAud), aud(report.valuation.consensus.highAud)), 20) });
    }
    const blocker = clause(x.phaseNow.blocker || report.phaseGates.blockers[0]?.detail || "", 20);
    if (blocker && report.phaseGates.blockers.length > 0) conditions.push({ kind: "blocker", text: blocker });
  }
  const conditionsCapped = conditions.slice(0, 3);

  // Band D: the evidence CTAs instead (top 3 by lift).
  const ctaRows = [...(report.actionPlan.evidenceToAdd ?? []), ...chapters.flatMap((c) => c.evidence)].filter((r) => r.status === "missing" && r.cta);
  const seenCta = new Set<string>();
  const evidenceCtas: EvidenceCta[] = [];
  if (band === "D") {
    for (const r of ctaRows.sort((a, b) => (b.cta?.lift ?? 0) - (a.cta?.lift ?? 0))) {
      const key = r.cta!.href + normTitle(r.cta!.label);
      if (seenCta.has(key)) continue;
      seenCta.add(key);
      evidenceCtas.push({ label: r.cta!.label, href: r.cta!.href, ...(typeof r.cta!.lift === "number" ? { lift: r.cta!.lift } : {}) });
      if (evidenceCtas.length >= 3) break;
    }
  }

  // Reasons / risks (spec § 4.1): the structured executive when present, else top / bottom 3 by (score − p50).
  const assessed = chapters.filter(isAssessed);
  const dimLine = (ch: DimensionChapter): InvestmentPoint => {
    const n = publishedN(ch);
    const name = dimName(ch.dim, locale);
    return { text: n === null ? t.dimLineNoBench(name, ch.score) : t.dimLine(name, ch.score, signed(ch.score - ch.benchmark.p50), n), dim: ch.dim, score: ch.score };
  };
  const byDelta = [...assessed].sort((a, b) => b.score - b.benchmark.p50 - (a.score - a.benchmark.p50) || DIM_ORDER.indexOf(a.dim) - DIM_ORDER.indexOf(b.dim));
  const reasons: InvestmentPoint[] =
    x.reasonsToBack.length > 0
      ? x.reasonsToBack.slice(0, 3).map((r) => ({ text: words(clause(`${r.title}${r.body ? ` — ${r.body}` : ""}`, 40), 30), ...(r.dim ? { dim: r.dim, score: byDim.get(r.dim)?.score } : {}) }))
      : byDelta.slice(0, 3).map(dimLine);
  const risks: InvestmentPoint[] =
    x.criticalGaps.length > 0
      ? x.criticalGaps.slice(0, 3).map((g) => {
          const lift = typeof g.lift === "number" && g.lift > 0 ? g.lift : g.dim ? byDim.get(g.dim)?.nextAction.expectedLift : undefined;
          return { text: words(clause(`${g.title}${g.body ? ` — ${g.body}` : ""}`, 40), 30), ...(g.dim ? { dim: g.dim, score: byDim.get(g.dim)?.score } : {}), ...(typeof lift === "number" && lift > 0 ? { lift } : {}) };
        })
      : [...byDelta].reverse().slice(0, 3).map((ch) => ({ ...dimLine(ch), lift: ch.nextAction.expectedLift }));

  // Key points (spec § 4.2), each ≤ 30 words.
  const v = report.valuation;
  const applicable = v.methods.filter((m) => m.applicable).length;
  const revenueNotRun = v.methods.filter((m) => !m.applicable && REVENUE_METHODS.has(m.method)).length;
  const valuationPending = coverValuationPending(report);
  const consensusLine = valuationPending ? t.kpValuationPending : `${t.kpConsensus(aud(v.consensus.lowAud), aud(v.consensus.highAud), applicable)}${revenueNotRun > 0 ? `; ${t.kpRevenueMethods(revenueNotRun)}` : ""}`;
  const topRisk = risks[0];
  const keyPoints = [
    words(clause(x.headline, 30), 30),
    reasons[0] ? words(reasons[0].text, 30) : "",
    topRisk ? words(`${topRisk.text}${typeof topRisk.lift === "number" ? ` (${t.lift(topRisk.lift)})` : ""}`, 30) : "",
    words(consensusLine, 30),
    words(t.kpVerdict(t.bandWording[band], conditionsCapped[0]?.text ?? null), 30),
  ].filter(Boolean);

  // Risk matrix (spec § 4.4).
  const riskRows: RiskMatrixRow[] = [];
  for (const ch of chapters) {
    if (!isAssessed(ch)) continue;
    const likelihood = dimLikelihood(ch);
    const impact = dimImpact(ch);
    const mitigation = clause(ch.nextAction.title, 12);
    chapterGaps(ch).slice(0, 2).forEach((g, i) => {
      const text = clause(g, 25);
      if (text) riskRows.push({ id: `gap-${ch.dim}-${i}`, kind: "gap", text, dim: ch.dim, likelihood, impact, mitigation });
    });
  }
  report.phaseGates.blockers.forEach((b, i) => {
    const text = clause(b.detail, 25);
    if (text) riskRows.push({ id: `blocker-${i}`, kind: "blocker", text, likelihood: "high", impact: "high", mitigation: t.mitigationBlocker });
  });
  if (unverified >= 1) riskRows.push({ id: "unverified", kind: "unverified", text: t.riskUnverified(unverified), likelihood: "medium", impact: "medium", mitigation: t.mitigationUnverified });
  if (ask === "above_consensus" && v.ask) riskRows.push({ id: "ask", kind: "ask", text: t.riskAsk(Math.round(v.ask.gapPct)), likelihood: "medium", impact: "high", mitigation: t.mitigationAsk });
  const riskMatrix = riskRows
    .sort((a, b) => LEVEL_RANK[a.impact] - LEVEL_RANK[b.impact] || LEVEL_RANK[a.likelihood] - LEVEL_RANK[b.likelihood] || (a.dim && b.dim ? byDim.get(a.dim)!.score - byDim.get(b.dim)!.score : 0))
    .slice(0, RISK_ROWS_MAX);

  // Improvement plan (spec § 4.5): candidates → dedup by title → lift ÷ effort, ties → lower-scoring dim first.
  type Candidate = Omit<ImprovementStep, "rank" | "priority" | "effort">;
  const candidates: Candidate[] = [];
  for (const ch of chapters) {
    const evidenceToAdd = ch.nextAction.evidenceToAdd ? (s43.source[ch.nextAction.evidenceToAdd] ?? ch.nextAction.evidenceToAdd) : undefined;
    candidates.push({ title: clause(ch.nextAction.title, 18), dim: ch.dim, window: ch.nextAction.window, expectedLift: ch.nextAction.expectedLift, ...(evidenceToAdd ? { evidenceToAdd } : {}), source: "chapter" });
  }
  for (const st of report.actionPlan.steps) {
    const evidenceToAdd = st.evidenceToAdd ? (s43.source[st.evidenceToAdd] ?? st.evidenceToAdd) : undefined;
    candidates.push({ title: clause(st.title, 18), dim: st.dimension, window: st.day <= 30 ? "30d" : "90d", expectedLift: st.expectedLift, ...(evidenceToAdd ? { evidenceToAdd } : {}), source: "plan" });
  }
  for (const ch of chapters) {
    if (!isAssessed(ch)) continue;
    for (const c of ch.criteria) {
      const title = clause(c.nextAction, 18);
      if (!title) continue;
      candidates.push({ title, dim: ch.dim, window: "30d", expectedLift: derivedLift(ch.weight, c.score), source: "criterion" });
    }
  }
  for (const r of ctaRows) {
    const dim = (r.dims[0] ?? "tre") as DimKey;
    candidates.push({ title: clause(r.cta!.label, 18), dim, window: "this_week", expectedLift: r.cta!.lift ?? 0, evidenceToAdd: s43.source[r.source] ?? r.source, href: r.cta!.href, source: "evidence" });
  }
  const seen = new Set<string>();
  const plan: ImprovementStep[] = [];
  for (const c of candidates) {
    const key = normTitle(c.title);
    if (!key || seen.has(key) || !(c.expectedLift > 0)) continue;
    seen.add(key);
    const effort = WINDOW_EFFORT[c.window];
    plan.push({ ...c, rank: 0, effort, priority: Math.round((c.expectedLift / effort) * 100) / 100 });
  }
  plan.sort((a, b) => b.priority - a.priority || (byDim.get(a.dim)?.score ?? 0) - (byDim.get(b.dim)?.score ?? 0) || DIM_ORDER.indexOf(a.dim) - DIM_ORDER.indexOf(b.dim));
  const improvementPlan = plan.slice(0, PLAN_STEPS_MAX).map((p, i) => ({ ...p, rank: i + 1 }));

  // What moves the valuation (≤ 3).
  const whatMovesIt: string[] = [];
  if (revenueNotRun > 0) whatMovesIt.push(t.movesRevenue(revenueNotRun));
  if (v.inputs?.growthAssumed) whatMovesIt.push(t.movesGrowth);
  if ((report.cover.verification?.level ?? 0) < 2) whatMovesIt.push(t.movesVerification);
  if (unverified >= 1) whatMovesIt.push(t.movesClaims(unverified));
  if (!v.ask) whatMovesIt.push(t.movesAsk);

  // Per-dimension takeaways.
  const takeaways = Object.fromEntries(DIM_ORDER.map((d) => [d, takeawayFor(byDim.get(d)!, locale, t)])) as Record<DimKey, string>;

  // Analyst synthesis: shown only when the CEO agent's label disagrees with the rubric band.
  const label = x.verdict.label;
  const analystSynthesis = BAND_TO_EXECUTIVE[band].includes(label) ? null : { label, text: clause(x.verdict.condition ?? x.headline, 40) };

  return {
    version: 1,
    locale,
    band,
    bandLabel: t.bandLabel[band],
    bandWording: t.bandWording[band],
    rule,
    conviction,
    convictionLine: t.convictionLine(ec, t.conviction[conviction]),
    evidenceConfidence: ec,
    compositeScore: composite,
    compositeBand,
    pendingDims: pending,
    floorMisses,
    blockers,
    unverifiedClaims: unverified,
    askVerdict: ask,
    subline: t.subline,
    conditions: conditionsCapped,
    evidenceCtas,
    reasons,
    risks,
    keyPoints: keyPoints.slice(0, 5),
    riskMatrix,
    improvementPlan,
    whatMovesIt: whatMovesIt.slice(0, 3),
    takeaways,
    analystSynthesis,
  };
}

/** The stored block when it matches `locale`, else a fresh build (pure). */
export function investmentViewFor(report: ReportV2, card: AssessmentCardData, locale: string | undefined): InvestmentView {
  const loc = investmentLocale(locale);
  const stored = report.investmentView;
  if (stored && stored.version === 1 && stored.locale === loc && stored.evidenceConfidence === Math.round(card.evidenceConfidence)) return stored;
  return buildInvestmentView(report, card, loc);
}

/**
 * The document with `investmentView` guaranteed (same pattern as
 * `ensureExecutiveStructured`), built after the Assessment Card alignment so
 * evidence confidence is the one number. Returns the same object when a
 * matching block is already stored.
 */
export function ensureInvestmentView(report: ReportV2, opts: AssessmentCardOptions = {}): ReportV2 {
  const aligned = alignReportWithAssessmentCard(report, opts);
  const view = investmentViewFor(aligned.report, aligned.card, report.locale);
  if (report.investmentView === view) return report;
  return { ...aligned.report, investmentView: view };
}

/** Likelihood × impact counts for the 3×3 grid (rows = likelihood high→low, cols = impact low→high). */
export function riskGrid(rows: readonly RiskMatrixRow[]): Record<RiskLevel, Record<RiskLevel, number>> {
  const grid: Record<RiskLevel, Record<RiskLevel, number>> = { high: { low: 0, medium: 0, high: 0 }, medium: { low: 0, medium: 0, high: 0 }, low: { low: 0, medium: 0, high: 0 } };
  for (const r of rows) grid[r.likelihood][r.impact] += 1;
  return grid;
}

export const RISK_LEVELS_DESC: readonly RiskLevel[] = ["high", "medium", "low"];
export const RISK_LEVELS_ASC: readonly RiskLevel[] = ["low", "medium", "high"];
