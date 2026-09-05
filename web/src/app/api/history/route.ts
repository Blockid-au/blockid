import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("startup_score_history")
    .select(
      "startup_id, startup_name, total_score, created_at, valuation_low_aud, valuation_high_aud, inputs"
    )
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[blockid:history] fetch failed", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch history" }, { status: 500 });
  }

  // Group by startup_id
  const grouped = new Map<
    string,
    {
      startup_id: string;
      startup_name: string;
      entries: Array<{
        total_score: number;
        created_at: string;
        valuation_low_aud: number | null;
        valuation_high_aud: number | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: any;
      }>;
    }
  >();

  for (const row of data ?? []) {
    if (!grouped.has(row.startup_id)) {
      grouped.set(row.startup_id, {
        startup_id: row.startup_id,
        startup_name: row.startup_name,
        entries: [],
      });
    }
    grouped.get(row.startup_id)!.entries.push({
      total_score: row.total_score,
      created_at: row.created_at,
      valuation_low_aud: row.valuation_low_aud ?? null,
      valuation_high_aud: row.valuation_high_aud ?? null,
      inputs: row.inputs,
    });
  }

  const startups = Array.from(grouped.values()).map((group) => {
    // Entries are newest first from the query; reverse to get oldest first for trend
    const oldestFirst = [...group.entries].reverse();
    const scoreTrend = oldestFirst.slice(-5).map((e) => e.total_score);
    const latest = group.entries[0];

    return {
      startup_id: group.startup_id,
      startup_name: group.startup_name,
      latest_score: latest.total_score,
      latest_date: latest.created_at,
      entry_count: group.entries.length,
      score_trend: scoreTrend,
      valuation_low_aud: latest.valuation_low_aud,
      valuation_high_aud: latest.valuation_high_aud,
      stage: latest.inputs?.stage ?? null,
    };
  });

  return NextResponse.json({ ok: true, startups, total: startups.length });
}
