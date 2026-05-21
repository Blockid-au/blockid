import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { spendCredits } from "@/lib/credits";
import { generateDataRoom } from "@/lib/data-room";
import { computeValuation, type ValuationInput } from "@/lib/valuation";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStage(numericStage: number): string {
  if (numericStage <= 1) return "idea";
  if (numericStage <= 2) return "validation";
  if (numericStage <= 4) return "mvp";
  return "growth";
}

// ---------------------------------------------------------------------------
// POST /api/data-room/generate — One-click Data Room Generator
//
// Compiles a structured data room from user's existing data across
// SVI accounts, analyses, metrics, cap table, and evidence vault.
// Costs 3.00 credits.
// ---------------------------------------------------------------------------

export async function POST() {
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
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // ── Charge credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, "data_room_generate", {
    email: user.email,
  });
  if (!spend.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: spend.balance,
        cost: 3.0,
      },
      { status: 402 },
    );
  }

  // ── Section 1: Company — Pull from app_users + svi_accounts ───────────
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("id, current_svi, current_stage, startup_name")
    .eq("email", user.email)
    .maybeSingle();

  // ── Section 2: Product — Pull latest SVI analysis ─────────────────────
  let latestAnalysis: { totalSvi: number; analysisJson: unknown } | null = null;
  if (sviAccount) {
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analysis) {
      latestAnalysis = {
        totalSvi: analysis.total_svi as number,
        analysisJson: analysis.analysis_json,
      };
    }
  }

  // ── Section 3: Financial — Pull from startup_metrics ──────────────────
  let metrics: Array<{ metricType: string; value: number }> | null = null;
  if (sviAccount) {
    const { data: metricsRow } = await supabase
      .from("startup_metrics")
      .select(
        "mrr_aud, arr_aud, revenue_growth_pct, monthly_churn_pct, burn_rate_aud, runway_months",
      )
      .eq("account_id", sviAccount.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metricsRow) {
      metrics = [];
      if (metricsRow.mrr_aud != null)
        metrics.push({ metricType: "mrr", value: Number(metricsRow.mrr_aud) });
      if (metricsRow.arr_aud != null)
        metrics.push({ metricType: "arr", value: Number(metricsRow.arr_aud) });
      if (metricsRow.burn_rate_aud != null)
        metrics.push({
          metricType: "burn_rate",
          value: Number(metricsRow.burn_rate_aud),
        });
      if (metricsRow.runway_months != null)
        metrics.push({
          metricType: "runway",
          value: Number(metricsRow.runway_months),
        });
      if (metricsRow.revenue_growth_pct != null)
        metrics.push({
          metricType: "revenue_growth",
          value: Number(metricsRow.revenue_growth_pct),
        });
    }
  }

  // ── Valuation ─────────────────────────────────────────────────────────
  let valuation: { low: number; mid: number; high: number } | null = null;
  if (sviAccount) {
    // Fetch dimension scores for valuation input
    let dimensions: Record<string, number> | undefined;
    const { data: snapshot } = await supabase
      .from("svi_snapshots")
      .select("dimension_scores")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot?.dimension_scores) {
      dimensions = snapshot.dimension_scores as Record<string, number>;
    }

    const input: ValuationInput = {
      sviScore: (sviAccount.current_svi as number) ?? 100,
      stage: mapStage((sviAccount.current_stage as number) ?? 0),
      mrrAud: metrics?.find((m) => m.metricType === "mrr")?.value,
      arrAud: metrics?.find((m) => m.metricType === "arr")?.value,
      revenueGrowthPct: metrics?.find((m) => m.metricType === "revenue_growth")
        ?.value,
      burnRateAud: metrics?.find((m) => m.metricType === "burn_rate")?.value,
      runwayMonths: metrics?.find((m) => m.metricType === "runway")?.value,
      dimensions: dimensions
        ? {
            ftv: dimensions.ftv,
            mpc: dimensions.mpc,
            ptd: dimensions.ptd,
            tre: dimensions.tre,
            cgh: dimensions.cgh,
            iri: dimensions.iri,
            lco: dimensions.lco,
            svm: dimensions.svm,
          }
        : undefined,
    };

    try {
      const result = computeValuation(input);
      valuation = {
        low: result.lowAud,
        mid: result.midAud,
        high: result.highAud,
      };
    } catch {
      // Valuation computation failed — continue without it
    }
  }

  // ── Section 5: Team — Pull from cap table shareholders ────────────────
  let capTable: {
    shareholders: Array<{ name: string; role: string; shares_held: number }>;
  } | null = null;

  const { data: holders } = await supabase
    .from("shareholders")
    .select("name, role, shares_held")
    .eq("account_id", user.id)
    .order("created_at", { ascending: true });

  if (holders && holders.length > 0) {
    capTable = {
      shareholders: holders.map((h) => ({
        name: h.name as string,
        role: h.role as string,
        shares_held: Number(h.shares_held),
      })),
    };
  }

  // ── Section 6: Legal — Pull from evidence vault ───────────────────────
  let evidence: Array<{
    evidenceType: string;
    label: string;
    valueOrUrl: string;
    dimension?: string;
  }> | null = null;

  if (sviAccount) {
    const { data: evidenceRows } = await supabase
      .from("svi_evidence")
      .select("evidence_type, label, value_or_url, dimension")
      .eq("account_id", sviAccount.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (evidenceRows && evidenceRows.length > 0) {
      evidence = evidenceRows.map((e) => ({
        evidenceType: e.evidence_type as string,
        label: e.label as string,
        valueOrUrl: (e.value_or_url as string) ?? "",
        dimension: (e.dimension as string) ?? undefined,
      }));
    }
  }

  // ── Generate the data room ────────────────────────────────────────────
  const dataRoom = generateDataRoom({
    user: {
      email: user.email,
      displayName: user.displayName,
    },
    sviAccount: sviAccount
      ? {
          startupName: sviAccount.startup_name as string | null,
          currentStage: (sviAccount.current_stage as number) ?? 0,
          currentSvi: (sviAccount.current_svi as number) ?? 0,
        }
      : null,
    latestAnalysis,
    metrics,
    capTable,
    evidence,
    valuation,
  });

  return NextResponse.json({
    ok: true,
    dataRoom,
    creditsUsed: 3.0,
    balance: spend.balance,
  });
}
