// run-for-project — the one seam through which a Trust BizReport is produced
// for a *project id* rather than for "whoever holds the session cookie".
//
// Why (T0271, docs/plans/evaluator-traction-2026-09-10.md §3c-6, §9-pre G12-8):
//   /api/svi/enhanced-report resolved everything from the caller — project
//   from the `blockid_project` cookie, the svi_accounts row from the
//   caller's email. An evaluator running the A$3 report on a startup they
//   entered (an `evaluations` row, migration 0314) owns that projects row
//   too (projects.user_id = evaluator), but the founder route could never be
//   pointed at it, and the report/share route is scoped the same way.
//
//   This module splits the founder route into three pure-ish steps so both
//   callers share one pipeline:
//     loadProjectReportContext()  — account + latest analysis + evidence +
//                                   13-criteria inputs for (ownerEmail, projectId)
//     generateAndPersistReport()  — orchestrateReport + assembled_reports +
//                                   agent_report_tasks (+ failed-row on throw)
//     runTrustReportForProject()  — the evaluator entry point: resolves the
//                                   project owner, synthesises the svi_accounts
//                                   / svi_analyses rows when the startup was
//                                   never analysed, runs the two steps above,
//                                   writes the svi_snapshots row the /tbr/<token>
//                                   page renders, and mints the share token.
//     runRescoreForProject()      — the cheaper path: computeSVI over the
//                                   stored input + evidence → new snapshot
//                                   (+ token), no agents.
//
//   The founder route keeps its exact behaviour (spend BEFORE orchestration,
//   cookie-scoped project) — it just calls the first two helpers. The
//   evaluator route spends AFTER success (transparent-pricing rule), which is
//   why spending is not inside this module at all.

import "server-only";
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";
import { newSlug } from "@/lib/slug";
import { orchestrateReport } from "@/lib/report-pipeline/orchestrator";
import type { AssembledReport, ReportTier, CriterionData, ReportSection } from "@/lib/report-pipeline/types";
import { CRITERIA, CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import {
  computeSVI,
  extractSignals,
  type SVIAnalysis,
  type EvidenceItem,
  type SVISubScore,
} from "@/lib/svi-analysis";
import { findLatestAnalysisWithFallback, findSVIAccountWithFallback, getProjectById } from "@/lib/projects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const STAGE_LABELS = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
] as const;

export interface ProjectReportAccount {
  id: string;
  email: string;
  startup_name: string | null;
  current_svi: number | null;
  current_stage: number | null;
}

export interface ProjectReportAnalysis {
  id: string;
  raw_input: string;
  total_svi: number | null;
  analysis_json: Record<string, unknown> | null;
}

export interface ProjectReportContext {
  projectId: string | null;
  account: ProjectReportAccount;
  latestAnalysis: ProjectReportAnalysis;
  evidenceItems: EvidenceItem[];
  criteriaData: Record<CriterionKey, CriterionData>;
  sviAnalysis: SVIAnalysis;
}

export type LoadContextResult =
  | { ok: true; ctx: ProjectReportContext }
  | { ok: false; error: "no_account" | "no_analysis" | "db_unavailable" };

export interface GenerateReportInput {
  ctx: ProjectReportContext;
  /** app_users.id of the person the report is generated for / by. */
  userId: string;
  tier: ReportTier;
  locale: "en" | "vi";
  /** Written to assembled_reports.credits_cost (both success and failure rows). */
  creditsCost: number;
}

export interface TrustReportRunResult {
  kind: "full";
  reportId: string;
  snapshotId: string | null;
  shareToken: string | null;
  svi: number;
  stage: number;
  wordCount: number;
  qualityScore: number;
  synthesisedAnalysis: boolean;
}

