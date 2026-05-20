import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ── Server-side chain helpers (uses fetch against the EVM RPC) ───────

const RPC_URL = "https://chain.blockid.au/evm";
const SVT_ADDRESS = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const BALANCE_OF_SELECTOR = "0x70a08231";
const DECIMALS_SELECTOR = "0x313ce567";

function padAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function decodeBigInt(hex: string): bigint {
  const clean = hex.replace("0x", "");
  if (!clean || clean === "" || clean === "0".repeat(clean.length)) return 0n;
  return BigInt("0x" + clean);
}

async function rpcCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: 1,
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result as string;
}

async function getOnChainBalance(userAddr: string): Promise<bigint> {
  const data = BALANCE_OF_SELECTOR + padAddress(userAddr);
  const result = await rpcCall(SVT_ADDRESS, data);
  return decodeBigInt(result);
}

async function getDecimals(): Promise<number> {
  const result = await rpcCall(SVT_ADDRESS, DECIMALS_SELECTOR);
  return Number(decodeBigInt(result));
}

// ---------------------------------------------------------------------------
// GET /api/cap-table/sync — check sync status between DB and blockchain
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  const { data: shareholders, error: fetchErr } = await supabase
    .from("shareholders")
    .select("id, name, email, shares_held, evm_address, account_id")
    .eq("account_id", user.id);

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch shareholders" },
      { status: 500 },
    );
  }

  let decimals: number;
  try {
    decimals = await getDecimals();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cannot reach blockchain RPC" },
      { status: 502 },
    );
  }

  const divisor = 10n ** BigInt(decimals);
  const mismatches: Array<{
    name: string;
    dbShares: number;
    chainShares: string;
    diff: string;
  }> = [];

  for (const sh of shareholders ?? []) {
    if (!sh.evm_address) continue;

    try {
      const chainBalance = await getOnChainBalance(sh.evm_address);
      const chainShares = chainBalance / divisor;
      const dbShares = BigInt(sh.shares_held ?? 0);

      if (chainShares !== dbShares) {
        mismatches.push({
          name: sh.name,
          dbShares: Number(dbShares),
          chainShares: chainShares.toString(),
          diff: (dbShares - chainShares).toString(),
        });
      }
    } catch {
      mismatches.push({
        name: sh.name,
        dbShares: sh.shares_held ?? 0,
        chainShares: "error",
        diff: "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    inSync: mismatches.length === 0,
    mismatches,
  });
}

// ---------------------------------------------------------------------------
// POST /api/cap-table/sync — sync cap table to blockchain (mint to fix gaps)
// ---------------------------------------------------------------------------

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  const { data: shareholders, error: fetchErr } = await supabase
    .from("shareholders")
    .select("id, name, email, shares_held, evm_address, account_id")
    .eq("account_id", user.id);

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch shareholders" },
      { status: 500 },
    );
  }

  let decimals: number;
  try {
    decimals = await getDecimals();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cannot reach blockchain RPC" },
      { status: 502 },
    );
  }

  const divisor = 10n ** BigInt(decimals);
  const results: {
    synced: number;
    minted: Array<{ name: string; amount: string }>;
    mismatches: Array<{ name: string; dbShares: number; chainShares: string }>;
    skipped: number;
  } = { synced: 0, minted: [], mismatches: [], skipped: 0 };

  for (const sh of shareholders ?? []) {
    if (!sh.evm_address) {
      results.skipped++;
      continue;
    }

    try {
      const chainBalance = await getOnChainBalance(sh.evm_address);
      const chainShares = chainBalance / divisor;
      const dbShares = BigInt(sh.shares_held ?? 0);

      if (chainShares === dbShares) {
        results.synced++;
      } else if (dbShares > chainShares) {
        // DB has more shares than chain — need to mint the difference.
        // Minting must happen client-side via MetaMask (admin wallet).
        // We record what needs to be minted; the client calls mintTokens.
        const diff = dbShares - chainShares;
        results.minted.push({
          name: sh.name,
          amount: diff.toString(),
        });
      } else {
        // Chain has more shares than DB — log warning.
        results.mismatches.push({
          name: sh.name,
          dbShares: Number(dbShares),
          chainShares: chainShares.toString(),
        });
      }
    } catch {
      results.mismatches.push({
        name: sh.name,
        dbShares: sh.shares_held ?? 0,
        chainShares: "error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ...results,
  });
}
