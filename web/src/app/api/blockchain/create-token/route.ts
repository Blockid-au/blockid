import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { upsertSyncConfig } from "@/lib/blockchain-sync";
import { aiSuggestTicker } from "@/lib/ai-equity";

export const dynamic = "force-dynamic";

// POST /api/blockchain/create-token — Create equity token for a startup
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const tokenSymbol = String(body.tokenSymbol ?? "").toUpperCase().trim();
  const tokenName = String(body.tokenName ?? "").trim();
  const totalSupply = Number(body.totalSupply) || 10_000_000;

  // Validate ticker format
  if (!/^[A-Z]{3,4}$/.test(tokenSymbol)) {
    return NextResponse.json(
      { ok: false, error: "Token symbol must be 3-4 uppercase letters" },
      { status: 400 },
    );
  }

  // Check reserved tickers
  const reserved = ["BID", "ETH", "BTC", "USDT", "USDC", "BNB", "SOL", "ADA", "DOT", "AVAX"];
  if (reserved.includes(tokenSymbol)) {
    return NextResponse.json(
      { ok: false, error: `"${tokenSymbol}" is a reserved ticker` },
      { status: 400 },
    );
  }

  if (!tokenName) {
    return NextResponse.json({ ok: false, error: "Token name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Check ticker uniqueness
  const { data: existing } = await supabase
    .from("blockchain_sync_config")
    .select("token_symbol")
    .eq("token_symbol", tokenSymbol)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: `Ticker "${tokenSymbol}" is already taken` },
      { status: 409 },
    );
  }

  // Store token config (actual deployment happens client-side via MetaMask)
  // The token_address will be set after MetaMask deploys via TokenFactory
  const result = await upsertSyncConfig(user.id, {
    syncEnabled: false, // Starts OFF — user enables after deployment
    syncState: "off",
    tokenSymbol,
    tokenName,
    tokenAddress: String(body.tokenAddress ?? ""), // Set by client after deploy
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Failed to save token config" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token: { symbol: tokenSymbol, name: tokenName, totalSupply },
    message: "Token config saved. Deploy via MetaMask to activate blockchain sync.",
  });
}

// GET /api/blockchain/create-token?suggest=CompanyName — AI ticker suggestions
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startupName = searchParams.get("suggest");

  if (!startupName) {
    return NextResponse.json({ ok: false, error: "?suggest=CompanyName required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const existingTickers: string[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("blockchain_sync_config")
      .select("token_symbol")
      .not("token_symbol", "is", null);

    if (data) {
      existingTickers.push(...data.map(r => r.token_symbol).filter(Boolean));
    }
  }

  const result = await aiSuggestTicker({ startupName, existingTickers });

  return NextResponse.json({ ok: true, suggestions: result.suggestions });
}
