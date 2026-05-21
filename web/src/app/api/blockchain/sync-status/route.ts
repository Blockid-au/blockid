import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSyncConfig, getSyncQueueStatus } from "@/lib/blockchain-sync";

export const dynamic = "force-dynamic";

// GET /api/blockchain/sync-status — Full sync dashboard data
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const [config, queueStatus] = await Promise.all([
    getSyncConfig(user.id),
    getSyncQueueStatus(user.id),
  ]);

  return NextResponse.json({
    ok: true,
    config: config ?? {
      syncEnabled: false,
      syncState: "off",
      tokenAddress: null,
      tokenSymbol: null,
      tokenName: null,
      lastSyncAt: null,
      pendingEvents: 0,
    },
    queue: queueStatus,
  });
}
