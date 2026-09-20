// run-for-project — the one seam through which a Trusted Business Report is produced
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
import { assertReportUsable, orchestrateReport, type AICallerResult, type PipelineEvent, type PipelineEventHandler } from "@/lib/report-pipeline/orchestrator";
import type { ReportTierV2, ReportV2 } from "@/lib/report-v2/schema";
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
import { fromAssembledReport, fromSnapshot, type SnapshotDimState } from "@/lib/report-v2/adapter";
import { writeAssembledReportJson, writeSnapshotReportV2 } from "@/lib/report-v2/storage";
import { loadCapTableInput } from "@/lib/svi/cap-table-input";
import { effectiveConfidenceLevel } from "@/lib/svi/rescore-from-evidence";
import { applyFounderExecution } from "@/lib/founder/execution-load";
import { loadDimensionEvidenceRows, type GatherDb } from "@/lib/report-pipeline/gather";
import { hubRowsToEvidenceItems } from "@/lib/evidence/hub-rows";
import { buildTbrQualityRow, formatTbrQualityLine, recordTbrQualityAsync, type TbrQualityRow, type TbrQualityWriter } from "@/lib/report-pipeline/quality-log";
import { PIPELINE_VERSION } from "@/lib/report-pipeline/version";

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
  /** app_users.id of the owner (S-R3: connector signals / cap-table key). Absent on legacy rows. */
  user_id?: string | null;
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
  /** G14-S36: projects.verification_level (0–5) for the cover badge; null when unknown. */
  verificationLevel?: number | null;
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
  /** G13-W2-R2: ReportV2 tier ("free" → W3 off, chapters 6–9 as cards, ≤ 16 calls). Defaults to `tier`. */
  tierV2?: ReportTierV2;
  /** §C.12 SSE hook forwarded to the orchestrator. */
  onEvent?: PipelineEventHandler;
  /**
   * G19-S46 quality telemetry: `"record"` (default) appends the
   * tbr-quality.jsonl row here (no snapshot id — the founder route writes
   * none); `"defer"` leaves it to the caller, which knows the snapshot id
   * (runTrustReportForProject). The stats are attached to the report either way.
   */
  qualityLog?: "record" | "defer";
  /** Test seam for the telemetry writer. */
  qualityWriter?: TbrQualityWriter;
}

export interface TrustReportRunResult {
  kind: "full";
  reportId: string;
  snapshotId: string | null;
  shareToken: string | null;
  /** S-R4: the ReportV2 persisted for this run (null when no snapshot row could be written). */
  reportV2: ReportV2 | null;
  /** G19-S46: the tbr-quality.jsonl row written for this run. */
  quality: TbrQualityRow;
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
 * `criterion_results` shapes `/tbr/<token>` and `/workspace/reports/business`
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
  /** S17-A P2-1: the CALLER's email — a member never falls back to the owner's pre-project record. */
  callerEmail?: string;
}): Promise<LoadContextResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "db_unavailable" };
  const keyOpts = args.callerEmail ? { callerEmail: args.callerEmail } : undefined;

  // `svi_accounts` has NO user_id column (W4 review P0: selecting it made
  // PostgREST 42703 → every full report failed `no_account`). The owner's
  // app_users.id comes from projects.user_id instead.
  const account = (await findSVIAccountWithFallback(
    args.ownerEmail,
    args.projectId,
    "id, email, startup_name, current_svi, current_stage",
    keyOpts,
  )) as ProjectReportAccount | null;
  if (!account) return { ok: false, error: "no_account" };
  // S36: projects.verification_level for the cover badge (null when unknown).
  let verificationLevel: number | null = null;
  if (args.projectId) {
    try {
      const project = await getProjectById(args.projectId);
      if (project?.userId) account.user_id = project.userId;
      verificationLevel = project?.verificationLevel ?? null;
    } catch {
      /* owner id is an optional GATHER key */
    }
  }

  const latestAnalysis = (await findLatestAnalysisWithFallback(
    args.ownerEmail,
    args.projectId,
    "id, raw_input, total_svi, analysis_json",
    keyOpts,
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
  // G19-S43: the project-scoped Evidence Hub (svi_dimension_evidence) joins the
  // account-scoped rows — the pipeline used to ignore every hub upload.
  if (args.projectId) evidenceItems.push(...(await loadHubEvidenceItems(args.projectId)));

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
      verificationLevel,
    },
  };
}

