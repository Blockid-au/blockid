import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("esop_pools")
    .select("*")
    .eq("account_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[esop/pool] fetch error", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch ESOP pool" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pool: data ?? null });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const total_shares = Number(body.total_shares);
  if (!total_shares || total_shares <= 0) {
    return NextResponse.json({ ok: false, error: "total_shares must be > 0" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("esop_pools")
    .upsert(
      {
        account_id: user.id,
        total_shares,
        allocated_shares: 0,
        vesting_cliff_months: Number(body.vesting_cliff_months) || 12,
        vesting_total_months: Number(body.vesting_total_months) || 48,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "account_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("[esop/pool] upsert error", error);
    return NextResponse.json({ ok: false, error: "Failed to create ESOP pool" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pool: data });
}
