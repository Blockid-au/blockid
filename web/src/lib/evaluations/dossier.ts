// Investor Dossier loader (G13-W2-D1, S-D1) — BA spec §A.1–A.4, §C.1, §C.3.
//
// One call builds everything /workspace/evaluations/[evaluationId] and
// GET /api/evaluations/[id]/dossier render, from PERSISTED rows only (no
// model call on render):
//
//   round 0  evaluations ⋈ projects by evaluation id — the ONE lookup that
//            decides access (evaluator → "assessor", founder who claimed →
//            "founder"; anyone else → null, which the callers turn into 404
//            — never 403, the id must not confirm a row exists).
//   round 1  in parallel, all keyed on ids known after round 0:
//            latest svi_snapshots (with report_v2 when 0395 is applied) ·
//            the snapshot ≥ 30 days old (Δ30d) · startup_taxonomy ·
//            evaluation_assessments (masked by viewer role) ·
//            svi_dimension_evidence rows · connector_snapshots providers ·
//            latest evaluation_reports (share token).
//   round 2  ONLY on a cache miss: stage-cohort percentile
//            (computeCohortPercentile, 10-minute in-process cache).
//
// Consent masking happens HERE, server-side (§C.1): the evidence block is
// projected by `evaluations.consent_tier` before anything leaves this
// module, and the founder preview is the same tier projection WITHOUT any
// assessment field (assessments.ts owns that allow-list).
//
// Everything degrades honestly: a missing 0392 / 0395 column or table, a
// project with no snapshot, or a taxonomy row that does not exist all
// render as explicit states ("Not scored yet", "Unclassified",
// "Assessment not available yet") — never a thrown page.
//
// G13-W4-R4 (S-R4) adds, from the same ReportV2 + persisted rows:
//   block 2  Valuation (ReportV2.valuation + the assessor's own view)
//   block 5  Progress radar scoped to this evaluation + "since my last
//            assessment"
//   header   mandate fit (primary mandate × this startup; persisted row or
//            scoreFit on read) and "Δ since last view" (previous
//            `dossier.viewed` audit row of this viewer)
// G13-W5-D3 (S-D3) adds, in the same second round: the seats consensus
// (lib/investor/organisations.ts — every same-org seat's current
// assessment, Appendix-2 medians / tally / disagreement) and the viewer's
// audit trail on this evaluation (block 6). `resolveDossierAccess` also
// admits a same-org seat as an assessor of their own seat (F1).
// Builders live in dossier-blocks.ts; the round shape stays ONE Promise.all.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AU_STATES, EVALUATION_OWNER_KINDS, mapEvaluationRow, type AuState, type Evaluation } from "@/lib/evaluations";
import { MENTOR_ACCESS_TIERS, TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import { getTaxonomy } from "@/lib/taxonomy/store";
import { BUSINESS_MODEL_LABELS, INDUSTRY_LABELS, type StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";
import { CANONICAL_STAGE_LABELS, sviStageToCanonical } from "@/lib/journey-vocabulary";
import { coverVerificationFor, resolveReportV2, type SnapshotDimState, type SnapshotCriterionState } from "@/lib/report-v2/adapter";
import { isReportV2, type CoverVerification, type ReportV2 } from "@/lib/report-v2/schema";
import { readEvaluationReportV2 } from "@/lib/report-v2/storage";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { CRITERIA, CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import { bandFor } from "@/lib/report-visuals/palette";
import { hubRowToDimensionEvidence, type DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import { assessmentCardFromReport, type AssessmentCardData } from "@/lib/svi/assessment-card";
import { loadAssessmentContext, assessmentCardOptionsFromContext } from "@/lib/svi/assessment-context";
import { connectorFreshness, staleConnectorCount } from "@/lib/evidence/freshness";
import { makeVisual } from "@/lib/report-visuals";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import { computeCohortPercentile, type CohortPercentileSource } from "@/lib/agents/cohort-percentile";
import { benchmarkLabel, publishedFromCohort } from "@/lib/benchmarks/publication-rules";
import { reportUrlForToken, pdfUrlForToken } from "@/lib/evaluations/report-quota";
import {
  getAssessment,
  type AssessmentHistoryEntry,
  type AssessmentViewerRole,
  type EvaluationAssessment,
  type FounderVisibleAssessment,
} from "@/lib/evaluations/assessments";
import {
  buildValuationBlock,
  emptyProgressBlock,
  readMandateFit,
  readProgressBlock,
  readSinceLastView,
  type DossierMandateFit,
  type DossierProgressBlock,
  type DossierSinceLastView,
  type DossierValuationBlock,
} from "./dossier-blocks";
import { emptyConsensus, readConsensus, shareOrg, type DossierConsensus } from "@/lib/investor/organisations";
import { readAuditTrail, type DossierAuditEntry } from "./dossier-audit";
import { loadFounderExecutionContext } from "@/lib/founder/execution-load";
import { founderExecutionSignals } from "@/lib/founder/execution";

export type { DossierMandateFit, DossierProgressBlock, DossierSinceLastView, DossierValuationBlock, DossierConsensus, DossierAuditEntry };

// ─── Public types ───────────────────────────────────────────────────────────

export type DossierViewerRole = Extract<AssessmentViewerRole, "assessor" | "founder">;

export interface DossierBadge {
  axis: "industry" | "business_model" | "stage";
  label: string;
  /** true when the value is the honest "Unclassified" state (never guessed). */
  unclassified: boolean;
  /** auto | founder | evaluator | fallback (projects.industry / stage) */
  source: string;
}

export interface DossierHeader {
  evaluationId: string;
  projectId: string;
  projectSlug: string;
  name: string;
  website: string | null;
  state: AuState | null;
  label: string | null;
  badges: DossierBadge[];
  svi: number | null;
  sviBand: Band;
  /** latest − snapshot ≥ 30 days old; null when there is no older snapshot. */
  delta30d: number | null;
  /**
   * Stage-cohort rank. G21 P1 review: `value` is the PUBLISHED percentile
   * (lib/benchmarks/publication-rules.ts) — null below the floor / on the
   * static fallback, with `cohortSize` + `label` saying why ("not enough
   * comparable companies (n = 3)"). The whole field is null only when no
   * score exists or the cohort read failed.
   */
  percentile: { value: number | null; source: CohortPercentileSource; cohortSize: number; label: string } | null;
  consentTier: MentorAccessTier;
  ownerKind: Evaluation["ownerKind"];
  founderClaimed: boolean;
  lastSnapshotAt: string | null;
  snapshotId: string | null;
  evidence: { items: number; connected: number; providers: string[] };
  /** G14-S36: projects.verification_level (0–5) → "Verified ABN" (L2+) / "ABN not verified" badge. */
  verification: CoverVerification;
  /** assessor only — the founder never receives a decision (§C.1). */
  decision: { value: EvaluationAssessment["decision"]; status: EvaluationAssessment["status"]; version: number } | null;
  /** S-R4, assessor only: fit of the viewer's primary mandate to this startup; null = no mandate / founder. */
  mandateFit: DossierMandateFit | null;
  /** S-R4: this viewer's previous dossier view of this evaluation and the SVI movement since; null on the first view. */
  sinceLastView: DossierSinceLastView | null;
  /** S-D3, assessor only: "Firm consensus (submitted/seats)" + the aggregate decision; null for a founder or a single personal seat. */
  consensus: { label: string; submitted: number; seats: number; aggregate: DossierConsensus["aggregate"] } | null;
  /** S-D3: true when the viewer opened this dossier as a same-org seat (not the evaluator who added it). */
  viaOrgSeat: boolean;
}

export interface DossierDimRow {
  dim: DimKey;
  code: string;
  title: string;
  weight: number;
  score: number | null;
  band: Band;
  delta30d: number | null;
  p50: number;
  percentile: number | null;
  ownerAgent: string;
}

export interface DossierCriterionRow {
  key: CriterionKey;
  title: string;
  primaryDimension: string;
  score: number | null;
  verdict: string;
  evidenceCount: number;
  /** Evidence bonus ladder of the strongest item, "self_declared" when none. */
  strongestSource: string;
  ownerAgent: string;
}

/** G14-S37: the FTV "Founder Execution" block — the rubric over the owner founder_profiles row. */
export interface DossierFounderExecution {
  score: number;
  rawScore: number;
  capped: boolean;
  capReason: string | null;
  capLiftedBy: "references_checked" | "linkedin_parser" | null;
  structured: boolean;
  rubricVersion: string;
  breakdown: Array<{ key: string; label: string; points: number; max: number; evidence: string; source: string }>;
}

export interface DossierReportBlock {
  available: boolean;
  source: ReportV2["source"] | null;
  radar: VisualSpecV2 | null;
  dims: DossierDimRow[];
  criteria: DossierCriterionRow[];
  /** per-dimension evidence counts (always visible, every tier) */
  evidenceCounts: Record<DimKey, number>;
  links: { fullReport: string | null; pdf: string | null; analyze: string };
  /** G14-S37: null when the owner has no founder profile (or the loader failed). */
  founderExecution?: DossierFounderExecution | null;
}

export interface DossierEvidenceItem {
  dimension: string;
  type: string;
  label: string;
  confidence: string;
  createdAt: string | null;
  /** only ≥ full_mentor (public URLs also at reports_shared) */
  url: string | null;
}

export interface DossierEvidenceBlock {
  tier: MentorAccessTier;
  /** counts only at attributed_only; items at ≥ reports_shared */
  items: DossierEvidenceItem[] | null;
  countsByDimension: Record<DimKey, number>;
  connectedProviders: string[];
  dataroomAvailable: boolean;
  requestUpgrade: MentorAccessTier | null;
}

export interface DossierAssessmentBlock {
  available: boolean;
  /** assessor only */
  mine: EvaluationAssessment | null;
  history: AssessmentHistoryEntry[];
  /** founder only, after share */
  sharedWithFounder: FounderVisibleAssessment | null;
}

export interface DossierView {
  viewer: { role: DossierViewerRole; userId: string };
  header: DossierHeader;
  /** G21-P1-B: the BlockID Assessment Card (SVI · Evidence Confidence · BlockID Verified · strength / gap · unverified claims); null without a report. */
  assessmentCard: AssessmentCardData | null;
  report: DossierReportBlock;
  /** block 2 — S-R4 */
  valuation: DossierValuationBlock;
  evidence: DossierEvidenceBlock;
  assessment: DossierAssessmentBlock;
  /** block 5 — S-R4 */
  progress: DossierProgressBlock;
  /** block 4 seats table — S-D3 (assessor only; null for the founder — no seat field ever reaches the preview, §C.1). */
  consensus: DossierConsensus | null;
  /** block 6 — S-D3: the viewer's audit rows on this evaluation (ids + actions, never note bodies). */
  auditTrail: DossierAuditEntry[];
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const DIM_UPPER: Record<DimKey, string> = { tre: "TRE", mpc: "MPC", ftv: "FTV", ptd: "PTD", cgh: "CGH", iri: "IRI", lco: "LCO", svm: "SVM" };
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isMissingRelation = (e: { code?: string; message?: string } | null | undefined): boolean => {
  if (!e) return false;
  if (e.code === "42P01" || e.code === "42703") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find");
};
const emptyCounts = (): Record<DimKey, number> => ({ tre: 0, mpc: 0, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 });

interface SnapshotRow {
  id: string;
  svi_total: number | null;
  stage: number | null;
  created_at: string;
  criterion_results: unknown;
  dim_results: unknown;
  dimension_scores: unknown;
  analysis_json: unknown;
  report_v2?: unknown;
}

const SNAPSHOT_COLUMNS = "id, svi_total, stage, created_at, criterion_results, dim_results, dimension_scores, analysis_json";

/** `dim_results` → adapter input; falls back to bare `dimension_scores`. */
export function snapshotDimStates(row: Pick<SnapshotRow, "dim_results" | "dimension_scores">): Record<string, SnapshotDimState> {
  const out: Record<string, SnapshotDimState> = {};
  const dr = row.dim_results && typeof row.dim_results === "object" ? (row.dim_results as Record<string, Row>) : null;
  const ds = row.dimension_scores && typeof row.dimension_scores === "object" ? (row.dimension_scores as Record<string, unknown>) : {};
  for (const k of DIM_ORDER) {
    const v = dr?.[k];
    if (v && typeof v === "object") {
      out[k] = {
        status: typeof v.status === "string" ? v.status : "complete",
        score: num(v.score),
        markdown: typeof v.markdown === "string" ? v.markdown : null,
        insights: Array.isArray(v.insights) ? (v.insights as string[]) : [],
        priority: v.priority === "high" || v.priority === "medium" || v.priority === "low" ? v.priority : null,
        marketBenchmark: typeof v.marketBenchmark === "string" ? v.marketBenchmark : null,
      };
      continue;
    }
    const raw = ds[k];
    const score = typeof raw === "number" ? raw : raw && typeof raw === "object" ? num((raw as Row).score) : null;
    out[k] = { status: score == null ? "idle" : "complete", score, markdown: null, insights: [], priority: null, marketBenchmark: null };
  }
  return out;
}

/** Bare per-dimension numbers from an older snapshot (for Δ30d). */
export function snapshotDimScores(row: Pick<SnapshotRow, "dim_results" | "dimension_scores"> | null): Partial<Record<DimKey, number>> {
  if (!row) return {};
  const out: Partial<Record<DimKey, number>> = {};
  const states = snapshotDimStates(row);
  for (const k of DIM_ORDER) {
    const s = states[k]?.score;
    if (typeof s === "number") out[k] = s;
  }
  return out;
}

// 10-minute in-process cache for the stage-cohort percentile (§C.3).
const PERCENTILE_TTL_MS = 10 * 60 * 1000;
const percentileCache = new Map<string, { at: number; value: DossierHeader["percentile"] }>();
export function __resetDossierCaches(): void {
  percentileCache.clear();
}
async function cachedPercentile(svi: number, stage: number): Promise<DossierHeader["percentile"]> {
  const key = `${stage}:${Math.round(svi)}`;
  const hit = percentileCache.get(key);
  if (hit && Date.now() - hit.at < PERCENTILE_TTL_MS) return hit.value;
  try {
    const r = await computeCohortPercentile({ sviScore: svi, stage, fallbackPercentile: 50 });
    // G21 P1 review: only the published rank — never the legacy `percentile`
    // (the static-table estimate) — and always with its n.
    const published = publishedFromCohort(r);
    const value = { value: published?.percentile ?? null, source: r.source, cohortSize: r.cohortSize, label: published?.label ?? benchmarkLabel(r.cohortSize) };
    percentileCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

// ─── Consent projection (§A.3 block 3) ──────────────────────────────────────

export interface EvidenceRowInput {
  dimension: string;
  evidence_type: string;
  evidence_label: string;
  confidence_level: string;
  evidence_value_or_url: string | null;
  created_at: string | null;
  /** G21-P1-B: reviewer signature + review state feed the Assessment Card (verified / unverified counts). */
  is_verified?: boolean | null;
  verified_at?: string | null;
  review_status?: string | null;
}

/** G21-P1-B: Evidence Hub rows → the per-dimension items the Assessment Card builder reads. */
export function dossierEvidenceByDim(rows: readonly EvidenceRowInput[]): Record<string, DimensionEvidenceItem[]> {
  const out: Record<string, DimensionEvidenceItem[]> = {};
  for (const r of rows) {
    const item = hubRowToDimensionEvidence({ ...r, dimension: r.dimension, evidence_type: r.evidence_type, updated_at: null });
    if (!item) continue;
    (out[r.dimension.toLowerCase()] ??= []).push(item);
  }
  return out;
}

const SOURCE_LADDER = ["self_declared", "public_url", "document_uploaded", "connected_source", "transaction_data", "third_party_verified"];
const ladderRank = (c: string): number => Math.max(0, SOURCE_LADDER.indexOf(c));

/**
 * Pure: project the raw evidence rows by consent tier. attributed_only →
 * counts only; reports_shared → items without document links;
 * full_mentor → items + links + data-room flag.
 */
export function projectEvidenceByTier(tier: MentorAccessTier, rows: EvidenceRowInput[], providers: string[]): DossierEvidenceBlock {
  const counts = emptyCounts();
  for (const r of rows) {
    const d = r.dimension.toLowerCase() as DimKey;
    if (d in counts) counts[d] += 1;
  }
  const rank = TIER_RANK[tier];
  const items: DossierEvidenceItem[] | null =
    rank >= TIER_RANK.reports_shared
      ? rows.map((r) => ({
          dimension: r.dimension.toLowerCase(),
          type: r.evidence_type,
          label: r.evidence_label,
          confidence: r.confidence_level,
          createdAt: r.created_at,
          url:
            rank >= TIER_RANK.full_mentor
              ? r.evidence_value_or_url
              : r.confidence_level === "public_url" && /^https?:\/\//i.test(r.evidence_value_or_url ?? "")
                ? r.evidence_value_or_url
                : null,
        }))
      : null;
  return {
    tier,
    items,
    countsByDimension: counts,
    connectedProviders: providers,
    dataroomAvailable: rank >= TIER_RANK.full_mentor,
    requestUpgrade: rank >= TIER_RANK.full_mentor ? null : (MENTOR_ACCESS_TIERS[rank + 1] as MentorAccessTier),
  };
}

// ─── Block 1 projection ─────────────────────────────────────────────────────

const AGENT_LABEL: Record<string, string> = {
  ceo: "CEO", cfo: "CFO", cmo: "CMO", cto: "CTO", cpo: "CPO", cro: "CRO", chro: "CHRO", clo: "CLO", cdo: "CDO", ciso: "CISO", coo: "COO",
};
export const agentLabel = (id: string): string => AGENT_LABEL[id] ?? id.toUpperCase();

export function buildDimRows(report: ReportV2, older: Partial<Record<DimKey, number>>): DossierDimRow[] {
  return DIM_ORDER.map((dim) => {
    const c = report.cover.dims[dim];
    const owner = DIMENSION_OWNERS[dim];
    const chapter = report.dimensions.find((d) => d.dim === dim);
    const scored = chapter ? chapter.band !== "pending" : c.band !== "pending";
    const score = scored ? c.score : null;
    const prev = older[dim];
    return {
      dim,
      code: DIM_UPPER[dim],
      title: owner.title,
      weight: owner.weight,
      score,
      band: scored ? c.band : "pending",
      delta30d: score != null && typeof prev === "number" ? Math.round((score - prev) * 10) / 10 : null,
      p50: c.p50,
      percentile: scored ? c.percentile : null,
      ownerAgent: agentLabel(owner.primary),
    };
  });
}

export function buildCriterionRows(report: ReportV2 | null, evidenceCounts: Record<DimKey, number>, strongestByDim: Partial<Record<DimKey, string>>): DossierCriterionRow[] {
  const cards = new Map<string, { score: number; verdict: string; citations: number; agent: string }>();
  if (report) {
    for (const ch of report.dimensions) {
      for (const card of ch.criteria) {
        if (!cards.has(card.key)) cards.set(card.key, { score: card.score, verdict: card.verdict, citations: card.citations.length, agent: card.agent });
      }
    }
  }
  return CRITERION_KEYS.map((key) => {
    const def = CRITERIA.find((c) => c.key === key)!;
    const card = cards.get(key);
    const dim = def.primaryDimension as DimKey;
    const dimCount = evidenceCounts[dim] ?? 0;
    const evidenceCount = Math.max(card?.citations ?? 0, dimCount);
    return {
      key,
      title: def.title,
      primaryDimension: DIM_UPPER[dim] ?? def.primaryDimension.toUpperCase(),
      score: card && Number.isFinite(card.score) ? Math.round(card.score) : null,
      verdict: card?.verdict?.trim() || (report ? "Not assessed in this snapshot." : "Not scored yet."),
      evidenceCount,
      strongestSource: evidenceCount > 0 ? (strongestByDim[dim] ?? "self_declared") : "self_declared",
      ownerAgent: agentLabel(card?.agent ?? def.primaryAgent),
    };
  });
}

export function buildBadges(tax: StartupTaxonomyRow | null, project: { industry: string | null; stage: number | null }): DossierBadge[] {
  const industry: DossierBadge =
    tax && tax.industry !== "unclassified"
      ? { axis: "industry", label: INDUSTRY_LABELS[tax.industry].en, unclassified: false, source: tax.sources.industry ?? "auto" }
      : project.industry
        ? { axis: "industry", label: project.industry, unclassified: false, source: "fallback" }
        : { axis: "industry", label: "Unclassified", unclassified: true, source: tax ? "auto" : "none" };
  const model: DossierBadge =
    tax && tax.business_model !== "unclassified"
      ? { axis: "business_model", label: BUSINESS_MODEL_LABELS[tax.business_model].en, unclassified: false, source: tax.sources.business_model ?? "auto" }
      : { axis: "business_model", label: "Unclassified", unclassified: true, source: tax ? "auto" : "none" };
  const stageKey = tax ? tax.stage_key : project.stage != null ? sviStageToCanonical(project.stage) : null;
  const stage: DossierBadge = stageKey
    ? { axis: "stage", label: CANONICAL_STAGE_LABELS[stageKey].label_en, unclassified: false, source: tax ? (tax.sources.stage_key ?? "auto") : "fallback" }
    : { axis: "stage", label: "Unclassified", unclassified: true, source: "none" };
  return [industry, model, stage];
}

function radarFrom(report: ReportV2 | null): VisualSpecV2 | null {
  if (!report) return null;
  const spec = report.cover.visuals.find((v) => v.kind === "radar") ?? null;
  if (spec) return spec;
  // Same spec the report cover builds (adapter.ts) — kept as a guard for a
  // stored report_v2 whose cover lost its visuals.
  return makeVisual({
    id: "cover-radar",
    kind: "radar",
    agentId: "cdo",
    title: "8 dimensions vs stage median",
    subtitle: `Stage ${report.cover.stageLabel} p50 dashed`,
    dataState: "partial",
    data: { axes: DIM_ORDER.map((d) => ({ label: DIM_UPPER[d], value: report.cover.dims[d].score, reference: report.cover.dims[d].p50 })), seriesLabel: "This startup", referenceLabel: `${report.cover.stageLabel} p50` },
    a11y: { tableFallback: DIM_ORDER.map((d) => ({ dimension: DIM_UPPER[d], score: report.cover.dims[d].score, p50: report.cover.dims[d].p50 })) },
  });
}

// ─── Access (round 0) ───────────────────────────────────────────────────────

interface EvaluationWithProject {
  evaluation: Evaluation;
  project: { id: string; name: string; slug: string; industry: string | null; stage: number | null; description: string | null; phaseId: string | null; verificationLevel: number | null; ownerUserId: string | null };
  role: DossierViewerRole;
  /** S-D3: set when the viewer is a same-org seat of the evaluator (F1) — the org both belong to. */
  viaOrgId: string | null;
}

const EVALUATION_COLUMNS =
  "id, evaluator_user_id, project_id, owner_kind, consent_tier, founder_email, founder_user_id, invite_token, invited_at, claimed_at, label, notes, website, state, created_at, updated_at";

/**
 * The single access lookup. Returns null for every "no" (unknown id, not the
 * evaluator, founder who has not claimed) so callers answer 404 uniformly.
 */
export async function resolveDossierAccess(evaluationId: string, userId: string): Promise<EvaluationWithProject | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !evaluationId || !userId) return null;
  // One lookup by id; the role is decided in code (evaluator → assessor,
  // claimed founder → founder, S-D3: same-org seat → assessor via ONE extra
  // membership read; anyone else → null → 404).
  const { data, error } = await supabase
    .from("evaluations")
    .select(`${EVALUATION_COLUMNS}, projects:project_id (id, name, slug, industry, stage, description, growth_phase_current, verification_level, user_id)`)
    .eq("id", evaluationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row & { projects?: Row | Row[] | null };
  const evaluation = mapEvaluationRow(row);
  let role: DossierViewerRole;
  let viaOrgId: string | null = null;
  if (evaluation.evaluatorUserId === userId) role = "assessor";
  else if (evaluation.founderUserId === userId && evaluation.ownerKind === "founder_claimed" && evaluation.claimedAt) role = "founder";
  else {
    // S-D3 (F1): a same-org seat opens the dossier the evaluator added.
    viaOrgId = evaluation.evaluatorUserId ? await shareOrg(userId, evaluation.evaluatorUserId) : null;
    if (!viaOrgId) return null;
    role = "assessor";
  }
  const p = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {};
  // A founder must never receive the invite token (Evaluation doc comment).
  if (role === "founder") evaluation.inviteToken = null;
  return {
    evaluation,
    role,
    viaOrgId,
    project: {
      id: String(p.id ?? evaluation.projectId),
      name: String(p.name ?? "Untitled startup"),
      slug: String(p.slug ?? ""),
      industry: str(p.industry),
      stage: num(p.stage),
      description: str(p.description),
      phaseId: str(p.growth_phase_current),
      verificationLevel: num(p.verification_level),
      ownerUserId: str(p.user_id),
    },
  };
}

/** G14-S37: the owner founder execution rubric for the FTV block (null = no profile / loader failed). */
async function readFounderExecution(ownerUserId: string | null, projectId: string): Promise<DossierFounderExecution | null> {
  if (!ownerUserId) return null;
  try {
    const ctx = await loadFounderExecutionContext({ accountId: ownerUserId, projectId });
    if (!ctx.profile) return null;
    const exec = founderExecutionSignals(ctx.profile, { evaluatorFlags: ctx.evaluatorFlags, linkedin: ctx.linkedin, github: ctx.github });
    return {
      score: exec.executionScore,
      rawScore: exec.rawScore,
      capped: exec.capped,
      capReason: exec.capReason ?? null,
      capLiftedBy: exec.capLiftedBy ?? null,
      structured: exec.structured,
      rubricVersion: exec.rubricVersion,
      breakdown: exec.breakdown.map((b) => ({ key: b.key, label: b.label, points: b.points, max: b.max, evidence: b.evidence, source: b.source })),
    };
  } catch {
    return null;
  }
}

// ─── Round 1 readers (each swallows its own failure) ────────────────────────

async function readLatestSnapshot(projectId: string): Promise<SnapshotRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const base = () => supabase.from("svi_snapshots").select(`${SNAPSHOT_COLUMNS}, report_v2`).eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  try {
    const { data, error } = await base();
    if (!error) return (data as SnapshotRow | null) ?? null;
    if (!isMissingRelation(error)) return null;
    // 0395 not applied: same query without the column (one extra round, pre-migration only).
    const retry = await supabase.from("svi_snapshots").select(SNAPSHOT_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return retry.error ? null : ((retry.data as SnapshotRow | null) ?? null);
  } catch {
    return null;
  }
}

async function readSnapshot30dAgo(projectId: string): Promise<Array<Pick<SnapshotRow, "svi_total" | "dim_results" | "dimension_scores" | "created_at">>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("svi_total, dim_results, dimension_scores, created_at")
      .eq("project_id", projectId)
      .lte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(2);
    if (error || !Array.isArray(data)) return [];
    // Up to two rows: when the latest snapshot is itself older than 30 days
    // the first row IS the latest (a "Δ30d = 0.0" lie) — the caller skips it.
    return data as Array<Pick<SnapshotRow, "svi_total" | "dim_results" | "dimension_scores" | "created_at">>;
  } catch {
    return [];
  }
}

async function readEvidenceRows(projectId: string): Promise<EvidenceRowInput[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("svi_dimension_evidence")
      .select("dimension, evidence_type, evidence_label, confidence_level, evidence_value_or_url, created_at, is_verified, verified_at, review_status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (data as Row[]).map((r) => ({
      dimension: String(r.dimension ?? ""),
      evidence_type: String(r.evidence_type ?? ""),
      evidence_label: String(r.evidence_label ?? r.evidence_type ?? ""),
      confidence_level: String(r.confidence_level ?? "self_declared"),
      evidence_value_or_url: str(r.evidence_value_or_url),
      created_at: str(r.created_at),
      is_verified: r.is_verified === true,
      verified_at: str(r.verified_at),
      review_status: str(r.review_status),
    }));
  } catch {
    return [];
  }
}

async function readConnectedProviders(projectId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("connector_snapshots").select("provider").eq("project_id", projectId).limit(200);
    if (error || !data) return [];
    return [...new Set((data as Row[]).map((r) => String(r.provider ?? "")).filter(Boolean))].sort();
  } catch {
    return [];
  }
}

