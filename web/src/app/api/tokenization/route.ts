import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isChainOnline,
  getWalletStatus,
  generateTokenizationPlan,
  calculateVestingSchedule,
  sharesToTokens,
  DEFAULT_CHAIN_CONFIG,
} from "@/lib/tokenization";

export const dynamic = "force-dynamic";

/**
 * GET /api/tokenization — get tokenization status for logged-in user
 * POST /api/tokenization — actions: plan, sync, vest-schedule
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Get cap table
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (!account) return NextResponse.json({ ok: false, error: "No SVI account" });

  const { data: shareholders } = await supabase
    .from("shareholders")
    .select("id, name, email, role, shares_held, vesting_start, vesting_months, cliff_months")
    .eq("account_id", account.id);

  const chainOnline = await isChainOnline();
  const totalShares = (shareholders ?? []).reduce((s, sh) => s + (sh.shares_held ?? 0), 0);

  // Generate tokenization plan
  const plan = generateTokenizationPlan(
    (shareholders ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      shares: s.shares_held ?? 0,
    })),
  );

  return NextResponse.json({
    ok: true,
    chainOnline,
    chainConfig: DEFAULT_CHAIN_CONFIG,
    totalShares,
    totalTokens: sharesToTokens(totalShares).toString(),
    shareholders: (shareholders ?? []).length,
    tokenizationPlan: plan.map((p) => ({
      ...p,
      amount: p.amount.toString(),
    })),
    status: chainOnline ? "ready" : "chain_offline",
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { action: string; data?: Record<string, unknown> };

  switch (body.action) {
    case "chain-status":
      return NextResponse.json({
        ok: true,
        online: await isChainOnline(),
        config: DEFAULT_CHAIN_CONFIG,
      });

    case "wallet-status": {
      const address = body.data?.address as string | undefined;
      const status = await getWalletStatus(address);
      return NextResponse.json({
        ok: true,
        ...status,
        balance: status.balance.toString(),
      });
    }

    case "vesting-schedule": {
      const { totalShares, startDate, vestingMonths, cliffMonths } = body.data ?? {};
      if (!totalShares) return NextResponse.json({ error: "totalShares required" }, { status: 400 });
      const schedule = calculateVestingSchedule(
        totalShares as number,
        new Date((startDate as string) ?? new Date().toISOString()),
        (vestingMonths as number) ?? 48,
        (cliffMonths as number) ?? 12,
      );
      return NextResponse.json({ ok: true, schedule });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
