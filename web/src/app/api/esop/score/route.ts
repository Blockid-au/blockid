import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scoreEsop, esopStatusFromCapTable } from "@/lib/agents/cfo-esop-scoring";
import type { GovernanceHealth } from "@/lib/agents/cfo-esop-scoring";

export const dynamic = "force-dynamic";

// GET /api/esop/score — governance + ESOP health score for the authenticated user
export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Fetch ESOP pool
  const { data: pool } = await supabase
    .from("esop_pools")
    .select("*")
    .eq("account_id", user.id)
    .maybeSingle();

  // Fetch grant count
  const { count: grantCount } = await supabase
    .from("esop_grants")
    .select("id", { count: "exact", head: true })
    .eq("esop_pool_id", pool?.id ?? "none");

  // Fetch SVI account for additional signals
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("score, analysis")
    .eq("account_id", user.id)
    .maybeSingle();

  const analysis = sviAccount?.analysis as Record<string, unknown> | null;
  const signals = analysis?.signals as Record<string, boolean> | null;

  const esopStatus = pool ? esopStatusFromCapTable({
    totalPoolShares: pool.total_shares ?? pool.total_pool_shares,
    totalShares: 100_000,
    grantsCount: grantCount ?? 0,
    hasLegalDeed: false,
    vestingMonths: pool.vesting_total_months ?? 48,
    cliffMonths: pool.vesting_cliff_months ?? 12,
  }) : null;

  const governance: GovernanceHealth = {
    esop: esopStatus,
    hasFounderVesting: signals?.hasVesting ?? false,
    hasShareholdersAgreement: signals?.hasShareholdersAgreement ?? false,
    boardMeetingsPerYear: 0,
    hasDataRoom: false,
    dataRoomPct: 0,
    hasInvestorNDA: false,
    hasIpAssignment: false,
  };

  const result = scoreEsop(governance);

  return NextResponse.json({
    ok: true,
    score: result.score,
    sviContribution: result.sviContribution,
    valuationMultiplier: result.valuationMultiplier,
    issues: result.issues,
    actions: result.actions,
    pool: pool ?? null,
    grantCount: grantCount ?? 0,
  });
}
