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
// `?dry=1` (S29-hardening, S27 review #11) is FETCH-ONLY: every source is
// pulled and reported (`fetched` / `fetch_failed` / `blocked` / `empty_text`
// + `textChars`) but the model is never called — no token spend, no DB
// writes. `?dry=1&extract=1` runs the full loop (fetch + extraction) with no
// DB writes and returns the proposals it would have inserted.
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

function flag(request: Request, name: string): boolean {
  try {
    const v = new URL(request.url).searchParams.get(name);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

/** `?dry=1` → fetch-only; `?dry=1&extract=1` → fetch + model, no writes; neither → live. Exported for the suite. */
export function refreshModeFor(request: Request): { dryRun: boolean; fetchOnly: boolean } {
  const dryRun = flag(request, "dry");
  if (!dryRun) return { dryRun: false, fetchOnly: false };
  // `fetchOnly=1` is accepted as the explicit spelling; `extract=1` opts into the model.
  const fetchOnly = flag(request, "fetchOnly") || !flag(request, "extract");
  return { dryRun: true, fetchOnly };
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { dryRun, fetchOnly } = refreshModeFor(request);
  const startedAt = Date.now();
  const summary = await refreshSectorMultiples({ dryRun, fetchOnly });

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

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` / `?dry=1&extract=1` checks.
export { GET as POST };
