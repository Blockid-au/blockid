// POST /api/svi/enhanced-report
//
// Triggers a multi-agent orchestrated report generation using the 13-criteria
// evaluation pipeline. Each criterion is analysed by its designated C-Level
// AI agent across 3 waves, then cross-validated and assembled.
//
// Body: { tier: "standard"|"premium"|"investor_memo", locale?: "en"|"vi" }
// Returns: { ok, reportId, wordCount, sections, qualityScore, balance }
//
// Founder-scoped: the project comes from the `blockid_project` cookie and the
// svi_accounts row from the caller's email. The pipeline itself lives in
// lib/report-pipeline/run-for-project.ts (T0271) so the evaluator route
// (/api/evaluations/[id]/report) can run the same report for a project id.
// Founder behaviour is unchanged: credits are spent BEFORE orchestration.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { isAIConfigured } from "@/lib/ai-client";
import type { ReportTier } from "@/lib/report-pipeline/types";
import { generateAndPersistReport, loadProjectReportContext } from "@/lib/report-pipeline/run-for-project";
import { getProjectIdFromRequest } from "@/lib/projects";

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

  const limited = enforceRateLimit("enhanced-report", user.email, request, 12, 60 * 60 * 1000);
  if (limited) return limited;

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

  // ── 3–5. Load SVI account, analysis, evidence + 13-criteria inputs ─────
  const projectId = await getProjectIdFromRequest();
  const loaded = await loadProjectReportContext({ ownerEmail: user.email, projectId });
  if (!loaded.ok) {
    if (loaded.error === "db_unavailable") {
      return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          loaded.error === "no_account"
            ? "No SVI account found — run an analysis first"
            : "No SVI analysis found — run an analysis first",
      },
      { status: 404 },
    );
  }
  const ctx = loaded.ctx;

  // ── 6. Spend credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, featureKey, {
    tier,
    svi: ctx.sviAnalysis.totalSVI,
    stage: ctx.sviAnalysis.stage,
    evidenceCount: ctx.evidenceItems.length,
    startupName: ctx.account.startup_name,
  });
  if (!spend.ok) {
    return NextResponse.json(
      { ok: false, error: "Credit spend failed — possible race condition" },
      { status: 402 },
    );
  }

  // ── 7–9. Orchestrate + persist ──────────────────────────────────────────
  try {
    const report = await generateAndPersistReport({
      ctx,
      userId: user.id,
      tier,
      locale,
      creditsCost: FEATURE_COSTS[featureKey],
    });

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
