// GET /api/conversion/pending-trigger (T-1020).
//
// Returns the latest unshown CRO trigger for the current user — the client
// upgrade-modal flow reads this on mount and calls useUpgradePrompt().request()
// if a pending trigger is found. "Unshown" means a row with action='shown' in
// conversion_events that the client has not yet dismissed (no paired
// action='dismissed'|'accepted' with a later ts).
//
// Response schema:
//   200 { trigger: ConversionTrigger; copyKey: string } — a pending trigger
//   204 (no body)                                      — nothing pending
//   401 { error: "unauthenticated" }                   — no session
//   503 { error: "supabase_not_configured" }            — degraded mode

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { TRIGGERS, type ConversionTrigger } from "@/lib/conversion/triggers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  // Fetch the most recent "shown" row — the client will call /track with
  // action=dismissed|accepted once the modal resolves so we don't re-surface
  // it. We rely on the client-side cool-down in useUpgradePrompt() to prevent
  // the same trigger from re-appearing in the same session.
  const { data: rows } = await supabase
    .from("conversion_events")
    .select("trigger, ts")
    .eq("user_id", user.id)
    .eq("action", "shown")
    .order("ts", { ascending: false })
    .limit(10);

  if (!rows || rows.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  // Find the first "shown" trigger that has no paired resolution in the same
  // batch (dismissed / accepted / snoozed). We re-query narrowly to keep the
  // resolution lookup cheap.
  for (const row of rows) {
    const trigger = row.trigger as ConversionTrigger;
    const spec = TRIGGERS[trigger];
    if (!spec) continue;

    // Check for a resolution event that is NEWER than this shown event.
    const { count } = await supabase
      .from("conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("trigger", trigger)
      .in("action", ["dismissed", "accepted", "snoozed"])
      .gte("ts", row.ts);

    if ((count ?? 0) === 0) {
      // No resolution yet — this trigger is still pending.
      return NextResponse.json({
        trigger,
        copyKey: spec.copyKey,
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}
