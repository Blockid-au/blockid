import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildVcValuationReport, type VcValuationInput } from "@/lib/agents/cfo-valuation";
import { findSVIAccountWithFallback, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * GET /api/valuation/vc
 * Returns the full VC-grade valuation report for the authenticated user.
 * Pulls SVI data + metrics from Supabase and runs buildVcValuationReport().
 * No credits charged — this is a free read endpoint that enriches the dashboard.
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

    const projectId = await getProjectIdFromRequest();
    const account = await findSVIAccountWithFallback(
      user.email,
      projectId,
      "id, current_svi, current_stage",
    );

    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found. Complete an SVI analysis first." },
        { status: 404 },
      );
    }

    const svi = (account.current_svi as number) ?? 100;
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

    const sector = inferSector(snapshot?.input_text as string | undefined);

    // Build VcValuationInput from available data
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
    };

    const report = buildVcValuationReport(input);

    return NextResponse.json({
      ok: true,
      report,
      svi,
      stage,
      numericStage,
      dataSource: {
        hasMetrics: !!metrics,
        hasSector: !!sector,
        mrrAud: mrrAud ?? null,
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
export async function POST(request: Request) {
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
