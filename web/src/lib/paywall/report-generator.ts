/**
 * report-generator.ts — the real Trust Business Report generation hook.
 *
 * Master Upgrade Plan §8.6 Phase 4. Replaces the `rpt-placeholder-…`
 * stub that used to live inline in /api/cron/report-order-drain: the
 * paywall state machine would happily flip an order to READY with a
 * report_id that resolved to nothing at all.
 *
 * Contract: this module exports a function whose signature matches
 * `WorkerDeps["generateReport"]` in report-order-worker.ts, so the cron
 * route can hand it straight to `processNextQueuedOrder()`.
 *
 * What it does (mirrors /api/svi/enhanced-report, the working call site
 * for the multi-agent pipeline — we deliberately reuse its data-gathering
 * rather than reimplementing it):
 *
 *   1. Resolve the order (report_orders) → user → svi_account → latest
 *      svi_analysis for the business. `report_orders.business_id`
 *      currently FKs projects(id), so it doubles as the project id used
 *      by the (email, project_id) account lookup.
 *   2. Load evidence + the 13 evaluation_criteria rows.
 *   3. Run `orchestrateReport()` — GATHER → 3 ANALYZE waves → SYNTHESIZE.
 *   4. Persist the assembled report to `assembled_reports` (the table the
 *      existing pipeline already writes to) plus per-agent rows in
 *      `agent_report_tasks`.
 *   5. Return the stored row's id so the worker can set
 *      `report_orders.report_id`.
 *
 * Report id note: `assembled_reports.id` is TEXT (app-generated ids such
 * as "rpt-mc3x-ab12cd") while `report_orders.report_id` is UUID
 * (migration 0270). To keep both sides valid without a schema change we
 * mint a UUID for the paywalled report and store it as the
 * assembled_reports primary key — a uuid string is perfectly legal TEXT,
 * and it is what report_orders.report_id was always documented to hold
 * ("stores a uuid handle so the orchestrator can enqueue with a stable
 * id"). The orchestrator's own `report.id` is kept in the row's
 * sections/metadata trail only.
 *
 * Failure semantics: every return value carries `transient` so the
 * worker's existing retry policy (MAX_RETRIES = 3) decides. Data-shaped
 * problems (no analysis for this business) are permanent — retrying
 * cannot fix them and the customer should be refunded straight away.
 * Infrastructure problems (DB down, AI provider hiccup) are transient.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { orchestrateReport } from "@/lib/report-pipeline/orchestrator";
import type { ReportTier, CriterionData } from "@/lib/report-pipeline/types";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { SVIAnalysis, EvidenceItem } from "@/lib/svi-analysis";
import {
  findSVIAccountWithFallback,
  findLatestAnalysisWithFallback,
} from "@/lib/projects";
import type { GenerateInput, GenerateResult } from "./report-order-worker";

// ─────────────────────────────────────────────────────────────────────────────
// Narrow Supabase surface
//
// Mirrors `MinimalSupabase` in report-order-worker.ts: the generator only
// needs select/insert, so tests can supply a hand-rolled double instead of
// a full SupabaseClient.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface GeneratorSelectBuilder
  extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq(col: string, val: unknown): GeneratorSelectBuilder;
  order(col: string, opts: { ascending: boolean }): GeneratorSelectBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
}

export interface GeneratorSupabase {
  from(table: string): {
    select(cols: string): GeneratorSelectBuilder;
    insert(
      payload: Row | Row[],
    ): PromiseLike<{ error: { message?: string } | null }>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deps — everything injectable so the colocated tests never touch a real
// database, a real AI provider, or the real orchestrator.
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratorDeps {
  /** Pass `null` to assert "no database"; omit to use getSupabaseAdmin(). */
  supabase?: GeneratorSupabase | null;
  orchestrate?: typeof orchestrateReport;
  aiConfigured?: () => boolean;
  findAccount?: typeof findSVIAccountWithFallback;
  findAnalysis?: typeof findLatestAnalysisWithFallback;
  /** Injectable id minter — the stored report's primary key. */
  newReportId?: () => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map the credit quote's depth (report-credit-cost.ts) onto a pipeline
 * tier. Path A (A$5.50 Stripe) carries no quote and lands on "standard",
 * which is exactly the 10-section / ~5-8k-word product the A$5.50 SKU is
 * priced for (§14bis D1).
 */
const DEPTH_TIER: Record<string, ReportTier> = {
  scan: "standard",
  standard: "standard",
  deep: "premium",
  expert: "premium",
  max: "investor_memo",
};

