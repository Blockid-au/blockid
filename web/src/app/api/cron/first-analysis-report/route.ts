// GET|POST /api/cron/first-analysis-report — S32-B, every 5 minutes.
//
// Retries first-analysis jobs left `failed` (attempts < 3) or stuck in
// `running` for > 15 min, backfills the missing sections of `done_partial`
// reports one section at a time (S32-E: <= SECTION_MAX_ATTEMPTS each, then
// `unavailable`), and sends the PDF email for finished or partial reports
// whose destination became known after the job landed. Logic lives in
// `@/lib/analyses/first-analysis/sweep` (shares the job runner and the
// deliverer with the intake path — nothing duplicated).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` via the constant-time helper
// (S8-C). `?dry=1` lists the candidates and writes / sends nothing.
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { sweepFirstAnalysisReports } from "@/lib/analyses/first-analysis/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Up to five jobs × seven agent calls; the dispatcher bounds each call. */
export const maxDuration = 290;

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
  const startedAt = Date.now();
  const summary = await sweepFirstAnalysisReports({ dryRun: isDry(request) });
  if (!summary.ok) {
    return NextResponse.json({ ...summary, error: summary.error ?? "sweep_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...summary, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