/**
 * The evaluator's own latest report row. S-R5 (W4 review d): its stored
 * `report_v2` (0401, written by POST /api/evaluations/[id]/report) is read
 * through `readEvaluationReportV2` and preferred over the founder's latest
 * snapshot — the dossier shows exactly the document the evaluator ran, even
 * after the founder re-scores. Falls back to the snapshot when the row has
 * no v2 document (pre-S-R4 rows, failed write, 0401 not applied).
 */
async function readLatestReport(evaluationId: string): Promise<{ id: string | null; shareToken: string | null; createdAt: string; kind: string; reportV2: ReportV2 | null } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    // One read: the report_v2 column joins the first select (W5 review — a
    // second round trip fetched it separately); pre-0401 environments retry
    // without the column and fall back to the helper.
    let data: unknown = null;
    let error: { message?: string } | null = null;
    ({ data, error } = await supabase
      .from("evaluation_reports")
      .select("id, share_token, created_at, kind, report_v2")
      .eq("evaluation_id", evaluationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle());
    let inline = true;
    if (error && /report_v2|does not exist|schema cache/i.test(error.message ?? "")) {
      inline = false;
      ({ data, error } = await supabase
        .from("evaluation_reports")
        .select("id, share_token, created_at, kind")
        .eq("evaluation_id", evaluationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());
    }
    if (error || !data) return null;
    const r = data as Row;
    const id = str(r.id);
    const isFull = String(r.kind ?? "full") === "full";
    const stored = inline && isFull && r.report_v2 && typeof r.report_v2 === "object" && isReportV2(r.report_v2) ? (r.report_v2 as ReportV2) : null;
    const reportV2 = stored ?? (id && isFull && !inline ? await readEvaluationReportV2(supabase, id) : null);
    return { id, shareToken: str(r.share_token), createdAt: String(r.created_at ?? ""), kind: String(r.kind ?? "full"), reportV2 };
  } catch {
    return null;
  }
}

