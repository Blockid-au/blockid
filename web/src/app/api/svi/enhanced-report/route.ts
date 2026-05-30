// POST /api/svi/enhanced-report
//
// Triggers a multi-agent orchestrated report generation using the 13-criteria
// evaluation pipeline. Each criterion is analysed by its designated C-Level
// AI agent across 3 waves, then cross-validated and assembled.
//
// Body: { tier: "standard"|"premium"|"investor_memo", locale?: "en"|"vi" }
// Returns: { ok, reportId, wordCount, sections, qualityScore, balance }

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { orchestrateReport } from "@/lib/report-pipeline/orchestrator";
import type { ReportTier, CriterionData } from "@/lib/report-pipeline/types";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { SVIAnalysis, EvidenceItem } from "@/lib/svi-analysis";
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";

export const dynamic = "force-dynamic";

const TIER_FEATURE_MAP: Record<ReportTier, string> = {
  standard: "enhanced_report_standard",
  premium: "enhanced_report_premium",
  investor_memo: "enhanced_report_investor",
};

export async function POST(request: Request) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI service not configured" },
      { status: 503 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { tier?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const tier: ReportTier =
    body.tier === "premium"
      ? "premium"
      : body.tier === "investor_memo"
        ? "investor_memo"
        : "standard";

  const locale: "en" | "vi" = body.locale === "vi" ? "vi" : "en";
  const featureKey = TIER_FEATURE_MAP[tier];

  // ── 2. Credit check ─────────────────────────────────────────────────────
  const affordCheck = await canAfford(user.id, featureKey);
  if (!affordCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: affordCheck.balance,
        cost: affordCheck.cost,
        tier,
      },
      { status: 402 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 },
    );
  }

  // ── 3. Load SVI account & analysis ──────────────────────────────────────
  const projectId = await getProjectIdFromRequest();

  const account = await findSVIAccountWithFallback(
    user.email,
    projectId,
    "id, email, startup_name, current_svi, current_stage",
  );
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "No SVI account found — run an analysis first" },
      { status: 404 },
    );
  }

  const latestAnalysis = await findLatestAnalysisWithFallback(
    user.email,
    projectId,
    "id, raw_input, total_svi, analysis_json",
  );
  if (!latestAnalysis) {
    return NextResponse.json(
      { ok: false, error: "No SVI analysis found — run an analysis first" },
      { status: 404 },
    );
  }

  // ── 4. Load evidence items ──────────────────────────────────────────────
  const { data: evidenceRows } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", account.id as string)
    .order("created_at", { ascending: false });

  const evidenceItems: EvidenceItem[] = (evidenceRows ?? []).map(
    (e: Record<string, unknown>) => ({
      evidence_type: String(e.evidence_type ?? ""),
      confidence_level: String(e.confidence_level ?? ""),
      dimension: String(e.dimension ?? ""),
      label: String(e.label ?? ""),
    }),
  );

  // ── 5. Build criteria data for all 13 criteria ──────────────────────────
  const { data: criteriaRows } = await supabase
    .from("evaluation_criteria")
    .select("criterion_key, text_input, files, links, quality_level, ai_score")
    .eq("account_id", account.id as string);

  const criteriaData: Record<string, CriterionData> = {};
  const emptyData: CriterionData = {
    textInput: "",
    files: [],
    links: [],
    qualityLevel: "incomplete",
  };

  for (const key of CRITERION_KEYS) {
    const row = (criteriaRows ?? []).find(
      (r: Record<string, unknown>) => r.criterion_key === key,
    );
    if (row) {
      criteriaData[key] = {
        textInput: String((row as Record<string, unknown>).text_input ?? ""),
        files: Array.isArray((row as Record<string, unknown>).files)
          ? ((row as Record<string, unknown>).files as CriterionData["files"])
          : [],
        links: Array.isArray((row as Record<string, unknown>).links)
          ? ((row as Record<string, unknown>).links as CriterionData["links"])
          : [],
        qualityLevel: String((row as Record<string, unknown>).quality_level ?? "incomplete"),
        aiScore: (row as Record<string, unknown>).ai_score as number | undefined,
      };
    } else {
      criteriaData[key] = { ...emptyData };
    }
  }

  // ── Build SVIAnalysis object from stored data ───────────────────────────
  const analysisJson = latestAnalysis.analysis_json as Record<string, unknown> | null;
  const sviAnalysis: SVIAnalysis = {
    version: String(analysisJson?.version ?? "2.0.0"),
    totalSVI: Number(latestAnalysis.total_svi ?? account.current_svi ?? 100),
    baselineSVI: Number(analysisJson?.baselineSVI ?? 100),
    netAdjustment: Number(analysisJson?.netAdjustment ?? 0),
    confidenceMultiplier: Number(analysisJson?.confidenceMultiplier ?? 0.5),
    subs: (analysisJson?.subs as SVIAnalysis["subs"]) ?? [],
    riskPenalties: (analysisJson?.riskPenalties as SVIAnalysis["riskPenalties"]) ?? [],
    evidenceGaps: (analysisJson?.evidenceGaps as SVIAnalysis["evidenceGaps"]) ?? [],
    nextActions: (analysisJson?.nextActions as SVIAnalysis["nextActions"]) ?? [],
    signals: (analysisJson?.signals as SVIAnalysis["signals"]) ?? ({} as SVIAnalysis["signals"]),
    summary: String(analysisJson?.summary ?? ""),
    stage: Number(account.current_stage ?? analysisJson?.stage ?? 0),
    stageLabel: String(
      analysisJson?.stageLabel ??
        ["Concept", "Validated Idea", "MVP / Prototype", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"][
          Number(account.current_stage ?? 0)
        ] ??
        "Concept",
    ),
    stageBonus: Number(analysisJson?.stageBonus ?? 0),
  };

  // ── 6. Spend credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, featureKey, {
    tier,
    svi: sviAnalysis.totalSVI,
    stage: sviAnalysis.stage,
    evidenceCount: evidenceItems.length,
    startupName: account.startup_name,
  });
  if (!spend.ok) {
    return NextResponse.json(
      { ok: false, error: "Credit spend failed — possible race condition" },
      { status: 402 },
    );
  }

  // ── 7. Orchestrate report ───────────────────────────────────────────────
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

  try {
    const report = await orchestrateReport({
      accountId: account.id as string,
      userId: user.id,
      projectId: projectId ?? undefined,
      startupName: String(account.startup_name ?? "Unknown Startup"),
      rawText: String(latestAnalysis.raw_input ?? ""),
      sviAnalysis,
      evidenceItems,
      criteriaData: criteriaData as Record<CriterionKey, CriterionData>,
      tier,
      locale,
      callAI: aiCaller,
    });

    // ── 8. Save assembled report ────────────────────────────────────────
    const { error: reportInsertErr } = await supabase
      .from("assembled_reports")
      .insert({
        id: report.id,
        account_id: account.id,
        user_id: user.id,
        project_id: projectId,
        analysis_id: latestAnalysis.id,
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
        credits_cost: FEATURE_COSTS[featureKey],
      });

    if (reportInsertErr) {
      console.error("[blockid:enhanced-report] assembled_reports insert failed", reportInsertErr);
    }

    // ── 9. Save individual agent tasks ──────────────────────────────────
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
      const { error: tasksErr } = await supabase
        .from("agent_report_tasks")
        .insert(agentTasks);
      if (tasksErr) {
        console.error("[blockid:enhanced-report] agent_report_tasks insert failed", tasksErr);
      }
    }

    // ── 10. Return result ───────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      reportId: report.id,
      wordCount: report.totalWords,
      sections: report.sections.map((s) => ({
        id: s.id,
        title: s.title,
        agentRole: s.agentRole,
        criterion: s.criterion,
        score: s.score,
        wordCount: s.wordCount,
      })),
      qualityScore: report.qualityScore,
      tier,
      locale,
      executiveSummary: report.executiveSummary.slice(0, 1000),
      generatedAt: report.createdAt,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:enhanced-report] orchestration failed:", err);

    // Save failed report status for status polling
    const failedId = `rpt-fail-${Date.now().toString(36)}`;
    await supabase.from("assembled_reports").insert({
      id: failedId,
      account_id: account.id,
      user_id: user.id,
      project_id: projectId,
      analysis_id: latestAnalysis.id,
      tier,
      locale,
      title: `Failed Report: ${account.startup_name ?? "Unknown"}`,
      status: "failed",
      error_message: err instanceof Error ? err.message : "Unknown error",
      credits_cost: FEATURE_COSTS[featureKey],
    }).then(null, () => {});

    return NextResponse.json(
      {
        ok: false,
        error: "Report generation failed. Credits have been charged — contact support if the issue persists.",
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }
}
