// POST /api/startup-package/analyze
//
// Dispatch ONE C-Level agent against the concatenated interview answers for
// a single step's lead agent. Cost-controlled: only the phase's leadAgent
// runs (not the full 3-wave orchestrator). Credits are spent AFTER the
// dispatch succeeds so a provider failure refunds implicitly.
//
// Body:  { stepKey, projectId, tier? }
// Reply: { ok, reportId, sviDelta, executiveSummary, creditsRemaining,
//          upgradeSuggestion? }  OR  402 { reason:"insufficient_credits", ... }
//
// Rate-limit: 5/hour/user. Auth: getCurrentUser → 401 anon.
//
// Persistence:
//   - assembled_reports row with report_type = `package_step_<stepKey>`
//     (Ship-1 uses `title` for that label — `assembled_reports` doesn't
//     have a dedicated report_type column yet).
//   - svi_snapshots recompute after dispatch.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { spendCredits, getBalance, FEATURE_COSTS } from "@/lib/credits";
import { callAI } from "@/lib/ai-client";
import {
  computeSVI,
  extractSignals,
  type SVIAnalysis,
} from "@/lib/svi-analysis";
import { buildAgentPrompt } from "@/lib/report-pipeline/agent-prompts";
import { REPORT_TIER_CONFIG, type ReportTier } from "@/lib/report-pipeline/types";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { recomputeAndSnapshot } from "@/lib/startup-package/svi-recompute";
import {
  getInterviewStep,
  isInterviewStepKey,
  type InterviewStepKey,
} from "@/lib/startup-package/interview-steps";

export const dynamic = "force-dynamic";

interface AnalyzeBody {
  stepKey?: string;
  projectId?: string;
  tier?: "free" | "standard";
}