export interface RescoreRunResult {
  kind: "rescore";
  snapshotId: string;
  shareToken: string | null;
  analysisId: string;
  svi: number;
  delta: number | null;
  stage: number;
}

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Rebuild the SVIAnalysis object the pipeline expects from the stored rows. */
export function buildSviAnalysisFromStored(
  account: Pick<ProjectReportAccount, "current_svi" | "current_stage">,
  analysis: Pick<ProjectReportAnalysis, "total_svi" | "analysis_json">,
): SVIAnalysis {
  const analysisJson = analysis.analysis_json ?? null;
  const stage = Number(account.current_stage ?? analysisJson?.stage ?? 0);
  return {
    version: String(analysisJson?.version ?? "2.0.0"),
    totalSVI: Number(analysis.total_svi ?? account.current_svi ?? 100),
    baselineSVI: Number(analysisJson?.baselineSVI ?? 100),
    netAdjustment: Number(analysisJson?.netAdjustment ?? 0),
    confidenceMultiplier: Number(analysisJson?.confidenceMultiplier ?? 0.5),
    subs: (analysisJson?.subs as SVIAnalysis["subs"]) ?? [],
    riskPenalties: (analysisJson?.riskPenalties as SVIAnalysis["riskPenalties"]) ?? [],
    evidenceGaps: (analysisJson?.evidenceGaps as SVIAnalysis["evidenceGaps"]) ?? [],
    nextActions: (analysisJson?.nextActions as SVIAnalysis["nextActions"]) ?? [],
    signals: (analysisJson?.signals as SVIAnalysis["signals"]) ?? ({} as SVIAnalysis["signals"]),
    summary: String(analysisJson?.summary ?? ""),
    stage,
    stageLabel: String(analysisJson?.stageLabel ?? STAGE_LABELS[stage] ?? "Concept"),
    stageBonus: Number(analysisJson?.stageBonus ?? 0),
    dimensionScores: (analysisJson?.dimensionScores as Record<string, number> | undefined) ?? undefined,
  };
}

/** Map the `evaluation_criteria` rows into the 13-key CriterionData record. */
export function buildCriteriaData(rows: Row[] | null | undefined): Record<CriterionKey, CriterionData> {
  const emptyData: CriterionData = { textInput: "", files: [], links: [], qualityLevel: "incomplete" };
  const out: Partial<Record<CriterionKey, CriterionData>> = {};
  for (const key of CRITERION_KEYS) {
    const row = (rows ?? []).find((r) => r.criterion_key === key);
    if (row) {
      out[key] = {
        textInput: String(row.text_input ?? ""),
        files: Array.isArray(row.files) ? (row.files as CriterionData["files"]) : [],
        links: Array.isArray(row.links) ? (row.links as CriterionData["links"]) : [],
        qualityLevel: String(row.quality_level ?? "incomplete"),
        aiScore: row.ai_score as number | undefined,
      };
    } else {
      out[key] = { ...emptyData };
    }
  }
  return out as Record<CriterionKey, CriterionData>;
}

/** The text an evaluator-entered startup is scored on when nobody ran an analysis. */
export function synthesiseRawInput(args: {
  name: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  state?: string | null;
  notes?: string | null;
}): string {
  const lines = [`# ${args.name}`];
  if (args.description) lines.push(args.description);
  if (args.industry) lines.push(`Industry: ${args.industry}`);
  if (args.website) lines.push(`Website: ${args.website}`);
  if (args.state) lines.push(`Location: ${args.state}, Australia`);
  if (args.notes) lines.push(`Evaluator notes:\n${args.notes}`);
  return lines.join("\n\n");
}

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

function verdictFor(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Developing";
  return "Weak";
}

/**
 * Project the assembled report + SVI subs into the `dim_results` /
 * `criterion_results` shapes `/tbr/<token>` and `/workspace/business-report`
 * render (see 20260903_wave25a_tbr_persistence.sql). Criterion sections come
 * from the 13 agent sections; each dimension's markdown is the concatenation
 * of the sections whose criterion has it as primary dimension.
 */
