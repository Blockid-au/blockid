import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Chain RPC helper — server-side calls to BlockID private EVM
// ---------------------------------------------------------------------------

const RPC_URL = "https://chain.blockid.au/evm";
const SVT_CONTRACT = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const ADMIN_ADDRESS = process.env.ADMIN_EVM_ADDRESS ?? "0x0000000000000000000000000000000000000000";

function padAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function decodeBool(hex: string): boolean {
  const clean = hex.replace("0x", "");
  return clean !== "0".repeat(clean.length);
}

async function ethCall(data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: SVT_CONTRACT, data }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC call failed");
  return json.result ?? "0x";
}

// ---------------------------------------------------------------------------
// Contract function selectors
// ---------------------------------------------------------------------------

const SELECTORS = {
  paused:            "0x5c975abb", // paused()
  whitelistEnabled:  "0x51fb012d", // whitelistEnabled()
  isWhitelisted:     "0x3af32abf", // isWhitelisted(address)
  pause:             "0x8456cb59", // pause()
  unpause:           "0x3f4ba83a", // unpause()
  addToWhitelist:    "0xe43252d7", // addToWhitelist(address)
  removeFromWhitelist: "0x8ab1d681", // removeFromWhitelist(address)
  enableWhitelist:   "0xcdfb2b4e", // enableWhitelist()
  disableWhitelist:  "0x2042e5c2", // disableWhitelist()
  forcedTransfer:    "0x9c3f1e90", // forcedTransfer(address,address,uint256,string)
} as const;

// ---------------------------------------------------------------------------
// GET /api/cap-table/restrictions
// Returns current restriction status from on-chain + DB
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    // Query on-chain state
    const [pausedHex, whitelistEnabledHex] = await Promise.all([
      ethCall(SELECTORS.paused),
      ethCall(SELECTORS.whitelistEnabled),
    ]);

    const paused = decodeBool(pausedHex);
    const whitelistEnabled = decodeBool(whitelistEnabledHex);

    // Fetch whitelisted addresses from DB (faster than iterating on-chain)
    const supabase = getSupabaseAdmin();
    let whitelistedAddresses: string[] = [];

    if (supabase) {
      const { data: rows } = await supabase
        .from("transfer_whitelist")
        .select("evm_address")
        .eq("account_id", user.id)
        .order("created_at", { ascending: true });

      whitelistedAddresses = (rows ?? []).map(
        (r: { evm_address: string }) => r.evm_address,
      );
    }

    return NextResponse.json({
      ok: true,
      paused,
      whitelistEnabled,
      whitelistedAddresses,
    });
  } catch (err) {
    // If chain is unreachable, return defaults
    console.error("[restrictions] GET error:", err);
    return NextResponse.json({
      ok: true,
      paused: false,
      whitelistEnabled: false,
      whitelistedAddresses: [],
      chainError: "Could not reach on-chain state. Showing defaults.",
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/cap-table/restrictions
// Admin actions: pause, unpause, whitelist management, forced transfer
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  // Admin-only
  if (user.email !== "admin@blockid.au" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  let body: {
    action?: string;
    address?: string;
    from?: string;
    to?: string;
    amount?: number;
    reason?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { action } = body;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // For actions that need MetaMask signing, return transaction data
  // For read/DB-only actions, execute directly
  switch (action) {
    // ----- Pause all SVT transfers -----
    case "pause_transfers": {
      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.pause,
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: "Pause all SVT transfers",
        },
      });
    }

    // ----- Unpause all SVT transfers -----
    case "unpause_transfers": {
      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.unpause,
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: "Unpause all SVT transfers",
        },
      });
    }

    // ----- Add address to whitelist -----
    case "whitelist_add": {
      const addr = body.address;
      if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return NextResponse.json(
          { ok: false, error: "Valid EVM address is required" },
          { status: 400 },
        );
      }

      // Store in DB
      if (supabase) {
        await supabase.from("transfer_whitelist").upsert(
          { account_id: user.id, evm_address: addr.toLowerCase() },
          { onConflict: "account_id,evm_address" },
        );
      }

      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.addToWhitelist + padAddress(addr),
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: `Add ${addr} to transfer whitelist`,
        },
      });
    }

    // ----- Remove address from whitelist -----
    case "whitelist_remove": {
      const addr = body.address;
      if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return NextResponse.json(
          { ok: false, error: "Valid EVM address is required" },
          { status: 400 },
        );
      }

      // Remove from DB
      if (supabase) {
        await supabase
          .from("transfer_whitelist")
          .delete()
          .eq("account_id", user.id)
          .eq("evm_address", addr.toLowerCase());
      }

      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.removeFromWhitelist + padAddress(addr),
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: `Remove ${addr} from transfer whitelist`,
        },
      });
    }

    // ----- Enable whitelist-only transfers -----
    case "enable_whitelist": {
      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.enableWhitelist,
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: "Enable whitelist-only transfers",
        },
      });
    }

    // ----- Disable whitelist (anyone can transfer) -----
    case "disable_whitelist": {
      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: SELECTORS.disableWhitelist,
          from: ADMIN_ADDRESS,
          gas: "0x30D40",
          description: "Disable whitelist restriction",
        },
      });
    }

    // ----- Forced transfer (admin moves shares between addresses) -----
    case "forced_transfer": {
      const { from, to, amount, reason } = body;
      if (!from || !to || !amount || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: "from, to, and amount (> 0) are required" },
          { status: 400 },
        );
      }

      if (!/^0x[0-9a-fA-F]{40}$/.test(from) || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
        return NextResponse.json(
          { ok: false, error: "Invalid EVM addresses" },
          { status: 400 },
        );
      }

      const amountWei = BigInt(amount) * 10n ** 18n;

      // Encode: forcedTransfer(address from, address to, uint256 amount, string reason)
      const encodedFrom = padAddress(from);
      const encodedTo = padAddress(to);
      const encodedAmount = padUint256(amountWei);
      // String offset (4 * 32 = 128 = 0x80)
      const encodedOffset = padUint256(128n);
      const reasonText = reason ?? "Admin forced transfer";
      const reasonBytes = new TextEncoder().encode(reasonText);
      const encodedLength = padUint256(BigInt(reasonBytes.length));
      let encodedContent = "";
      for (const b of reasonBytes) {
        encodedContent += b.toString(16).padStart(2, "0");
      }
      // Pad to next 32 bytes
      const contentPadded = encodedContent.padEnd(
        Math.ceil(encodedContent.length / 64) * 64,
        "0",
      );

      const calldata =
        SELECTORS.forcedTransfer +
        encodedFrom +
        encodedTo +
        encodedAmount +
        encodedOffset +
        encodedLength +
        contentPadded;

      // Log in DB
      if (supabase) {
        await supabase.from("share_transactions").insert({
          account_id: user.id,
          transaction_type: "forced_transfer",
          notes: `Forced transfer: ${amount} shares from ${from} to ${to}. Reason: ${reasonText}`,
        });
      }

      return NextResponse.json({
        ok: true,
        txData: {
          to: SVT_CONTRACT,
          data: calldata,
          from: ADMIN_ADDRESS,
          gas: "0x7A120",
          description: `Forced transfer of ${amount} shares from ${from} to ${to}`,
        },
      });
    }

    default:
      return NextResponse.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
  }
}
