/**
 * Exit Strategy — Scenarios collection
 *
 * POST /api/exit-strategy/scenarios  — create scenario + compute outputs
 * GET  /api/exit-strategy/scenarios  — list scenarios for authenticated user
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  suggestAcquirers,
  computeExitReadiness,
} from "@/lib/exit-strategy.helpers";
import type { CreateExitScenarioRequest, ExitScenarioResponse, ListExitScenariosResponse } from "@/types/exit-strategy";

export const dynamic = "force-dynamic";

// ─── POST — create ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: Partial<CreateExitScenarioRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    scenario_name,
    exit_type,
    exit_timeline_years,
    target_exit_valuation_aud,
    series_a_planned,
    series_a_target_raise_aud,
    series_a_target_valuation_aud,
    series_a_year_relative,
    series_a_investor_name,
    series_b_planned,
    series_b_target_raise_aud,
    series_b_target_valuation_aud,
    series_b_year_relative,
    series_b_investor_name,
    narrative,
  } = body;

  if (
    !scenario_name ||
    !exit_type ||
    exit_timeline_years == null ||
    target_exit_valuation_aud == null
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields: scenario_name, exit_type, exit_timeline_years, target_exit_valuation_aud" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Resolve account_id from user → svi_accounts
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, sector, current_arr_aud, team_size")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const accountId = account?.id;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "No account found for user" }, { status: 404 });
  }

  // Store scenario
  const { data: scenario, error: insertError } = await supabase
    .from("exit_scenarios")
    .insert([
      {
        account_id: accountId,
        scenario_name,
        exit_type,
        exit_timeline_years,
        target_exit_valuation_aud,
        series_a_planned: series_a_planned ?? false,
        series_a_target_raise_aud: series_a_target_raise_aud ?? null,
        series_a_target_valuation_aud: series_a_target_valuation_aud ?? null,
        series_a_year_relative: series_a_year_relative ?? null,
        series_a_investor_name: series_a_investor_name ?? null,
        series_b_planned: series_b_planned ?? false,
        series_b_target_raise_aud: series_b_target_raise_aud ?? null,
        series_b_target_valuation_aud: series_b_target_valuation_aud ?? null,
        series_b_year_relative: series_b_year_relative ?? null,
        series_b_investor_name: series_b_investor_name ?? null,
        narrative: narrative ?? null,
        is_primary: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (insertError || !scenario) {
    console.error("[POST /api/exit-strategy/scenarios] Insert error:", insertError);
    return NextResponse.json({ ok: false, error: "Failed to create scenario" }, { status: 500 });
  }

  // Compute acquirer landscape (sector-matched, anonymized)
  const sector = account?.sector ?? "saas";
  const acquirerLandscape = suggestAcquirers(sector, target_exit_valuation_aud);

  // Compute exit readiness with available account data
  const currentRevenue = account?.current_arr_aud ?? 0;
  const teamSize = account?.team_size ?? 5;
  // Estimate revenue needed at exit: assume 8x ARR multiple target
  const targetRevenueAtExit = target_exit_valuation_aud / 8;

  const readiness = computeExitReadiness(
    null, // SVI analysis not available at create-time
    currentRevenue,
    target_exit_valuation_aud,
    targetRevenueAtExit,
    teamSize,
    [],
  );

  const response: ExitScenarioResponse = {
    ok: true,
    scenario,
    acquirer_landscape: acquirerLandscape.map((a) => ({
      label: a.label,
      exit_value_range_aud: { low: a.valuationRangeMin, high: a.valuationRangeMax },
      typical_multiple: {
        low: a.medianRevenueMultiple ? Math.max(1, a.medianRevenueMultiple - 2) : 3,
        high: a.medianRevenueMultiple ? a.medianRevenueMultiple + 3 : 10,
      },
      exit_count: a.countOfDeals,
      sector,
    })),
    readiness: {
      id: scenario.id,
      exit_scenario_id: scenario.id,
      product_maturity_score: readiness.checkpoints[0]?.score ?? 50,
      revenue_scale_score: readiness.checkpoints[1]?.score ?? 50,
      team_stability_score: readiness.checkpoints[2]?.score ?? 50,
      market_fit_score: readiness.checkpoints[3]?.score ?? 50,
      overall_readiness_score: readiness.overallScore,
      readiness_band: readiness.band,
      critical_gaps: readiness.criticalGaps,
      narrative: readiness.recommendations.join(" "),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  return NextResponse.json(response, { status: 201 });
}

// ─── GET — list ───────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Resolve account_id
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!account?.id) {
    const response: ListExitScenariosResponse = { ok: true, scenarios: [] };
    return NextResponse.json(response);
  }

  const { data: scenarios, error } = await supabase
    .from("exit_scenarios")
    .select("*")
    .eq("account_id", account.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[GET /api/exit-strategy/scenarios] Query error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch scenarios" }, { status: 500 });
  }

  const response: ListExitScenariosResponse = { ok: true, scenarios: scenarios ?? [] };
  return NextResponse.json(response);
}
