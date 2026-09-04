// POST /api/tbr/[token]/view-end
//
// Wave 26A — patches read duration onto a `tbr_views` row created by
// /view-start. Fired from the client on `visibilitychange` (hidden) and
// `beforeunload`. Best-effort — swallowed errors are fine.
//
// Body: { viewId: number, readMs: number }

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  let body: { viewId?: number; readMs?: number };
  try {
    body = (await request.json()) as { viewId?: number; readMs?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const viewId = Number(body.viewId);
  const readMs = Number(body.readMs);
  if (!Number.isFinite(viewId) || viewId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_view" }, { status: 400 });
  }
  const safeMs = Number.isFinite(readMs) && readMs >= 0 ? Math.min(readMs, 6 * 60 * 60_000) : 0;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true });

  await supabase
    .from("tbr_views")
    .update({ read_ms: safeMs, ended_at: new Date().toISOString() })
    .eq("id", viewId)
    .eq("share_token", token);

  return NextResponse.json({ ok: true });
}
