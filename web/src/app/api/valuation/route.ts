import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeValuation, type ValuationInput } from "@/lib/valuation";

export const dynamic = "force-dynamic";

// Map numeric SVI stage (0-7) to valuation stage string
function mapStage(numericStage: number): string {
  if (numericStage <= 1) return "idea";
  if (numericStage <= 2) return "validation";
  if (numericStage <= 4) return "mvp";
  return "growth"; // 5-7
}

// ---------------------------------------------------------------------------
// GET /api/valuation — Compute dollar valuation for the logged-in user
// Uses latest SVI analysis (dimension scores) + latest metrics (revenue data)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    // 1. Find the user's SVI account
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id, current_svi, current_stage")
      .eq("email", user.email)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found. Complete an SVI analysis first." },
        { status: 404 },
      );
    }

    const sviScore = (account.current_svi as number) ?? 100;
    const numericStage = (account.current_stage as number) ?? 0;
    const stage = mapStage(numericStage);

    // 2. Fetch latest snapshot for dimension scores
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("dimension_scores")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Parse dimension scores from the snapshot JSON
    let dimensions: ValuationInput["dimensions"] = undefined;
    if (snapshot?.dimension_scores && typeof snapshot.dimension_scores === "object") {
      const ds = snapshot.dimension_scores as Record<string, number>;
      dimensions = {
        ftv: ds.ftv,
        mpc: ds.mpc,
        ptd: ds.ptd,
        tre: ds.tre,
        cgh: ds.cgh,
        iri: ds.iri,
        lco: ds.lco,
        svm: ds.svm,
      };
    }

    // 3. Fetch latest metrics for revenue data
    const { data: latestMetrics } = await supabase
      .from("startup_metrics")
      .select(
        "mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months",
      )
      .eq("account_id", account.id)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Build valuation input
    const input: ValuationInput = {
      sviScore,
      stage,
      dimensions,
      mrrAud: (latestMetrics?.mrr_aud as number) ?? undefined,
      arrAud: (latestMetrics?.arr_aud as number) ?? undefined,
      revenueGrowthPct:
        (latestMetrics?.revenue_growth_pct as number) ?? undefined,
      monthlyChurnPct:
        (latestMetrics?.monthly_churn_pct as number) ?? undefined,
      burnRateAud: (latestMetrics?.burn_rate_aud as number) ?? undefined,
      runwayMonths: (latestMetrics?.runway_months as number) ?? undefined,
    };

    // 5. Run valuation engine
    const valuation = computeValuation(input);

    return NextResponse.json({
      ok: true,
      valuation,
      sviScore,
      stage,
      numericStage,
    });
  } catch (err) {
    console.error("[blockid:valuation] GET error", err);
    return NextResponse.json(
      { ok: false, error: "Valuation computation failed" },
      { status: 500 },
    );
  }
}
