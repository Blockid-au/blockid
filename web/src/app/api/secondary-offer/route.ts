// /api/secondary-offer (T_SVI_EXC_0012) — founder declares intent to list a
// secondary parcel. Gated: SVI ≥ 80 AND governance-score ≥ 60 on the
// latest analysis. Status starts as 'draft'; admin promotes to 'live'.
//
// Path A: sophisticated-investor-only per T_0011 regulatory research.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface OfferBody {
  ticker?: string;
  slug?: string;
  shares_for_sale?: number;
  price_band_low_aud?: number;
  price_band_high_aud?: number;
  lock_up_months?: number;
  buyer_profile?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500 });

  let body: OfferBody = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const ticker = (body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "Invalid ticker" }, { status: 400 });
  }

  const { data: latest } = await supabase
    .from("svi_analyses")
    .select("total_svi, analysis_json, slug")
    .eq("email", me.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestTyped = latest as { total_svi: number | null; analysis_json: Record<string, unknown> | null; slug: string } | null;
  const svi = latestTyped?.total_svi ?? 0;
  const gov = (latestTyped?.analysis_json?.governance_score as number | undefined) ?? 0;

  if (svi < 80) {
    return NextResponse.json({ ok: false, error: `SVI must be ≥ 80 to list a secondary offer (yours: ${svi}).` }, { status: 403 });
  }
  if (gov < 60) {
    return NextResponse.json({ ok: false, error: `Governance score must be ≥ 60 (yours: ${gov}).` }, { status: 403 });
  }

  const sharesNum = typeof body.shares_for_sale === "number" ? Math.max(1, Math.floor(body.shares_for_sale)) : null;
  const lowAud = typeof body.price_band_low_aud === "number" ? Math.max(0, body.price_band_low_aud) : null;
  const highAud = typeof body.price_band_high_aud === "number" ? Math.max(0, body.price_band_high_aud) : null;
  const totalRaise = sharesNum && highAud ? sharesNum * highAud : null;

  const { data: existing } = await supabase
    .from("secondary_offers")
    .select("id, status")
    .eq("account_id", me.id)
    .eq("ticker", ticker)
    .in("status", ["draft", "live"])
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("secondary_offers").update({
      slug: body.slug ?? latestTyped?.slug,
      shares_for_sale: sharesNum,
      price_band_low_aud: lowAud,
      price_band_high_aud: highAud,
      total_raise_aud: totalRaise,
      lock_up_months: typeof body.lock_up_months === "number" ? Math.max(0, body.lock_up_months) : 12,
      buyer_profile: body.buyer_profile?.toString().slice(0, 2000) ?? null,
      notes: body.notes?.toString().slice(0, 2000) ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "updated", id: (existing as { id: string }).id });
  }

  const { data: created, error } = await supabase.from("secondary_offers").insert({
    account_id: me.id,
    ticker,
    slug: body.slug ?? latestTyped?.slug,
    shares_for_sale: sharesNum,
    price_band_low_aud: lowAud,
    price_band_high_aud: highAud,
    total_raise_aud: totalRaise,
    lock_up_months: typeof body.lock_up_months === "number" ? Math.max(0, body.lock_up_months) : 12,
    buyer_profile: body.buyer_profile?.toString().slice(0, 2000) ?? null,
    notes: body.notes?.toString().slice(0, 2000) ?? null,
    eligible_investor_type: "sophisticated",
    status: "draft",
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: "created", id: (created as { id: string }).id });
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, rows: [] });
  const { data } = await supabase
    .from("secondary_offers")
    .select("*")
    .eq("account_id", me.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