export function tierForOrderMetadata(metadata: unknown): ReportTier {
  if (!metadata || typeof metadata !== "object") return "standard";
  const quote = (metadata as Row).quote;
  if (!quote || typeof quote !== "object") return "standard";
  const depth = (quote as Row).depth;
  if (typeof depth !== "string") return "standard";
  return DEPTH_TIER[depth] ?? "standard";
}

function localeForOrderMetadata(metadata: unknown): "en" | "vi" {
  if (!metadata || typeof metadata !== "object") return "en";
  return (metadata as Row).locale === "vi" ? "vi" : "en";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fail(transient: boolean, reason: string): GenerateResult {
  return { ok: false, transient, reason };
}

const STAGE_LABELS = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
];

function buildSVIAnalysis(
  account: Row,
  latestAnalysis: Row,
): SVIAnalysis {
  const analysisJson =
    (latestAnalysis.analysis_json as Row | null | undefined) ?? null;
  const stage = Number(account.current_stage ?? analysisJson?.stage ?? 0);

  return {
    version: String(analysisJson?.version ?? "2.0.0"),
    totalSVI: Number(
      latestAnalysis.total_svi ?? account.current_svi ?? 100,
    ),
    baselineSVI: Number(analysisJson?.baselineSVI ?? 100),
    netAdjustment: Number(analysisJson?.netAdjustment ?? 0),
    confidenceMultiplier: Number(analysisJson?.confidenceMultiplier ?? 0.5),
    subs: (analysisJson?.subs as SVIAnalysis["subs"]) ?? [],
    riskPenalties:
      (analysisJson?.riskPenalties as SVIAnalysis["riskPenalties"]) ?? [],
    evidenceGaps:
      (analysisJson?.evidenceGaps as SVIAnalysis["evidenceGaps"]) ?? [],
    nextActions:
      (analysisJson?.nextActions as SVIAnalysis["nextActions"]) ?? [],
    signals:
      (analysisJson?.signals as SVIAnalysis["signals"]) ??
      ({} as SVIAnalysis["signals"]),
    summary: String(analysisJson?.summary ?? ""),
    stage,
    stageLabel: String(
      analysisJson?.stageLabel ?? STAGE_LABELS[stage] ?? "Concept",
    ),
    stageBonus: Number(analysisJson?.stageBonus ?? 0),
  };
}