/** G19-S46: the tbr-quality.jsonl row for a finished run (pure; exported for tests). */
export function qualityRowFor(
  report: Pick<AssembledReport, "reportV2" | "totalWords" | "consistencyIssues" | "llmCalls" | "pipelineStats">,
  ctx: Pick<ProjectReportContext, "projectId" | "sviAnalysis">,
  tier: string,
  snapshotId: string | null,
  reportV2: ReportV2 | null = report.reportV2 ?? null,
  now: Date = new Date(),
): TbrQualityRow {
  const row = buildTbrQualityRow({
    projectId: ctx.projectId,
    snapshotId,
    tier,
    report: reportV2,
    calls: report.pipelineStats?.calls ?? report.llmCalls ?? 0,
    costUsd: report.pipelineStats?.costUsd ?? 0,
    durationMs: report.pipelineStats?.durationMs ?? 0,
    words: report.totalWords,
    consistencyIssues: report.consistencyIssues.length,
    sviVersion: ctx.sviAnalysis.version,
    pipelineVersion: reportV2?.pipelineVersion ?? PIPELINE_VERSION,
    now,
  });
  try {
    console.info(formatTbrQualityLine(row));
  } catch {
    /* never throw */
  }
  return row;
}

// ---------------------------------------------------------------------------
// Step 2 — orchestrate + persist (throws on pipeline failure)
// ---------------------------------------------------------------------------

