import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildVcValuationReport, type VcValuationInput } from "@/lib/agents/cfo-valuation";
import { findSVIAccountWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { loadConnectedRevenueSignals } from "@/lib/connected-revenue";
import { applyConnectedRevenueBridge } from "@/lib/valuation-mrr-bridge";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/valuation/vc
 * Returns the full VC-grade valuation report for the authenticated user.
 * Pulls SVI data + metrics from Supabase and runs buildVcValuationReport().
 * No credits charged — this is a free read endpoint that enriches the dashboard.
 *
 * Responds `{ ok: true, empty: true, reason: "no_svi_analysis" }` when the
 * account has never been scored (release QA-2 F4) — the client shows an
 * empty state with a CTA to /analyze rather than a made-up number.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
    }

    // S18-A — member-aware read (viewer+): the OWNER's record on a shared
    // project; the analysis + connected-revenue reads use the same key.
    const { scope, denied } = await projectScopeOrDeny("viewer");
    if (denied) return denied;
    const projectId = scope?.projectId ?? null;
    const dataEmail = scope?.dataEmail ?? user.email;
    const account = await findSVIAccountWithFallback(
      dataEmail,
      projectId,
      "id, current_svi, current_stage",
      { callerEmail: user.email },
    );

    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found. Complete an SVI analysis first." },
        { status: 404 },
      );
    }

    const numericStage = (account.current_stage as number) ?? 0;

    // Map numeric SVI stage to VC stage string
    let stage: string;
    if (numericStage <= 1) stage = "pre-seed";
    else if (numericStage <= 2) stage = "seed";
    else if (numericStage <= 4) stage = "seed";
    else stage = "series-a";

    // Fetch latest metrics
    const { data: metrics } = await supabase
      .from("startup_metrics")
      .select(
        "mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months, cac_aud, ltv_aud, mau",
      )
      .eq("account_id", account.id)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch latest snapshot for dimension scores + sector hint
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("dimension_scores, input_text")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch latest SVI analysis for this specific project (startup-specific signals)
    const analysisQuery = supabase
      .from("svi_analyses")
      .select("analysis_json, total_svi, raw_input")
      .eq("email", dataEmail);
    if (projectId) {
      analysisQuery.eq("project_id", projectId);
    } else {
      analysisQuery.is("project_id", null);
    }
    const { data: latestAnalysis } = await analysisQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const analysisJson = latestAnalysis?.analysis_json as SVIAnalysis | null | undefined;

    // Infer sector from SVI analysis text (best-effort)
    function inferSector(text?: string): string | undefined {
      if (!text) return undefined;
      const t = text.toLowerCase();
      if (t.includes("saas") || t.includes("software as a service")) return "saas";
      if (t.includes("fintech") || t.includes("financial")) return "fintech";
      if (t.includes("marketplace")) return "marketplace";
      if (t.includes("health") || t.includes("medtech")) return "healthtech";
      if (t.includes("ai ") || t.includes("artificial intelligence")) return "ai";
      if (t.includes("ecommerce") || t.includes("e-commerce")) return "ecommerce";
      return undefined;
    }

    // Prefer analysis raw_input for sector inference (most startup-specific signal)
    const analysisRawInput = (latestAnalysis?.raw_input as string | null | undefined) ?? undefined;
    const sector =
      inferSector(analysisRawInput) ??
      inferSector(snapshot?.input_text as string | undefined);

    // Override stage from SVI analysis signals when available (more accurate per startup)
    if (analysisJson?.stage != null) {
      const s = analysisJson.stage;
      if (s <= 1) stage = "pre-seed";
      else if (s <= 4) stage = "seed";
      else stage = "series-a";
    }

    // Release QA-2 F4 — never fabricate a valuation. A fresh account has an
    // svi_accounts row (created at signup) but no score; the old `?? 100`
    // default produced "A$535K · SVI 100 · 60% confidence" for a founder who
    // had never run an analysis, while the certificate panel next to it
    // correctly said "Complete an SVI analysis first" (409). Same rule as
    // the certificate: no analysis row, no snapshot, no stored score → the
    // dashboard renders an honest empty state instead of a number.
    const accountSvi = account.current_svi as number | null;
    const analysisSvi = (latestAnalysis?.total_svi as number | null | undefined) ?? null;
    const hasScore =
      !!latestAnalysis ||
      !!snapshot ||
      (typeof accountSvi === "number" && Number.isFinite(accountSvi) && accountSvi > 0);
    if (!hasScore) {
      return NextResponse.json({
        ok: true,
        empty: true,
        reason: "no_svi_analysis",
        message: "Run your first score to see a valuation.",
      });
    }

    const sviScore = accountSvi ?? analysisSvi ?? null;

    // Estimate TAM from market size signal in analysis (per-startup differentiation)
    function tamFromMarketSize(marketSize?: string): number | undefined {
      if (!marketSize) return undefined;
      if (marketSize === "large") return 5_000_000_000;
      if (marketSize === "medium") return 500_000_000;
      if (marketSize === "small") return 50_000_000;
      return undefined;
    }

    const tamAudFromSignals = tamFromMarketSize(analysisJson?.signals?.marketSize);

    // Build VcValuationInput — prefer real metrics, fall back to analysis signals
    const mrrAud = (metrics?.mrr_aud as number | null) ?? undefined;
    const input: VcValuationInput = {
      sector,
      stage,
      mrrAud,
      monthlyGrowthRatePct: (metrics?.revenue_growth_pct as number | null) ?? undefined,
      monthlyOpexAud: (metrics?.burn_rate_aud as number | null) ?? undefined,
      monthlyChurnPct: (metrics?.monthly_churn_pct as number | null) ?? undefined,
      cacAud: (metrics?.cac_aud as number | null) ?? undefined,
      customers: (metrics?.mau as number | null) ?? undefined,
      tamAud: tamAudFromSignals,
    };

    const report = buildVcValuationReport(input);

    // S17-B — connected-revenue cross-check on the blended range. The
    // per-method rows stay untouched so the Methods tab still explains the
    // SVI-side derivation; `sviRange` keeps the pre-bridge blended numbers.
    const signals = await loadConnectedRevenueSignals(supabase, {
      userId: scope?.ownerUserId ?? user.id,
      projectId,
      accountId: account.id as string,
    });
    const bridged = applyConnectedRevenueBridge(report.blended, signals, { sector });
    const sviRange = {
      lowAud: report.blended.lowAud,
      midAud: report.blended.midAud,
      highAud: report.blended.highAud,
    };
    report.blended = {
      ...report.blended,
      lowAud: bridged.lowAud,
      midAud: bridged.midAud,
      highAud: bridged.highAud,
    };

    return NextResponse.json({
      ok: true,
      empty: false,
      report,
      svi: sviScore,
      stage,
      numericStage,
      valuationMethod: bridged.valuationMethod,
      methodNote: bridged.methodNote,
      connectedRevenue: bridged.connectedRevenue,
      sviRange,
      dataSource: {
        hasMetrics: !!metrics,
        hasAnalysis: !!latestAnalysis,
        hasSector: !!sector,
        mrrAud: mrrAud ?? null,
        connectedMrrAud: bridged.connectedRevenue?.mrrAud ?? null,
      },
    });
  } catch (err) {
    console.error("[blockid:valuation/vc] GET error", err);
    return NextResponse.json(
      { ok: false, error: "VC valuation computation failed" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/valuation/vc
 * Scenario modelling: compute VC-grade valuation with custom inputs (no auth required
 * for the basic scenario; auth required to save results).
 */
async function POST_handler(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const {
      sector, stage, mrrAud, monthlyGrowthRatePct, monthlyOpexAud,
      grossMarginPct, cashOnHandAud, arpuAud, monthlyChurnPct,
      cacAud, customers, tamAud, raiseAud,
    } = body as Record<string, unknown>;

    const input: VcValuationInput = {
      sector: typeof sector === "string" ? sector : undefined,
      stage: typeof stage === "string" ? stage : "pre-seed",
      mrrAud: typeof mrrAud === "number" ? mrrAud : undefined,
      monthlyGrowthRatePct: typeof monthlyGrowthRatePct === "number" ? monthlyGrowthRatePct : undefined,
      monthlyOpexAud: typeof monthlyOpexAud === "number" ? monthlyOpexAud : undefined,
      grossMarginPct: typeof grossMarginPct === "number" ? grossMarginPct : undefined,
      cashOnHandAud: typeof cashOnHandAud === "number" ? cashOnHandAud : undefined,
      arpuAud: typeof arpuAud === "number" ? arpuAud : undefined,
      monthlyChurnPct: typeof monthlyChurnPct === "number" ? monthlyChurnPct : undefined,
      cacAud: typeof cacAud === "number" ? cacAud : undefined,
      customers: typeof customers === "number" ? customers : undefined,
      tamAud: typeof tamAud === "number" ? tamAud : undefined,
      raiseAud: typeof raiseAud === "number" ? raiseAud : undefined,
    };

    const report = buildVcValuationReport(input);

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    console.error("[blockid:valuation/vc] POST error", err);
    return NextResponse.json(
      { ok: false, error: "VC valuation scenario failed" },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/valuation/vc/route.ts", method: "POST" }, POST_handler);
