// /api/cron/svi-index-populate — incremental snapshot populator.
//
// Runs on a normal cron (Bearer CRON_SECRET) and lands snapshots for any
// svi_analyses rows created since the last successful pass. Batch size is
// deliberately small (200) so the endpoint always fits inside the platform
// timeout, even during a burst of analyses.
//
// State lives in `svi_index_populate_state` (id = 1). We update it AFTER
// the batch so a crashed run just re-processes the same window on the next
// tick — populateBatch is idempotent thanks to the (account_id, snapshot_date)
// unique constraint on svi_index_snapshots.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { populateBatch } from "@/lib/svi-index-populator";

export const dynamic = "force-dynamic";

const CRON_BATCH_LIMIT = 200;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  // Read the checkpoint. Missing row is fine — populateBatch(null, …) will
  // start from the oldest analysis (the /dataset zero-state).
  const { data: stateRow } = await supabase
    .from("svi_index_populate_state")
    .select("last_populated_analysis_id")
    .eq("id", 1)
    .maybeSingle();

  const sinceId =
    (stateRow?.last_populated_analysis_id as string | null | undefined) ?? null;

  const result = await populateBatch(sinceId, CRON_BATCH_LIMIT);

  // Only advance the checkpoint when we actually saw rows — an empty batch
  // means the queue is drained, no state change needed.
  if (result.scanned > 0 && result.lastId) {
    await supabase
      .from("svi_index_populate_state")
      .update({
        last_populated_analysis_id: result.lastId,
        last_populated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
  }

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    inserted: result.inserted,
    lastId: result.lastId,
    since: sinceId,
  });
}

export { GET as POST };
