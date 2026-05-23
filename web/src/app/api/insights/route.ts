import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/insights — return unread insights for the authenticated user
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("user_insights")
    .select("id, insight_type, title, summary, detail, relevance_score, source, read_at, created_at")
    .eq("user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[insights] GET error", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch insights" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, insights: data ?? [] });
}

// ---------------------------------------------------------------------------
// PATCH /api/insights — mark an insight as read
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const insightId = body.insightId as string;
  if (!insightId) {
    return NextResponse.json({ ok: false, error: "insightId is required" }, { status: 400 });
  }

  // Verify ownership before updating
  const { data: existing } = await supabase
    .from("user_insights")
    .select("id")
    .eq("id", insightId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Insight not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("user_insights")
    .update({ read_at: new Date().toISOString() })
    .eq("id", insightId);

  if (error) {
    console.error("[insights] PATCH error", error);
    return NextResponse.json({ ok: false, error: "Failed to mark insight as read" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