/** Map each interview step to the criterion the lead agent scores. */
const STEP_TO_CRITERION: Record<InterviewStepKey, CriterionKey> = {
  idea_and_problem: "idea",
  target_customers: "market",
  revenue_hypothesis: "revenue",
  one_line_pitch: "gtm_strategy",
  mentor_feedback: "team",
  founder_and_equity: "founder_profile",
  gtm_channels: "customer_size",
  first_traction: "code_git",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  // ── Rate-limit — 5/hour/user (expensive, LLM-backed) ─────────────────
  const rl = await consumeRateLimit({
    bucket: "startup-package.analyze",
    actorId: user.id,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        limit: rl.limit,
        retry_after_seconds: rl.retry_after_seconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isInterviewStepKey(body.stepKey)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_step_key" },
      { status: 400 },
    );
  }
  const step = getInterviewStep(body.stepKey);
  const criterion: CriterionKey =
    STEP_TO_CRITERION[step.key] ?? CRITERION_KEYS[0];

  // Report tier stays at "standard" regardless of the body value — the
  // "free"/"standard" caller field refers to Package PRICING (whether the
  // founder is on the free sample or paid unlock), not report depth.
  // REPORT_TIER_CONFIG only ships standard/premium/investor_memo.
  void body.tier;
  const tier: ReportTier = "standard";
  const tierConfig = REPORT_TIER_CONFIG[tier];

  // ── Resolve project ───────────────────────────────────────────────────
  let projectId = body.projectId;
  if (!projectId) {
    const active = await getActiveProject(user.id);
    projectId = active?.id;
  }
  if (!projectId) {
    return NextResponse.json(
      { ok: false, reason: "no_project" },
      { status: 400 },
    );
  }

  // ── Credit pre-flight (per-step cost from interview-steps.ts) ────────
  // Server-authoritative cost is FEATURE_COSTS["package_agent_analysis"]
  // (single source of truth for billing). Display-side step.creditCost is
  // captured in metadata for auditability.
  const creditsNeeded =
    FEATURE_COSTS.package_agent_analysis ?? step.creditCost;
  const balance = await getBalance(user.id);
  if (balance < creditsNeeded) {
    return NextResponse.json(
      {
        ok: false,
        reason: "insufficient_credits",
        credits_needed: creditsNeeded,
        credits_balance: balance,
        url: "/credits",
      },
      { status: 402 },
    );
  }

  // ── Build inputs from stored interview answers ────────────────────────
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "db_unavailable" },
      { status: 503 },
    );
  }

  const { data: answers } = await admin
    .from("startup_package_interview")
    .select("step_key, answer_text")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const rawText =
    (answers ?? [])
      .map(
        (a: { step_key: string; answer_text: string }) =>
          `## ${a.step_key}\n${a.answer_text}`,
      )
      .join("\n\n") || "";

  if (!rawText.trim()) {
    return NextResponse.json(
      { ok: false, reason: "no_answers_yet" },
      { status: 400 },
    );
  }

  const { data: project } = await admin
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  const startupName = (project?.name as string) || "Untitled startup";

  // Compute a fresh SVI from the concatenated interview text. Ship-1 does
  // NOT join svi_analyses here — the interview is the ONLY input signal
  // this early in the funnel and joining would slow the LLM call.
  const signals = extractSignals({ rawText });
  const sviAnalysis: SVIAnalysis = computeSVI(signals);

  // Minimal ReportContext for the single-agent path. buildAgentPrompt
  // consumes only the parts of the context that its role expects, and
  // buildUserPrompt for the criterion pulls text/files/links. We supply
  // an empty CriterionData for every criterion (orchestrator would do the
  // same via ensureAllCriteria).
  type CriterionSlot = {
    textInput: string;
    files: Array<{ name: string; url: string; type: string; size: number }>;
    links: Array<{ url: string; label: string }>;
    qualityLevel: string;
  };
  const emptyCriteria: Record<string, CriterionSlot> = {};
  for (const key of CRITERION_KEYS) {
    emptyCriteria[key] = {
      textInput: key === criterion ? rawText.slice(0, 4000) : "",
      files: [],
      links: [],
      qualityLevel: "incomplete",
    };
  }

  const context = {
    accountId: "",
    userId: user.id,
    projectId,
    startupName,
    rawText,
    sviAnalysis,
    evidenceItems: [],
    criteriaData: emptyCriteria as unknown as ReturnType<
      () => import("@/lib/report-pipeline/types").ReportContext
    >["criteriaData"],
    stage: sviAnalysis.stage,
    locale: "en" as const,
    gatherResults: {},
    criterionResults: new Map(),
  };
  const systemPrompt = buildAgentPrompt(
    step.leadAgent,
    context as unknown as import("@/lib/report-pipeline/types").ReportContext,
    criterion,
  );

  const userPrompt = [
    `## Startup: ${startupName}`,
    `## Founder Interview Answers`,
    rawText,
    "",
    `## Current SVI: ${sviAnalysis.totalSVI} (${sviAnalysis.stageLabel})`,
    "",
    `Focus your analysis on the "${criterion}" criterion. Provide a score`,
    `via <!-- SCORE: NN --> and a 400-600 word critique with:`,
    `- 3 highlighted strengths (bulleted, bold-lead)`,
    `- 3 critical gaps`,
    `- 3 concrete next steps`,
  ].join("\n");

  // ── Dispatch ONE agent ────────────────────────────────────────────────
  let response = "";
  try {
    const result = await callAI({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: tierConfig.maxTokensPerAgent,
    });
    response = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ai_call_failed";
    console.error("[startup-package:analyze] dispatch failed", err);
    return NextResponse.json(
      { ok: false, reason: "dispatch_failed", detail: msg },
      { status: 502 },
    );
  }

  // ── Spend credits AFTER success (implicit refund on failure above) ───
  const spend = await spendCredits(user.id, "package_agent_analysis", {
    project_id: projectId,
    step_key: step.key,
    lead_agent: step.leadAgent,
    criterion,
    display_cost: step.creditCost,
  });
  if (!spend.ok) {
    // Rare race: balance moved between pre-check and spend. Report but
    // don't roll back the LLM work — persist the report and warn.
    console.warn("[startup-package:analyze] spendCredits race", {
      userId: user.id,
      balance: spend.balance,
    });
  }

  // ── Persist to assembled_reports ──────────────────────────────────────
  const reportId = `pkg-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const words = response.split(/\s+/).filter(Boolean).length;
  const executiveSummary = extractExecSummary(response);

  const scoreMatch = response.match(/<!--\s*SCORE:\s*(\d+)\s*-->/);
  const score = scoreMatch
    ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
    : 50;

  // Look up (or create) svi_accounts row so the FK on assembled_reports
  // resolves. We piggyback the recompute helper for account materialisation
  // by inserting the report only when we can resolve account_id.
  const { data: acct } = await admin
    .from("svi_accounts")
    .select("id")
    .eq("email", user.email)
    .eq("project_id", projectId)
    .maybeSingle();

  if (acct?.id) {
    const { error: insertErr } = await admin.from("assembled_reports").insert({
      id: reportId,
      account_id: acct.id,
      user_id: user.id,
      project_id: projectId,
      tier,
      locale: "en",
      title: `Package step: ${step.key}`,
      executive_summary: executiveSummary,
      full_markdown: response,
      total_words: words,
      sections_count: 1,
      sections_json: [
        {
          id: `sec-${step.key}`,
          title: step.prompt.en,
          agentRole: step.leadAgent,
          criterion,
          content: response,
          score,
          visuals: [],
          wordCount: words,
        },
      ],
      status: "complete",
      credits_cost: creditsNeeded,
      quality_score: 60,
    });
    if (insertErr) {
      // 42P01 handled the same as other missing-table paths — non-fatal.
      const code = (insertErr as { code?: string }).code;
      if (code !== "42P01") {
        console.error(
          "[startup-package:analyze] assembled_reports insert failed",
          insertErr,
        );
      }
    }
  }

  // ── SVI real-time recompute ──────────────────────────────────────────
  const snap = await recomputeAndSnapshot(projectId);

  // ── Upgrade suggestion — surface when balance is low or step was pricey.
  const remaining = spend.balance;
  const upgradeSuggestion =
    remaining < 3
      ? "Balance is running low — top up A$5 to keep every agent flowing."
      : undefined;

  return NextResponse.json({
    ok: true,
    reportId,
    sviDelta: snap.delta,
    svi: snap.svi,
    executiveSummary,
    creditsRemaining: remaining,
    upgradeSuggestion,
  });
}

// Pull the first ~400 chars of the response, skipping the score marker.
function extractExecSummary(md: string): string {
  const stripped = md.replace(/<!--\s*SCORE:\s*\d+\s*-->/g, "").trim();
  const firstPara = stripped.split(/\n\n+/, 1)[0]?.trim() ?? stripped;
  return firstPara.length > 480 ? `${firstPara.slice(0, 480)}…` : firstPara;
}
