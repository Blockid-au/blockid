import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  calculateRound,
  type FundraiseRound,
  type CapTableData,
} from "@/lib/fundraise";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/fundraise — Configure a new fundraise round
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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

  let body: Partial<FundraiseRound> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Validate required fields
  const { roundName, targetAmount, preMoneyValuation, instrumentType } = body;

  if (!roundName || typeof roundName !== "string") {
    return NextResponse.json(
      { ok: false, error: "roundName is required" },
      { status: 400 },
    );
  }
  if (!targetAmount || targetAmount <= 0) {
    return NextResponse.json(
      { ok: false, error: "targetAmount must be a positive number" },
      { status: 400 },
    );
  }
  if (!preMoneyValuation || preMoneyValuation <= 0) {
    return NextResponse.json(
      { ok: false, error: "preMoneyValuation must be a positive number" },
      { status: 400 },
    );
  }
  if (
    !instrumentType ||
    !["priced", "safe", "convertible_note"].includes(instrumentType)
  ) {
    return NextResponse.json(
      { ok: false, error: "instrumentType must be priced, safe, or convertible_note" },
      { status: 400 },
    );
  }

  const accountId = user.id;

  // Fetch current cap table
  const [holdersRes, esopRes] = await Promise.all([
    supabase
      .from("shareholders")
      .select("id, name, email, role, shares_held")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("esop_pool")
      .select("total_pool_shares, allocated_shares")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  if (holdersRes.error) {
    console.error("[fundraise] fetch shareholders error", holdersRes.error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch cap table" },
      { status: 500 },
    );
  }

  const shareholders = holdersRes.data ?? [];
  if (shareholders.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No shareholders found. Set up a cap table first." },
      { status: 400 },
    );
  }

  const capTable: CapTableData = {
    shareholders: shareholders as CapTableData["shareholders"],
    esopPool: esopRes.data as CapTableData["esopPool"],
  };

  const round: FundraiseRound = {
    roundName,
    targetAmount,
    preMoneyValuation,
    instrumentType: instrumentType as FundraiseRound["instrumentType"],
    safeDiscount: body.safeDiscount,
    safeCap: body.safeCap,
  };

  let result;
  try {
    result = calculateRound(round, capTable);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Calculation failed",
      },
      { status: 400 },
    );
  }

  // Store the round
  const { data: savedRound, error: insertErr } = await supabase
    .from("fundraise_rounds")
    .insert({
      account_id: accountId,
      round_name: roundName,
      target_amount: targetAmount,
      pre_money_valuation: preMoneyValuation,
      instrument_type: instrumentType,
      safe_discount: body.safeDiscount ?? null,
      safe_cap: body.safeCap ?? null,
      share_price: result.sharePrice,
      new_shares: result.newShares,
      dilution_pct: result.dilutionPct,
      dilution_table: result.dilutionTable,
      new_cap_table: result.newCapTable,
      status: "draft",
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[fundraise] insert error", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to save fundraise round" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    round: savedRound,
    dilutionTable: result.dilutionTable,
    newCapTable: result.newCapTable,
  });
}

// ---------------------------------------------------------------------------
// GET /api/fundraise — List all fundraise rounds for user
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

  const { data: rounds, error } = await supabase
    .from("fundraise_rounds")
    .select("*")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fundraise] fetch error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch fundraise rounds" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, rounds: rounds ?? [] });
}
