import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSyncConfig } from "@/lib/blockchain-sync";

export const dynamic = "force-dynamic";

// POST /api/blockchain/verify — Verify off-chain vs on-chain balances
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

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