export function projectReportToSnapshotShapes(
  report: Pick<AssembledReport, "sections">,
  sviAnalysis: Pick<SVIAnalysis, "subs" | "dimensionScores">,
): {
  dimResults: Record<string, Row>;
  criterionResults: Row[];
  dimensionScores: Record<string, { score: number; priority: "high" | "medium" | "low" }>;
} {
  const sectionsByCriterion = new Map<string, ReportSection>();
  for (const s of report.sections) if (s.criterion) sectionsByCriterion.set(s.criterion, s);

  const criterionResults: Row[] = CRITERIA.filter((c) => sectionsByCriterion.has(c.key)).map((c) => {
    const s = sectionsByCriterion.get(c.key)!;
    const score = typeof s.score === "number" ? Math.round(s.score) : 0;
    return {
      key: c.key,
      title: c.title,
      primary_dimension: c.primaryDimension,
      weight: c.weight,
      score,
      verdict: verdictFor(score),
      strengths: [],
      gaps: [],
      next_action: "",
    };
  });

  const subByKey = new Map<string, SVISubScore>();
  for (const sub of sviAnalysis.subs ?? []) subByKey.set(sub.key, sub);

  const dimResults: Record<string, Row> = {};
  const dimensionScores: Record<string, { score: number; priority: "high" | "medium" | "low" }> = {};
  for (const dim of DIM_KEYS) {
    const sub = subByKey.get(dim);
    const fromMap = sviAnalysis.dimensionScores?.[dim];
    const scoreRaw = typeof fromMap === "number" ? fromMap : sub?.value;
    const score = typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : null;
    const sections = CRITERIA.filter((c) => c.primaryDimension === dim)
      .map((c) => sectionsByCriterion.get(c.key))
      .filter((s): s is ReportSection => Boolean(s));
    const markdown = sections.length
      ? sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n")
      : null;
    const priority: "high" | "medium" | "low" =
      score === null ? "medium" : score < 50 ? "high" : score < 70 ? "medium" : "low";
    dimResults[dim] = {
      status: "complete",
      score,
      markdown,
      insights: sub ? [...(sub.gaps ?? []).slice(0, 3)] : [],
      priority,
      marketBenchmark: null,
    };
    if (score !== null) dimensionScores[dim] = { score, priority };
  }

  return { dimResults, criterionResults, dimensionScores };
}

// ---------------------------------------------------------------------------
// Step 1 — context for (ownerEmail, projectId)
// ---------------------------------------------------------------------------

/**
 * Everything orchestrateReport needs for the project, resolved exactly the
 * way the founder route did (findSVIAccountWithFallback +
 * findLatestAnalysisWithFallback keyed by the OWNER's email).
 */
export async function loadProjectReportContext(args: {
  ownerEmail: string;
  projectId: string | null;
}): Promise<LoadContextResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "db_unavailable" };

  const account = (await findSVIAccountWithFallback(
    args.ownerEmail,
    args.projectId,
    "id, email, startup_name, current_svi, current_stage",
  )) as ProjectReportAccount | null;
  if (!account) return { ok: false, error: "no_account" };

  const latestAnalysis = (await findLatestAnalysisWithFallback(
    args.ownerEmail,
    args.projectId,
    "id, raw_input, total_svi, analysis_json",
  )) as ProjectReportAnalysis | null;
  if (!latestAnalysis) return { ok: false, error: "no_analysis" };

  const { data: evidenceRows } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });
  const evidenceItems: EvidenceItem[] = ((evidenceRows ?? []) as Row[]).map((e) => ({
    evidence_type: String(e.evidence_type ?? ""),
    confidence_level: String(e.confidence_level ?? ""),
    dimension: String(e.dimension ?? ""),
    label: String(e.label ?? ""),
  }));

  const { data: criteriaRows } = await supabase
    .from("evaluation_criteria")
    .select("criterion_key, text_input, files, links, quality_level, ai_score")
    .eq("account_id", account.id);

  return {
    ok: true,
    ctx: {
      projectId: args.projectId,
      account,
      latestAnalysis,
      evidenceItems,
      criteriaData: buildCriteriaData((criteriaRows ?? []) as Row[]),
      sviAnalysis: buildSviAnalysisFromStored(account, latestAnalysis),
    },
  };
}

