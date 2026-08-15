// SVI + valuation wiring for analyzer_runs.
//
// Pulls the most recent analyzer_runs row for a startup and translates it into
// two adjustments consumed by SVI / valuation call sites:
//
//   • ptdBoost              — additive integer points fed into PTD raw score
//                              (weight 0.3 of PTD dim per the analyzer spec).
//   • valuationAdjusterPct  — pass-through percentage the valuation blender
//                              applies to midAud (± range).

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export interface AnalyzerAdjustments {
  ptdBoost: number;
  valuationAdjusterPct: number;
  subScore: number;
}

export async function pullLatestAnalyzerAdjustments(
  startupId: string,
): Promise<AnalyzerAdjustments | null> {
  if (!startupId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("analyzer_runs")
    .select("sub_score, valuation_adjuster_pct")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const subScore = Number((data as { sub_score: number }).sub_score) || 0;
  const valuationAdjusterPct = Number(
    (data as { valuation_adjuster_pct: number }).valuation_adjuster_pct,
  ) || 0;

  // Weight 0.3 of PTD dim: (sub_score - 50) * 0.3, clamped ±30.
  const raw = Math.round((subScore - 50) * 0.3);
  const ptdBoost = Math.max(-30, Math.min(30, raw));

  return { ptdBoost, valuationAdjusterPct, subScore };
}