function buildCriteriaData(rows: Row[]): Record<CriterionKey, CriterionData> {
  const empty: CriterionData = {
    textInput: "",
    files: [],
    links: [],
    qualityLevel: "incomplete",
  };
  const out: Record<string, CriterionData> = {};

  for (const key of CRITERION_KEYS) {
    const row = rows.find((r) => r.criterion_key === key);
    if (!row) {
      out[key] = { ...empty };
      continue;
    }
    out[key] = {
      textInput: String(row.text_input ?? ""),
      files: Array.isArray(row.files)
        ? (row.files as CriterionData["files"])
        : [],
      links: Array.isArray(row.links)
        ? (row.links as CriterionData["links"])
        : [],
      qualityLevel: String(row.quality_level ?? "incomplete"),
      aiScore:
        typeof row.ai_score === "number" ? row.ai_score : undefined,
    };
  }

  return out as Record<CriterionKey, CriterionData>;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate + persist the Trust Business Report for a PAID order.
 *
 * Signature-compatible with `WorkerDeps["generateReport"]`; the optional
 * second argument exists purely for the colocated tests.
 */
export async function generateTrustReportForOrder(
  input: GenerateInput,
  deps: GeneratorDeps = {},
): Promise<GenerateResult> {
  const supabase =
    deps.supabase !== undefined
      ? deps.supabase
      : ((getSupabaseAdmin() as SupabaseClient | null) as GeneratorSupabase | null);
  if (!supabase) return fail(true, "supabase_not_configured");

  const orchestrate = deps.orchestrate ?? orchestrateReport;
  const aiConfigured = deps.aiConfigured ?? isAIConfigured;
  const findAccount = deps.findAccount ?? findSVIAccountWithFallback;
  const findAnalysis = deps.findAnalysis ?? findLatestAnalysisWithFallback;
  const newReportId = deps.newReportId ?? randomUUID;

  // ── 1. Order → user ──────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("report_orders")
    .select("id, user_id, business_id, status, credits_used, metadata")
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderErr) {
    return fail(
      true,
      `order_lookup_failed: ${errMessage(orderErr)}`,
    );
  }
  if (!order) return fail(false, "order_not_found");

  const userId = String(order.user_id ?? "");
  if (!userId) return fail(false, "order_missing_user");

  const { data: userRow } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  const email = typeof userRow?.email === "string" ? userRow.email : "";
  if (!email) return fail(false, "order_user_not_found");

  // ── 2. SVI account + latest analysis for this business ───────────────
  // business_id FKs projects(id) today, so it is the project scope key.
  const projectId = input.businessId;

  const account = await findAccount(
    email,
    projectId,
    "id, email, startup_name, current_svi, current_stage",
  );
  if (!account) return fail(false, "no_svi_account_for_business");

  const latestAnalysis = await findAnalysis(
    email,
    projectId,
    "id, raw_input, total_svi, analysis_json",
  );
  if (!latestAnalysis) return fail(false, "no_svi_analysis_for_business");

  // AI outage / key rotation is transient — three drain ticks apart gives
  // the provider chain time to recover before we refund the customer.
  if (!aiConfigured()) return fail(true, "ai_not_configured");

  const accountId = String(account.id ?? "");
  if (!accountId) return fail(false, "svi_account_missing_id");

  // ── 3. Evidence + criteria ───────────────────────────────────────────
  const { data: evidenceRows } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  const evidenceItems: EvidenceItem[] = (evidenceRows ?? []).map((e) => ({
    evidence_type: String(e.evidence_type ?? ""),
    confidence_level: String(e.confidence_level ?? ""),
    dimension: String(e.dimension ?? ""),
    label: String(e.label ?? ""),
  }));

  const { data: criteriaRows } = await supabase
    .from("evaluation_criteria")
    .select("criterion_key, text_input, files, links, quality_level, ai_score")
    .eq("account_id", accountId);

  const criteriaData = buildCriteriaData(criteriaRows ?? []);
  const sviAnalysis = buildSVIAnalysis(account, latestAnalysis);

  const tier = tierForOrderMetadata(order.metadata);
  const locale = localeForOrderMetadata(order.metadata);

  // ── 4. Orchestrate ───────────────────────────────────────────────────
  const aiCaller = async (
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> => {
    const result = await callAI({
      system: systemPrompt,
      user: userPrompt,
      maxTokens,
      timeoutMs: 120_000,
    });
    return result.text;
  };

  let report: Awaited<ReturnType<typeof orchestrateReport>>;
  try {
    report = await orchestrate({
      accountId,
      userId,
      projectId,
      startupName: String(account.startup_name ?? "Unknown Startup"),
      rawText: String(latestAnalysis.raw_input ?? ""),
      sviAnalysis,
      evidenceItems,
      criteriaData,
      tier,
      locale,
      callAI: aiCaller,
    });
  } catch (err) {
    // AI provider / network failure — worth another drain tick.
    return fail(true, `orchestration_failed: ${errMessage(err)}`);
  }

  // ── 5. Persist ───────────────────────────────────────────────────────
  // The stored row's primary key IS the value we hand back as
  // report_orders.report_id, so a READY order always resolves to a real
  // assembled_reports row (regression-guarded in
  // report-generation-e2e.test.ts).
  const storedReportId = newReportId();

  const { error: insertErr } = await supabase
    .from("assembled_reports")
    .insert({
      id: storedReportId,
      account_id: accountId,
      user_id: userId,
      project_id: projectId,
      analysis_id: latestAnalysis.id ?? null,
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
      credits_cost: Number(order.credits_used ?? 0),
    });

  if (insertErr) {
    // Nothing was stored — do NOT hand back an id that resolves to
    // nothing. Transient so the next tick can retry the whole run.
    return fail(
      true,
      `assembled_reports_insert_failed: ${errMessage(insertErr)}`,
    );
  }

  // Per-agent rows are analytics only — never fail the order on them.
  const agentTasks = report.sections
    .filter((s) => s.criterion)
    .map((s) => ({
      report_id: storedReportId,
      agent_role: s.agentRole,
      criterion_key: s.criterion,
      score: s.score ?? null,
      word_count: s.wordCount,
      content_preview: s.content.slice(0, 500),
      status: "complete",
    }));

  if (agentTasks.length > 0) {
    try {
      const { error: tasksErr } = await supabase
        .from("agent_report_tasks")
        .insert(agentTasks);
      if (tasksErr) {
        console.warn(
          "[blockid:report-generator] agent_report_tasks insert failed",
          errMessage(tasksErr),
        );
      }
    } catch (err) {
      console.warn(
        "[blockid:report-generator] agent_report_tasks insert threw",
        errMessage(err),
      );
    }
  }

  return { ok: true, reportId: storedReportId };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "unknown_error");
  }
  return String(err ?? "unknown_error");
}
