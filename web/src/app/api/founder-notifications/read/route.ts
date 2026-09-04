// POST /api/founder-notifications/read
//
// Wave 27C — mark founder_notifications rows as read. Body accepts either
// { ids: number[] } (specific rows) or { all: true } (all unread for the
// user). Returns { ok: true, updated: <count> }.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  ids?: unknown;
  all?: unknown;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const now = new Date().toISOString();

  if (body.all === true) {
    const { data, error } = await supabase
      .from("founder_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null)
      .select("id");
    if (error) {
      return NextResponse.json({ ok: false, error: "update_failed", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: (data ?? []).length });
  }

  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("founder_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: (data ?? []).length });
}
