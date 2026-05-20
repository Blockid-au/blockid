import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/auth/me
// Returns the current authenticated user (id, email, plan, role) or
// { ok: false } when not logged in.  Used by client components that need
// to adapt UI based on auth / plan status without a full page reload.
// Also includes Drive folder + source folder references for session context.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, user: null });
  }

  // Enrich with Drive folder and source folder info
  let driveFolderId: string | null = null;
  let driveFolderUrl: string | null = null;
  let sourceFoldersEnabled = false;
  let sourceFolderCount = 0;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const [accountRes, foldersRes] = await Promise.all([
      supabase.from("svi_accounts").select("drive_folder_id, drive_folder_url, source_folders_enabled")
        .eq("email", user.email).maybeSingle(),
      supabase.from("user_source_folders").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_active", true),
    ]);
    driveFolderId = accountRes.data?.drive_folder_id ?? null;
    driveFolderUrl = accountRes.data?.drive_folder_url ?? null;
    sourceFoldersEnabled = accountRes.data?.source_folders_enabled ?? false;
    sourceFolderCount = foldersRes.count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
      role: user.role,
      displayName: user.displayName,
      driveFolderId,
      driveFolderUrl,
      sourceFoldersEnabled,
      sourceFolderCount,
    },
  });
}

export const dynamic = "force-dynamic";
