// POST /api/auth/set-password — Set or change password for authenticated user
// Body: { currentPassword?: string, newPassword: string }
// If user has no password yet (magic-link / Google user), currentPassword is optional.
// If user has an existing password, currentPassword is required.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const BCRYPT_ROUNDS = 12;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body ?? {};

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
    }

    // Get current password hash
    const { data: row } = await supabase
      .from("app_users")
      .select("id, password_hash")
      .eq("id", user.id)
      .single();

    if (!row) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // If user has an existing password, verify current password
    if (row.password_hash) {
      if (!currentPassword || typeof currentPassword !== "string") {
        return NextResponse.json(
          { ok: false, error: "Current password is required" },
          { status: 400 },
        );
      }
      const valid = await bcrypt.compare(currentPassword, row.password_hash);
      if (!valid) {
        return NextResponse.json(
          { ok: false, error: "Current password is incorrect" },
          { status: 403 },
        );
      }
    }

    // Hash and save new password
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const { error: updateErr } = await supabase
      .from("app_users")
      .update({ password_hash: hash })
      .eq("id", user.id);

    if (updateErr) {
      console.error("[auth:set-password] update failed", updateErr);
      return NextResponse.json({ ok: false, error: "Failed to update password" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("[auth:set-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
