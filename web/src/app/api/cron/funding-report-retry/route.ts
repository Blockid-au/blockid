// GET|POST /api/cron/funding-report-retry
//
// Review 2026-09-10 #11 — every 30 min. Re-runs the Money Finder generation
// for paid guest rows the Stripe webhook left at `paid` / `generating` /
// `failed` (paid marker older than 10 min), max 10 per tick, and sends the
// same "report ready" email once (`meta.email_sent_at` dedupe). Logic lives in
// `@/lib/funding/report-retry` (shares `generateAndStoreFundingReport` +
// `sendFundingReportReadyEmail` with the webhook — nothing duplicated).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: money-radar-sweep).
// `?dry=1` lists the candidates and writes / sends nothing.
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl.

import { NextResponse } from "next/server";
import { retryStuckFundingReports } from "@/lib/funding/report-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const summary = await retryStuckFundingReports({ dryRun });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "retry_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...summary, ok: true, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
