import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { clientIpFromHeaders, hashIp } from "@/lib/iphash";
import { apiRoute } from "@/lib/audit/api-route";
import { getCurrentUser } from "@/lib/auth";
import {
  buildEngagementHeatmap,
  isDuplicateEvent,
  parseEngageEvent,
  type HeatmapEventInput,
} from "@/lib/dataroom/engagement";
import { resolveRoomForCaller } from "@/lib/dataroom/room-access";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/data-room/engage — Track investor engagement events
// GET  /api/data-room/engage?roomId=... — Fetch engagement analytics
//
// POST is called from the investor-facing data room view page (no auth
// required for posting events; the share token is the credential). S21-A
// added validation (`parseEngageEvent`: whitelisted event types, clamped
// dwell / scroll, capped strings) and a server-side dedupe — a second
// (link, type, section, document) event inside 30 s is acknowledged and
// dropped, so a misbehaving client cannot inflate a heatmap.
//
// GET is founder-facing. Before S21-A it took any roomId with no auth at all
// (an IDOR: any room's engagement by guessing its uuid). It now requires a
// session and resolves the caller's role on the room through
// lib/dataroom/room-access (owner or accepted project member; stranger →
// 404), and returns the per-link × per-section heatmap the /workspace page
// renders alongside the legacy sectionHeatmap shape.
// ---------------------------------------------------------------------------

// r-03-exempt: investor engagement telemetry from anonymous investor-facing view; auth handled by data_room_access_tokens.token lookup, not by user entitlement
async function POST_handler(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // sendBeacon posts a Blob with an application/json type; `req.json()`
  // reads it the same as a fetch body.
  const parsed = parseEngageEvent(await req.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const { token, eventType, section, documentName, durationMs, scrollPct } = parsed.event;

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

  // Dedupe: same (link, type, section, document) inside the window → drop.
  let dupQuery = supabase
    .from("data_room_engagement")
    .select("occurred_at")
    .eq("access_token_id", accessToken.id)
    .eq("event_type", eventType);
  dupQuery = section === null ? dupQuery.is("section", null) : dupQuery.eq("section", section);
  dupQuery = documentName === null ? dupQuery.is("document_name", null) : dupQuery.eq("document_name", documentName);
  const { data: last } = await dupQuery.order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (isDuplicateEvent(parsed.event, last as { occurred_at: string | null } | null)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // S21-A: the edge-observed hop (cf-connecting-ip / LAST x-forwarded-for),
  // never the first hop the client can forge — same rule as lib/iphash and
  // the S20-A audit writer. Still a salted, 16-char prefix, never the address.
  const ipHash = hashIp(clientIpFromHeaders(req.headers) ?? "unknown")?.slice(0, 16) ?? null;

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

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const resolved = await resolveRoomForCaller(user, roomId, "viewer");
  if (!resolved.ok) return resolved.response;

  // Fetch engagement summary grouped by section
  const { data: events } = await supabase
    .from("data_room_engagement")
    .select("access_token_id, event_type, section, document_name, duration_ms, scroll_pct, occurred_at")
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

  // S21-A — per investor link × section matrix. Links fix the row order
  // (newest first); a link's label never includes the token.
  const { data: links } = await supabase
    .from("data_room_access_tokens")
    .select("id, investor_name, investor_firm, investor_email, created_at, nda_signed_at, nda_signed_version")
    .eq("data_room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(100);
  const linkRows = ((links ?? []) as Array<Record<string, unknown>>).map((l) => {
    const name = (l.investor_name as string | null)?.trim();
    const firm = (l.investor_firm as string | null)?.trim();
    const email = (l.investor_email as string | null)?.trim();
    const label = name && firm ? `${name} · ${firm}` : name || firm || email || "Anonymous link";
    return { id: String(l.id), label, ndaSignedAt: (l.nda_signed_at as string | null) ?? null };
  });
  const heatmap = buildEngagementHeatmap((events ?? []) as HeatmapEventInput[], linkRows);

  return NextResponse.json({
    ok: true,
    analytics: {
      totalViews,
      totalEvents,
      sectionHeatmap: sectionStats,
      recentEvents: (events ?? []).slice(0, 20),
      heatmap,
      links: linkRows,
    },
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/data-room/engage/route.ts", method: "POST" }, POST_handler);
