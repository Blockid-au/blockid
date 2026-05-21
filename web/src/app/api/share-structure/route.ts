import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeSharePriceFromSVI, getDefaultShareStructure, type ShareMode } from "@/lib/share-structure";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/share-structure — Get share structure config + computed prices
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data } = await supabase
    .from("share_structure")
    .select("*")
    .eq("account_id", user.id)
    .maybeSingle();

  if (!data) {
    const defaults = getDefaultShareStructure();
    return NextResponse.json({ ok: true, config: defaults, computed: null });
  }

  const config = {
    mode: data.mode as "fixed_shares" | "dynamic_shares",
    authorizedShares: Number(data.authorized_shares),
    sharePriceAud: data.share_price_aud ? Number(data.share_price_aud) : null,
    valuationAud: data.valuation_aud ? Number(data.valuation_aud) : null,
    lastSviScore: data.last_svi_score,
    autoRecompute: data.auto_recompute,
  };

  const computed = config.lastSviScore
    ? computeSharePriceFromSVI(config.lastSviScore, config)
    : null;

  return NextResponse.json({ ok: true, config, computed });
}

// ---------------------------------------------------------------------------
// POST /api/share-structure — Create or update share structure config
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const mode: ShareMode = body.mode === "dynamic_shares" ? "dynamic_shares" : "fixed_shares";
  const authorizedShares = Number(body.authorizedShares) || 10_000_000;
  const sviScore = body.sviScore ? Number(body.sviScore) : null;

  const config: {
    mode: ShareMode;
    authorizedShares: number;
    sharePriceAud: number | null;
    valuationAud: number | null;
    lastSviScore: number | null;
    autoRecompute: boolean;
  } = {
    mode,
    authorizedShares,
    sharePriceAud: null,
    valuationAud: null,
    lastSviScore: sviScore,
    autoRecompute: true,
  };

  // Compute share price if SVI provided
  if (sviScore) {
    const result = computeSharePriceFromSVI(sviScore, config);
    config.sharePriceAud = result.pricePerShare;
    config.valuationAud = result.valuationAud;
  }

  const { data, error } = await supabase
    .from("share_structure")
    .upsert(
      {
        account_id: user.id,
        mode: config.mode,
        authorized_shares: config.authorizedShares,
        share_price_aud: config.sharePriceAud,
        valuation_aud: config.valuationAud,
        last_svi_score: config.lastSviScore,
        auto_recompute: config.autoRecompute,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("[share-structure] upsert error", error);
    return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
  }

  const computed = sviScore
    ? computeSharePriceFromSVI(sviScore, config)
    : null;

  return NextResponse.json({ ok: true, config: data, computed });
}
