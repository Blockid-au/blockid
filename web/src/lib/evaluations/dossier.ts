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

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AU_STATES, EVALUATION_OWNER_KINDS, mapEvaluationRow, type AuState, type Evaluation } from "@/lib/evaluations";
import { MENTOR_ACCESS_TIERS, TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import { getTaxonomy } from "@/lib/taxonomy/store";
import { BUSINESS_MODEL_LABELS, INDUSTRY_LABELS, type StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";
import { CANONICAL_STAGE_LABELS, sviStageToCanonical } from "@/lib/journey-vocabulary";
import { resolveReportV2, type SnapshotDimState, type SnapshotCriterionState } from "@/lib/report-v2/adapter";
import { isReportV2, type ReportV2 } from "@/lib/report-v2/schema";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { CRITERIA, CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import { bandFor } from "@/lib/report-visuals/palette";
import { makeVisual } from "@/lib/report-visuals";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import { computeCohortPercentile } from "@/lib/agents/cohort-percentile";
import { reportUrlForToken, pdfUrlForToken } from "@/lib/evaluations/report-quota";
import {
  getAssessment,
  type AssessmentHistoryEntry,
  type AssessmentViewerRole,
  type EvaluationAssessment,
  type FounderVisibleAssessment,
} from "@/lib/evaluations/assessments";

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
  percentile: { value: number; source: "real_cohort" | "benchmark_fallback"; cohortSize: number } | null;
  consentTier: MentorAccessTier;
  ownerKind: Evaluation["ownerKind"];
  founderClaimed: boolean;
  lastSnapshotAt: string | null;
  snapshotId: string | null;
  evidence: { items: number; connected: number; providers: string[] };
  /** assessor only — the founder never receives a decision (§C.1). */
  decision: { value: EvaluationAssessment["decision"]; status: EvaluationAssessment["status"]; version: number } | null;
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

export interface DossierReportBlock {
  available: boolean;
  source: ReportV2["source"] | null;
  radar: VisualSpecV2 | null;
  dims: DossierDimRow[];
  criteria: DossierCriterionRow[];
  /** per-dimension evidence counts (always visible, every tier) */
  evidenceCounts: Record<DimKey, number>;
  links: { fullReport: string | null; pdf: string | null; analyze: string };
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
  report: DossierReportBlock;
  evidence: DossierEvidenceBlock;
  assessment: DossierAssessmentBlock;
  /** blocks 2, 5, 6 — placeholders in S-D1 */
  placeholders: { valuation: "S-R3"; progress: "S-D3"; actions: "S-D3" };
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
    const value = { value: Math.round(r.percentile), source: r.source, cohortSize: r.cohortSize };
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
  project: { id: string; name: string; slug: string; industry: string | null; stage: number | null; description: string | null; phaseId: string | null };
  role: DossierViewerRole;
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
  const { data, error } = await supabase
    .from("evaluations")
    .select(`${EVALUATION_COLUMNS}, projects:project_id (id, name, slug, industry, stage, description, growth_phase_current)`)
    .eq("id", evaluationId)
    .or(`evaluator_user_id.eq.${userId},founder_user_id.eq.${userId}`)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row & { projects?: Row | Row[] | null };
  const evaluation = mapEvaluationRow(row);
  let role: DossierViewerRole;
  if (evaluation.evaluatorUserId === userId) role = "assessor";
  else if (evaluation.founderUserId === userId && evaluation.ownerKind === "founder_claimed" && evaluation.claimedAt) role = "founder";
  else return null;
  const p = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {};
  // A founder must never receive the invite token (Evaluation doc comment).
  if (role === "founder") evaluation.inviteToken = null;
  return {
    evaluation,
    role,
    project: {
      id: String(p.id ?? evaluation.projectId),
      name: String(p.name ?? "Untitled startup"),
      slug: String(p.slug ?? ""),
      industry: str(p.industry),
      stage: num(p.stage),
      description: str(p.description),
      phaseId: str(p.growth_phase_current),
    },
  };
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

async function readSnapshot30dAgo(projectId: string): Promise<Pick<SnapshotRow, "svi_total" | "dim_results" | "dimension_scores" | "created_at"> | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("svi_total, dim_results, dimension_scores, created_at")
      .eq("project_id", projectId)
      .lte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return error ? null : ((data as Pick<SnapshotRow, "svi_total" | "dim_results" | "dimension_scores" | "created_at"> | null) ?? null);
  } catch {
    return null;
  }
}

async function readEvidenceRows(projectId: string): Promise<EvidenceRowInput[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("svi_dimension_evidence")
      .select("dimension, evidence_type, evidence_label, confidence_level, evidence_value_or_url, created_at")
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

async function readLatestReport(evaluationId: string): Promise<{ shareToken: string | null; createdAt: string; kind: string } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("evaluation_reports")
      .select("share_token, created_at, kind")
      .eq("evaluation_id", evaluationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Row;
    return { shareToken: str(r.share_token), createdAt: String(r.created_at ?? ""), kind: String(r.kind ?? "full") };
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
  const [latest, older, taxonomy, assessment, evidenceRows, providers, lastReport] = await Promise.all([
    readLatestSnapshot(project.id),
    readSnapshot30dAgo(project.id),
    getTaxonomy(project.id).catch(() => null),
    getAssessment(evaluation.id, { userId, role }),
    readEvidenceRows(project.id),
    readConnectedProviders(project.id),
    readLatestReport(evaluation.id),
  ]);

  // ReportV2: stored column when valid, else the read-time adapter.
  let report: ReportV2 | null = null;
  if (latest) {
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

  // Round 2 — only on a cache miss (10-minute in-process cache).
  const percentile = svi != null && latest ? await cachedPercentile(svi, latest.stage ?? project.stage ?? 0) : null;

  const header: DossierHeader = {
    evaluationId: evaluation.id,
    projectId: project.id,
    projectSlug: project.slug,
    name: project.name,
    website: evaluation.website,
    state: evaluation.state && (AU_STATES as readonly string[]).includes(evaluation.state) ? evaluation.state : null,
    label: evaluation.label,
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
    decision:
      role === "assessor" && assessment.mine
        ? { value: assessment.mine.decision, status: assessment.mine.status, version: assessment.mine.version }
        : null,
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
  };

  return {
    viewer: { role, userId },
    header,
    report: reportBlock,
    evidence,
    assessment: {
      available: assessment.available,
      mine: role === "assessor" ? assessment.mine : null,
      history: role === "assessor" ? assessment.history : [],
      sharedWithFounder: role === "founder" ? assessment.sharedWithFounder : null,
    },
    placeholders: { valuation: "S-R3", progress: "S-D3", actions: "S-D3" },
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
      .limit(5);
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
