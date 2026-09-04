// GET /api/svi/report/views?projectId=<pid>
//
// Wave 26A — founder-side aggregation of TBR opens for the most recent
// shared snapshot on `projectId`. NEVER exposes raw IPs; the response only
// contains country codes, coarse device classes, and read-duration seconds.
//
// Response:
// {
//   ok: true,
//   hasShareToken: boolean,
//   totals: { views, uniqueCountries, totalReadMs, firstAt, lastAt } | null,
//   recent: [{ viewedAt, country, device, readSeconds }]
// }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ViewRow {
  viewed_at: string;
  viewer_country: string | null;
  viewer_device: string | null;
  read_ms: number | null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "missing_project" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Ownership check: resolve the caller's most recent svi_account.
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountId = (account?.id as string | undefined) ?? null;
  if (!accountId) {
    return NextResponse.json({
      ok: true,
      hasShareToken: false,
      totals: null,
      recent: [],
    });
  }

  // Latest snapshot on this project — same ordering as /share route so the
  // token surfaced here is the same one the founder has already handed out.
  let q = supabase
    .from("svi_snapshots")
    .select("id, report_share_token")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (projectId !== "default") q = q.eq("project_id", projectId);
  const { data: snap } = await q.maybeSingle();
  const token = (snap as { report_share_token: string | null } | null)?.report_share_token ?? null;

  if (!token) {
    return NextResponse.json({
      ok: true,
      hasShareToken: false,
      totals: null,
      recent: [],
    });
  }

  const { data: rows } = await supabase
    .from("tbr_views")
    .select("viewed_at, viewer_country, viewer_device, read_ms")
    .eq("share_token", token)
    .order("viewed_at", { ascending: false })
    .limit(200);
  const views = ((rows as ViewRow[] | null) ?? []).filter(
    (r) => (r.viewer_device ?? "unknown") !== "bot",
  );

  if (views.length === 0) {
    return NextResponse.json({ ok: true, hasShareToken: true, totals: null, recent: [] });
  }

  const totalReadMs = views.reduce((acc, v) => acc + (v.read_ms ?? 0), 0);
  const uniqueCountries = new Set(
    views.map((v) => (v.viewer_country ?? "").toUpperCase()).filter(Boolean),
  ).size;
  const sortedAsc = [...views].sort((a, b) => a.viewed_at.localeCompare(b.viewed_at));
  const firstAt = sortedAsc[0]?.viewed_at ?? null;
  const lastAt = sortedAsc[sortedAsc.length - 1]?.viewed_at ?? null;

  const recent = views.slice(0, 20).map((v) => ({
    viewedAt: v.viewed_at,
    country: (v.viewer_country ?? "").toUpperCase() || null,
    device: v.viewer_device ?? "unknown",
    readSeconds: Math.round((v.read_ms ?? 0) / 1000),
  }));

  return NextResponse.json({
    ok: true,
    hasShareToken: true,
    totals: {
      views: views.length,
      uniqueCountries,
      totalReadMs,
      firstAt,
      lastAt,
    },
    recent,
  });
}
