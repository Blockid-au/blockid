// ReportV2 adapter — builds a valid ReportV2 from what the platform stores
// TODAY (svi_snapshots.dim_results / criterion_results / dimension_scores,
// or an `AssembledReport` from the C-level pipeline), so every stored report
// renders through the new contract without regeneration (spec §F S-R1,
// risk R5 mitigation).
//
// Everything here is deterministic and honest about provenance: chapters
// built from a v1 snapshot carry `source: "adapter"`, no evidence rows, and
// visuals whose `dataState` is `benchmark_only` / `target` / `partial` per
// the §A.3 fallback column — never `real`. The pipeline (S-R2/S-R3) emits
// the same shape with real evidence and module outputs.
//
// Client-safe: imported by the web TBR client, so nothing server-only
// (no cfo-valuation → ai-client, no supabase). Server callers may pass a
// `VcValuationReport` through `input.vc` to fill the 5-method chapter.

import { CRITERIA, type CriterionKey, type QualityLevel } from "@/lib/evaluation-criteria";
import { getMultiplesBenchmark, mapSectorToAUIndustry, mapStageToAUStage } from "@/lib/data/au-comparables";
import { comparablesCounts, topComparables } from "@/lib/valuation/comparables-repo";
import { PHASE_EXIT_RULES, type PhaseGateResult } from "@/lib/growth/phase-gate";
import { inferPhase } from "@/lib/growth/infer-phase";
import { derivedLift } from "@/lib/svi-lift";
import { ensureExecutiveStructured } from "./executive-structure";
import { ensureInvestmentView } from "./investment-view";
import { groundingAudit } from "./grounding";
import { GROWTH_PHASE_IDS, GROWTH_PHASE_LABELS, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { DIMENSION_OWNERS, DIM_ORDER, criteriaForDimension, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { buildValuationChapter, type ValuationAskInput, type VcValuationLike } from "@/lib/report-pipeline/valuation-chapter";
import { VALUATION_BASELINES_AUD } from "@/lib/valuation";
import type { AssembledReport, ReportSection } from "@/lib/report-pipeline/types";
import { bandFor, makeVisual, type Band, type VisualSpecV2 } from "@/lib/report-visuals";
import { computeThreeCaseValuation } from "@/lib/svi/three-case-valuation";
import { inferTractionFromTreScore, selectValuationMethod } from "@/lib/svi/valuation-method-selector";
import { DIMENSION_BENCHMARKS_BY_STAGE } from "@/lib/svi-dimension-benchmarks";
import { mayShowPercentile, publishPercentile, publishedFromCohort, type PublishedPercentile } from "@/lib/benchmarks/publication-rules";
import {
  DATA_PRINCIPLE_SENTENCE,
  EVIDENCE_CONFIDENCE_LEVELS,
  FREE_PAGE_BUDGET,
  REPORT_V2_SCHEMA_VERSION,
  VALUATION_METHOD_KEYS,
  type ActionStep,
  type AuditStamp,
  type CoverEvidenceLevel,
  type CoverVerification,
  type CriterionCard,
  type DimensionChapter,
  type EvidenceConfidence,
  type EvidenceRow,
  type MatchedGrant,
  type MatchedProgram,
  type ReportTierV2,
  type ReportV2,
  type ScoreBreakdown,
  type ScoreBreakdownSignal,
  type SviLedger,
  type ValuationChapter,
} from "./schema";
import { evidenceGapRows, type EvidenceGapLike } from "./evidence-cta";
import { chooseNextAction, dedupeAgainstCards, type NextActionFacts } from "./next-action";
import { verificationBadgeLabel, verificationMeta } from "@/lib/verification/confidence-multiplier";
import { getTbrStrings, type TbrV2Strings } from "@/lib/i18n/tbr-strings";

/** G19-S45: the adapter's templated sentences (thesis, where/worth/next, phase lens, method, disclaimer) in the report locale. */
type AdapterStrings = TbrV2Strings["adapter"];
function adapterStrings(locale: ReportV2["locale"] | undefined): AdapterStrings {
  return getTbrStrings(locale).v2.adapter;
}
function phaseLabelFor(id: GrowthPhaseId, locale: ReportV2["locale"] | undefined): string {
  return GROWTH_PHASE_LABELS[id][locale === "vi" ? "vi" : "en"];
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface SnapshotDimState {
  status?: string;
  score: number | null;
  markdown?: string | null;
  insights?: string[];
  priority?: "high" | "medium" | "low" | null;
  marketBenchmark?: string | null;
  /**
   * G19-S41: the dimension's score ledger (svi-analysis `SVISubScore`
   * breakdown via `scoreBreakdownFromSub`). `assessed:false` renders the
   * chapter as pending — the number is a baseline, not a score.
   */
  scoreBreakdown?: ScoreBreakdown | null;
}

export interface SnapshotCriterionState {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
}

/** Sector benchmark the web already fetches from /api/svi/benchmarks/[sector]. */
export interface CohortBenchmarkInput {
  sector?: string;
  dim_medians?: Record<string, number>;
  dim_top_quartile?: Record<string, number>;
  sample_size?: number;
  updated_at?: string;
}

export interface SnapshotInput {
  snapshotId?: string | null;
  reportId?: string | null;
  projectId?: string | null;
  accountId?: string | null;
  createdAt?: string | number | null;
  startupName?: string | null;
  industry?: string | null;
  stageLabel?: string | null;
  /** SVI stage 0–7 (svi-analysis scale) — used only when no label parses. */
  stage?: number | null;
  sviTotal?: number | null;
  deltaVsLast?: number | null;
  dimStates: Record<string, SnapshotDimState | undefined>;
  criterionStates?: SnapshotCriterionState[] | null;
  /** projects.growth_phase_current when the caller has it. */
  phaseId?: string | null;
  /** G14-S36: projects.verification_level (0–5) when the caller has it; null/absent → L0 "ABN not verified". */
  verificationLevel?: number | null;
  tier?: ReportTierV2;
  /** G19-S45: report locale — the adapter's templated sentences follow it (VI with diacritics; ES / JA read EN). */
  locale?: ReportV2["locale"];
  cohort?: CohortBenchmarkInput | null;
  /**
   * G19-S44: the startup's SVI percentile in its cohort when the caller has
   * it; otherwise derived from the sector cohort, else null (the Pctl column
   * hides). G21 P1 review: published only when `cohort.sample_size` clears
   * the publication floor (lib/benchmarks/publication-rules.ts) — a number
   * without its n never reaches the cover.
   */
  cohortPercentile?: number | null;
  /** Optional narrative overrides (e.g. the pipeline's executive summary). */
  executiveSummary?: string | null;
  qualityScore?: number | null;
  consistencyIssues?: ReportV2["quality"]["consistencyIssues"];
  /** Optional CFO 5-method valuation (server side) — fills valuation.methods. */
  vc?: VcValuationLike | null;
  /** S-R3 §C.5: founder-stated ask for the valuation cross-check (only used with `vc`). */
  valuationAsk?: ValuationAskInput | null;
  /** S-R3: evidence ids behind the revenue figure (stripe / xero rows) — the chapter is grounded only when non-empty. */
  revenueEvidenceIds?: string[] | null;
  /** G19-S41: the engine's report-level ledger (`SVIAnalysis.ledger`) — the cover strip "base 100 → dims → stage → penalties → total". */
  sviLedger?: SviLedger | null;
  /**
   * G19-S43: the evidence rows the chapters filter by dimension (GATHER rows,
   * Evidence Hub rows, `missing` rows with a `cta`). Absent on a bare snapshot.
   */
  evidenceRows?: EvidenceRow[] | null;
  /** G19-S43: the engine's evidence gaps (`SVIAnalysis.evidenceGaps`) — P0 / P1 become `actionPlan.evidenceToAdd`. */
  evidenceGaps?: EvidenceGapLike[] | null;
  /** G19-S43: known co-founder count (null = unknown) — "Find a co-founder" is never offered at ≥ 2. */
  coFounders?: number | null;
  /** G19-S43: the cover's "Evidence: mostly self-declared (×0.50)" line. */
  evidenceLevel?: CoverEvidenceLevel | null;
  /** G19-S43: grant / program matches (GATHER `results.grants`) — Money on the Table. */
  moneyOnTable?: MoneyOnTableInput | null;
  source?: ReportV2["source"];
  generatedAt?: string;
}

/** Structural subset of `gather.ts:GrantsMatch` / `GatherResults.grants`. */
export interface MoneyOnTableInput {
  grants: MatchedGrant[];
  programs: MatchedProgram[];
}

/**
 * G19-S43: the Money on the Table chapter from the matches GATHER found.
 * `null` = no grant profile → honest empty state whose visual subtitle is
 * the CTA (the web / PDF / DOCX empty copy links `/workspace/funding`).
 */
export function buildMoneyOnTable(matches: MoneyOnTableInput | null): ReportV2["moneyOnTable"] {
  const grants = (matches?.grants ?? []).map((g) => ({ ...g })).sort((a, b) => b.fit - a.fit);
  const programs = (matches?.programs ?? []).map((p) => ({ ...p })).sort((a, b) => b.fit - a.fit);
  const rows = [...grants, ...programs];
  const totalAud = rows.reduce((s, r) => s + (typeof r.amountAud === "number" && Number.isFinite(r.amountAud) ? r.amountAud : 0), 0);
  const bars = makeVisual({
    id: "money-bars",
    kind: "bar",
    agentId: "cfo",
    title: "Matched grants & programs (A$)",
    subtitle: rows.length
      ? `${rows.length} matched on the saved grant profile · A$${fmtShort(totalAud)} where an amount is published`
      : matches
        ? "No open match on the saved grant profile right now — matching re-runs on every report"
        : "No grant profile yet — complete it at /workspace/funding to match grants and programs",
    dataState: rows.length ? "real" : "partial",
    data: { bars: rows.slice(0, 8).map((r) => ({ label: r.name, value: typeof r.amountAud === "number" ? r.amountAud : 0 })), unit: "A$" },
    a11y: { tableFallback: rows.slice(0, 8).map((r) => ({ name: r.name, aud: typeof r.amountAud === "number" ? r.amountAud : "n/a", fit: Math.round(r.fit) })) },
  });
  return { grants, programs, totalAud, visuals: [bars] };
}

// ── G19-S41: score ledger helpers ───────────────────────────────────────────

/** Structural subset of `svi-analysis.ts:SVISubScore` (the fields the ledger copies). */
export interface SubScoreLike {
  key: string;
  value?: number;
  adjustment?: number;
  gaps?: string[];
  base?: number;
  breakdown?: ScoreBreakdownSignal[];
  assessed?: boolean;
}

/** Structural subset of `SVIAnalysis` the ledger needs — callers pass the whole analysis. */
export interface SviAnalysisLike {
  confidenceMultiplier?: number;
  ledger?: SviLedger | null;
  meta?: { verification?: { ladderConfidence: number; effectiveConfidence: number } | null } | null;
  /** G19-S43: the extracted signals the next-action rules and the cover evidence line read. */
  signals?: { hasCoFounder?: boolean; evidenceLevel?: string } | null;
  /** G19-S43: the engine's evidence gaps (P0 / P1 → `actionPlan.evidenceToAdd`). */
  evidenceGaps?: EvidenceGapLike[] | null;
  /**
   * G19-S44: real cohort percentile (T0102) — fills `cover.svi.cohortPercentile`
   * / `cohortN`. G21 P1 review: read through `publishedFromCohort` — the
   * `published` rank (null below the floor), never the legacy `percentile`.
   */
  cohortPercentile?: { percentile: number; cohortSize?: number; source?: string; published?: PublishedPercentile | null } | null;
  /** G19-S44: the stage-benchmark percentile the engine computes when no cohort is available — a static-table estimate, never printed (G21 P1 review). */
  percentileRank?: number;
}

/**
 * G19-S43: the cover's evidence line from the analysis — the confidence the
 * formula ran at and the ladder rung it corresponds to. Undefined when the
 * analysis carries neither (pre-S43 stored rows keep no line).
 */
export function coverEvidenceLevelFrom(analysis: SviAnalysisLike | null | undefined): CoverEvidenceLevel | undefined {
  if (!analysis) return undefined;
  const raw = typeof analysis.confidenceMultiplier === "number" ? analysis.confidenceMultiplier : analysis.meta?.verification?.effectiveConfidence;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const confidenceMultiplier = Math.max(0, Math.min(1, Math.round(raw * 100) / 100));
  const declared = analysis.signals?.evidenceLevel;
  const level: EvidenceConfidence = (EVIDENCE_CONFIDENCE_LEVELS as readonly string[]).includes(declared ?? "") ? (declared as EvidenceConfidence) : levelForMultiplier(confidenceMultiplier);
  return { level, confidenceMultiplier };
}

/** The ladder rung whose confidence is nearest the multiplier (EVIDENCE_CONFIDENCE in svi-analysis.ts). */
export function levelForMultiplier(m: number): EvidenceConfidence {
  const ladder: Array<[EvidenceConfidence, number]> = [["self_declared", 0.2], ["public_url", 0.35], ["document_uploaded", 0.5], ["connected_source", 0.75], ["transaction_data", 0.9], ["third_party_verified", 1]];
  let best = ladder[0];
  for (const rung of ladder) if (Math.abs(rung[1] - m) < Math.abs(best[1] - m)) best = rung;
  return best[0];
}

/**
 * `SVISubScore` → `ScoreBreakdown`. Undefined when the sub predates S41 (no
 * `breakdown` / `base`), so old snapshots keep rendering without a ledger.
 * `confidenceMultiplier` is the effective confidence the formula used;
 * `verificationMultiplier` is the bounded L0–L5 factor already inside it
 * (effective ÷ ladder), informational only.
 */
export function scoreBreakdownFromSub(sub: SubScoreLike | null | undefined, analysis?: SviAnalysisLike | null): ScoreBreakdown | undefined {
  if (!sub || !Array.isArray(sub.breakdown) || typeof sub.base !== "number") return undefined;
  const ver = analysis?.meta?.verification ?? null;
  const rawConf = typeof analysis?.confidenceMultiplier === "number" ? analysis.confidenceMultiplier : ver?.effectiveConfidence ?? 0.2;
  const confidenceMultiplier = Math.max(0, Math.min(1, Number.isFinite(rawConf) ? rawConf : 0.2));
  const verificationMultiplier = ver && ver.ladderConfidence > 0 ? Math.round((ver.effectiveConfidence / ver.ladderConfidence) * 1000) / 1000 : undefined;
  return {
    base: sub.base,
    signals: sub.breakdown.map((s) => (s.scale ? { signal: s.signal, points: s.points, source: s.source, scale: s.scale } : { signal: s.signal, points: s.points, source: s.source })),
    confidenceMultiplier,
    ...(verificationMultiplier !== undefined ? { verificationMultiplier } : {}),
    adjustment: typeof sub.adjustment === "number" && Number.isFinite(sub.adjustment) ? sub.adjustment : 0,
    assessed: sub.assessed === true,
  };
}

/** `SVIAnalysis.ledger` → cover ledger (identity with a structural guard; undefined for pre-S41 analyses). */
export function sviLedgerFrom(ledger: SviLedger | null | undefined): SviLedger | undefined {
  if (!ledger || ledger.base !== 100 || !ledger.dimAdjustments) return undefined;
  const dims: Record<DimKey, number> = { tre: 0, mpc: 0, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 };
  for (const d of DIM_ORDER) dims[d] = Number(ledger.dimAdjustments[d]) || 0;
  return {
    base: 100,
    dimAdjustments: dims,
    stageBonus: Number(ledger.stageBonus) || 0,
    riskPenalties: Number(ledger.riskPenalties) || 0,
    sectorAdj: Number(ledger.sectorAdj) || 0,
    metricsBonus: Number(ledger.metricsBonus) || 0,
    ciBoost: Number(ledger.ciBoost) || 0,
    floorClamp: Number(ledger.floorClamp) || 0,
    total: Number(ledger.total) || 0,
  };
}

/** How many of the 8 cover dimensions are pending (unassessed / unscored). */
export function pendingDimCount(cover: Pick<ReportV2["cover"], "dims">): number {
  return DIM_ORDER.filter((d) => cover.dims[d]?.band === "pending").length;
}

/** Structural subset of `agents/cfo-valuation.ts:VcValuationReport` — defined in report-pipeline/valuation-chapter.ts (S-R3). */
export type { VcValuationLike };

/** Founder-stated ask inputs for the valuation cross-check (S-R3 §C.5). */
export type { ValuationAskInput };

// ── Stage helpers ───────────────────────────────────────────────────────────

const BENCH_STAGE_LABELS = ["Idea", "Pre-seed", "Seed", "Post-seed", "Series A", "Series B", "Series C", "Late"] as const;

/** SVI-analysis stage (0 Concept … 7 Corporation) → benchmark stage (0 idea … 7 late). */
const SVI_STAGE_TO_BENCH = [0, 1, 2, 3, 3, 4, 5, 7] as const;

export function benchmarkStageFrom(stageLabel: string | null | undefined, stage: number | null | undefined): number {
  const l = (stageLabel ?? "").toLowerCase().replace(/[-_]/g, " ").trim();
  if (l) {
    if (/series\s*c|late|scale|corporation|unicorn/.test(l)) return l.includes("series c") ? 6 : 7;
    if (/series\s*b/.test(l)) return 5;
    if (/series\s*a|revenue/.test(l)) return 4;
    if (/post\s*seed|early traction|traction/.test(l)) return 3;
    if (/pre\s*seed|preseed|validated/.test(l)) return 1;
    if (/seed|mvp|prototype/.test(l)) return 2;
    if (/idea|concept|pre launch|vision/.test(l)) return 0;
    if (/growth/.test(l)) return 5;
  }
  if (typeof stage === "number" && Number.isFinite(stage)) {
    const i = Math.max(0, Math.min(7, Math.round(stage)));
    return SVI_STAGE_TO_BENCH[i];
  }
  return 2;
}

export function qualityFromScore(score: number): QualityLevel {
  if (score >= 85) return "exceptional";
  if (score >= 70) return "strong";
  if (score >= 50) return "good";
  if (score >= 30) return "basic";
  return "incomplete";
}

function clamp100(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function words(s: string, max: number): string {
  const w = String(s ?? "").trim().split(/\s+/).filter(Boolean);
  return w.length <= max ? w.join(" ") : `${w.slice(0, max).join(" ")}…`;
}

function firstParagraph(md: string | null | undefined): string {
  if (!md) return "";
  const cleaned = md
    .replace(/^#+\s.*$/gm, "")
    .replace(/[*_`>]/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 20);
  return cleaned ?? "";
}

export function percentileFor(score: number, p25: number, p50: number, p75: number): number {
  if (score <= p25) return Math.max(1, Math.round((score / Math.max(1, p25)) * 25));
  if (score <= p50) return Math.round(25 + ((score - p25) / Math.max(1, p50 - p25)) * 25);
  if (score <= p75) return Math.round(50 + ((score - p50) / Math.max(1, p75 - p50)) * 25);
  return Math.min(99, Math.round(75 + ((score - p75) / Math.max(1, 100 - p75)) * 24));
}

function stamp(at: string): AuditStamp {
  return { grounded: false, uncited: 0, revised: false, auditor: "llm-auditor", at };
}

// ── Phase inference ─────────────────────────────────────────────────────────

/**
 * G19-S44 (D5): the one phase rule lives in `lib/growth/infer-phase.ts` and
 * is re-exported here so existing importers keep working; the dashboard and
 * the pipeline call the same function.
 */
export { inferPhase };

// ── Dimension chapter builders ──────────────────────────────────────────────

interface ChapterCtx {
  dim: DimKey;
  score: number;
  scored: boolean;
  band: Band;
  p25: number;
  p50: number;
  p75: number;
  percentile: number | null;
  /** G21 P1 review: the cohort size behind `percentile` (null when no cohort was supplied). */
  n: number | null;
  stage: number;
  stageLabel: string;
  cards: CriterionCard[];
  criterionScore: (key: CriterionKey) => number | null;
  state: SnapshotDimState;
  at: string;
  /** G19-S41: the score ledger when the snapshot carries one. */
  breakdown?: ScoreBreakdown;
  /** G19-S41: false only when a ledger says no real input moved the dimension. */
  assessed: boolean;
  /** G19-S43: the evidence rows on this dimension (missing rows carry `cta`). */
  evidence: EvidenceRow[];
  /** G19-S43: what the next-action rules already know is satisfied. */
  facts: NextActionFacts;
}

function chapterVisuals(c: ChapterCtx): { primary: VisualSpecV2; secondary: VisualSpecV2[] } {
  const owner = DIMENSION_OWNERS[c.dim];
  const cs = c.criterionScore;
  const bandLabel = `${c.stageLabel} cohort p25–p75`;
  switch (c.dim) {
    case "tre": {
      const primary = makeVisual({
        id: `dim-tre-primary`,
        kind: "sparkline",
        dim: "tre",
        agentId: owner.primary,
        title: "Monthly revenue, last 12 months",
        subtitle: "No revenue connector in this snapshot — cohort band and your TRE score shown instead",
        dataState: "benchmark_only",
        data: { points: [], ghost: true, ghostLabel: "Connect Stripe / Xero to plot revenue", band: { low: c.p25, high: c.p75, label: bandLabel }, marker: { label: "TRE", value: c.score } },
        a11y: { tableFallback: [{ metric: "TRE score", value: c.score }, { metric: "Cohort p25", value: c.p25 }, { metric: "Cohort p50", value: c.p50 }, { metric: "Cohort p75", value: c.p75 }] },
      });
      const funnel = makeVisual({
        id: `dim-tre-funnel`,
        kind: "funnel",
        dim: "tre",
        agentId: owner.primary,
        title: "AARRR funnel — criterion scores",
        subtitle: "Market pull → customers → revenue evidence, from the stored criterion scores",
        dataState: "partial",
        data: {
          stages: [
            { label: "Market", value: cs("market") ?? c.score },
            { label: "Go-to-market", value: cs("gtm_strategy") ?? c.score },
            { label: "Customers", value: cs("customer_size") ?? c.score },
            { label: "Revenue", value: cs("revenue") ?? c.score },
          ],
          unit: "/100",
        },
      });
      return { primary, secondary: [funnel] };
    }
    case "mpc": {
      const primary = makeVisual({
        id: `dim-mpc-primary`,
        kind: "funnel",
        dim: "mpc",
        agentId: owner.primary,
        title: "Market evidence funnel (criterion scores)",
        subtitle: "TAM/SAM/SOM in A$ arrives with the market-sizing module (S-R3); this snapshot shows the market → GTM → idea criterion scores",
        dataState: "partial",
        data: {
          stages: [
            { label: "Market", value: cs("market") ?? c.score },
            { label: "Go-to-market", value: cs("gtm_strategy") ?? c.score },
            { label: "Idea", value: cs("idea") ?? c.score },
          ],
          unit: "/100",
        },
        a11y: { tableFallback: [{ criterion: "market", score: cs("market") ?? c.score }, { criterion: "gtm_strategy", score: cs("gtm_strategy") ?? c.score }, { criterion: "idea", score: cs("idea") ?? c.score }] },
      });
      const twoByTwo = makeVisual({
        id: `dim-mpc-2x2`,
        kind: "positioning_2x2",
        dim: "mpc",
        agentId: "cmo",
        title: "Positioning — score vs stage median",
        subtitle: "Your MPC vs the stage p50 (competitor set arrives with GATHER research, S-R3)",
        dataState: "benchmark_only",
        data: { xLabel: "Market pull (MPC score)", yLabel: "Percentile vs stage", points: [{ label: "You", x: c.score, y: c.percentile ?? 50, self: true }, { label: "Stage p50", x: c.p50, y: 50 }], quadrants: ["Ahead on evidence", "Category leader", "Early", "Strong score, thin evidence"] },
      });
      return { primary, secondary: [twoByTwo] };
    }
    case "ftv": {
      const rows: Array<[string, CriterionKey]> = [["Founder profile", "founder_profile"], ["Team composition", "team"], ["Structure & governance", "team_structure"]];
      const primary = makeVisual({
        id: `dim-ftv-primary`,
        kind: "heat_map",
        dim: "ftv",
        agentId: owner.primary,
        title: "Team completeness — criterion × benchmark",
        subtitle: "Score, gap to p50 and gap to p75 for each founder / team criterion (role map arrives with LinkedIn evidence, S-R5)",
        dataState: "partial",
        data: {
          rows: rows.map((r) => r[0]),
          cols: ["Score", "vs p50", "vs p75"],
          cells: rows.map(([, key]) => {
            const s = cs(key);
            return s === null ? [null, null, null] : [s, Math.max(0, 100 - Math.max(0, c.p50 - s) * 2), Math.max(0, 100 - Math.max(0, c.p75 - s) * 2)];
          }),
          legend: "Darker = stronger; ? = criterion not scored in this snapshot",
        },
        a11y: { tableFallback: rows.map(([label, key]) => ({ criterion: label, score: cs(key) ?? "not scored" })) },
      });
      const bars = makeVisual({
        id: `dim-ftv-bars`,
        kind: "bar",
        dim: "ftv",
        agentId: "chro",
        title: "Founder-market fit factors",
        dataState: "partial",
        data: { bars: rows.map(([label, key]) => ({ label, value: cs(key) ?? 0, reference: c.p50 })), max: 100, referenceLabel: `stage p50 (${c.p50})` },
      });
      return { primary, secondary: [bars] };
    }
    case "ptd": {
      const primary = makeVisual({
        id: `dim-ptd-primary`,
        kind: "bar",
        dim: "ptd",
        agentId: owner.primary,
        title: "Product & tech depth vs stage benchmark",
        subtitle: "Repo health bars (commits / tests / CI / deps) arrive when GitHub is connected; criterion scores vs p50 shown",
        dataState: "benchmark_only",
        data: { bars: [{ label: "Code & repo", value: cs("code_git") ?? c.score, reference: c.p50 }, { label: "Website & UX", value: cs("website") ?? c.score, reference: c.p50 }, { label: "Roadmap", value: cs("roadmap") ?? c.score, reference: c.p50 }], max: 100, referenceLabel: `stage p50 (${c.p50})` },
        a11y: { tableFallback: [{ metric: "code_git", score: cs("code_git") ?? c.score }, { metric: "website", score: cs("website") ?? c.score }, { metric: "roadmap", score: cs("roadmap") ?? c.score }, { metric: "stage p50", score: c.p50 }] },
      });
      const gauge = makeVisual({
        id: `dim-ptd-gauge`,
        kind: "gauge",
        dim: "ptd",
        agentId: "cto",
        title: "PTD score gauge",
        subtitle: "Core Web Vitals gauge arrives with the tech audit (S-R3)",
        dataState: "benchmark_only",
        data: { value: c.score, label: `PTD ${c.score} / stage p50 ${c.p50}` },
      });
      return { primary, secondary: [gauge] };
    }
    case "cgh": {
      const primary = makeVisual({
        id: `dim-cgh-primary`,
        kind: "donut",
        dim: "cgh",
        agentId: owner.primary,
        title: "Recommended cap-table structure (target, not actual)",
        subtitle: "No cap-table register in this snapshot — AU seed norm shown: founders 70 %, ESOP 12 %, investors 18 %",
        dataState: "target",
        data: { slices: [{ label: "Founders", value: 70 }, { label: "ESOP pool", value: 12 }, { label: "Investors", value: 18 }], centreValue: "target", centreLabel: "not actual" },
        a11y: { tableFallback: [{ holder: "Founders", target_pct: 70 }, { holder: "ESOP pool", target_pct: 12 }, { holder: "Investors", target_pct: 18 }] },
      });
      const dilution = makeVisual({
        id: `dim-cgh-dilution`,
        kind: "line",
        dim: "cgh",
        agentId: "cfo",
        title: "Dilution path (2 rounds, 20 % each) — target",
        dataState: "target",
        data: { series: [{ label: "Founders %", points: [70, 56, 45] }, { label: "ESOP %", points: [12, 10, 8] }], xLabels: ["Now", "Seed", "Series A"], unit: "%" },
      });
      return { primary, secondary: [dilution] };
    }
    case "iri": {
      const folders = ["Corporate", "Cap table", "Financials", "Contracts", "IP", "Team", "Product", "Compliance"];
      const docs = cs("documents");
      const room = cs("dataroom");
      const primary = makeVisual({
        id: `dim-iri-primary`,
        kind: "heat_map",
        dim: "iri",
        agentId: owner.primary,
        title: "Data-room completeness (8 standard folders)",
        subtitle: "Folder-level presence arrives with the data-room connector; the stored documents / dataroom criterion scores are shown per folder",
        dataState: "partial",
        data: {
          rows: folders,
          cols: ["Documents", "Data room"],
          cells: folders.map(() => [docs, room]),
          legend: "? = criterion not scored in this snapshot",
        },
        a11y: { tableFallback: [{ criterion: "documents", score: docs ?? "not scored" }, { criterion: "dataroom", score: room ?? "not scored" }] },
      });
      const ring = makeVisual({
        id: `dim-iri-ring`,
        kind: "progress",
        dim: "iri",
        agentId: "clo",
        title: "Investor readiness",
        dataState: "partial",
        data: { value: c.score, max: 100, label: `IRI ${c.score}/100 — stage p50 ${c.p50}` },
      });
      return { primary, secondary: [ring] };
    }
    case "lco": {
      const items = ["ASIC — company registered, director IDs", "ATO — GST / PAYG / R&D registration", "OAIC — privacy policy, breach plan", "IP — assignment, trademark, domain", "Essential Eight — ML1"];
      const docs = cs("documents");
      const status = (i: number): "done" | "pending" | "unknown" => (docs === null ? "unknown" : docs >= 70 ? "done" : docs >= 40 && i < 2 ? "done" : "pending");
      const primary = makeVisual({
        id: `dim-lco-primary`,
        kind: "checklist",
        dim: "lco",
        agentId: owner.primary,
        title: "Compliance checklist",
        subtitle: "Item status inferred from the documents criterion score; ABN lookup and uploads make each row evidenced (S-R3/S-R5)",
        dataState: "partial",
        data: { items: items.map((label, i) => ({ label, status: status(i) })) },
        a11y: { tableFallback: items.map((label, i) => ({ item: label, status: status(i) })) },
      });
      const risk = makeVisual({
        id: `dim-lco-risk`,
        kind: "heat_map",
        dim: "lco",
        agentId: "clo",
        title: "Legal risk — likelihood × impact",
        dataState: "benchmark_only",
        data: { rows: ["Structure", "IP", "Privacy", "Employment"], cols: ["Likelihood", "Impact"], cells: [[100 - c.score, 60], [100 - c.score, 70], [100 - c.score, 50], [100 - c.score, 40]] },
      });
      return { primary, secondary: [risk] };
    }
    case "svm":
    default: {
      const primary = makeVisual({
        id: `dim-svm-primary`,
        kind: "radar",
        dim: "svm",
        agentId: owner.primary,
        title: "Strategic vision & moat — signals vs stage p50",
        subtitle: "5-factor moat scores arrive with the CEO chapter (S-R2); vision-adjacent criterion scores shown",
        dataState: "partial",
        data: {
          axes: [
            { label: "SVM", value: c.score, reference: c.p50 },
            { label: "Roadmap", value: cs("roadmap") ?? c.score, reference: c.p50 },
            { label: "Idea", value: cs("idea") ?? c.score, reference: c.p50 },
            { label: "Market", value: cs("market") ?? c.score, reference: c.p50 },
            { label: "Product", value: cs("code_git") ?? c.score, reference: c.p50 },
          ],
          seriesLabel: "This startup",
          referenceLabel: `stage p50 (${c.p50})`,
        },
        a11y: { tableFallback: [{ axis: "SVM", value: c.score, p50: c.p50 }, { axis: "roadmap", value: cs("roadmap") ?? c.score, p50: c.p50 }, { axis: "idea", value: cs("idea") ?? c.score, p50: c.p50 }] },
      });
      const exits = makeVisual({
        id: `dim-svm-exits`,
        kind: "timeline",
        dim: "svm",
        agentId: "ceo",
        title: "Exit paths — 3 / 5 / 7 years",
        dataState: "benchmark_only",
        data: { items: [{ label: "Strategic", at: 3, detail: "trade sale" }, { label: "PE / secondary", at: 5 }, { label: "ASX / IPO", at: 7 }], unit: "yr", horizon: 8 },
      });
      return { primary, secondary: [exits] };
    }
  }
}

function buildChapter(c: ChapterCtx, phase: PhaseGateResult, tier: ReportTierV2, L: AdapterStrings = adapterStrings("en"), locale: ReportV2["locale"] = "en"): DimensionChapter {
  const owner = DIMENSION_OWNERS[c.dim];
  const phaseNow = phaseLabelFor(phase.currentPhase, locale);
  const { primary, secondary } = chapterVisuals(c);
  const insights = (c.state.insights ?? []).filter((s) => typeof s === "string" && s.trim());
  const cardGaps = c.cards.flatMap((k) => k.gaps).filter(Boolean);
  const verdictSrc = insights[0] ?? firstParagraph(c.state.markdown) ?? "";
  // G19-S41: an unassessed dimension is a baseline, not a score — never
  // narrate it as "scores N/100".
  const verdict = !c.scored
    ? `${owner.title} was not scored in this snapshot — re-run the analysis to populate this chapter.`
    : !c.assessed
      ? words(`${owner.title} is not assessed yet — no evidence reached this dimension, so the ${c.score} in the ledger is the stage baseline, not a score.${verdictSrc ? ` Start with: ${verdictSrc}` : ""}`, 80)
      : // G27 never-say guard: a median is printed only with its n (publication-rules.ts); the static anchor is named as such.
        words(verdictSrc || (typeof c.n === "number" && mayShowPercentile(c.n) ? `${owner.title} scores ${c.score}/100 (${c.band}) against a ${c.stageLabel} median of ${c.p50} (n = ${c.n}).` : `${owner.title} scores ${c.score}/100 (${c.band}) against the ${c.stageLabel} rubric anchor of ${c.p50}.`), 80);
  const floor = PHASE_EXIT_RULES[phase.currentPhase].dimensionFloors[c.dim as keyof typeof PHASE_EXIT_RULES.vision.dimensionFloors];
  // G19-S43: chapter-level bullets never repeat the criterion cards' own
  // bullets (the cards render them) — the dimension narrative (insights) is
  // the chapter's voice; the "N below the strong band" line only stands in
  // when no card names a gap.
  const strengths = dedupeAgainstCards(insights.slice(1), c.cards).slice(0, 4);
  const gaps = dedupeAgainstCards(c.scored && c.assessed && c.score < 70 && !cardGaps.length ? [`${owner.title} is ${70 - c.score} points below the strong band (70).`] : [], c.cards).slice(0, 4);
  // G19-S43: the next action fits the founder (lowest criterion / first linked
  // gap / never an already-satisfied generic) and quotes the one lift model.
  const nextAction = chooseNextAction({ dim: c.dim, score: c.score, assessed: c.assessed, cards: c.cards, evidence: c.evidence, facts: c.facts });
  return {
    dim: c.dim,
    title: owner.title,
    titleVi: owner.titleVi,
    weight: owner.weight,
    ownerAgent: owner.primary,
    supportingAgents: owner.supporting,
    score: c.score,
    band: c.band,
    benchmark: { p25: c.p25, p50: c.p50, p75: c.p75, percentile: c.percentile, n: c.n, stage: c.stage },
    verdict,
    primaryVisual: primary,
    secondaryVisuals: secondary,
    evidence: c.evidence,
    criteria: c.cards,
    strengths,
    gaps,
    nextAction,
    phaseLens: {
      phaseId: phase.currentPhase,
      whatMattersNow:
        typeof floor === "number"
          ? L.phaseFloor(phaseNow, owner.shortLabel, floor, c.score >= floor, c.score)
          : L.phaseNoFloor(phaseNow, owner.shortLabel, phase.nextPhase ? phaseLabelFor(phase.nextPhase, locale) : L.lastPhase),
      floor: typeof floor === "number" ? floor : undefined,
      floorMet: typeof floor === "number" ? c.score >= floor : undefined,
    },
    frameworks: owner.frameworks,
    modules: [],
    audit: stamp(c.at),
    runIds: [],
    renderAs: tier === "free" ? owner.freeTier : "full",
    ...(c.breakdown ? { scoreBreakdown: c.breakdown } : {}),
  };
}

// ── G19-S44: executive strengths / gaps from the criterion cards ────────────

/** Score restatements never make the executive list ("FTV 83/100 (strong)", "5 below the strong band"). */
const SCORE_RESTATEMENT = /\b\d{1,3}\s*\/\s*100\b|below the (strong |developing )?band|points below|\bscores? \d{1,3}\b/i;

/** The evidence behind a card, as a short source word: cited row → top ledger signal → first evidenced row → "no citation". */
function cardSourceLabel(chapter: DimensionChapter, card: Pick<CriterionCard, "citations"> | undefined, src: Record<string, string>): string {
  const cited = card?.citations[0]?.evidence_id;
  const row = cited ? chapter.evidence.find((e) => e.evidence_id === cited) : undefined;
  if (row) return src[row.source] ?? row.source;
  const signal = (chapter.scoreBreakdown?.signals ?? [])
    .filter((sg) => !sg.scale && sg.source !== "penalty" && sg.source !== "stage" && sg.points > 0)
    .sort((a, b) => b.points - a.points)[0];
  if (signal) return src[signal.source] ?? signal.source;
  const evidenced = chapter.evidence.find((e) => e.status === "evidenced" || e.status === "partial");
  if (evidenced) return src[evidenced.source] ?? evidenced.source;
  return src.none ?? "no citation";
}

function tidyBullet(text: string): string {
  return text.trim().replace(/[.;:,\s]+$/u, "");
}

export interface ExecutiveFromCards {
  /** Top-3 strengths from the criterion cards (highest score × weight), "text (source)". */
  strengths: string[];
  /** Top-3 gaps from the criterion cards (highest lift), "text (source)". */
  gaps: string[];
  /** Mean of the chapter ledgers' `confidenceMultiplier`; null when no chapter carries a ledger (pre-S41 row). */
  confidence: number | null;
}

/**
 * G19-S44 — executive strengths / gaps are the top criterion-card bullets
 * ranked by lift (never a score restatement), each with the evidence source
 * in parentheses; the executive confidence is the mean chapter-ledger
 * confidence (S41). Shared by `fromSnapshot` and the pipeline's
 * `buildReportV2`, so the dashboard synthesis and the report agree.
 */
export function executiveFromChapters(dimensions: readonly DimensionChapter[], locale: ReportV2["locale"] | undefined): ExecutiveFromCards {
  const src = getTbrStrings(locale).v2.s44.source;
  type Candidate = { text: string; rank: number; source: string };
  const strengths: Candidate[] = [];
  const gaps: Candidate[] = [];
  for (const ch of dimensions) {
    if (ch.band === "pending") continue;
    // A card is attributed to its PRIMARY dimension's chapter only (the TRE
    // funnel also carries market / gtm cards) so the source in parentheses is
    // that chapter's evidence, and each bullet is considered once.
    const withBullets = ch.criteria.filter((c) => c.strengths.length > 0 || c.gaps.length > 0);
    const cards = withBullets.filter((c) => (CRITERIA.find((d) => d.key === c.key)?.primaryDimension ?? ch.dim) === ch.dim);
    for (const card of cards) {
      const weight = CRITERIA.find((c) => c.key === card.key)?.weight ?? 5;
      const source = cardSourceLabel(ch, card, src);
      const s = card.strengths.map(tidyBullet).find((t) => t && !SCORE_RESTATEMENT.test(t));
      if (s) strengths.push({ text: s, rank: card.score * weight, source });
      const g = card.gaps.map(tidyBullet).find((t) => t && !SCORE_RESTATEMENT.test(t));
      if (g) gaps.push({ text: g, rank: derivedLift(weight, card.score) * 100 + (100 - card.score), source });
    }
    // A chapter whose cards carry no bullets at all (adapter fallback card)
    // may still have chapter-level insights — they count once, ranked by the
    // dimension score, never a score restatement.
    if (withBullets.length === 0) {
      const source = cardSourceLabel(ch, ch.criteria[0], src);
      const s = ch.strengths.map(tidyBullet).find((t) => t && !SCORE_RESTATEMENT.test(t));
      if (s) strengths.push({ text: s, rank: ch.score * ch.weight, source });
      const g = ch.gaps.map(tidyBullet).find((t) => t && !SCORE_RESTATEMENT.test(t));
      if (g) gaps.push({ text: g, rank: derivedLift(ch.weight, ch.score) * 100 + (100 - ch.score), source });
    }
  }
  const top3 = (list: Candidate[]): string[] => {
    const seen = new Set<string>();
    return list
      .sort((a, b) => b.rank - a.rank)
      .filter((c) => {
        const k = c.text.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3)
      .map((c) => `${c.text} (${c.source})`);
  };
  const confidences = dimensions.map((d) => d.scoreBreakdown?.confidenceMultiplier).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const confidence = confidences.length ? Math.round((confidences.reduce((a, c) => a + c, 0) / confidences.length) * 100) / 100 : null;
  return { strengths: top3(strengths), gaps: top3(gaps), confidence };
}

// ── Valuation ───────────────────────────────────────────────────────────────

function buildValuation(args: { sviTotal: number; sviIndex: number; stageLabel: string; stage: number; industry: string | null; treScore: number | null; vc?: VcValuationLike | null; ask?: ValuationAskInput | null; revenueEvidenceIds?: string[]; at: string }): ValuationChapter {
  // S-R3 §C.5: with a CFO valuation the chapter is the real thing — methods,
  // inputs, derivation, cross-checks, consensus, ask cross-check, dated sector
  // multiples, comparables N, three-case scenarios (report-pipeline/valuation-chapter.ts).
  if (args.vc) {
    return buildValuationChapter({ vc: args.vc, stage: args.stage, stageLabel: args.stageLabel, industry: args.industry, sviIndex: args.sviIndex, ask: args.ask ?? null, revenueEvidenceIds: args.revenueEvidenceIds ?? [], at: args.at });
  }
  // Read-time fallback for stored rows that never ran the pipeline (no vc):
  // a directional three-case band, clearly labelled as such.
  const three = computeThreeCaseValuation(args.sviTotal, args.stageLabel, args.industry);
  const sel = selectValuationMethod(three.stage, args.sviTotal, inferTractionFromTreScore(args.treScore));
  const auIndustry = mapSectorToAUIndustry(args.industry ?? undefined);
  const auStage = mapStageToAUStage(args.stageLabel || args.stage);
  const mult = getMultiplesBenchmark(auIndustry, auStage);
  const live = comparablesCounts();
  const comps = topComparables(auIndustry, auStage, 5);
  // G19-S42: same shape as the pipeline chapter — every method non-applicable,
  // one honest line, the stage baseline as the only cross-check, no ask.
  const methods: ValuationChapter["methods"] = VALUATION_METHOD_KEYS.map((key) => ({
    method: key,
    lowAud: 0,
    midAud: 0,
    highAud: 0,
    weight: 0,
    rationale: "Not computed for this snapshot — run the analysis to get the CFO valuation; the three-case directional range below is shown instead.",
    applicable: false,
  }));
  const consensus = { lowAud: three.average.low, midAud: three.average.mid, highAud: three.average.high, confidence: 0.35 };
  const baselineStage = Math.max(0, Math.min(7, Math.round(Number.isFinite(args.stage) ? args.stage : 0)));
  const baseline = VALUATION_BASELINES_AUD[baselineStage];
  const crossChecks: ValuationChapter["crossChecks"] = [
    { label: `AU stage baseline — SVI stage ${baselineStage} pre-money`, lowAud: baseline.low, midAud: baseline.mid, highAud: baseline.high, source: "Cut Through Venture — State of Australian Startup Funding 2024/25 medians", asOf: "2025" },
  ];
  const scenarios = { bear: three.worst.mid, base: three.average.mid, bull: three.best.mid };
  const rangeBars = makeVisual({
    id: "valuation-range-bars",
    kind: "range_bars",
    agentId: "cfo",
    title: "Directional valuation — three cases and consensus",
    subtitle: `${sel.meta.shortLabel}; ${sel.rationale}`,
    dataState: "benchmark_only",
    data: {
      rows: [
        { label: "Bear case", low: three.worst.low, mid: three.worst.mid, high: three.worst.high },
        { label: "Base case", low: three.average.low, mid: three.average.mid, high: three.average.high },
        { label: "Bull case", low: three.best.low, mid: three.best.mid, high: three.best.high },
      ],
      consensus: { low: consensus.lowAud, mid: consensus.midAud, high: consensus.highAud, label: "Consensus" },
      currency: "AUD",
    },
    a11y: { tableFallback: [{ case: "bear", aud: scenarios.bear }, { case: "base", aud: scenarios.base }, { case: "bull", aud: scenarios.bull }] },
  });
  const scatter = makeVisual({
    id: "valuation-comparables",
    kind: "scatter",
    agentId: "cfo",
    title: `AU comparables — ${comps.length} nearest by sector / stage (ARR multiple)`,
    subtitle: `${live.n} raises tracked, ${live.withMultiplesN} with disclosed multiples (sources dated ${live.sourceWindow})`,
    dataState: "partial",
    data: { xLabel: "Founded year", yLabel: "ARR multiple (×)", points: comps.map((cp) => ({ label: cp.industry, x: cp.founded_year - 2000, y: cp.arr_multiple })) },
    a11y: { tableFallback: comps.map((cp) => ({ industry: cp.industry, stage: cp.stage, year: cp.founded_year, arr_multiple: cp.arr_multiple })) },
  });
  return {
    currency: "AUD",
    methods,
    consensus,
    // Key order mirrors the Zod schema so a parsed fixture serialises identically (fixtures.test).
    crossChecks,
    consistencyNotes: [],
    sectorMultiples: { sector: auIndustry, low: mult.low, median: mult.median, high: mult.high, sourceLabel: live.source === "table" ? "BlockID AU comparables (verified table)" : "BlockID AU comparables (code table)", sourceDate: live.sourceWindow },
    comparables: {
      n: live.n,
      withMultiplesN: live.withMultiplesN,
      rows: comps.map((cp) => ({ name: "anonymised", stage: cp.stage, industry: cp.industry, year: cp.founded_year, arrMultiple: cp.arr_multiple, source: live.sourceLabel })),
    },
    scenarios,
    visuals: [rangeBars, scatter],
    narrative: `${sel.meta.shortLabel}: ${sel.rationale} ${three.disclaimer} No CFO method ran on this snapshot — connect Stripe or Xero, or state MRR, and re-run the analysis to get the method table, inputs and cross-checks.`,
    audit: stamp(args.at),
  };
}

// ── Main adapter ────────────────────────────────────────────────────────────

export function fromSnapshot(input: SnapshotInput): ReportV2 {
  const at = input.generatedAt ?? (typeof input.createdAt === "number" ? new Date(input.createdAt).toISOString() : input.createdAt ? new Date(input.createdAt).toISOString() : new Date(0).toISOString());
  const tier: ReportTierV2 = input.tier ?? "standard";
  const stage = benchmarkStageFrom(input.stageLabel, input.stage);
  const stageLabel = (input.stageLabel && input.stageLabel.trim()) || BENCH_STAGE_LABELS[stage];
  const industry = (input.industry && input.industry.trim()) || null;

  // Criterion cards keyed by criterion.
  const cardsByKey = new Map<CriterionKey, CriterionCard>();
  for (const cs of input.criterionStates ?? []) {
    const def = CRITERIA.find((d) => d.key === cs.key);
    if (!def) continue;
    const score = clamp100(cs.score);
    cardsByKey.set(def.key, {
      key: def.key,
      title: cs.title || def.title,
      score,
      quality: qualityFromScore(score),
      verdict: String(cs.verdict ?? ""),
      strengths: Array.isArray(cs.strengths) ? cs.strengths.filter(Boolean) : [],
      gaps: Array.isArray(cs.gaps) ? cs.gaps.filter(Boolean) : [],
      nextAction: String(cs.next_action ?? ""),
      citations: [],
      grounded: false,
      agent: DIMENSION_OWNERS[def.primaryDimension as DimKey]?.primary ?? "ceo",
    });
  }
  const criterionScore = (key: CriterionKey): number | null => cardsByKey.get(key)?.score ?? null;

  // G19-S43: evidence rows per dimension + the facts the next-action rules check.
  const allEvidence: EvidenceRow[] = (input.evidenceRows ?? []).map((r) => ({ ...r, dims: [...r.dims] }));
  const verification = coverVerificationFor(input.verificationLevel);
  const facts: NextActionFacts = { abnVerified: verification.abnVerified, coFounders: typeof input.coFounders === "number" ? input.coFounders : null };

  // Dimension scores + benchmarks.
  const dimScores: Partial<Record<DimKey, number>> = {};
  const coverDims = {} as ReportV2["cover"]["dims"];
  const ctxs: ChapterCtx[] = [];
  for (const dim of DIM_ORDER) {
    const state = input.dimStates?.[dim] ?? { score: null };
    const scored = typeof state.score === "number" && Number.isFinite(state.score);
    const score = scored ? clamp100(state.score) : 0;
    if (scored) dimScores[dim] = score;
    const bench = DIMENSION_BENCHMARKS_BY_STAGE[dim]?.[stage] ?? { p25: 38, p50: 50, p75: 62 };
    const cohortMedian = input.cohort?.dim_medians?.[dim];
    const cohortTop = input.cohort?.dim_top_quartile?.[dim];
    // G21 P1 review: the cohort sets the anchors — and the only percentile —
    // once it clears the publication floor (publication-rules.ts, n ≥ 10).
    const cohortN = typeof input.cohort?.sample_size === "number" ? input.cohort.sample_size : null;
    const useCohort = typeof cohortMedian === "number" && typeof cohortTop === "number" && mayShowPercentile(cohortN ?? 0);
    const p50 = useCohort ? Math.round(cohortMedian) : bench.p50;
    const p75 = useCohort ? Math.round(cohortTop) : bench.p75;
    const p25 = useCohort ? Math.max(0, Math.round(p50 - (p75 - p50))) : bench.p25;
    // G19-S41: a ledger that says "no real input" makes the chapter pending
    // (band + "—") even though the baseline number is still a number.
    const breakdown = state.scoreBreakdown ?? undefined;
    const assessed = breakdown ? breakdown.assessed : true;
    const band: Band = scored && assessed ? bandFor(score) : "pending";
    // A rank exists only against a published cohort — the static stage
    // table is an editorial anchor, not a comparison set (score-governance § 7).
    const percentile = scored && assessed && useCohort ? (publishPercentile({ percentile: percentileFor(score, p25, p50, p75), n: cohortN ?? 0, segment: stageLabel })?.percentile ?? null) : null;
    const mapped = criteriaForDimension(dim);
    let cards = mapped.map((k) => cardsByKey.get(k)).filter((c): c is CriterionCard => Boolean(c));
    if (cards.length === 0) {
      const fallbackKey = mapped[0] ?? "idea";
      const def = CRITERIA.find((d) => d.key === fallbackKey)!;
      cards = [
        {
          key: def.key,
          title: def.title,
          score,
          quality: scored ? qualityFromScore(score) : "incomplete",
          verdict: scored ? `Derived from the ${DIMENSION_OWNERS[dim].title} dimension score — no criterion synthesis is stored in this snapshot.` : "Not scored in this snapshot.",
          strengths: [],
          gaps: [],
          nextAction: "",
          citations: [],
          grounded: false,
          agent: DIMENSION_OWNERS[dim].primary,
        },
      ];
    }
    coverDims[dim] = { score, weight: DIMENSION_OWNERS[dim].weight, band, p25, p50, p75, percentile };
    ctxs.push({ dim, score, scored, band, p25, p50, p75, percentile, n: cohortN, stage, stageLabel, cards, criterionScore, state, at, breakdown, assessed, evidence: allEvidence.filter((r) => r.dims.includes(dim)), facts });
  }

  const scoredDims = ctxs.filter((c) => c.scored);
  const totalWeight = scoredDims.reduce((a, c) => a + DIMENSION_OWNERS[c.dim].weight, 0);
  const derivedTotal = totalWeight > 0 ? Math.round(scoredDims.reduce((a, c) => a + (c.score * DIMENSION_OWNERS[c.dim].weight) / totalWeight, 0)) : 0;
  const sviTotal = typeof input.sviTotal === "number" && Number.isFinite(input.sviTotal) && input.sviTotal > 0 ? Math.round(input.sviTotal) : derivedTotal;
  const sviBand: Band = scoredDims.length ? bandFor(Math.min(100, sviTotal)) : "pending";

  // Phase gate from stored criteria + dims (deterministic).
  const criteriaQuality = Array.from(cardsByKey.values()).map((c) => ({ criterion_key: c.key, quality_level: c.quality }));
  const phase = inferPhase(input.phaseId, criteriaQuality, dimScores);

  // G19-S45: templated sentences in the report locale.
  const L = adapterStrings(input.locale);
  const dimensions = ctxs.map((c) => buildChapter(c, phase, tier, L, input.locale ?? "en"));

  // Executive summary.
  const ranked = [...scoredDims].sort((a, b) => b.score - a.score);
  // G19-S43: a dimension already in the strong band is not a gap ("0 below the strong band" is gone).
  const gapDims = [...ranked].reverse().filter((c) => c.score < 70 || !c.assessed).slice(0, 3);
  // G19-S43: the plan ranks the chapters' own next actions by the one lift
  // model — a chapter contributes when it is below the strong band, pending,
  // or has a linked missing input.
  const byLift = (a: { c: ChapterCtx; lift: number }, b: { c: ChapterCtx; lift: number }) => b.lift - a.lift || DIMENSION_OWNERS[b.c.dim].weight - DIMENSION_OWNERS[a.c.dim].weight;
  const qualifies = (c: ChapterCtx) => c.score < 70 || !c.assessed || c.evidence.some((r) => r.status === "missing" && r.cta);
  const candidates = [...ctxs.filter((c) => c.scored && qualifies(c)).map((c) => ({ c, lift: dimensions.find((d) => d.dim === c.dim)?.nextAction.expectedLift ?? 1 })).sort(byLift), ...ctxs.filter((c) => c.scored && !qualifies(c)).map((c) => ({ c, lift: dimensions.find((d) => d.dim === c.dim)?.nextAction.expectedLift ?? 1 })).sort(byLift)];
  // Two chapters that share a criterion (or a missing row) never list the
  // same step twice; the plan carries every qualifying chapter (≤ 5) and tops
  // up to 3 steps from the strongest chapters' own next steps.
  const seenTitles = new Set<string>();
  const roadmap: Array<{ c: ChapterCtx; lift: number }> = [];
  for (const item of candidates) {
    const title = dimensions.find((d) => d.dim === item.c.dim)?.nextAction.title.trim().toLowerCase() ?? "";
    if (!title || seenTitles.has(title)) continue;
    if (roadmap.length >= 5 || (!qualifies(item.c) && roadmap.length >= 3)) break;
    seenTitles.add(title);
    roadmap.push(item);
  }
  const above70 = scoredDims.filter((c) => c.score >= 70).length;
  const thesis =
    input.executiveSummary?.trim() ||
    (sviBand === "strong" ? L.thesisStrong(sviTotal, above70) : sviBand === "developing" ? L.thesisDeveloping(sviTotal, gapDims.length) : sviBand === "early" ? L.thesisEarly(sviTotal) : L.thesisPending);
  const valuation = buildValuation({ sviTotal: Math.min(100, sviTotal), sviIndex: sviTotal, stageLabel, stage, industry, treScore: dimScores.tre ?? null, vc: input.vc, ask: input.valuationAsk ?? null, revenueEvidenceIds: input.revenueEvidenceIds ?? [], at });
  const worthLine = L.worthLine(fmtShort(valuation.consensus.lowAud), fmtShort(valuation.consensus.highAud), industry ?? L.sectorNeutral, stageLabel);
  const nextLine = roadmap[0] ? L.nextLine(dimensions.find((d) => d.dim === roadmap[0].c.dim)?.nextAction.title ?? L.addEvidence, roadmap[0].lift, DIMENSION_OWNERS[roadmap[0].c.dim].shortLabel) : L.nextFallback;
  // G19-S44 (D5): the where-sentence names the 12-phase label only — the SVI stage label is benchmark-internal.
  const whereLine = L.whereLine(industry ?? L.startup, sviTotal, getTbrStrings(input.locale).v2.band[sviBand].toLowerCase(), phaseLabelFor(phase.currentPhase, input.locale), phase.completionPct);
  // G19-S44: cohort percentile — the caller's real cohort number, else the
  // mean dimension percentile when the sector cohort set the benchmarks,
  // else null (the Pctl column hides). G21 P1 review: either way it is
  // published only with its n (publication-rules.ts) — a number the caller
  // passed without a cohort size is dropped, never printed.
  const coverN = typeof input.cohort?.sample_size === "number" ? input.cohort.sample_size : 0;
  const dimPercentiles = DIM_ORDER.map((d) => coverDims[d].percentile).filter((p): p is number => typeof p === "number");
  const cohortUsed = mayShowPercentile(coverN) && dimPercentiles.length > 0;
  const rawCohortPercentile =
    typeof input.cohortPercentile === "number" && Number.isFinite(input.cohortPercentile)
      ? Math.max(1, Math.min(99, Math.round(input.cohortPercentile)))
      : cohortUsed
        ? Math.max(1, Math.min(99, Math.round(dimPercentiles.reduce((a, p) => a + p, 0) / dimPercentiles.length)))
        : null;
  const cohortPercentile = rawCohortPercentile === null ? null : (publishPercentile({ percentile: rawCohortPercentile, n: coverN, segment: stageLabel })?.percentile ?? null);

  const routeMap = (id: string, agentId: "ceo" | "coo") =>
    makeVisual({
      id,
      kind: "route_map",
      agentId,
      title: "Growth route — 12 phases",
      subtitle: `Current phase: ${phase.currentPhaseLabel}`,
      dataState: "real",
      data: {
        phases: GROWTH_PHASE_IDS.map((p, i) => ({ id: p, label: GROWTH_PHASE_LABELS[p].en, status: i + 1 < phase.phaseOrder ? "done" : i + 1 === phase.phaseOrder ? "current" : "upcoming" })),
      },
      a11y: { tableFallback: GROWTH_PHASE_IDS.map((p, i) => ({ phase: GROWTH_PHASE_LABELS[p].en, status: i + 1 < phase.phaseOrder ? "done" : i + 1 === phase.phaseOrder ? "current" : "upcoming" })) },
    });

  const cover: ReportV2["cover"] = {
    startupName: (input.startupName && input.startupName.trim()) || "Your startup",
    sector: industry ?? "Unclassified",
    stage,
    stageLabel,
    phaseId: phase.currentPhase,
    svi: { total: sviTotal, band: sviBand, cohortPercentile, cohortN: cohortPercentile === null ? null : coverN, deltaVsLast: typeof input.deltaVsLast === "number" ? input.deltaVsLast : null },
    dims: coverDims,
    threeQuestions: { where: words(whereLine, 30), worth: words(worthLine, 30), next: words(nextLine, 30) },
    visuals: [
      makeVisual({ id: "cover-score-ring", kind: "score_ring", agentId: "cdo", title: `SVI ${sviTotal}`, dataState: "real", data: { value: Math.min(100, sviTotal), label: "SVI", sublabel: sviBand, band: sviBand }, a11y: { tableFallback: [{ metric: "SVI", value: sviTotal, band: sviBand }] } }),
      makeVisual({
        id: "cover-radar",
        kind: "radar",
        agentId: "cdo",
        title: "8 dimensions vs stage median",
        subtitle: `Stage ${stageLabel} p50 dashed`,
        dataState: scoredDims.length === 8 ? "real" : "partial",
        data: { axes: DIM_ORDER.map((d) => ({ label: d.toUpperCase(), value: coverDims[d].score, reference: coverDims[d].p50 })), seriesLabel: "This startup", referenceLabel: `${stageLabel} p50` },
        a11y: { tableFallback: DIM_ORDER.map((d) => ({ dimension: d.toUpperCase(), score: coverDims[d].score, p50: coverDims[d].p50 })) },
      }),
      makeVisual({ id: "cover-three-questions", kind: "three_questions_strip", agentId: "ceo", title: "Where / Worth / Next", dataState: "real", data: { where: words(whereLine, 30), worth: words(worthLine, 30), next: words(nextLine, 30) } }),
    ],
    verification,
  };
  const sviLedger = sviLedgerFrom(input.sviLedger);
  if (sviLedger) cover.sviLedger = sviLedger;
  // G19-S43: "Evidence: mostly self-declared (×0.50)" beside the ledger strip.
  if (input.evidenceLevel) cover.evidenceLevel = { level: input.evidenceLevel.level, confidenceMultiplier: input.evidenceLevel.confidenceMultiplier };

  // G19-S44: strengths / gaps from the criterion cards by lift (never score
  // restatements); confidence = mean chapter-ledger confidence (S41), with
  // the pre-S41 fallback only when no chapter carries a ledger.
  const fromCards = executiveFromChapters(dimensions, input.locale);
  const executive: ReportV2["executive"] = {
    thesis,
    strengths: fromCards.strengths,
    gaps: fromCards.gaps,
    verdict: thesis,
    confidence: fromCards.confidence ?? (scoredDims.length ? 0.5 : 0.1),
    phaseNow: phase,
    visuals: [routeMap("exec-route-map", "ceo")],
    audit: stamp(at),
  };

  // Phase gates 13 × 12.
  const qualityByKey = new Map(criteriaQuality.map((c) => [c.criterion_key, c.quality_level]));
  const matrix: ReportV2["phaseGates"]["matrix"] = [];
  for (const p of GROWTH_PHASE_IDS) {
    const req = new Set<string>(PHASE_EXIT_RULES[p].requiredCriteria);
    for (const def of CRITERIA) {
      const quality = qualityByKey.get(def.key) ?? "incomplete";
      const required = req.has(def.key);
      const met = required ? ["good", "strong", "exceptional"].includes(quality) : true;
      matrix.push({ criterion: def.key, phase: p, required, quality, met });
    }
  }
  const gateHeat = makeVisual({
    id: "phase-gates-heatmap",
    kind: "heat_map",
    agentId: "coo",
    title: "13 criteria × 12 phases — required gates met",
    subtitle: "✓ required and met · ✗ required, not met · – not required",
    dataState: "real",
    width: 520,
    data: {
      rows: CRITERIA.map((d) => d.title),
      cols: GROWTH_PHASE_IDS.map((p) => GROWTH_PHASE_LABELS[p].en.split(" ")[0]),
      cells: CRITERIA.map((d) => GROWTH_PHASE_IDS.map((p) => {
        const row = matrix.find((m) => m.criterion === d.key && m.phase === p)!;
        return row.required ? (row.met ? 100 : 30) : 0;
      })),
      cellLabels: CRITERIA.map((d) => GROWTH_PHASE_IDS.map((p) => {
        const row = matrix.find((m) => m.criterion === d.key && m.phase === p)!;
        return row.required ? (row.met ? "✓" : "✗") : "–";
      })),
    },
    a11y: { tableFallback: matrix.filter((m) => m.required).map((m) => ({ criterion: m.criterion, phase: m.phase, met: m.met ? "yes" : "no" })) },
  });

  // Money on the table — G19-S43: the matches GATHER found (grant-advisor on
  // the saved grant profile) when the caller passes them; otherwise an honest
  // empty state that points at the grant profile, never "re-run the analysis".
  const money = buildMoneyOnTable(input.moneyOnTable ?? null);

  // 90-day plan from the roadmap — G19-S43: ≤ 5 steps spread across the three
  // columns by lift rank (1st → day 30, 2nd → 60, 3rd → 90, 4th → 30 …) so a
  // plan with ≥ 3 steps always fills every column; each step is its chapter's
  // next action with the same lift and evidence source. The engine's P0 / P1
  // evidence gaps ride along as linked CTA rows.
  const steps: ActionStep[] = roadmap.map(({ c, lift }, i) => {
    const chapter = dimensions.find((d) => d.dim === c.dim)!;
    const cardKey = chapter.criteria.find((k) => k.nextAction.trim() === chapter.nextAction.title)?.key;
    return {
      day: [30, 60, 90][i % 3] as 30 | 60 | 90,
      title: chapter.nextAction.title,
      ownerAgent: DIMENSION_OWNERS[c.dim].primary,
      dimension: c.dim,
      criterion: cardKey ?? DIMENSION_OWNERS[c.dim].primaryCriteria[0],
      expectedLift: lift,
      ...(chapter.nextAction.evidenceToAdd ? { evidenceToAdd: chapter.nextAction.evidenceToAdd } : {}),
    };
  });
  const planEvidenceToAdd = evidenceGapRows(input.evidenceGaps ?? [], at);
  const gantt = makeVisual({
    id: "action-plan-gantt",
    kind: "gantt",
    agentId: "coo",
    title: "90-day action plan",
    dataState: "real",
    data: { rows: steps.map((s) => ({ label: s.title, start: s.day - 30, end: s.day, owner: s.ownerAgent })), horizon: 90, unit: "d" },
    a11y: { tableFallback: steps.map((s) => ({ day: s.day, step: s.title, owner: s.ownerAgent, lift: s.expectedLift })) },
  });

  const report: ReportV2 = {
    schemaVersion: REPORT_V2_SCHEMA_VERSION,
    reportId: input.reportId ?? (input.snapshotId ? `rv2-${input.snapshotId}` : "rv2-adapter"),
    snapshotId: input.snapshotId ?? "",
    projectId: input.projectId ?? "",
    accountId: input.accountId ?? "",
    tier,
    locale: input.locale ?? "en",
    generatedAt: at,
    promptVersionIds: {},
    pipelineVersion: "adapter-v1-snapshot",
    source: input.source ?? "adapter",
    cover,
    executive,
    dimensions,
    valuation,
    phaseGates: { current: phase.currentPhase, matrix, blockers: [...phase.blockers], visuals: [gateHeat, routeMap("phase-gates-route", "coo")] },
    moneyOnTable: money,
    actionPlan: { horizonDays: 90, steps, visuals: [gantt], ...(planEvidenceToAdd.length ? { evidenceToAdd: planEvidenceToAdd } : {}) },
    appendix: {
      method: L.method,
      dataPrinciple: DATA_PRINCIPLE_SENTENCE,
      disclaimer: L.disclaimer,
      evidenceRegister: allEvidence,
      auditLog: [],
      comparablesN: comparablesCounts().n,
      comparablesWithMultiplesN: comparablesCounts().withMultiplesN,
      sourcesDated: [
        { label: comparablesCounts().source === "table" ? "AU comparables (BlockID verified table)" : "AU comparables (BlockID code table)", date: comparablesCounts().sourceWindow },
        { label: "SVI stage benchmarks (svi-dimension-benchmarks.ts)", date: "2026" },
        ...(input.cohort?.updated_at ? [{ label: `Sector cohort (${input.cohort.sector ?? "default"}, N=${input.cohort.sample_size ?? 0})`, date: input.cohort.updated_at }] : []),
        // G19-S42: the backtest behind the valuation quartile cross-check.
        ...(input.vc?.backtest?.generated_at ? [{ label: `SVI backtest quartiles (N=${input.vc.backtest.n} scorable rows)`, date: input.vc.backtest.generated_at.slice(0, 10) }] : []),
      ],
    },
    quality: {
      score: typeof input.qualityScore === "number" ? input.qualityScore : Math.round((scoredDims.length / 8) * 100),
      groundedShare: 0,
      consistencyIssues: input.consistencyIssues ?? [],
      degradedSections: ctxs.filter((c) => !c.scored).map((c) => c.dim),
    },
    pageBudget: { free: FREE_PAGE_BUDGET },
  };
  // G19-S47: the executive sections (headline / paragraphs / reasons / gaps /
  // verdict / actions) are always present — parsed from the summary text or
  // built from the chapters, the valuation and the plan.
  const structured = ensureExecutiveStructured(report);
  // G23-A: a read-time projection never ran the llm-auditor sweep, so its
  // grounded share is the deterministic citation gate over the same sections
  // (the pipeline overwrites this with the audited value in buildReportV2).
  const grounding = groundingAudit(structured);
  structured.quality.groundedShare = grounding.groundedShare;
  for (const d of structured.dimensions) {
    const sec = grounding.sections.find((x) => x.id === `dim:${d.dim}`);
    if (sec) d.audit = { ...d.audit, grounded: sec.grounded, uncited: sec.uncited.length };
  }
  return structured;
}

function fmtShort(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

// ── G14-S36: cover verification badge ───────────────────────────────────────

/** `projects.verification_level` → the cover block; unknown reads as L0 "ABN not verified". */
export function coverVerificationFor(level: number | null | undefined): CoverVerification {
  const meta = verificationMeta(level ?? 0);
  return { level: meta.level, abnVerified: meta.abnVerified, label: verificationBadgeLabel(meta.level) };
}

// ── AssembledReport → ReportV2 ──────────────────────────────────────────────

export interface AssembledReportContext {
  snapshotId?: string | null;
  projectId?: string | null;
  /** G14-S36: projects.verification_level (0–5). */
  verificationLevel?: number | null;
  accountId?: string | null;
  startupName?: string | null;
  industry?: string | null;
  stageLabel?: string | null;
  stage?: number | null;
  sviTotal?: number | null;
  dimensionScores?: Record<string, number> | null;
  /** SVIAnalysis.subs — gaps become insights; G19-S41: `breakdown` / `assessed` / `base` / `adjustment` become the chapter ledger. */
  subs?: SubScoreLike[] | null;
  /** G19-S41: pass the whole `SVIAnalysis` — `ledger` fills the cover strip, `confidenceMultiplier` + `meta.verification` the chapter ledgers. */
  sviAnalysis?: SviAnalysisLike | null;
  phaseId?: string | null;
  tier?: ReportTierV2;
  locale?: ReportV2["locale"];
  vc?: VcValuationLike | null;
  valuationAsk?: ValuationAskInput | null;
  revenueEvidenceIds?: string[] | null;
  /** G19-S43: GATHER + Evidence Hub rows (`context.evidenceRows`) — chapter evidence tables + register + CTA rows. */
  evidenceRows?: EvidenceRow[] | null;
  /** G19-S43: GATHER `results.grants` → Money on the Table. */
  moneyOnTable?: MoneyOnTableInput | null;
  /** G19-S44: overrides `sviAnalysis.cohortPercentile` when the caller has a fresher number (published only with `sviAnalysis.cohortPercentile.cohortSize` as its n). */
  cohortPercentile?: number | null;
}

/**
 * Adapter from today's C-level pipeline output. Mirrors
 * run-for-project.ts:projectReportToSnapshotShapes (criterion sections →
 * cards, sections by primary dimension → chapter narrative) and then goes
 * through `fromSnapshot`, so both stored shapes yield the same document.
 */
export function fromAssembledReport(report: Pick<AssembledReport, "id" | "tier" | "sections" | "executiveSummary" | "qualityScore" | "consistencyIssues" | "createdAt">, ctx: AssembledReportContext = {}): ReportV2 {
  const byCriterion = new Map<string, ReportSection>();
  for (const s of report.sections) if (s.criterion) byCriterion.set(s.criterion, s);
  const criterionStates: SnapshotCriterionState[] = CRITERIA.filter((c) => byCriterion.has(c.key)).map((c) => {
    const s = byCriterion.get(c.key)!;
    const score = typeof s.score === "number" ? Math.round(s.score) : 0;
    return {
      key: c.key,
      title: c.title,
      primary_dimension: c.primaryDimension,
      weight: c.weight,
      score,
      verdict: words(firstParagraph(s.content) || s.title, 60),
      strengths: [],
      gaps: [],
      next_action: "",
    };
  });
  const subByKey = new Map((ctx.subs ?? []).map((s) => [s.key, s]));
  const dimStates: Record<string, SnapshotDimState> = {};
  for (const dim of DIM_ORDER) {
    const fromMap = ctx.dimensionScores?.[dim];
    const sub = subByKey.get(dim);
    const raw = typeof fromMap === "number" ? fromMap : sub?.value;
    const sections = CRITERIA.filter((c) => c.primaryDimension === dim).map((c) => byCriterion.get(c.key)).filter((s): s is ReportSection => Boolean(s));
    dimStates[dim] = {
      status: "complete",
      score: typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : null,
      markdown: sections.length ? sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n") : null,
      insights: sub ? [...(sub.gaps ?? []).slice(0, 3)] : [],
      priority: null,
      marketBenchmark: null,
      scoreBreakdown: scoreBreakdownFromSub(sub, ctx.sviAnalysis) ?? null,
    };
  }
  const tier: ReportTierV2 = ctx.tier ?? (report.tier === "standard" || report.tier === "premium" || report.tier === "investor_memo" ? report.tier : "standard");
  return fromSnapshot({
    sviLedger: ctx.sviAnalysis?.ledger ?? null,
    reportId: report.id,
    snapshotId: ctx.snapshotId,
    projectId: ctx.projectId,
    accountId: ctx.accountId,
    createdAt: report.createdAt,
    startupName: ctx.startupName,
    industry: ctx.industry,
    stageLabel: ctx.stageLabel,
    stage: ctx.stage,
    sviTotal: ctx.sviTotal,
    dimStates,
    criterionStates,
    // G21 P1 review: the published rank only (null below the floor / on the
    // static fallback) — `percentileRank` is a static-table estimate and is
    // never passed on.
    cohortPercentile: ctx.cohortPercentile ?? publishedFromCohort(ctx.sviAnalysis?.cohortPercentile)?.percentile ?? null,
    cohort: ctx.sviAnalysis?.cohortPercentile?.cohortSize ? { sample_size: ctx.sviAnalysis.cohortPercentile.cohortSize } : null,
    phaseId: ctx.phaseId,
    verificationLevel: ctx.verificationLevel ?? null,
    tier,
    locale: ctx.locale,
    executiveSummary: report.executiveSummary,
    qualityScore: report.qualityScore,
    consistencyIssues: report.consistencyIssues,
    vc: ctx.vc,
    valuationAsk: ctx.valuationAsk ?? null,
    revenueEvidenceIds: ctx.revenueEvidenceIds ?? null,
    // G19-S43
    evidenceRows: ctx.evidenceRows ?? null,
    evidenceGaps: ctx.sviAnalysis?.evidenceGaps ?? null,
    coFounders: ctx.sviAnalysis?.signals?.hasCoFounder === true ? 2 : ctx.sviAnalysis?.signals?.hasCoFounder === false ? 1 : null,
    evidenceLevel: coverEvidenceLevelFrom(ctx.sviAnalysis) ?? null,
    moneyOnTable: ctx.moneyOnTable ?? null,
    source: "adapter",
  });
}

/**
 * Reader helper: prefer a stored `report_v2` when it looks valid, otherwise
 * build one from the v1 snapshot columns. Never throws on a bad stored row.
 */
export function resolveReportV2(stored: unknown, fallback: SnapshotInput, validate: (v: unknown) => v is ReportV2): ReportV2 {
  // G19-S47: a document stored before S47 (or with a stale block) gets its
  // executive sections on read — the same parser the pipeline uses.
  // G27: the investment view (verdict band, conditions, key points, risk
  // matrix, plan, takeaways) is derived on read the same way, so every stored
  // document renders v3 without regeneration.
  if (stored && validate(stored)) return ensureInvestmentView(ensureExecutiveStructured(stored));
  return ensureInvestmentView(fromSnapshot(fallback));
}

export type { DimKey, GrowthPhaseId };
