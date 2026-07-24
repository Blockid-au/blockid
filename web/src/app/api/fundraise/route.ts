import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  calculateRound,
  type FundraiseRound,
  type CapTableData,
} from "@/lib/fundraise";
import { assertESICEligibleOrWarn } from "@/lib/compliance/esic-funding-gate";
import { assertDiv83AEligibleOrWarn } from "@/lib/compliance/div83a-funding-gate";

// Extra body flag — the /api/fundraise endpoint historically took only
// FundraiseRound fields. The ESIC gate (P6) needs to know whether the
// caller is configuring a wholesale-only round so we treat this optional
// boolean as an additive body slot. Unknown values fall back to false.
interface FundraisePostBody extends Partial<FundraiseRound> {
  wholesaleOnly?: boolean;
}

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

  let body: FundraisePostBody = {};
  try {
    body = (await request.json()) as FundraisePostBody;
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

  // ---- ESIC funding gate (P6, atlassian-standard-mapping goal) ----
  //
  // Warn-only for standard rounds, blocking (412) for wholesale-only
  // rounds where the founder is likely to market the ESIC tax offset.
  // The gate reads the latest `compliance_esic_assessments` row and
  // fires `esic_gate.*` analytics events so CS can see who starts a
  // fundraise without a fresh ESIC self-assessment. See
  // web/src/lib/compliance/esic-funding-gate.ts for the ITAA97 Div 360
  // + AusIndustry ESIC + s911A/s1041H references.
  const wholesaleOnly = body.wholesaleOnly === true;
  let esicWarn: unknown = undefined;
  let div83aWarn: unknown = undefined;
  try {
    const project = await getActiveProject(user.id);
    const gate = await assertESICEligibleOrWarn(supabase, {
      userId: user.id,
      projectId: project?.id ?? null,
      requireEligible: wholesaleOnly,
      action: "fundraise_round_create",
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "esic_gate_blocked",
          reason: gate.reason,
          message: gate.message,
          url_to_fix: gate.url_to_fix,
          disclaimer: gate.disclaimer,
        },
        { status: 412 },
      );
    }
    esicWarn = gate.warn;

    // Div 83A ESOP gate (P6a). Protects the *employee*-facing ESS
    // start-up concession story: a wholesale-only round that pitches
    // "your options qualify for the Div 83A concession" must not go
    // out while an active grant has div83a_status='ineligible' /
    // 'unsure' / null. Warn-only for standard rounds.
    const div83a = await assertDiv83AEligibleOrWarn(supabase, {
      userId: user.id,
      projectId: project?.id ?? null,
      requireEligible: wholesaleOnly,
      action: "fundraise_round_create",
    });
    if (!div83a.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "div83a_gate_blocked",
          reason: div83a.reason,
          message: div83a.message,
          url_to_fix: div83a.url_to_fix,
          disclaimer: div83a.disclaimer,
        },
        { status: 412 },
      );
    }
    div83aWarn = div83a.warn;
  } catch (err) {
    // Never let the gate break a legitimate flow — log and proceed.
    console.warn("[fundraise] compliance gate errored", err);
  }

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
    ...(esicWarn ? { esic_warn: esicWarn } : {}),
    ...(div83aWarn ? { div83a_warn: div83aWarn } : {}),
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
