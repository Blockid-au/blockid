// GET /api/svi/history/full?projectId=<pid>
//
// Wave 26C — full 12-snapshot history for the SVI trend dashboard. Returns
// per-snapshot overall + 8-dim vectors so the client can render the trend
// line chart, 8 sparklines, and delta table WITHOUT extra round-trips.
//
// Response:
// {
//   ok: true,
//   snapshots: [{
//     createdAt: string,
//     overallScore: number,
//     dimScores: { ftv, mpc, ptd, tre, cgh, iri, lco, svm },
//     criterionCount: number
//   }]
// }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];

interface SnapshotRow {
  created_at: string;
  svi_total: number | null;
  dimension_scores: unknown;
  dim_results: unknown;
  criterion_results: unknown;
  project_id: string | null;
}

function extractDimScores(row: SnapshotRow): Record<DimKey, number | null> {
  const out = {} as Record<DimKey, number | null>;
  const results = row.dim_results && typeof row.dim_results === "object"
    ? (row.dim_results as Record<string, { score?: number | null }>)
    : null;
  const scores = row.dimension_scores && typeof row.dimension_scores === "object"
    ? (row.dimension_scores as Record<string, number | { score?: number }>)
    : null;
  for (const k of DIM_KEYS) {
    let val: number | null = null;
    const fromDim = results?.[k]?.score;
    if (typeof fromDim === "number") val = fromDim;
    if (val === null && scores) {
      const raw = scores[k];
      if (typeof raw === "number") val = raw;
      else if (raw && typeof raw === "object" && typeof (raw as { score?: number }).score === "number") {
        val = (raw as { score: number }).score;
      }
    }
    out[k] = val;
  }
  return out;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, snapshots: [] });
  }
  const supabase = getSupabaseAdmin()!;

  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountId = (account as { id: string } | null)?.id ?? null;
  if (!accountId) {
    return NextResponse.json({ ok: true, snapshots: [] });
  }

  let q = supabase
    .from("svi_snapshots")
    .select("created_at, svi_total, dimension_scores, dim_results, criterion_results, project_id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (projectId && projectId !== "default") q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: "fetch_failed", detail: error.message }, { status: 500 });
  }
  const rows = ((data as SnapshotRow[] | null) ?? []).reverse(); // chronological asc

  const snapshots = rows.map((row) => {
    const dims = extractDimScores(row);
    let overall = typeof row.svi_total === "number" ? row.svi_total : null;
    if (overall === null) {
      // Fallback: average of non-null dim scores.
      const vals = Object.values(dims).filter((v): v is number => typeof v === "number");
      overall = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    }
    const criterionCount = Array.isArray(row.criterion_results) ? row.criterion_results.length : 0;
    return {
      createdAt: row.created_at,
      overallScore: overall,
      dimScores: dims,
      criterionCount,
    };
  });

  return NextResponse.json({ ok: true, snapshots });
}
