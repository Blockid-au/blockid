import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiSuggestTicker } from "@/lib/ai-equity";
import { deployCompanyToken } from "@/lib/evm-deploy";
import { getProjectIdFromRequest, findSVIAccountWithFallback } from "@/lib/projects";
import { BLOCKID_CHAIN } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const RESERVED = ["BID", "ETH", "BTC", "USDT", "USDC", "BNB", "SOL", "ADA", "DOT", "AVAX"];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// POST /api/blockchain/create-token
// Deploys a NEW per-startup equity token (its own SVToken contract) via
// TokenFactory.createCompany, signed server-side by the factory owner key.
// The founder's wallet (adminAddress) receives 100% of the initial shares
// and ADMIN_ROLE. Returns the deployed token address.
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
  const totalSupply = Math.floor(Number(body.totalSupply) || 10_000_000);
  const adminAddress = String(body.adminAddress ?? "").trim();

  // ── Validate ──────────────────────────────────────────────────────────
  if (!/^[A-Z]{3,4}$/.test(tokenSymbol)) {
    return NextResponse.json(
      { ok: false, error: "Token symbol must be 3-4 uppercase letters" },
      { status: 400 },
    );
  }
  if (RESERVED.includes(tokenSymbol)) {
    return NextResponse.json({ ok: false, error: `"${tokenSymbol}" is a reserved ticker` }, { status: 400 });
  }
  if (!tokenName) {
    return NextResponse.json({ ok: false, error: "Token name is required" }, { status: 400 });
  }
  if (!ADDRESS_RE.test(adminAddress)) {
    return NextResponse.json(
      { ok: false, error: "Connect your wallet first — a valid founder address is required to receive the shares." },
      { status: 400 },
    );
  }
  if (totalSupply <= 0 || totalSupply > 1_000_000_000) {
    return NextResponse.json({ ok: false, error: "Total supply must be between 1 and 1,000,000,000" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // ── Resolve the current startup (per-project SVI account) ───────────────
  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "No startup profile found — run an SVI analysis first." },
      { status: 404 },
    );
  }

  // Already tokenized?
  const { data: current } = await supabase
    .from("blockchain_sync_config")
    .select("token_symbol, token_address")
    .eq("account_id", account.id)
    .maybeSingle();
  if (current?.token_address && ADDRESS_RE.test(current.token_address)) {
    return NextResponse.json(
      { ok: false, error: `This startup already has a token (${current.token_symbol}).`, tokenAddress: current.token_address },
      { status: 409 },
    );
  }

  // Ticker uniqueness across all startups (DB-level)
  const { data: taken } = await supabase
    .from("blockchain_sync_config")
    .select("token_symbol")
    .eq("token_symbol", tokenSymbol)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ ok: false, error: `Ticker "${tokenSymbol}" is already taken` }, { status: 409 });
  }

  // ── Deploy on-chain (server signs with factory owner key) ───────────────
  let tokenAddress: string;
  let txHash: string;
  try {
    const result = await deployCompanyToken({
      tokenName,
      tokenSymbol,
      totalSupply,
      companyName: String(account.startup_name ?? tokenName),
      companyId: String(account.id),
      jurisdiction: "AU",
      adminAddress,
    });
    tokenAddress = result.tokenAddress;
    txHash = result.txHash;
  } catch (err) {
    console.error("[blockid:create-token] deploy failed", err);
    const msg = err instanceof Error ? err.message : "Deploy failed";
    // Surface "already exists" as a conflict, everything else as 502.
    const status = /exists|taken/i.test(msg) ? 409 : 502;
    return NextResponse.json({ ok: false, error: `On-chain deploy failed: ${msg}` }, { status });
  }

  // ── Persist token config for this startup ───────────────────────────────
  const { error: saveErr } = await supabase.from("blockchain_sync_config").upsert(
    {
      account_id: account.id,
      project_id: projectId,
      token_symbol: tokenSymbol,
      token_name: tokenName,
      token_address: tokenAddress,
      sync_enabled: true,
      sync_state: "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" },
  );
  if (saveErr) {
    // Token IS deployed — don't fail the request, just warn.
    console.error("[blockid:create-token] deployed but failed to save config", saveErr);
  }

  const explorerUrl = `${BLOCKID_CHAIN.blockExplorerUrls[0]}/address/${tokenAddress}`;
  return NextResponse.json({
    ok: true,
    token: {
      symbol: tokenSymbol,
      name: tokenName,
      address: tokenAddress,
      totalSupply,
      owner: adminAddress,
      txHash,
      explorerUrl,
    },
    message: `Deployed ${tokenSymbol} — ${totalSupply.toLocaleString()} shares minted to your wallet.`,
  });
}

// GET /api/blockchain/create-token — NASDAQ-style ticker suggestions for the
// current startup. Resolves the startup name server-side (falls back to the
// optional ?suggest= override). Also returns whether a token already exists.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const override = searchParams.get("suggest");

  // Resolve the active startup for this project.
  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);
  const startupName = String(override || account?.startup_name || "").trim();

  if (!startupName) {
    return NextResponse.json(
      { ok: false, error: "No startup profile found — run an SVI analysis first." },
      { status: 404 },
    );
  }

  const supabase = getSupabaseAdmin();
  const existingTickers: string[] = [];
  let existingToken: { symbol: string; address: string } | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("blockchain_sync_config")
      .select("token_symbol")
      .not("token_symbol", "is", null);
    if (data) existingTickers.push(...data.map((r) => r.token_symbol).filter(Boolean));

    // Has this startup already minted a token?
    if (account) {
      const { data: cfg } = await supabase
        .from("blockchain_sync_config")
        .select("token_symbol, token_address")
        .eq("account_id", account.id)
        .maybeSingle();
      if (cfg?.token_address && ADDRESS_RE.test(cfg.token_address)) {
        existingToken = { symbol: cfg.token_symbol, address: cfg.token_address };
      }
    }
  }

  const result = await aiSuggestTicker({ startupName, existingTickers });

  return NextResponse.json({
    ok: true,
    startupName,
    suggestions: result.suggestions,
    existingToken,
    defaultTokenName: `${startupName} Shares`,
  });
}
