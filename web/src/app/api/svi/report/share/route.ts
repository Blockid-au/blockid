// POST /api/svi/report/share
//
// Wave 25A — mint (or return existing) share token for the founder's most
// recent Trusted Business Report snapshot on `projectId`. The returned URL
// (/tbr/<token>) is public and read-only.
//
// Body: { projectId: string }
// Response: { ok: true, token, url } | { ok: false, error }

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { insertNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { projectId?: string };
  try {
    body = (await request.json()) as { projectId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const projectId = body.projectId?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "missing_project" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Verify ownership + locate the snapshot to share.
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountId = (account?.id as string | undefined) ?? null;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "no_account" }, { status: 404 });
  }

  let query = supabase
    .from("svi_snapshots")
    .select("id, report_share_token")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (projectId !== "default") query = query.eq("project_id", projectId);

  const { data: snapshot, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "no_snapshot" }, { status: 404 });
  }

  // Idempotent: return the pre-existing token if one is already minted.
  const existing = (snapshot as { report_share_token: string | null }).report_share_token;
  if (existing && existing.length > 0) {
    return NextResponse.json({
      ok: true,
      token: existing,
      url: `${baseUrl(request)}/tbr/${existing}`,
      alreadyShared: true,
    });
  }

  // Mint a fresh token — 24 chars from nanoid's URL-safe alphabet ≈ 143 bits.
  const token = nanoid(24);
  const { error: updateErr } = await supabase
    .from("svi_snapshots")
    .update({ report_share_token: token })
    .eq("id", (snapshot as { id: string }).id);
  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: updateErr.message },
      { status: 500 },
    );
  }

  // Wave 27C — record first-mint in the founder notification hub.
  void insertNotification({
    userId: user.id,
    projectId: projectId !== "default" ? projectId : null,
    kind: "report_shared",
    payload: {
      token,
      url: `${baseUrl(request)}/tbr/${token}`,
    },
  });

  return NextResponse.json({
    ok: true,
    token,
    url: `${baseUrl(request)}/tbr/${token}`,
  });
}
