import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getGrantForUser(supabase: ReturnType<typeof import("@/lib/supabase").getSupabaseAdmin>, userId: string, grantId: string) {
  const { data: pool } = await supabase!
    .from("esop_pools")
    .select("id")
    .eq("account_id", userId)
    .maybeSingle();

  if (!pool) return null;

  const { data: grant } = await supabase!
    .from("esop_grants")
    .select("*")
    .eq("id", grantId)
    .eq("esop_pool_id", pool.id)
    .maybeSingle();

  return grant;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const grant = await getGrantForUser(supabase, user.id, params.id);
  if (!grant) {
    return NextResponse.json({ ok: false, error: "Grant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, grant });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const existing = await getGrantForUser(supabase, user.id, params.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Grant not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const allowedFields = ["status", "notes", "termination_date", "termination_type", "vested_shares"];
  const updates: Record<string, unknown> = { updated_by: user.id };
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  const { data, error } = await supabase
    .from("esop_grants")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    console.error("[esop/grants/id] update error", error);
    return NextResponse.json({ ok: false, error: "Failed to update grant" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, grant: data });
}
