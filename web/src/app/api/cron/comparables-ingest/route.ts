// GET/POST /api/cron/comparables-ingest — weekly AU comparables ingest
// (G13-W5-R5 / S-R5, spec §C.7 + §F "S-R5").
//
// Runs `runComparablesIngest` (src/lib/valuation/comparables-ingest.ts):
// fetches the three allow-listed public sources (Cut Through Venture
// monthly roundups, Startup Daily funding feed, ASX announcements), regex-
// extracts raise candidates (no LLM — the weekly run costs nothing),
// dedupes on (name_key, round_date) against the table and inserts the fresh
// rows as `status='pending'` for /admin/comparables review. A report never
// cites a pending row (the repo reads the verified view only).
//
// Auth: Bearer CRON_SECRET (isCronAuthorised). `?dry=1` fetches + extracts
// but writes nothing (the manual check). Weekly line in
// docs/ops/crontab-setup.md; cron-runner.sh sends POST.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runComparablesIngest, type IngestDb } from "@/lib/valuation/comparables-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Three sources + up to two roundup pages, 15 s each with retries. */
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
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  const startedAt = Date.now();
  const dry = isDry(request);
  const summary = await runComparablesIngest({ write: !dry }, { db: supabase as unknown as IngestDb });
  const body = {
    ...summary,
    rows: summary.rows.map((r) => ({ name: r.name, round_date: r.round_date, stage: r.stage, sector: r.sector, amount_aud: r.amount_aud, source_name: r.source_name, confidence: r.confidence })),
    duration_ms: Date.now() - startedAt,
  };
  if (!summary.ok) {
    return NextResponse.json({ ...body, error: summary.error ?? "ingest_failed" }, { status: 500 });
  }
  return NextResponse.json(body);
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
