import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getFoldersForStage, getCompletenessRequirements } from "@/lib/data-room-templates";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/data-room/initialize
//
// Creates or refreshes the professional data room for a user:
// 1. Fetches SVI account stage
// 2. Creates data_rooms record (v2 professional)
// 3. Seeds data_room_documents for all sections relevant to stage
// 4. Seeds default automation goals
// 5. Returns completeness score and action plan
// ---------------------------------------------------------------------------

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // ── Fetch startup profile ─────────────────────────────────────────────
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("startup_name, current_stage, current_svi")
    .eq("user_id", user.id)
    .single();

  const stage = sviAccount?.current_stage ?? 0;
  const startupName = sviAccount?.startup_name ?? "My Startup";

  // ── Check for existing data room ──────────────────────────────────────
  const { data: existingRoom } = await supabase
    .from("data_rooms")
    .select("id, token, completeness_score, template_version")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let roomId: string;
  let token: string;

  if (existingRoom && existingRoom.template_version === 2) {
    // Refresh existing v2 room
    roomId = existingRoom.id;
    token = existingRoom.token;
    await supabase
      .from("data_rooms")
      .update({ last_generated_at: new Date().toISOString(), stage })
      .eq("id", roomId);
  } else {
    // Create new professional data room
    token = nanoid(32);
    const { data: newRoom, error: roomError } = await supabase
      .from("data_rooms")
      .insert({
        account_id: user.id,
        email: user.email,
        token,
        title: `${startupName} — Investor Data Room`,
        sections: {},
        is_active: true,
        startup_name: startupName,
        stage,
        template_version: 2,
        last_generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (roomError || !newRoom) {
      return NextResponse.json(
        { ok: false, error: roomError?.message ?? "Failed to create data room" },
        { status: 500 }
      );
    }
    roomId = newRoom.id;
  }

  // ── Seed documents for current stage ─────────────────────────────────
  const folders = getFoldersForStage(stage);
  const documentsToInsert = folders.flatMap(folder =>
    folder.documents.map(doc => ({
      data_room_id: roomId,
      account_id: user.id,
      section: folder.section,
      folder: folder.name,
      document_name: doc.name,
      document_type: doc.type,
      status: "missing" as const,
      priority: doc.priority,
      template_content: doc.templateContent ?? null,
      notes: doc.dueDiligenceNotes ?? null,
    }))
  );

  // Remove existing docs then re-seed (idempotent)
  await supabase.from("data_room_documents").delete().eq("data_room_id", roomId);
  await supabase.from("data_room_documents").insert(documentsToInsert);

  // ── Seed default automation goals ────────────────────────────────────
  const { data: existingGoals } = await supabase
    .from("data_room_goals")
    .select("id")
    .eq("account_id", user.id);

  if (!existingGoals?.length) {
    await supabase.from("data_room_goals").insert([
      {
        account_id: user.id,
        goal_type: "completeness",
        target_value: 80,
        current_value: 0,
        unit: "%",
        status: "active",
      },
      {
        account_id: user.id,
        goal_type: "investor_views",
        target_value: 5,
        current_value: 0,
        unit: "count",
        status: "active",
      },
      {
        account_id: user.id,
        goal_type: "nda_signed",
        target_value: 3,
        current_value: 0,
        unit: "count",
        status: "active",
      },
    ]);
  }

  // ── Calculate completeness ────────────────────────────────────────────
  const { sections, totalDocs, p0Docs } = getCompletenessRequirements();
  const relevantFolders = getFoldersForStage(stage);
  const relevantTotal = relevantFolders.reduce((sum, f) => sum + f.documents.length, 0);
  const relevantP0 = relevantFolders.reduce(
    (sum, f) => sum + f.documents.filter(d => d.priority === "P0").length,
    0
  );

  // ── Build action plan (top 5 missing P0) ─────────────────────────────
  const missingP0 = relevantFolders.flatMap(folder =>
    folder.documents
      .filter(d => d.priority === "P0")
      .map(d => ({ folder: folder.name, document: d.name, type: d.type }))
  );

  const actionPlan = missingP0.slice(0, 8).map((item, i) => ({
    step: i + 1,
    action: `Upload ${item.document}`,
    section: item.folder,
    type: item.type,
    impact: "high",
  }));

  return NextResponse.json({
    ok: true,
    dataRoom: {
      id: roomId,
      token,
      shareUrl: `/data-room/${token}`,
      startupName,
      stage,
      templateVersion: 2,
    },
    completeness: {
      overall: 0,
      totalDocuments: relevantTotal,
      p0Documents: relevantP0,
      sectionCount: relevantFolders.length,
    },
    actionPlan,
    sections: sections.filter(s =>
      relevantFolders.some(f => f.section === s.section)
    ),
  });
}

// GET — fetch current data room status
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data: room } = await supabase
    .from("data_rooms")
    .select("id, token, startup_name, stage, completeness_score, last_generated_at, investor_count")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!room) {
    return NextResponse.json({ ok: false, error: "No data room found" }, { status: 404 });
  }

  const { data: documents } = await supabase
    .from("data_room_documents")
    .select("section, folder, document_name, status, priority")
    .eq("data_room_id", room.id)
    .order("priority");

  const { data: goals } = await supabase
    .from("data_room_goals")
    .select("*")
    .eq("account_id", user.id)
    .eq("status", "active");

  // Calculate completeness by section
  const sectionStats: Record<string, { total: number; complete: number }> = {};
  for (const doc of documents ?? []) {
    if (!sectionStats[doc.section]) {
      sectionStats[doc.section] = { total: 0, complete: 0 };
    }
    sectionStats[doc.section].total++;
    if (doc.status === "complete") sectionStats[doc.section].complete++;
  }

  const total = Object.values(sectionStats).reduce((s, v) => s + v.total, 0);
  const complete = Object.values(sectionStats).reduce((s, v) => s + v.complete, 0);
  const overallPct = total > 0 ? Math.round((complete / total) * 100) : 0;

  return NextResponse.json({
    ok: true,
    room: {
      ...room,
      completenessScore: overallPct,
      shareUrl: `/data-room/${room.token}`,
    },
    sectionStats,
    goals,
    missingP0: (documents ?? []).filter(d => d.priority === "P0" && d.status === "missing"),
  });
}