export async function generateAndPersistReport(input: GenerateReportInput): Promise<AssembledReport> {
  const { ctx, userId, tier, locale, creditsCost, tierV2 } = input;
  const supabase = getSupabaseAdmin();

  // G19-S46: capture the orchestrator's `done` event (calls, real cost,
  // wall-clock) for the quality row; the caller's SSE hook still sees every event.
  const t0 = Date.now();
  let done: Extract<PipelineEvent, { type: "done" }> | null = null;
  const onEvent: PipelineEventHandler = (event) => {
    if (event.type === "done") done = event;
    input.onEvent?.(event);
  };

  // agentId scoped to this account+project → each report gets its own
  // per-agent semaphore slot (see agent-dispatcher) so concurrent reports
  // run in parallel instead of serialising through one shared bucket.
  const svAgentId = `svi:${ctx.account.id}${ctx.projectId ? `:${ctx.projectId}` : ""}`;
  // S-R3 (W2 review b): hand the REAL cost / provider back so the
  // orchestrator's `done` event and ai-spend-daily.json carry it.
  //
  // G19-S46: NO `userId` on these calls. ai-client's per-user fairness
  // limiter (S31-A: 2 in flight per user, 6 queued for ≤ 45 s, then
  // AICapacityError) exists for interactive fan-out — a founder with six
  // tabs. A report run is ONE job that fans out 6 W1 + 8 W4 calls of ~30 s
  // each under its own per-report call cap and per-agent semaphore
  // (`svAgentId`, 8 slots); under the per-user cap calls 3–6 of every wave
  // timed out in the queue ("AI capacity busy for this account"), the
  // structured pass failed, the repair pass queued and failed again, and
  // each criterion degraded to unvalidated prose (BlockID's own run,
  // 2026-09-20: 4 of 6 W1 criteria). `userId` still lands on the
  // assembled_reports / agent_report_tasks rows below.
  const aiCaller = async (
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    taskClass?: "classify" | "report" | "synthesis",
  ): Promise<AICallerResult> => {
    const result = await callAI({
      system: systemPrompt,
      user: userPrompt,
      maxTokens,
      timeoutMs: 120_000,
      agentId: svAgentId,
      taskClass,
    });
    return { text: result.text, costUsd: result.cost_usd, provider: result.via ?? result.provider, model: result.model };
  };

  try {
    const report = await orchestrateReport({
      accountId: ctx.account.id,
      userId,
      ownerUserId: ctx.account.user_id ?? undefined,
      projectId: ctx.projectId ?? undefined,
      startupName: String(ctx.account.startup_name ?? "Unknown Startup"),
      rawText: String(ctx.latestAnalysis.raw_input ?? ""),
      sviAnalysis: ctx.sviAnalysis,
      evidenceItems: ctx.evidenceItems,
      criteriaData: ctx.criteriaData,
      verificationLevel: ctx.verificationLevel ?? null,
      tier,
      tierV2,
      locale,
      callAI: aiCaller,
      onEvent,
    });
    // Throws into the catch below → failed-status row, and the evaluator
    // route's refund path (a throw after a credit spend refunds it).
    assertReportUsable(report);
    const stats = done as Extract<PipelineEvent, { type: "done" }> | null;
    report.pipelineStats = {
      calls: stats?.calls ?? report.llmCalls ?? 0,
      costUsd: stats?.costUsd ?? 0,
      costAud: stats?.costAud ?? 0,
      durationMs: stats?.totalMs ?? Date.now() - t0,
      degradedSections: stats?.degradedSections ?? report.reportV2?.quality.degradedSections ?? [],
      deadlineHit: stats?.deadlineHit ?? false,
    };
    if ((input.qualityLog ?? "record") === "record") {
      await recordTbrQualityAsync(qualityRowFor(report, ctx, tier, null), input.qualityWriter);
    }

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
      } else {
        // G13-W1-R1: ReportV2 projection (migration 0395 column; best effort —
        // a missing column logs once and never fails the report).
        // G13-W2-R2: the orchestrator now attaches the projection WITH the W4
        // chapters (`report.reportV2`); the adapter is the fallback when W4 is
        // off (REPORT_PIPELINE_W4=off) or the projection failed validation.
        await writeAssembledReportJson(
          supabase,
          report.id,
          report.reportV2 ??
          fromAssembledReport(report, {
            projectId: ctx.projectId,
            accountId: ctx.account.id,
            startupName: ctx.account.startup_name,
            stageLabel: ctx.sviAnalysis.stageLabel,
            stage: ctx.sviAnalysis.stage,
            sviTotal: ctx.sviAnalysis.totalSVI,
            dimensionScores: ctx.sviAnalysis.dimensionScores ?? null,
            subs: ctx.sviAnalysis.subs,
            sviAnalysis: ctx.sviAnalysis,
            industry: ctx.sviAnalysis.sectorLabel ?? ctx.sviAnalysis.sector ?? null,
            verificationLevel: ctx.verificationLevel ?? null,
            tier,
            locale,
          }),
        );
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
    // G19-S46: a fully-degraded run is still a run — log it (8 degraded, no
    // snapshot) so /api/status.tbr_quality sees the outage as degradedShare.
    const stats = done as Extract<PipelineEvent, { type: "done" }> | null;
    const degradedErr = err as { degradedSections?: unknown; calls?: unknown };
    if (typeof degradedErr?.degradedSections === "number" && typeof degradedErr?.calls === "number") {
      await recordTbrQualityAsync(
        buildTbrQualityRow({
          projectId: ctx.projectId,
          snapshotId: null,
          tier,
          report: null,
          calls: degradedErr.calls,
          costUsd: stats?.costUsd ?? 0,
          durationMs: stats?.totalMs ?? Date.now() - t0,
          degradedSections: degradedErr.degradedSections,
          sviVersion: ctx.sviAnalysis.version,
          pipelineVersion: PIPELINE_VERSION,
        }),
        input.qualityWriter,
      );
    }
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

/**
 * G19-S43: the project's Evidence Hub rows (`svi_dimension_evidence`) as
 * `EvidenceItem`s for extractSignals / computeSVI — origin-capped (S36 D4:
 * founder upload ≤ document_uploaded, reviewer-signed may reach
 * third_party_verified), rejected rows dropped. Fail-soft: a missing table /
 * column reads as no rows.
 */
export async function loadHubEvidenceItems(projectId: string): Promise<EvidenceItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const rows = await loadDimensionEvidenceRows(supabase as unknown as GatherDb, projectId);
    return hubRowsToEvidenceItems(rows);
  } catch {
    return [];
  }
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

  // G13-W1-T1: silent taxonomy fill from the freshly computed analysis
  // (detectSector slug, SVI stage, raw input). try/catch-guarded — a
  // classification problem never fails a report run.
  try {
    const { silentFillTaxonomy } = await import("@/lib/taxonomy/silent-fill");
    const { suggestInputFromAnalysis } = await import("@/lib/taxonomy/suggest");
    await silentFillTaxonomy(
      args.projectId,
      suggestInputFromAnalysis(args.analysis, { rawText: args.rawInput }),
      { reason: "report_pipeline" },
    );
  } catch (taxErr) {
    console.warn("[blockid:report-pipeline] taxonomy silent fill threw", taxErr);
  }
  return id;
}

