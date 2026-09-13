// GET|POST /api/cron/sector-multiples-refresh
//
// S27-C (2026-09-13) — quarterly, 1st of Jan/Apr/Jul/Oct 03:00 UTC
// (scripts/crontab.production). Reads the fixed allow-list of public pages
// that publish SaaS / sector revenue multiples (lib/valuation/
// multiples-sources.ts), pulls each through the DNS-pinned fetcher with the
// SSRF guard, asks the AI client to extract `{sector, low, mid, high,
// excerpt}` rows and inserts ONLY the ones whose excerpt is a verbatim
// substring of the fetched text — as `sector_multiples_overrides` rows with
// status='proposed'. Nothing is approved here; an admin reviews the queue at
// /dashboard/admin/sector-multiples. Fetch / AI failures are logged per
// source in the JSON body and never abort the run.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: refresh-funding-sources).
// `?dry=1` runs the full loop (fetch + extraction) with no DB writes and
// returns the proposals it would have inserted.
//
// Heartbeat: cron-runner.sh appends one line per run to
// content/reports/cron-health.jsonl from this JSON body, so the route does
// not write to that file itself.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { refreshSectorMultiples } from "@/lib/valuation/multiples-refresh";

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
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const summary = await refreshSectorMultiples({ dryRun });

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
    // Full proposal list only on dry runs (keeps the cron-health detail short).
    ...(dryRun ? { entries } : {}),
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
