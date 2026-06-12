import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { processSyncQueue } from "@/lib/blockchain-sync";

export const dynamic = "force-dynamic";

// GET /api/cron/blockchain-sync — Process pending blockchain sync events
// Runs every 5 minutes via cron
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Find all accounts with sync enabled and pending events
    const { data: accounts } = await supabase
      .from("blockchain_sync_config")
      .select("account_id")
      .eq("sync_enabled", true)
      .gt("pending_events", 0);

    if (!accounts?.length) {
      return NextResponse.json({ ok: true, message: "No pending events", accounts: 0 });
    }

    let totalProcessed = 0;
    let totalSynced = 0;
    let totalFailed = 0;
    const results: Array<{ accountId: string; result: { processed: number; synced: number; failed: number; remaining: number } }> = [];

    for (const account of accounts) {
      const result = await processSyncQueue(account.account_id);
      totalProcessed += result.processed;
      totalSynced += result.synced;
      totalFailed += result.failed;
      results.push({ accountId: account.account_id, result });
    }

    console.log(
      `[blockid:blockchain-sync-cron] done: accounts=${accounts.length}, processed=${totalProcessed}, synced=${totalSynced}, failed=${totalFailed}`,
    );

    return NextResponse.json({
      ok: true,
      accounts: accounts.length,
      totalProcessed,
      totalSynced,
      totalFailed,
      results,
    });
  } catch (err) {
    console.error("[blockid:blockchain-sync-cron] failed", err);
    return NextResponse.json({ ok: false, error: "Sync cron failed" }, { status: 500 });
  }
}

export { GET as POST };
