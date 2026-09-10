// GET|POST /api/cron/money-radar-sweep
//
// T0245 (G11 sprint S4) — weekly Sunday 05:00 UTC, one hour after
// `refresh-funding-sources`. Re-matches every Money Radar subscriber (plan
// flag `money_radar`) and every A$3 / credit report buyer of the last 90 days
// against the refreshed `au_grants` / `au_programs`, upserts
// `funding_matches`, diffs against last week and fans the events out as
// in-app notifications (`new_matches`, `grant_deadline`, `program_intake`,
// `event_match`). Email is T0246's drip worker, fed by the
// `last_notified.pending_email` contract documented in
// `@/lib/funding/radar-sweep`.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: refresh-funding-sources).
// `?dry=1` computes everything, writes nothing and returns the full event list.
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl,
// so the non-dry response keeps `events` out (counts only).

import { NextResponse } from "next/server";
import { runMoneyRadarSweep } from "@/lib/funding/radar-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
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

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const summary = await runMoneyRadarSweep({ dryRun });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    const { events: _events, ...rest } = summary;
    void _events;
    return NextResponse.json({ ...rest, ok: false, error: summary.error ?? "sweep_failed" }, { status: 500 });
  }

  const { events, ...rest } = summary;
  return NextResponse.json({
    ...rest,
    ok: true,
    duration_ms: Date.now() - startedAt,
    ...(dryRun ? { events } : {}),
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
