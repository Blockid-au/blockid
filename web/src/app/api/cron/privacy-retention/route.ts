// GET|POST /api/cron/privacy-retention
//
// S15-A (2026-09-11) — weekly (Monday 03:15 UTC, after the Sunday funding
// crons). Applies the retention periods the Privacy Policy v2.2 clause 4
// states for the Money Finder / Founder Radar / evaluator tables:
// `RETENTION_RULES` in `@/lib/privacy/retention` (policy↔code parity is
// pinned by that module's test). ≤ 500 rows per rule per tick, active
// subscribers' rows never touched, guest reports anonymised not deleted.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: funding-report-retry).
// `?dry=1` returns the per-rule counts and writes nothing (no DB change, no
// audit line). `?limit=N` caps rows per rule (clamped to 1..500).
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl;
// the sweep itself appends one line per rule to
// content/reports/retention-history.jsonl.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runRetentionSweep } from "@/lib/privacy/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function params(request: Request): { dryRun: boolean; limit: number | undefined } {
  try {
    const sp = new URL(request.url).searchParams;
    const dry = sp.get("dry");
    const rawLimit = sp.get("limit");
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    return { dryRun: dry === "1" || dry === "true", limit: Number.isFinite(limit) ? limit : undefined };
  } catch {
    return { dryRun: false, limit: undefined };
  }
}

export async function GET(request: Request) {
  // S8-C: constant-time compare of the bearer secret.
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { dryRun, limit } = params(request);
  const startedAt = Date.now();
  const summary = await runRetentionSweep({ db: getSupabaseAdmin(), dryRun, limit });

  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "retention_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...summary, ok: true, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
