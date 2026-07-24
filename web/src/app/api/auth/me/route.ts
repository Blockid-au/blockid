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
  // Trial lifecycle fields (migration 0110). null = user is not on a trial
  // — components must gracefully degrade rather than assume the field exists.
  let trialStartedAt: string | null = null;
  let trialEndAt: string | null = null;
  let trialConvertedAt: string | null = null;
  let paymentFailedAt: string | null = null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const [accountRes, foldersRes, trialRes] = await Promise.all([
      supabase.from("svi_accounts").select("drive_folder_id, drive_folder_url, source_folders_enabled")
        .eq("email", user.email).maybeSingle(),
      supabase.from("user_source_folders").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_active", true),
      supabase.from("app_users")
        .select("trial_started_at, trial_end_at, trial_converted_at, payment_failed_at")
        .eq("id", user.id).maybeSingle(),
    ]);
    driveFolderId = accountRes.data?.drive_folder_id ?? null;
    driveFolderUrl = accountRes.data?.drive_folder_url ?? null;
    sourceFoldersEnabled = accountRes.data?.source_folders_enabled ?? false;
    sourceFolderCount = foldersRes.count ?? 0;
    trialStartedAt = trialRes.data?.trial_started_at ?? null;
    trialEndAt = trialRes.data?.trial_end_at ?? null;
    trialConvertedAt = trialRes.data?.trial_converted_at ?? null;
    paymentFailedAt = trialRes.data?.payment_failed_at ?? null;
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
      trial: {
        started_at: trialStartedAt,
        end_at: trialEndAt,
        converted_at: trialConvertedAt,
        payment_failed_at: paymentFailedAt,
      },
    },
  });
}

export const dynamic = "force-dynamic";