// ─── The loader ─────────────────────────────────────────────────────────────

export async function loadDossier(evaluationId: string, userId: string): Promise<DossierView | null> {
  const access = await resolveDossierAccess(evaluationId, userId);
  if (!access) return null;
  const { evaluation, project, role } = access;

  // Round 1 — everything in parallel; each reader degrades to null/[] on its own.
  const [latest, olderCandidates, taxonomy, assessment, evidenceRows, providers, lastReport, lastView, founderExecution] = await Promise.all([
    readLatestSnapshot(project.id),
    readSnapshot30dAgo(project.id),
    getTaxonomy(project.id).catch(() => null),
    getAssessment(evaluation.id, { userId, role }),
    readEvidenceRows(project.id),
    readConnectedProviders(project.id),
    readLatestReport(evaluation.id),
    // S-R4: the viewer's previous `dossier.viewed` row (its SVI feeds "Δ since last view").
    readSinceLastView(userId, evaluation.id, null).catch(() => null),
    // G14-S37: the owner founder execution rubric (FTV block).
    readFounderExecution(project.ownerUserId, project.id),
  ]);

  // Δ30d baseline = the newest row ≥ 30 days old that is NOT the latest row.
  const older = olderCandidates.find((r) => !latest || r.created_at < latest.created_at) ?? null;

  // ReportV2: the evaluator's own evaluation_reports.report_v2 first (S-R5),
  // else the snapshot's stored column when valid, else the read-time adapter.
  let report: ReportV2 | null = lastReport?.reportV2 ?? null;
  if (!report && latest) {
    const meta = (latest.analysis_json && typeof latest.analysis_json === "object" ? (latest.analysis_json as Record<string, unknown>) : {}) as { industry?: string | null; stageLabel?: string | null };
    const criterionStates = Array.isArray(latest.criterion_results) ? (latest.criterion_results as SnapshotCriterionState[]) : null;
    report = resolveReportV2(
      latest.report_v2,
      {
        snapshotId: latest.id,
        projectId: project.id,
        createdAt: latest.created_at,
        startupName: project.name,
        industry: meta.industry ?? project.industry ?? null,
        stageLabel: meta.stageLabel ?? null,
        stage: latest.stage ?? project.stage ?? null,
        sviTotal: num(latest.svi_total),
        deltaVsLast: null,
        dimStates: snapshotDimStates(latest),
        criterionStates,
        phaseId: project.phaseId,
        verificationLevel: project.verificationLevel,
        tier: "standard",
      },
      isReportV2,
    );
  }

  const svi = latest ? num(latest.svi_total) : null;
  const olderSvi = older ? num(older.svi_total) : null;
  const evidence = projectEvidenceByTier(evaluation.consentTier, evidenceRows, providers);
  const strongestByDim: Partial<Record<DimKey, string>> = {};
  for (const r of evidenceRows) {
    const d = r.dimension.toLowerCase() as DimKey;
    if (!(d in evidence.countsByDimension)) continue;
    if (!strongestByDim[d] || ladderRank(r.confidence_level) > ladderRank(strongestByDim[d]!)) strongestByDim[d] = r.confidence_level;
  }
  const connected = evidenceRows.filter((r) => ladderRank(r.confidence_level) >= ladderRank("connected_source")).length;

  // Round 2 — the percentile (10-minute in-process cache) plus the S-R4
  // readers that depend on round-1 ids: mandate fit (assessor only — needs
  // the taxonomy row + SVI), block 5 progress (needs the assessment's
  // snapshot id). All in parallel; each degrades on its own.
  const mine = role === "assessor" ? assessment.mine : null;
  const [percentile, mandateFit, progress, consensus, auditTrail] = await Promise.all([
    svi != null && latest ? cachedPercentile(svi, latest.stage ?? project.stage ?? 0) : Promise.resolve(null),
    role === "assessor"
      ? readMandateFit({ viewerUserId: userId, projectId: project.id, taxonomy, svi, stage: latest?.stage ?? project.stage ?? null, state: evaluation.state }).catch(() => null)
      : Promise.resolve(null),
    readProgressBlock({
      evaluationId: evaluation.id,
      evaluatorUserId: evaluation.evaluatorUserId,
      latestSvi: svi,
      mine: mine ? { version: mine.version, snapshotId: mine.snapshotId, updatedAt: mine.updatedAt, submittedAt: mine.submittedAt } : null,
    }).catch(() => emptyProgressBlock()),
    // S-D3: every seat's current assessment (assessor only; the founder never receives other seats' rows).
    role === "assessor" && assessment.available
      ? readConsensus({ evaluationId: evaluation.id, viewerUserId: userId, viewerAssessment: mine }).catch(() => emptyConsensus(false))
      : Promise.resolve(emptyConsensus(false)),
    readAuditTrail(userId, evaluation.id).catch(() => [] as DossierAuditEntry[]),
  ]);

  const header: DossierHeader = {
    evaluationId: evaluation.id,
    projectId: project.id,
    projectSlug: project.slug,
    name: project.name,
    website: evaluation.website,
    state: evaluation.state && (AU_STATES as readonly string[]).includes(evaluation.state) ? evaluation.state : null,
    // The label is the evaluator's private annotation (Evaluation doc comment)
    // — a claimed founder never sees it (W2 review P1).
    label: role === "founder" ? null : evaluation.label,
    badges: buildBadges(taxonomy, { industry: project.industry, stage: project.stage }),
    svi,
    sviBand: bandFor(svi),
    delta30d: svi != null && olderSvi != null ? Math.round((svi - olderSvi) * 10) / 10 : null,
    percentile,
    consentTier: evaluation.consentTier,
    ownerKind: (EVALUATION_OWNER_KINDS as readonly string[]).includes(evaluation.ownerKind) ? evaluation.ownerKind : "evaluator",
    founderClaimed: evaluation.ownerKind === "founder_claimed" && !!evaluation.claimedAt,
    lastSnapshotAt: latest?.created_at ?? null,
    snapshotId: latest?.id ?? null,
    evidence: { items: evidenceRows.length, connected: Math.max(connected, providers.length), providers },
    verification: coverVerificationFor(project.verificationLevel),
    decision:
      role === "assessor" && assessment.mine
        ? { value: assessment.mine.decision, status: assessment.mine.status, version: assessment.mine.version }
        : null,
    mandateFit,
    sinceLastView: lastView ? { ...lastView, sviNow: svi, delta: lastView.sviThen !== null && svi !== null ? Math.round((svi - lastView.sviThen) * 10) / 10 : null } : null,
    consensus:
      role === "assessor" && consensus.available && consensus.seatCount > 1
        ? { label: consensus.label, submitted: consensus.submittedCount, seats: consensus.seatCount, aggregate: consensus.aggregate }
        : null,
    viaOrgSeat: !!access.viaOrgId,
  };

  const reportBlock: DossierReportBlock = {
    available: !!report,
    source: report?.source ?? null,
    radar: radarFrom(report),
    dims: report ? buildDimRows(report, snapshotDimScores(older)) : [],
    criteria: buildCriterionRows(report, evidence.countsByDimension, strongestByDim),
    evidenceCounts: evidence.countsByDimension,
    links: {
      fullReport: reportUrlForToken(lastReport?.shareToken ?? null),
      pdf: pdfUrlForToken(lastReport?.shareToken ?? null),
      analyze: `/workspace/projects/${encodeURIComponent(project.slug)}/analyze`,
    },
    founderExecution,
  };

  // G21-P1-B: the Assessment Card from the same ReportV2 + Evidence Hub rows
  // every other surface uses (the card never re-derives a score).
  const assessmentContext = report ? await loadAssessmentContext(evaluation.projectId, report.cover.stage ?? null) : null;
  // G21 P3-C: the "stale connector" hint — sources past the proof TTL (fail-soft, [] without a db).
  const staleConnectors = report ? staleConnectorCount(await connectorFreshness(evaluation.projectId, { db: getSupabaseAdmin() })) : 0;
  const assessmentCard = report
    ? assessmentCardFromReport(report, { evidence: dossierEvidenceByDim(evidenceRows), ...(assessmentContext ? assessmentCardOptionsFromContext(assessmentContext) : {}), staleConnectors })
    : null;

  return {
    viewer: { role, userId },
    header,
    assessmentCard,
    report: reportBlock,
    valuation: buildValuationBlock(report, mine),
    evidence,
    assessment: {
      available: assessment.available,
      mine: role === "assessor" ? assessment.mine : null,
      history: role === "assessor" ? assessment.history : [],
      sharedWithFounder: role === "founder" ? assessment.sharedWithFounder : null,
    },
    progress,
    consensus: role === "assessor" ? consensus : null,
    auditTrail,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Deep-link helpers (deal-flow / watchlist rows → dossier) ───────────────

/** Deal-flow `scores.id` → `projects.id` via svi_accounts.email (best effort, S-T2 replaces the join). */
export async function resolveDealflowProjectIds(scoreIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const supabase = getSupabaseAdmin();
  if (!supabase || scoreIds.length === 0) return out;
  try {
    const { data: scores } = await supabase.from("scores").select("id, email").in("id", scoreIds.slice(0, 200));
    const emailById = new Map<string, string>();
    for (const r of (scores ?? []) as Row[]) if (r.email) emailById.set(String(r.id), String(r.email).toLowerCase());
    const emails = [...new Set(emailById.values())];
    if (emails.length === 0) return out;
    const { data: accounts } = await supabase.from("svi_accounts").select("email, project_id").in("email", emails).not("project_id", "is", null);
    const projectByEmail = new Map<string, string>();
    for (const r of (accounts ?? []) as Row[]) if (r.project_id) projectByEmail.set(String(r.email).toLowerCase(), String(r.project_id));
    for (const [id, email] of emailById) {
      const pid = projectByEmail.get(email);
      if (pid) out.set(id, pid);
    }
  } catch {
    /* decorative */
  }
  return out;
}

/** Watchlist ticker → `watchlist.project_id` (0392 column; empty map until applied). */
export async function resolveWatchlistProjectIds(userId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  try {
    const { data, error } = await supabase.from("watchlist").select("ticker, project_id").eq("account_id", userId).not("project_id", "is", null);
    if (error || !data) return out;
    for (const r of data as Row[]) if (r.project_id) out.set(String(r.ticker), String(r.project_id));
  } catch {
    /* 0392 not applied */
  }
  return out;
}

/** `/workspace/investor/startup/[projectId]` → the caller's evaluation id, or null. */
export async function findEvaluationIdForProject(userId: string, projectId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluator_user_id, founder_user_id, owner_kind, claimed_at")
      .eq("project_id", projectId)
      .or(`evaluator_user_id.eq.${userId},founder_user_id.eq.${userId}`)
      // The filter already scopes to the caller's own rows, so this is at most
      // one evaluator row + one claimed founder row per project; no cap that
      // could hide the claimed row behind older ones (W2 review).
      .order("claimed_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (error || !data) return null;
    const rows = data as Row[];
    const mine = rows.find((r) => r.evaluator_user_id === userId) ?? rows.find((r) => r.founder_user_id === userId && r.owner_kind === "founder_claimed" && r.claimed_at);
    return mine ? String(mine.id) : null;
  } catch {
    return null;
  }
}

export const DOSSIER_PATH = (evaluationId: string): string => `/workspace/evaluations/${encodeURIComponent(evaluationId)}`;
export const DOSSIER_ALIAS_PATH = (projectId: string): string => `/workspace/investor/startup/${encodeURIComponent(projectId)}`;
