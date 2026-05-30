import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeValuation, type ValuationInput } from "@/lib/valuation";
import { canAfford, spendCredits } from "@/lib/credits";
import { getProjectIdFromRequest, findSVIAccountWithFallback } from "@/lib/projects";

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

    // 1. Find the user's SVI account — with fallback for legacy records
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

// ---------------------------------------------------------------------------
// POST /api/valuation — Scenario modeling with custom inputs
// Costs 0.50 credits for detailed multi-method valuation
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Parse request body
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const {
      sviScore,
      stage,
      mrrAud,
      arrAud,
      revenueGrowthPct,
      monthlyChurnPct,
      burnRateAud,
      runwayMonths,
      sector,
      teamSize,
      dimensions,
    } = body;

    // Validate required fields
    if (typeof sviScore !== "number" || sviScore < 0) {
      return NextResponse.json(
        { ok: false, error: "sviScore is required and must be a positive number" },
        { status: 400 },
      );
    }
    if (typeof stage !== "string" || !["idea", "validation", "mvp", "growth"].includes(stage)) {
      return NextResponse.json(
        { ok: false, error: 'stage must be one of: idea, validation, mvp, growth' },
        { status: 400 },
      );
    }

    // Check credits
    const affordCheck = await canAfford(user.id, "valuation_detailed");
    if (!affordCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient credits",
          balance: affordCheck.balance,
          cost: affordCheck.cost,
        },
        { status: 402 },
      );
    }

    // Build valuation input from request body
    const input: ValuationInput = {
      sviScore,
      stage,
      mrrAud: typeof mrrAud === "number" ? mrrAud : undefined,
      arrAud: typeof arrAud === "number" ? arrAud : undefined,
      revenueGrowthPct: typeof revenueGrowthPct === "number" ? revenueGrowthPct : undefined,
      monthlyChurnPct: typeof monthlyChurnPct === "number" ? monthlyChurnPct : undefined,
      burnRateAud: typeof burnRateAud === "number" ? burnRateAud : undefined,
      runwayMonths: typeof runwayMonths === "number" ? runwayMonths : undefined,
      sector: typeof sector === "string" ? sector : undefined,
      teamSize: typeof teamSize === "number" ? teamSize : undefined,
      dimensions:
        dimensions && typeof dimensions === "object"
          ? {
              ftv: typeof dimensions.ftv === "number" ? dimensions.ftv : undefined,
              mpc: typeof dimensions.mpc === "number" ? dimensions.mpc : undefined,
              ptd: typeof dimensions.ptd === "number" ? dimensions.ptd : undefined,
              tre: typeof dimensions.tre === "number" ? dimensions.tre : undefined,
              cgh: typeof dimensions.cgh === "number" ? dimensions.cgh : undefined,
              iri: typeof dimensions.iri === "number" ? dimensions.iri : undefined,
              lco: typeof dimensions.lco === "number" ? dimensions.lco : undefined,
              svm: typeof dimensions.svm === "number" ? dimensions.svm : undefined,
            }
          : undefined,
    };

    // Spend credits
    const spend = await spendCredits(user.id, "valuation_detailed", {
      sviScore,
      stage,
      scenario: true,
    });
    if (!spend.ok) {
      return NextResponse.json(
        { ok: false, error: "Credit deduction failed" },
        { status: 402 },
      );
    }

    // Run valuation engine
    const valuation = computeValuation(input);

    return NextResponse.json({
      ok: true,
      valuation,
      input: { sviScore, stage },
      creditsRemaining: spend.balance,
    });
  } catch (err) {
    console.error("[blockid:valuation] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Valuation computation failed" },
      { status: 500 },
    );
  }
}
