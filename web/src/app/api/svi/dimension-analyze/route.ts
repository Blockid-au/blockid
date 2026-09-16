// POST /api/svi/dimension-analyze — per-dimension deep dive as a thin
// re-run of the ONE report generator (S-R3, spec §C.1 / §C.12: "POST
// {dims:['cgh']} re-runs only W4 for that dim; W1–W3 results reused from
// the snapshot").
//
// Body: { dimension: 'ftv'|'mpc'|'ptd'|'tre'|'cgh'|'iri'|'lco'|'svm' }
// Returns: { ok, dimension, dimensionLabel, analysis (legacy JSON the panel
//            renders: report / score / strengths / gaps / recommendations /
//            benchmarkComparison / nextMilestone), chapter (DimensionChapter),
//            balance, creditsUsed, creditNote }
//
// Credits: `dim_<dim>_analysis`, checked before and spent AFTER a usable
// chapter is produced (transparent-pricing rule). The result is stored as an
// evidence_analyses row exactly as before, so /admin/analyses/deep-dives
// keeps reading the same shape.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai-client";
import { aiCapacityResponse, isAICapacityError } from "@/lib/ai/capacity";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { chapterToMarkdown, runReportPipeline } from "@/lib/report-pipeline/run-report-pipeline";
import type { DimensionChapter } from "@/lib/report-v2/schema";

export const dynamic = "force-dynamic";

/** The legacy deep-dive JSON the results panel renders, derived from the chapter. */
function chapterToLegacyAnalysis(chapter: DimensionChapter): Record<string, unknown> {
  const b = chapter.benchmark;
  return {
    report: chapterToMarkdown(chapter),
    score: chapter.score,
    strengths: chapter.strengths,
    gaps: chapter.gaps,
    recommendations: [
      { action: chapter.nextAction.title, impact: chapter.nextAction.expectedLift >= 5 ? "high" : chapter.nextAction.expectedLift >= 2 ? "medium" : "low", effort: chapter.nextAction.window === "this_week" ? "low" : chapter.nextAction.window === "30d" ? "medium" : "high", timeline: chapter.nextAction.window.replace(/_/g, " ") },
      ...chapter.criteria.filter((c) => c.nextAction).slice(0, 3).map((c) => ({ action: c.nextAction, impact: "medium", effort: "medium", timeline: "30d" })),
    ],
    benchmarkComparison: `${chapter.dim.toUpperCase()} ${chapter.score}/100 vs stage ${b.stage} cohort p25 ${b.p25} · p50 ${b.p50} · p75 ${b.p75}${typeof b.percentile === "number" ? ` (percentile ${b.percentile})` : ""}.`,
    nextMilestone: chapter.nextAction.title,
    phaseLens: chapter.phaseLens,
    degraded: chapter.degraded ?? false,
  };
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  let body: { dimension?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const dim = body.dimension?.toLowerCase();
  if (!dim || !(DIM_ORDER as readonly string[]).includes(dim)) {
    return NextResponse.json({ ok: false, error: `Invalid dimension. Use: ${DIM_ORDER.join(", ")}` }, { status: 400 });
  }
  const dimKey = dim as DimKey;
  const label = DIMENSION_OWNERS[dimKey].promptCopy.analyzeLabel;

  const featureKey = `dim_${dim}_analysis`;
  const affordCheck = await canAfford(user.id, featureKey);
  if (!affordCheck.allowed) {
    return NextResponse.json({ ok: false, error: "Insufficient credits", balance: affordCheck.balance, cost: affordCheck.cost }, { status: 402 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  // S18-A — member-aware: editor+ (viewer → 403 before any AI spend). Data
  // under the OWNER's email; the caller's wallet pays.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;

  try {
    let chapter: DimensionChapter | null = null;
    const result = await runReportPipeline({
      userId: user.id,
      ownerEmail: dataEmail,
      ownerUserId: scope?.ownerUserId ?? user.id,
      projectId,
      tier: "standard",
      dims: [dimKey],
      persist: false,
      onEvent: (e) => {
        if (e.type === "dimension_complete" && e.dim === dimKey && e.chapter) chapter = e.chapter;
      },
    });
    if (!result.ok) {
      const status = result.error === "no_account" || result.error === "no_analysis" ? 404 : result.error === "db_unavailable" ? 503 : 500;
      return NextResponse.json({ ok: false, error: result.message, retryable: status >= 500 }, { status });
    }
    const produced: DimensionChapter | null = chapter ?? result.chapters.find((c) => c.dim === dimKey) ?? null;
    if (!produced) {
      return NextResponse.json({ ok: false, error: "Dimension analysis failed. Please try again — no credits were charged.", retryable: true }, { status: 500 });
    }
    if (produced.degraded) {
      // A deterministic card is not a paid deep dive — never charge for it.
      return NextResponse.json({ ok: false, error: "Our AI service is busy. Please try again in 1-2 minutes — no credits charged.", retryable: true, degradeReason: produced.degradeReason }, { status: 429 });
    }

    const analysisData = chapterToLegacyAnalysis(produced);

    // Spend credits (after success)
    const spend = await spendCredits(user.id, featureKey, { dimension: dim, reportId: result.reportId });

    // Store as evidence analysis (same shape as before — admin deep-dives page)
    const { data: dimEvidence } = result.accountId
      ? await supabase.from("svi_evidence").select("id").eq("account_id", result.accountId).eq("dimension", dim).limit(1)
      : { data: null };
    const first = (dimEvidence?.[0] ?? null) as { id?: string } | null;
    await supabase
      .from("evidence_analyses")
      .insert({
        evidence_id: first?.id ?? null,
        account_id: result.accountId,
        tier: "standard",
        dimension: dim,
        feature_key: featureKey,
        analysis_json: { ...analysisData, chapter: produced, pipeline_report_id: result.reportId },
        signals_extracted: {},
        svi_delta_applied: 0,
        credits_charged: FEATURE_COSTS[featureKey],
      })
      .then(({ error }) => {
        if (error) console.warn("[blockid:dim-analyze] store failed", error.message);
      });

    return NextResponse.json({
      ok: true,
      dimension: dim,
      dimensionLabel: label,
      analysis: analysisData,
      chapter: produced,
      reportId: result.reportId,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
      creditNote: creditChargeNote(scope),
    });
  } catch (err) {
    if (isAICapacityError(err)) return aiCapacityResponse(err); // S31-A: 503 + Retry-After, never a 500
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("timeout") || msg.includes("Timeout") || msg.includes("deadline");
    const isRateLimit = msg.includes("429") || msg.includes("rate");
    console.error("[blockid:dimension-analyze]", msg);
    return NextResponse.json({
      ok: false,
      error: isTimeout
        ? "AI analysis is taking longer than usual. Please try again in a moment — no credits were charged."
        : isRateLimit
          ? "Our AI service is busy. Please try again in 1-2 minutes — no credits charged."
          : "Dimension analysis failed. Please try again.",
      retryable: true,
    }, { status: isRateLimit ? 429 : 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi/dimension-analyze/route.ts", method: "POST" }, POST_handler);
