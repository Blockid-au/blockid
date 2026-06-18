// /api/admin/investor-verify (T_SVI_EXC_0003) — admin marks/unmarks an
// investor account as verified. Used by the verification queue page.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500 });

  let body: { userId?: string; verified?: boolean } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });

  const update = body.verified
    ? { verified_at: new Date().toISOString(), verified_by: me.id }
    : { verified_at: null, verified_by: null };

  const { error } = await supabase.from("app_users").update(update).eq("id", body.userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
