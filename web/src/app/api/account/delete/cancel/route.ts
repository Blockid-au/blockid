// GET /api/account/delete/cancel?token=… — "Keep my account" link from the
// deletion-scheduled email (S24-B). Token-gated (sha256 stored, single use);
// the only effect is to KEEP the account, so a GET is acceptable here (same
// posture as one-click unsubscribe). Redirects to Account settings with a
// status flag; an invalid or already-used token lands on the same page with
// `deletion=invalid` and no state change.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cancelDeletionByToken } from "@/lib/privacy/deletion-request";

export const dynamic = "force-dynamic";

function settingsUrl(request: Request, flag: string): URL {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return new URL(`/workspace/settings?deletion=${flag}`, base);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  const res = await cancelDeletionByToken(db, token);
  if (!res.ok && res.reason === "error") return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  return NextResponse.redirect(settingsUrl(request, res.ok ? "cancelled" : "invalid"), 303);
}
