// GET|POST /api/cron/benchmark-segments — nightly (03:25 UTC) refresh of the
// stage / stage × sector SVI benchmark segments (G21 P3-B; score-governance
// § 7). One latest score per company (never per analysis row) →
// `computeSegments` → every segment upserted into `benchmark_segments`
// (migration 0428; rows with n < 10 are stored for the diff and hidden from
// clients by RLS) → content/reports/benchmark-segments-latest.json with the
// PUBLISHED rows only → the 1 h data cache tag is revalidated so the
// Assessment Card, the Cohort Report, /startup-index and the institutional
// API read the new table within the request.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (lib/security/cron-auth).
// `?dry=1` computes and returns the counts without writing anything.
// 503 when the table is missing (apply 0428) — cron-health records it.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { refreshBenchmarkSegments } from "@/lib/benchmarks/segments-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isDry(request: Request): boolean {
  try {
    const dry = new URL(request.url).searchParams.get("dry");
    return dry === "1" || dry === "true";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const summary = await refreshBenchmarkSegments({}, { dryRun: isDry(request) });
  if (!summary.ok) {
    const missing = /migration 0428/.test(summary.error ?? "");
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "refresh_failed", duration_ms: Date.now() - startedAt }, { status: missing || summary.error === "supabase_unavailable" ? 503 : 500 });
  }
  return NextResponse.json({ ...summary, ok: true, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
