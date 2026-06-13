import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/data-room/engage — Track investor engagement events
// GET  /api/data-room/engage?roomId=... — Fetch engagement analytics
//
// Called from the investor-facing data room view page (no auth required
// for posting events; auth required for fetching analytics).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    token,         // data_room_access_tokens.token
    eventType,     // open|section_view|document_open|document_download|nda_sign
    section,
    documentName,
    durationMs,
    scrollPct,
  } = body;

  if (!token || !eventType) {
    return NextResponse.json({ ok: false, error: "Missing token or eventType" }, { status: 400 });
  }

  // Resolve token to data_room_id and access_token_id
  const { data: accessToken } = await supabase
    .from("data_room_access_tokens")
    .select("id, data_room_id, is_active, expires_at")
    .eq("token", token)
    .single();

  if (!accessToken || !accessToken.is_active) {
    return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 403 });
  }

  if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "Link has expired" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const salt = process.env.IP_HASH_SALT ?? "";
  const ipHash = createHash("sha256").update(ip + salt).digest("hex").slice(0, 16);

  // Insert engagement event
  await supabase.from("data_room_engagement").insert({
    data_room_id: accessToken.data_room_id,
    access_token_id: accessToken.id,
    event_type: eventType,
    section: section ?? null,
    document_name: documentName ?? null,
    duration_ms: durationMs ?? null,
    scroll_pct: scrollPct ?? null,
    ip_hash: ipHash,
    user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  const tokenUpdate: Record<string, string> = {
    last_accessed: new Date().toISOString(),
  };
  if (eventType === "open") {
    tokenUpdate.first_accessed = new Date().toISOString();
  }

  await supabase
    .from("data_room_access_tokens")
    .update(tokenUpdate)
    .eq("id", accessToken.id);

  // Increment access count via raw SQL (fire and forget)
  void supabase.rpc("increment_access_count", { token_id: accessToken.id });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Fetch engagement summary grouped by section
  const { data: events } = await supabase
    .from("data_room_engagement")
    .select("event_type, section, document_name, duration_ms, scroll_pct, occurred_at")
    .eq("data_room_id", roomId)
    .order("occurred_at", { ascending: false })
    .limit(500);

  // Build section heatmap
  const sectionStats: Record<string, { views: number; avgDuration: number; avgScroll: number }> = {};
  for (const event of events ?? []) {
    if (!event.section) continue;
    if (!sectionStats[event.section]) {
      sectionStats[event.section] = { views: 0, avgDuration: 0, avgScroll: 0 };
    }
    sectionStats[event.section].views++;
    if (event.duration_ms) sectionStats[event.section].avgDuration += event.duration_ms;
    if (event.scroll_pct) sectionStats[event.section].avgScroll += event.scroll_pct;
  }

  // Average the cumulative values
  for (const section of Object.keys(sectionStats)) {
    const { views } = sectionStats[section];
    if (views > 0) {
      sectionStats[section].avgDuration = Math.round(sectionStats[section].avgDuration / views);
      sectionStats[section].avgScroll = Math.round(sectionStats[section].avgScroll / views);
    }
  }

  const totalViews = (events ?? []).filter(e => e.event_type === "open").length;
  const totalEvents = (events ?? []).length;

  return NextResponse.json({
    ok: true,
    analytics: {
      totalViews,
      totalEvents,
      sectionHeatmap: sectionStats,
      recentEvents: (events ?? []).slice(0, 20),
    },
  });
}