/**
 * Write (or, same UTC day, update — svi_snapshots has UNIQUE(account_id,
 * snapshot_date)) the snapshot the /tbr page renders and make sure it
 * carries a share token. Returns the row id + token, or nulls on failure —
 * the report itself is already persisted, so callers degrade to "no link".
 */
export async function upsertSnapshotWithToken(args: {
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
 * Full Trusted Business Report for `projectId`, run by `requestedByUserId` (the
 * evaluator). Throws on any failure — the caller charges only on return.
 */
export async function runTrustReportForProject(args: {
  projectId: string;
  requestedByUserId: string;
  tier?: ReportTier;
  locale?: "en" | "vi";
  /** Written to assembled_reports.credits_cost. */
  creditsCost?: number;
  /** G19-S46: test seam for the tbr-quality.jsonl writer. */
  qualityWriter?: TbrQualityWriter;
  /** G19-S46: pipeline events (the self-report script logs phases + timings). */
  onEvent?: PipelineEventHandler;
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
    // S-R5 §C.7: the equity register feeds CGH (fail-soft: null → keyword score).
    const capTableInput = await loadCapTableInput(getSupabaseAdmin() as unknown as GatherDb | null, project.userId, project.id);
    // G14-S37: the owner's structured founder profile overrides the regex founder flags (fail-soft).
    const { signals } = await applyFounderExecution(
      extractSignals({ rawText: rawInput }, undefined, [...loadEvidenceItems(await loadEvidence(account.id)), ...(await loadHubEvidenceItems(project.id))]),
      { accountId: project.userId, email: ownerEmail, projectId: project.id },
    );
    // G14-S36 (F-6): the project's verification level scales the confidence (null → unchanged).
    const analysis = computeSVI(signals, undefined, undefined, undefined, undefined, undefined, undefined, capTableInput, project.verificationLevel ?? null);
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
    qualityLog: "defer",
    qualityWriter: args.qualityWriter,
    onEvent: args.onEvent,
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

  // G13-W1-R1: persist the ReportV2 document the /tbr page renders
  // (svi_snapshots.report_v2, migration 0395). Best effort — readers fall
  // back to the adapter when the column is absent or the write fails.
  let reportV2: ReportV2 | null = null;
  if (snapshotId) {
    const db = getSupabaseAdmin();
    if (db) {
      // W2 review P1: the evaluator TBR / dossier read `svi_snapshots.report_v2`
      // — persist the pipeline's own document (with the W4 chapters) when the
      // orchestrator produced one; the adapter projection is the fallback.
      reportV2 = report.reportV2
        ? { ...report.reportV2, snapshotId, projectId: project.id }
        : fromAssembledReport(report, {
            snapshotId,
            projectId: project.id,
            accountId: ctx.account.id,
            startupName: project.name ?? ctx.account.startup_name,
            industry: project.industry ?? null,
            stageLabel: ctx.sviAnalysis.stageLabel,
            stage: ctx.sviAnalysis.stage,
            sviTotal,
            dimensionScores: ctx.sviAnalysis.dimensionScores ?? null,
            subs: ctx.sviAnalysis.subs,
            sviAnalysis: ctx.sviAnalysis,
            verificationLevel: project.verificationLevel ?? null,
            tier,
            locale,
          });
      await writeSnapshotReportV2(db, snapshotId, reportV2);
    }
  }

  // G19-S46: one quality row per run, now that the snapshot id is known.
  const quality = await recordTbrQualityAsync(qualityRowFor(report, ctx, tier, snapshotId, reportV2 ?? report.reportV2 ?? null), args.qualityWriter);

  return {
    kind: "full",
    reportId: report.id,
    snapshotId,
    shareToken,
    reportV2,
    quality,
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
    // S36 D4: the extractor sees each row at its origin-capped level.
    confidence_level: effectiveConfidenceLevel({
      evidence_type: String(e.evidence_type ?? ""),
      confidence_level: e.confidence_level == null ? null : String(e.confidence_level),
      verified_at: e.verified_at == null ? null : String(e.verified_at),
    }),
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
  /**
   * G19-S46: replaces the stored `raw_input` for this re-score (the
   * self-report seed writes BlockID's own description before the report
   * run). Persisted on the new svi_analyses row like any founder input.
   */
  rawInput?: string;
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

  let rawInput = args.rawInput?.trim() ? args.rawInput.trim() : latest?.raw_input ? String(latest.raw_input) : "";
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
  // S-R5 §C.7: the equity register feeds CGH (fail-soft: null → keyword score).
  const capTableInput = await loadCapTableInput(getSupabaseAdmin() as unknown as GatherDb | null, project.userId, project.id);
  // G14-S37: the owner's structured founder profile overrides the regex founder flags (fail-soft).
  // G19-S43: the Evidence Hub rows score alongside the account-scoped ones.
  const hubItems = await loadHubEvidenceItems(project.id);
  const { signals } = await applyFounderExecution(
    extractSignals({ rawText: rawInput }, undefined, [...loadEvidenceItems(evidenceRows), ...hubItems]),
    { accountId: project.userId, email: ownerEmail, projectId: project.id },
  );
  // G14-S36 (F-6): the project's verification level scales the confidence (null → unchanged).
  const analysis = computeSVI(signals, undefined, undefined, undefined, undefined, undefined, undefined, capTableInput, project.verificationLevel ?? null);
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
      evidenceCount: evidenceRows.length + hubItems.length,
      requested_by: args.requestedByUserId,
    },
    dimensionScores,
    dimResults: null,
    criterionResults: null,
  });
  if (!snapshotId) throw new Error("snapshot_write_failed");

  // G13-W1-R1: ReportV2 from the dimension scores alone (no agents ran).
  {
    const db = getSupabaseAdmin();
    if (db) {
      const dimStates: Record<string, SnapshotDimState> = {};
      for (const [k, v] of Object.entries(dimensionScores)) dimStates[k] = { status: "complete", score: v.score, priority: v.priority };
      await writeSnapshotReportV2(
        db,
        snapshotId,
        fromSnapshot({
          snapshotId,
          projectId: project.id,
          accountId: account.id,
          startupName: project.name ?? account.startup_name,
          industry: project.industry ?? null,
          stageLabel: analysis.stageLabel,
          stage: analysis.stage,
          sviTotal,
          deltaVsLast: delta,
          dimStates,
          verificationLevel: project.verificationLevel ?? null,
          tier: "standard",
        }),
      );
    }
  }

  return { kind: "rescore", snapshotId, shareToken, analysisId, svi: sviTotal, delta, stage: analysis.stage };
}
