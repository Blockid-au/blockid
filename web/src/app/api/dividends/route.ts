import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { calculateDividends } from "@/lib/dividends";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/dividends — dividend history
// ---------------------------------------------------------------------------

export async function GET() {
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

  const { data: dividends, error } = await supabase
    .from("dividend_records")
    .select("*")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[dividends] fetch error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch dividend history" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, dividends: dividends ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/dividends — calculate (and optionally record) dividend distribution
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
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

  let body: {
    distributionPct?: number;
    netIncome?: number;
    record?: boolean;
    period?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const distributionPct = body.distributionPct ?? 50;

  if (distributionPct < 0 || distributionPct > 100) {
    return NextResponse.json(
      { ok: false, error: "distributionPct must be between 0 and 100" },
      { status: 400 },
    );
  }

  // ── Fetch net income: from body or compute from revenue API ───────────
  let netIncome = body.netIncome ?? 0;

  if (!body.netIncome) {
    // Auto-calculate: fetch revenue data inline
    // Use a simple estimate from startup_metrics if available
    const { data: latestMetric } = await supabase
      .from("startup_metrics")
      .select("mrr_aud, arr_aud, burn_rate_aud")
      .eq("email", user.email)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMetric) {
      const annualRevenue = latestMetric.arr_aud ?? (latestMetric.mrr_aud ?? 0) * 12;
      const annualExpense = (latestMetric.burn_rate_aud ?? 0) * 12;
      netIncome = annualRevenue - annualExpense;
    }
  }

  // ── Fetch cap table shareholders ──────────────────────────────────────
  const [holdersRes, esopRes] = await Promise.all([
    supabase
      .from("shareholders")
      .select("name, shares_held, role")
      .eq("account_id", user.id)
      .order("shares_held", { ascending: false }),
    supabase
      .from("esop_pool")
      .select("total_pool_shares")
      .eq("account_id", user.id)
      .maybeSingle(),
  ]);

  if (holdersRes.error) {
    console.error("[dividends] shareholders fetch error", holdersRes.error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch shareholders" },
      { status: 500 },
    );
  }

  const shareholders = (holdersRes.data ?? []).map(
    (s: { name: string; shares_held: number; role: string }) => ({
      name: s.name,
      shares: Number(s.shares_held),
      role: s.role ?? "shareholder",
    }),
  );

  const totalShares =
    shareholders.reduce((sum: number, s: { shares: number }) => sum + s.shares, 0) +
    (esopRes.data ? Number(esopRes.data.total_pool_shares) : 0);

  if (shareholders.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "No shareholders found. Set up your cap table first.",
      },
      { status: 400 },
    );
  }

  // ── Calculate dividends ───────────────────────────────────────────────
  const result = calculateDividends({
    netIncome,
    distributionPct,
    totalShares,
    shareholders,
  });

  // ── Optionally record the dividend ────────────────────────────────────
  if (body.record && netIncome > 0 && distributionPct > 0) {
    const { error: insertErr } = await supabase
      .from("dividend_records")
      .insert({
        account_id: user.id,
        period: body.period ?? new Date().toISOString().slice(0, 7),
        net_income: netIncome,
        distribution_pct: distributionPct,
        total_dividend: result.totalDividend,
        per_share_dividend: result.perShareDividend,
        retained_earnings: result.retainedEarnings,
        franking_rate: result.frankingRate,
        payouts: result.payouts,
      });

    if (insertErr) {
      console.error("[dividends] record insert error", insertErr);
      // Non-fatal: still return the calculation
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