// ---------------------------------------------------------------------------
// Step 2 — orchestrate + persist (throws on pipeline failure)
// ---------------------------------------------------------------------------

export async function generateAndPersistReport(input: GenerateReportInput): Promise<AssembledReport> {
  const { ctx, userId, tier, locale, creditsCost } = input;
  const supabase = getSupabaseAdmin();

  // agentId scoped to this account+project → each report gets its own
  // per-agent semaphore slot (see agent-dispatcher) so concurrent reports
  // run in parallel instead of serialising through one shared bucket.
  const svAgentId = `svi:${ctx.account.id}${ctx.projectId ? `:${ctx.projectId}` : ""}`;
  const aiCaller = async (systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> => {
    const result = await callAI({
      system: systemPrompt,
      user: userPrompt,
      maxTokens,
      timeoutMs: 120_000,
      agentId: svAgentId,
    });
    return result.text;
  };

  try {
    const report = await orchestrateReport({
      accountId: ctx.account.id,
      userId,
      projectId: ctx.projectId ?? undefined,
      startupName: String(ctx.account.startup_name ?? "Unknown Startup"),
      rawText: String(ctx.latestAnalysis.raw_input ?? ""),
      sviAnalysis: ctx.sviAnalysis,
      evidenceItems: ctx.evidenceItems,
      criteriaData: ctx.criteriaData,
      tier,
      locale,
      callAI: aiCaller,
    });

    if (supabase) {
      const { error: reportInsertErr } = await supabase.from("assembled_reports").insert({
        id: report.id,
        account_id: ctx.account.id,
        user_id: userId,
        project_id: ctx.projectId,
        analysis_id: ctx.latestAnalysis.id,
        tier,
        locale,
        title: report.title,
        executive_summary: report.executiveSummary,
        quality_score: report.qualityScore,
        total_words: report.totalWords,
        sections_count: report.sections.length,
        sections_json: report.sections.map((s) => ({
          id: s.id,
          title: s.title,
          agentRole: s.agentRole,
          criterion: s.criterion,
          score: s.score,
          wordCount: s.wordCount,
        })),
        charts_json: report.charts,
        consistency_issues: report.consistencyIssues,
        agent_contributions: report.agentContributions,
        full_markdown: report.markdown,
        status: "complete",
        credits_cost: creditsCost,
      });
      if (reportInsertErr) {
        console.error("[blockid:report-pipeline] assembled_reports insert failed", reportInsertErr);
      }

      const agentTasks = report.sections
        .filter((s) => s.criterion)
        .map((s) => ({
          report_id: report.id,
          agent_role: s.agentRole,
          criterion_key: s.criterion,
          score: s.score ?? null,
          word_count: s.wordCount,
          content_preview: s.content.slice(0, 500),
          status: "complete",
        }));
      if (agentTasks.length > 0) {
        const { error: tasksErr } = await supabase.from("agent_report_tasks").insert(agentTasks);
        if (tasksErr) {
          console.error("[blockid:report-pipeline] agent_report_tasks insert failed", tasksErr);
        }
      }
    }

    return report;
  } catch (err) {
    console.error("[blockid:report-pipeline] orchestration failed:", err);
    if (supabase) {
      // Failed-status row for status polling — best effort.
      const failedId = `rpt-fail-${Date.now().toString(36)}`;
      await supabase
        .from("assembled_reports")
        .insert({
          id: failedId,
          account_id: ctx.account.id,
          user_id: userId,
          project_id: ctx.projectId,
          analysis_id: ctx.latestAnalysis.id,
          tier,
          locale,
          title: `Failed Report: ${ctx.account.startup_name ?? "Unknown"}`,
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
          credits_cost: creditsCost,
        })
        .then(null, () => {});
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Evaluator entry points
// ---------------------------------------------------------------------------

async function resolveOwnerEmail(projectUserId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("app_users").select("email").eq("id", projectUserId).maybeSingle();
  const email = (data as Row | null)?.email;
  return typeof email === "string" && email ? email : null;
}

/** svi_accounts row for (ownerEmail, projectId) — created when missing (synthetic account for evaluator-entered startups). */
async function ensureAccount(ownerEmail: string, projectId: string, startupName: string): Promise<ProjectReportAccount | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const existing = (await findSVIAccountWithFallback(
    ownerEmail,
    projectId,
    "id, email, startup_name, current_svi, current_stage",
  )) as ProjectReportAccount | null;
  if (existing) return existing;
  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({
      email: ownerEmail,
      project_id: projectId,
      startup_name: startupName,
      last_active_at: new Date().toISOString(),
    })
    .select("id, email, startup_name, current_svi, current_stage")
    .single();
  if (error || !created) {
    console.error("[blockid:report-pipeline] svi_accounts insert failed", error);
    return null;
  }
  return created as ProjectReportAccount;
}

async function loadEvidence(accountId: string): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("svi_evidence").select("*").eq("account_id", accountId);
  return (data ?? []) as Row[];
}

/** Insert an svi_analyses row from a computed analysis; returns its id (slug). */
async function insertAnalysisRow(args: {
  email: string;
  projectId: string;
  rawInput: string;
  analysis: SVIAnalysis;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const id = newSlug();
  const { error } = await supabase.from("svi_analyses").insert({
    id,
    email: args.email,
    raw_input: args.rawInput,
    total_svi: Math.round(args.analysis.totalSVI),
    net_adjustment: Math.round(args.analysis.netAdjustment),
    confidence_multiplier: args.analysis.confidenceMultiplier,
    analysis_json: args.analysis,
    svi_version: args.analysis.version,
    project_id: args.projectId,
  });
  if (error) {
    console.error("[blockid:report-pipeline] svi_analyses insert failed", error);
    return null;
  }
  return id;
}

/**
 * Write (or, same UTC day, update — svi_snapshots has UNIQUE(account_id,
 * snapshot_date)) the snapshot the /tbr page renders and make sure it
 * carries a share token. Returns the row id + token, or nulls on failure —
 * the report itself is already persisted, so callers degrade to "no link".
 */
async function upsertSnapshotWithToken(args: {
  accountId: string;
  projectId: string;
  sviTotal: number;
  stage: number;
  delta: number | null;
  analysisJson: Row;
  dimensionScores: Row | null;
  dimResults: Row | null;
  criterionResults: Row[] | null;
}): Promise<{ snapshotId: string | null; shareToken: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { snapshotId: null, shareToken: null };
  const today = new Date().toISOString().slice(0, 10);

  const payload: Row = {
    project_id: args.projectId,
    svi_total: Math.round(args.sviTotal),
    stage: args.stage,
    delta: args.delta,
    analysis_json: args.analysisJson,
    dimension_scores: args.dimensionScores,
  };
  if (args.dimResults) payload.dim_results = args.dimResults;
  if (args.criterionResults) payload.criterion_results = args.criterionResults;

  const { data: existing } = await supabase
    .from("svi_snapshots")
    .select("id, report_share_token")
    .eq("account_id", args.accountId)
    .eq("snapshot_date", today)
    .maybeSingle();

  let snapshotId: string | null = null;
  let token: string | null = null;
  if (existing) {
    snapshotId = String((existing as Row).id);
    token = ((existing as Row).report_share_token as string | null) ?? null;
    if (!token) {
      token = nanoid(24);
      payload.report_share_token = token;
    }
    const { error } = await supabase.from("svi_snapshots").update(payload).eq("id", snapshotId);
    if (error) {
      console.error("[blockid:report-pipeline] svi_snapshots update failed", error);
      return { snapshotId: null, shareToken: null };
    }
  } else {
    token = nanoid(24);
    const { data: inserted, error } = await supabase
      .from("svi_snapshots")
      .insert({ account_id: args.accountId, snapshot_date: today, report_share_token: token, ...payload })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[blockid:report-pipeline] svi_snapshots insert failed", error);
      return { snapshotId: null, shareToken: null };
    }
    snapshotId = String((inserted as Row).id);
  }

  await supabase
    .from("svi_accounts")
    .update({ current_svi: Math.round(args.sviTotal), current_stage: args.stage, last_active_at: new Date().toISOString() })
    .eq("id", args.accountId);

  return { snapshotId, shareToken: token };
}

async function loadEvaluationIntake(projectId: string): Promise<{ website: string | null; state: string | null; notes: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { website: null, state: null, notes: null };
  const { data } = await supabase
    .from("evaluations")
    .select("website, state, notes")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const r = (data ?? {}) as Row;
  return {
    website: typeof r.website === "string" ? r.website : null,
    state: typeof r.state === "string" ? r.state : null,
    notes: typeof r.notes === "string" ? r.notes : null,
  };
}

/**
 * Full Trust BizReport for `projectId`, run by `requestedByUserId` (the
 * evaluator). Throws on any failure — the caller charges only on return.
 */
export async function runTrustReportForProject(args: {
  projectId: string;
  requestedByUserId: string;
  tier?: ReportTier;
  locale?: "en" | "vi";
  /** Written to assembled_reports.credits_cost. */
  creditsCost?: number;
}): Promise<TrustReportRunResult> {
  const tier: ReportTier = args.tier ?? "standard";
  const locale = args.locale ?? "en";
  const project = await getProjectById(args.projectId);
  if (!project) throw new Error("project_not_found");
  const ownerEmail = await resolveOwnerEmail(project.userId);
  if (!ownerEmail) throw new Error("owner_not_found");

  const account = await ensureAccount(ownerEmail, project.id, project.name);
  if (!account) throw new Error("account_unavailable");

  // A startup the evaluator just entered has no svi_analyses row yet —
  // synthesise one from the intake fields so the 13 agents have a baseline.
  let synthesisedAnalysis = false;
  let loaded = await loadProjectReportContext({ ownerEmail, projectId: project.id });
  if (!loaded.ok && loaded.error === "no_analysis") {
    const intake = await loadEvaluationIntake(project.id);
    const rawInput = synthesiseRawInput({
      name: project.name,
      description: project.description,
      industry: project.industry,
      website: intake.website,
      state: intake.state,
      notes: intake.notes,
    });
    const analysis = computeSVI(extractSignals({ rawText: rawInput }, undefined, loadEvidenceItems(await loadEvidence(account.id))));
    const analysisId = await insertAnalysisRow({ email: ownerEmail, projectId: project.id, rawInput, analysis });
    if (!analysisId) throw new Error("analysis_insert_failed");
    synthesisedAnalysis = true;
    loaded = await loadProjectReportContext({ ownerEmail, projectId: project.id });
  }
  if (!loaded.ok) throw new Error(loaded.error);
  const ctx = loaded.ctx;

  const report = await generateAndPersistReport({
    ctx,
    userId: args.requestedByUserId,
    tier,
    locale,
    creditsCost: args.creditsCost ?? 0,
  });

  const shapes = projectReportToSnapshotShapes(report, ctx.sviAnalysis);
  const sviTotal = Math.round(ctx.sviAnalysis.totalSVI);
  const { snapshotId, shareToken } = await upsertSnapshotWithToken({
    accountId: ctx.account.id,
    projectId: project.id,
    sviTotal,
    stage: ctx.sviAnalysis.stage,
    delta: null,
    analysisJson: {
      source: "evaluator_trust_report",
      report_id: report.id,
      tier,
      locale,
      industry: project.industry ?? null,
      stageLabel: ctx.sviAnalysis.stageLabel,
      executiveSummary: report.executiveSummary.slice(0, 2000),
      qualityScore: report.qualityScore,
      totalWords: report.totalWords,
      requested_by: args.requestedByUserId,
    },
    dimensionScores: shapes.dimensionScores,
    dimResults: shapes.dimResults,
    criterionResults: shapes.criterionResults,
  });

  return {
    kind: "full",
    reportId: report.id,
    snapshotId,
    shareToken,
    svi: sviTotal,
    stage: ctx.sviAnalysis.stage,
    wordCount: report.totalWords,
    qualityScore: report.qualityScore,
    synthesisedAnalysis,
  };
}

function loadEvidenceItems(rows: Row[]): EvidenceItem[] {
  return rows.map((e) => ({
    evidence_type: String(e.evidence_type ?? ""),
    confidence_level: String(e.confidence_level ?? ""),
    dimension: String(e.dimension ?? ""),
    label: String(e.label ?? ""),
  }));
}

/**
 * Re-score: the `svi_analysis` path (extractSignals → computeSVI over the
 * stored input + every evidence item), persisted as a new svi_analyses row
 * and today's svi_snapshots row (with share token). No agents, no LLM.
 */
export async function runRescoreForProject(args: {
  projectId: string;
  requestedByUserId: string;
}): Promise<RescoreRunResult> {
  const project = await getProjectById(args.projectId);
  if (!project) throw new Error("project_not_found");
  const ownerEmail = await resolveOwnerEmail(project.userId);
  if (!ownerEmail) throw new Error("owner_not_found");
  const account = await ensureAccount(ownerEmail, project.id, project.name);
  if (!account) throw new Error("account_unavailable");

  const latest = (await findLatestAnalysisWithFallback(
    ownerEmail,
    project.id,
    "id, raw_input, total_svi, analysis_json",
  )) as ProjectReportAnalysis | null;

  let rawInput = latest?.raw_input ? String(latest.raw_input) : "";
  if (!rawInput.trim()) {
    const intake = await loadEvaluationIntake(project.id);
    rawInput = synthesiseRawInput({
      name: project.name,
      description: project.description,
      industry: project.industry,
      website: intake.website,
      state: intake.state,
      notes: intake.notes,
    });
  }

  const evidenceRows = await loadEvidence(account.id);
  const analysis = computeSVI(extractSignals({ rawText: rawInput }, undefined, loadEvidenceItems(evidenceRows)));
  const analysisId = await insertAnalysisRow({ email: ownerEmail, projectId: project.id, rawInput, analysis });
  if (!analysisId) throw new Error("analysis_insert_failed");

  const prior =
    typeof account.current_svi === "number" && Number.isFinite(account.current_svi)
      ? account.current_svi
      : latest?.total_svi != null
        ? Number(latest.total_svi)
        : null;
  const sviTotal = Math.round(analysis.totalSVI);
  const delta = prior !== null && Number.isFinite(prior) ? sviTotal - Math.round(prior) : null;

  const dimensionScores: Record<string, { score: number; priority: "high" | "medium" | "low" }> = {};
  for (const sub of analysis.subs) {
    const score = Math.round(sub.value);
    dimensionScores[sub.key] = { score, priority: score < 50 ? "high" : score < 70 ? "medium" : "low" };
  }

  const { snapshotId, shareToken } = await upsertSnapshotWithToken({
    accountId: account.id,
    projectId: project.id,
    sviTotal,
    stage: analysis.stage,
    delta,
    analysisJson: {
      source: "evaluator_rescore",
      analysis_id: analysisId,
      industry: project.industry ?? null,
      stageLabel: analysis.stageLabel,
      summary: analysis.summary,
      evidenceCount: evidenceRows.length,
      requested_by: args.requestedByUserId,
    },
    dimensionScores,
    dimResults: null,
    criterionResults: null,
  });
  if (!snapshotId) throw new Error("snapshot_write_failed");

  return { kind: "rescore", snapshotId, shareToken, analysisId, svi: sviTotal, delta, stage: analysis.stage };
}
