import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/journal/[id] — fetch a single journal entry
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { id } = await params;

  const { data: entry, error } = await supabase
    .from("growth_journal")
    .select("*")
    .eq("id", id)
    .eq("account_id", user.id)
    .single();

  if (error || !entry) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entry });
}

// ---------------------------------------------------------------------------
// PATCH /api/journal/[id] — update a single journal entry
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { id } = await params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("growth_journal")
    .select("id")
    .eq("id", id)
    .eq("account_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title != null) updates.title = body.title;
  if (body.content != null) updates.content = body.content;
  if (body.entryType != null) {
    const validTypes = ["note", "decision", "pivot", "milestone", "learning", "metric", "ai_reflection", "revaluation"];
    if (!validTypes.includes(body.entryType as string)) {
      return NextResponse.json({ ok: false, error: `Invalid entry type` }, { status: 400 });
    }
    updates.entry_type = body.entryType;
  }
  if (body.tags != null) updates.tags = body.tags;
  if (body.isPublic != null) updates.is_public = body.isPublic;
  if (body.metadata != null) updates.metadata = body.metadata;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from("growth_journal")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[journal] PATCH error", error);
    return NextResponse.json({ ok: false, error: "Failed to update journal entry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry });
}

// ---------------------------------------------------------------------------
// DELETE /api/journal/[id] — remove a single journal entry
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { id } = await params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("growth_journal")
    .select("id")
    .eq("id", id)
    .eq("account_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("growth_journal")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[journal] DELETE error", error);
    return NextResponse.json({ ok: false, error: "Failed to delete journal entry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
