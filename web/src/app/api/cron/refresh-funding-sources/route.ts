// GET|POST /api/cron/refresh-funding-sources
//
// T0243 (G11 sprint S3) — weekly Sunday 04:00 UTC. Re-checks every matchable
// `au_grants` row against its source page, auto-flips only `upcoming → open`
// on an explicit "applications open" hint, stamps `verified_by=cron` where
// the page agrees, and writes everything else (mismatches, 403/429 blocks,
// possible new GrantConnect items) to the gitignored review queue
// `content/reports/grants-review-queue.jsonl` for /admin/funding.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: refresh-sector-benchmarks).
// `?dry=1` runs the full loop with no DB / queue writes and returns the
// entries it would have queued.
//
// Heartbeat: cron-runner.sh already appends one line per run to
// content/reports/cron-health.jsonl from this route's JSON body (ok + the
// summary below becomes the `detail`), so the route deliberately does NOT
// write to that file itself — doing so would double-log every Sunday.

import { NextResponse } from "next/server";
import { refreshFundingSources } from "@/lib/funding/refresh";

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
  const summary = await refreshFundingSources({ dryRun });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    return NextResponse.json({ ok: false, error: summary.error ?? "refresh_failed", summary }, { status: 500 });
  }

  const { entries, ...rest } = summary;
  return NextResponse.json({
    ...rest,
    ok: true,
    duration_ms: Date.now() - startedAt,
    // Full entry list only on dry runs (keeps the cron-health detail short).
    ...(dryRun ? { entries } : {}),
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
