/**
 * Exit Strategy — Single scenario
 *
 * GET    /api/exit-strategy/scenarios/[scenarioId]  — fetch with computed outputs
 * DELETE /api/exit-strategy/scenarios/[scenarioId]  — soft-delete (sets deleted_at)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  suggestAcquirers,
  computeExitReadiness,
} from "@/lib/exit-strategy.helpers";
import type { FetchExitScenarioResponse } from "@/types/exit-strategy";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { scenarioId: string };
}

// ─── GET — fetch single scenario ──────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { scenarioId } = params;
  if (!scenarioId) {
    return NextResponse.json({ ok: false, error: "scenarioId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Resolve account to enforce ownership
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, sector, current_arr_aud, team_size")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!account?.id) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }

  const { data: scenario, error } = await supabase
    .from("exit_scenarios")
    .select("*")
    .eq("id", scenarioId)
    .eq("account_id", account.id) // ownership check
    .single();

  if (error || !scenario) {
    return NextResponse.json({ ok: false, error: "Scenario not found" }, { status: 404 });
  }

  // Compute acquirer landscape
  const sector = account.sector ?? "saas";
  const acquirerProfiles = suggestAcquirers(sector, scenario.target_exit_valuation_aud);

  // Compute readiness
  const currentRevenue = account.current_arr_aud ?? 0;
  const teamSize = account.team_size ?? 5;
  const targetRevenueAtExit = scenario.target_exit_valuation_aud / 8;

  const readiness = computeExitReadiness(
    null,
    currentRevenue,
    scenario.target_exit_valuation_aud,
    targetRevenueAtExit,
    teamSize,
    [],
  );

  const response: FetchExitScenarioResponse = {
    ok: true,
    scenario,
    acquirers: acquirerProfiles.map((a) => ({
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

  return NextResponse.json(response);
}

// ─── DELETE — remove scenario ─────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { scenarioId } = params;
  if (!scenarioId) {
    return NextResponse.json({ ok: false, error: "scenarioId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Resolve account for ownership check
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!account?.id) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }

  // Verify ownership before delete
  const { data: existing } = await supabase
    .from("exit_scenarios")
    .select("id, is_primary")
    .eq("id", scenarioId)
    .eq("account_id", account.id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Scenario not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("exit_scenarios")
    .delete()
    .eq("id", scenarioId)
    .eq("account_id", account.id);

  if (error) {
    console.error("[DELETE /api/exit-strategy/scenarios/[scenarioId]] Delete error:", error);
    return NextResponse.json({ ok: false, error: "Failed to delete scenario" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: scenarioId });
}
