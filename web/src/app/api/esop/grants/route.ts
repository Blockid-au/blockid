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

  // Get pool for user, then grants
  const { data: pool } = await supabase
    .from("esop_pools")
    .select("id")
    .eq("account_id", user.id)
    .maybeSingle();

  if (!pool) {
    return NextResponse.json({ ok: true, grants: [] });
  }

  const { data, error } = await supabase
    .from("esop_grants")
    .select("*")
    .eq("esop_pool_id", pool.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[esop/grants] fetch error", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch grants" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, grants: data ?? [] });
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
  const { grantee_name, grantee_email, grantee_role, total_shares, strike_price_cents, grant_date, cliff_months, total_months } = body;

  if (!grantee_name?.trim()) {
    return NextResponse.json({ ok: false, error: "grantee_name is required" }, { status: 400 });
  }
  if (!total_shares || Number(total_shares) <= 0) {
    return NextResponse.json({ ok: false, error: "total_shares must be > 0" }, { status: 400 });
  }

  // Get pool
  const { data: pool, error: poolErr } = await supabase
    .from("esop_pools")
    .select("id, total_shares, allocated_shares")
    .eq("account_id", user.id)
    .maybeSingle();

  if (poolErr || !pool) {
    return NextResponse.json({ ok: false, error: "ESOP pool not found. Create a pool first." }, { status: 400 });
  }

  const unallocated = pool.total_shares - pool.allocated_shares;
  if (Number(total_shares) > unallocated) {
    return NextResponse.json(
      { ok: false, error: `Only ${unallocated} shares available in the pool` },
      { status: 400 },
    );
  }

  // Insert grant
  const { data: grant, error: grantErr } = await supabase
    .from("esop_grants")
    .insert({
      esop_pool_id: pool.id,
      grantee_name: grantee_name.trim(),
      grantee_email: grantee_email?.trim() || null,
      grantee_role: grantee_role || null,
      total_shares: Number(total_shares),
      strike_price_cents: Number(strike_price_cents) || 10,
      grant_date: grant_date || new Date().toISOString().split("T")[0],
      cliff_months: Number(cliff_months) || 12,
      total_months: Number(total_months) || 48,
      vested_shares: 0,
      exercised_shares: 0,
      forfeited_shares: 0,
      status: "active",
      created_by: user.id,
    })
    .select()
    .single();

  if (grantErr) {
    console.error("[esop/grants] insert error", grantErr);
    return NextResponse.json({ ok: false, error: "Failed to create grant" }, { status: 500 });
  }

  // Update allocated shares
  await supabase
    .from("esop_pools")
    .update({
      allocated_shares: pool.allocated_shares + Number(total_shares),
      updated_by: user.id,
    })
    .eq("id", pool.id);

  return NextResponse.json({ ok: true, grant }, { status: 201 });
}
