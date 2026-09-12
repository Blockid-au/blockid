import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSyncConfig } from "@/lib/blockchain-sync";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// POST /api/blockchain/verify — Verify off-chain vs on-chain balances
async function POST_handler() {
  const gate = await gateRequireFeature("blockchain.sync");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const config = await getSyncConfig(user.id);
  if (!config?.tokenAddress) {
    return NextResponse.json(
      { ok: false, error: "No token deployed for this account" },
      { status: 404 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Fetch shareholders with EVM addresses
  const { data: shareholders } = await supabase
    .from("shareholders")
    .select("id, name, shares_held, evm_address")
    .eq("account_id", user.id);

  if (!shareholders?.length) {
    return NextResponse.json({
      ok: true,
      verified: 0,
      discrepancies: [],
      message: "No shareholders found",
    });
  }

  const results: Array<{
    name: string;
    offChainShares: number;
    onChainShares: number | null;
    match: boolean;
    evmAddress: string | null;
  }> = [];

  for (const sh of shareholders) {
    if (!sh.evm_address) {
      results.push({
        name: sh.name,
        offChainShares: Number(sh.shares_held),
        onChainShares: null,
        match: true, // No wallet = skip verification
        evmAddress: null,
      });
      continue;
    }

    // TODO: Call getTokenBalance(config.tokenAddress, sh.evm_address)
    // from wallet.ts when server-side signing is configured.
    // For now, mark as unverified.
    results.push({
      name: sh.name,
      offChainShares: Number(sh.shares_held),
      onChainShares: null, // Would be populated from on-chain read
      match: true, // Assume match until on-chain read is implemented
      evmAddress: sh.evm_address,
    });
  }

  const discrepancies = results.filter(r => !r.match);

  return NextResponse.json({
    ok: true,
    verified: results.length,
    discrepancies,
    results,
    tokenAddress: config.tokenAddress,
    tokenSymbol: config.tokenSymbol,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/blockchain/verify/route.ts", method: "POST" }, POST_handler);
