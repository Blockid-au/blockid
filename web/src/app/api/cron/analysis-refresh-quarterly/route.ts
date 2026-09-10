// GET|POST /api/cron/analysis-refresh-quarterly
//
// T0251 (G11 sprint S5) — 1st of Jan / Apr / Jul / Oct, 06:00 UTC. Builds the
// quarterly "what changed for your startup" note for every Growth founder
// (tier ≥ growth or an active Startup Package grant) × project from the
// SVI delta, the Money Radar match history and this quarter's CFO / CLO
// research (`@/lib/funding/analysis-refresh`), stores it in
// `analysis_refreshes` and writes ONE `analysis_refresh` in-app notification
// per project when something actually changed (zero-change quarters store
// the note silently).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: money-radar-sweep).
// `?dry=1` computes everything, writes nothing and returns the note list.
// `?force=1` rebuilds quarters that already have a row (upsert).

import { NextResponse } from "next/server";
import { runAnalysisRefreshQuarterly } from "@/lib/funding/analysis-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function flag(request: Request, name: string): boolean {
  try {
    const v = new URL(request.url).searchParams.get(name);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = flag(request, "dry");
  const force = flag(request, "force");
  const startedAt = Date.now();
  const summary = await runAnalysisRefreshQuarterly({ dryRun, force });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "refresh_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...summary, ok: true, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
