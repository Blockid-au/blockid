// GET /api/founder-notifications
//
// Wave 27C — founder activity feed (distinct from the legacy `notifications`
// table at /api/notifications which stores email/toast messages). This feed
// reads from `founder_notifications` and covers TBR opens, investor Q&A,
// new leads, share mints, and analysis completions.
//
// Query params:
//   • limit=50               (max 200)
//   • unread_only=1          (only rows where read_at IS NULL)
//   • count_only=1           (skip rows, return { unread_count } — used by
//                             the nav bell badge poller)
//   • kind=<kind>            (optional filter)

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_KINDS = new Set([
  "tbr_view",
  "tbr_qa_asked",
  "tbr_lead",
  "report_shared",
  "analysis_done",
  "svi_trend_alert",
]);

interface Row {
  id: number;
  user_id: string;
  project_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread_only") === "1";
  const countOnly = url.searchParams.get("count_only") === "1";
  const kind = url.searchParams.get("kind");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  if (countOnly) {
    let cq = supabase
      .from("founder_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (kind && KNOWN_KINDS.has(kind)) cq = cq.eq("kind", kind);
    const { count } = await cq;
    return NextResponse.json({ ok: true, unread_count: count ?? 0 });
  }

  let q = supabase
    .from("founder_notifications")
    .select("id, user_id, project_id, kind, payload, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is("read_at", null);
  if (kind && KNOWN_KINDS.has(kind)) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: "fetch_failed", detail: error.message }, { status: 500 });
  }
  const rows = (data as Row[] | null) ?? [];

  // Also return the unread count so the client can update the badge in a
  // single round-trip.
  const { count: unreadCount } = await supabase
    .from("founder_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    ok: true,
    notifications: rows,
    unread_count: unreadCount ?? 0,
  });
}
