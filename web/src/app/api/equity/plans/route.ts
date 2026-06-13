// /api/equity/plans — CRUD for equity_plans (T0094 schema).
//
//   GET  /api/equity/plans         → list current user's plans
//   POST /api/equity/plans         → create a plan
//   PUT  /api/equity/plans?id=...  → update a plan (owner only)
//   DELETE /api/equity/plans?id=...→ delete a plan (owner only)
//
// Service-role client is used; we enforce user_id ownership in WHERE clauses.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TABLE = "equity_plans";

interface PlanInput {
  startup_name: string;
  total_shares?: number;
  pre_money_valuation?: number | null;
  incorporation_date?: string | null;
  jurisdiction?: string;
  share_classes?: unknown;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, plans: [] });

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plans: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  let body: PlanInput;
  try { body = (await request.json()) as PlanInput; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  if (!body.startup_name?.trim()) {
    return NextResponse.json({ ok: false, error: "startup_name required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: user.id,
      startup_name: body.startup_name.trim(),
      total_shares: body.total_shares ?? 10_000_000,
      pre_money_valuation: body.pre_money_valuation ?? null,
      incorporation_date: body.incorporation_date ?? null,
      jurisdiction: body.jurisdiction ?? "AU",
      share_classes: body.share_classes ?? [
        { name: "Ordinary", votes_per_share: 1, liquidation_preference: 1 },
      ],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  let body: Partial<PlanInput>;
  try { body = (await request.json()) as Partial<PlanInput>; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.startup_name !== undefined) patch.startup_name = body.startup_name;
  if (body.total_shares !== undefined) patch.total_shares = body.total_shares;
  if (body.pre_money_valuation !== undefined) patch.pre_money_valuation = body.pre_money_valuation;
  if (body.incorporation_date !== undefined) patch.incorporation_date = body.incorporation_date;
  if (body.jurisdiction !== undefined) patch.jurisdiction = body.jurisdiction;
  if (body.share_classes !== undefined) patch.share_classes = body.share_classes;

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Plan not found" }, { status: 404 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
