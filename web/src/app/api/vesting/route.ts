import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/vesting — List all vesting schedules for authenticated user
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
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

  // Vesting schedules are linked via cap_table_id = account_id
  const { data, error } = await supabase
    .from("vesting_schedules")
    .select("*")
    .eq("cap_table_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[vesting] fetch error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch vesting schedules" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, schedules: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/vesting — Create new vesting schedule
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const shareholderName = String(body.shareholderName ?? "").trim();
  const totalShares = Number(body.totalShares);

  if (!shareholderName) {
    return NextResponse.json(
      { ok: false, error: "Shareholder name is required" },
      { status: 400 },
    );
  }
  if (!totalShares || totalShares <= 0) {
    return NextResponse.json(
      { ok: false, error: "Total shares must be greater than 0" },
      { status: 400 },
    );
  }

  const validTypes = ["linear", "back_weighted", "front_weighted", "milestone"];
  const vestingType = validTypes.includes(String(body.vestingType))
    ? String(body.vestingType)
    : "linear";

  const cliffMonths = Math.max(0, Math.min(48, Number(body.cliffMonths) || 12));
  const totalMonths = Math.max(1, Math.min(120, Number(body.totalMonths) || 48));
  const grantDate = body.grantDate
    ? String(body.grantDate)
    : new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("vesting_schedules")
    .insert({
      cap_table_id: user.id,
      shareholder_name: shareholderName,
      shareholder_email: body.shareholderEmail
        ? String(body.shareholderEmail).trim()
        : null,
      grant_date: grantDate,
      total_shares: totalShares,
      vested_shares: 0,
      vesting_type: vestingType,
      cliff_months: cliffMonths,
      total_months: totalMonths,
      single_trigger: Boolean(body.singleTrigger),
      double_trigger: Boolean(body.doubleTrigger),
      notes: body.notes ? String(body.notes).trim() : null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("[vesting] insert error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create vesting schedule" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, schedule: data }, { status: 201 });
}
