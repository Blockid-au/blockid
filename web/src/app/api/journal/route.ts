import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/journal — list journal entries with pagination & filter
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const entryType = url.searchParams.get("type"); // filter by entry_type
  const offset = (page - 1) * limit;

  let query = supabase
    .from("growth_journal")
    .select("*", { count: "exact" })
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entryType) {
    query = query.eq("entry_type", entryType);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[journal] GET error", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch journal entries" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    entries: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

// ---------------------------------------------------------------------------
// POST /api/journal — create a new journal entry
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
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

  const title = body.title as string;
  const content = (body.content as string) || null;
  const entryType = (body.entryType as string) || "note";
  const tags = (body.tags as string[]) || [];
  const isPublic = body.isPublic === true;

  if (!title) {
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  }

  const validTypes = ["note", "decision", "pivot", "milestone", "learning", "metric"];
  if (!validTypes.includes(entryType)) {
    return NextResponse.json({ ok: false, error: `Invalid entry type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Fetch current SVI score
  let currentSVI: number | null = null;
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("current_svi")
    .eq("email", user.email)
    .maybeSingle();

  if (sviAccount) {
    currentSVI = (sviAccount.current_svi as number) ?? null;
  }

  // Insert the journal entry
  const { data: entry, error } = await supabase
    .from("growth_journal")
    .insert({
      account_id: user.id,
      email: user.email,
      entry_type: entryType,
      title,
      content,
      tags,
      svi_at_time: currentSVI,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) {
    console.error("[journal] POST error", error);
    return NextResponse.json({ ok: false, error: "Failed to create journal entry" }, { status: 500 });
  }

  // Generate AI reflection in background (non-blocking update)
  generateReflection(entry.id, entryType, title, content, currentSVI, supabase).catch((err) => {
    console.warn("[journal] AI reflection failed:", err);
  });

  return NextResponse.json({ ok: true, entry }, { status: 201 });
}

async function generateReflection(
  entryId: string,
  entryType: string,
  title: string,
  content: string | null,
  currentSVI: number | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
) {
  try {
    const result = await callAI({
      system: "You are a startup advisor. Write a 1-2 sentence reflection on this journal entry. Be encouraging and insightful.",
      user: `Entry type: ${entryType}\nTitle: ${title}\nContent: ${content ?? "(no content)"}\nCurrent SVI: ${currentSVI ?? "unknown"}`,
      maxTokens: 100,
    });

    await supabase
      .from("growth_journal")
      .update({ ai_reflection: result.text })
      .eq("id", entryId);
  } catch (err) {
    console.warn("[journal] AI reflection generation failed:", err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/journal — update an existing journal entry
// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
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

  const entryId = body.id as string;
  if (!entryId) {
    return NextResponse.json({ ok: false, error: "Entry id is required" }, { status: 400 });
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from("growth_journal")
    .select("id")
    .eq("id", entryId)
    .eq("account_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title != null) updates.title = body.title;
  if (body.content != null) updates.content = body.content;
  if (body.entryType != null) updates.entry_type = body.entryType;
  if (body.tags != null) updates.tags = body.tags;
  if (body.isPublic != null) updates.is_public = body.isPublic;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from("growth_journal")
    .update(updates)
    .eq("id", entryId)
    .select()
    .single();

  if (error) {
    console.error("[journal] PUT error", error);
    return NextResponse.json({ ok: false, error: "Failed to update journal entry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry });
}

// ---------------------------------------------------------------------------
// DELETE /api/journal — remove a journal entry
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: { id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Entry id is required" }, { status: 400 });
  }

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
