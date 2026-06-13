import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeCLevelValuation,
  type CLevelValuationInput,
} from "@/lib/clevel-valuation";
import { getProjectIdFromRequest, findSVIAccountWithFallback } from "@/lib/projects";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/valuation/clevel
// Applies 5-method C-Level blended valuation to any startup profile.
//
// Body (optional — if omitted, uses calling user's latest SVI data):
//   { email?: string, sviScore?: number, stage?: number, dimensions?: {...},
//     mrrAud?: number, monthlyGrowthRate?: number, churnRate?: number,
//     arpu?: number, burnRateAud?: number, runwayMonths?: number,
//     tamAud?: number, samAud?: number, sector?: string, teamSize?: number }
//
// Returns: { ok, valuation: CLevelValuationResult }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const body: Partial<CLevelValuationInput> = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 503 });
    const projectId = await getProjectIdFromRequest();

    // Load SVI account for the calling user (or specified email if admin)
    const targetEmail = body.email ?? user.email ?? "";
    const account = await findSVIAccountWithFallback(targetEmail, projectId);

    // Pull latest SVI analysis for dimension scores
    let dimensions = body.dimensions;
    let sviScore = body.sviScore;
    let stage = body.stage;

    if (!dimensions || sviScore == null || stage == null) {
      const { data: latestAnalysis } = await supabase
        .from("svi_analyses")
        .select("svi_score, stage, dimensions")
        .eq("account_id", account?.id ?? user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestAnalysis) {
        sviScore  = sviScore  ?? latestAnalysis.svi_score;
        stage     = stage     ?? latestAnalysis.stage;
        dimensions = dimensions ?? latestAnalysis.dimensions;
      }
    }

    // Pull latest startup metrics for revenue context
    let mrrAud = body.mrrAud;
    let burnRateAud = body.burnRateAud;
    let runwayMonths = body.runwayMonths;
    let customers = body.customers;

    if (mrrAud == null || burnRateAud == null) {
      const { data: metrics } = await supabase
        .from("startup_metrics")
        .select("mrr, burn_rate, runway_months, total_customers")
        .eq("account_id", account?.id ?? user.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .single();

      if (metrics) {
        mrrAud       = mrrAud       ?? metrics.mrr ?? 0;
        burnRateAud  = burnRateAud  ?? metrics.burn_rate ?? 1057;
        runwayMonths = runwayMonths ?? metrics.runway_months ?? 24;
        customers    = customers    ?? metrics.total_customers ?? 0;
      }
    }

    const input: CLevelValuationInput = {
      name:              String(account?.startup_name ?? targetEmail),
      email:             targetEmail,
      sviScore:          sviScore  ?? 100,
      stage:             stage     ?? 2,
      dimensions:        dimensions ?? undefined,
      mrrAud:            mrrAud        ?? 0,
      monthlyGrowthRate: body.monthlyGrowthRate ?? 0.15,
      churnRate:         body.churnRate         ?? 0.05,
      arpu:              body.arpu              ?? 75,
      burnRateAud:       burnRateAud   ?? 1057,
      runwayMonths:      runwayMonths  ?? 24,
      tamAud:            body.tamAud   ?? 4_000_000_000,
      samAud:            body.samAud   ?? 400_000_000,
      sector:            body.sector   ?? String(account?.sector ?? "SaaS"),
      teamSize:          body.teamSize ?? 1,
      customers:         customers     ?? 0,
    };

    const valuation = computeCLevelValuation(input);

    // Persist snapshot to svi_snapshots for tracking
    if (account?.id) {
      await supabase.from("svi_snapshots").insert({
        account_id: account.id,
        svi_score: input.sviScore,
        stage: input.stage,
        valuation_low: valuation.blended.lowAud,
        valuation_mid: valuation.blended.midAud,
        valuation_high: valuation.blended.highAud,
        metadata: { source: "clevel_valuation", methods: valuation.methods.map(m => m.method) },
      }).throwOnError();
    }

    return NextResponse.json({ ok: true, valuation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[blockid:valuation:clevel]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/valuation/clevel
// Quick valuation for the calling user using latest SVI + metrics data
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  return POST(req);
}
