import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateUserFolder, listUserFolderFiles } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/**
 * GET  /api/source-folders — list user's source folders + files
 * POST /api/source-folders — add a source folder (external Drive share or BlockID folder)
 * PUT  /api/source-folders — toggle is_active / update label
 * DELETE /api/source-folders — remove a source folder
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  // Get user's source folders
  const { data: folders } = await supabase
    .from("user_source_folders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Get user's BlockID Drive folder
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("drive_folder_id, drive_folder_url, source_folders_enabled")
    .eq("email", user.email)
    .maybeSingle();

  // Get dataroom files organized by SVI dimension
  const { data: dataroomFiles } = await supabase
    .from("dataroom_files")
    .select("*")
    .eq("user_id", user.id)
    .order("svi_dimension, created_at");

  // List files in BlockID Drive folder if it exists
  let blockidFiles: Array<{ id: string; name: string; webViewLink: string; mimeType: string; createdTime: string }> = [];
  if (account?.drive_folder_id) {
    try {
      blockidFiles = await listUserFolderFiles(account.drive_folder_id);
    } catch { /* Drive not configured */ }
  }

  return NextResponse.json({
    ok: true,
    blockidFolder: account?.drive_folder_id ? {
      folderId: account.drive_folder_id,
      folderUrl: account.drive_folder_url,
      files: blockidFiles,
    } : null,
    sourceFoldersEnabled: account?.source_folders_enabled ?? false,
    folders: folders ?? [],
    dataroomFiles: dataroomFiles ?? [],
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as {
    action?: string;
    folderId?: string;
    folderUrl?: string;
    label?: string;
    sviDimension?: string;
  };

  // Action: toggle source folders on/off
  if (body.action === "toggle_source_folders") {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("source_folders_enabled")
      .eq("email", user.email)
      .maybeSingle();

    const newState = !(account?.source_folders_enabled ?? false);
    await supabase.from("svi_accounts").update({
      source_folders_enabled: newState,
    }).eq("email", user.email);

    return NextResponse.json({ ok: true, enabled: newState });
  }

  // Action: create BlockID Drive folder if doesn't exist
  if (body.action === "create_blockid_folder") {
    try {
      const { folderId, folderUrl } = await getOrCreateUserFolder(user.email, user.displayName);
      await supabase.from("svi_accounts").update({
        drive_folder_id: folderId,
        drive_folder_url: folderUrl,
      }).eq("email", user.email);

      // Also add as source folder
      await supabase.from("user_source_folders").upsert({
        user_id: user.id,
        email: user.email,
        folder_type: "blockid",
        folder_id: folderId,
        folder_url: folderUrl,
        label: "BlockID Documents",
        is_active: true,
      }, { onConflict: "user_id,folder_id" }).select();

      return NextResponse.json({ ok: true, folderId, folderUrl });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to create folder" }, { status: 500 });
    }
  }

  // Action: add external source folder
  if (!body.folderId || !body.label) {
    return NextResponse.json({ error: "folderId and label are required" }, { status: 400 });
  }

  const folderUrl = body.folderUrl ?? `https://drive.google.com/drive/folders/${body.folderId}`;

  const { error } = await supabase.from("user_source_folders").insert({
    user_id: user.id,
    email: user.email,
    folder_type: "drive",
    folder_id: body.folderId,
    folder_url: folderUrl,
    label: body.label,
    svi_dimension: body.sviDimension ?? null,
    is_active: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as { id: string; is_active?: boolean; label?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.label) updates.label = body.label;

  const { error } = await supabase
    .from("user_source_folders")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as { id: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("user_source_folders")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
