// GET|POST /api/cron/mandate-fit-refresh
//
// G13-W3-T2 — nightly (off-peak, 16:20 UTC = 02:20 AEST; see
// docs/ops/crontab-setup.md). Recomputes `mandate_fit_scores` for every
// active investor mandate × every founder-visible project with the
// FIT_WEIGHTS_V2 scorer (lib/investors/fit-v2.ts) — the investors → startups
// direction of BA spec §B.8. Deal-flow reads the result keyed on project_id,
// which is what replaces the old scores.email → svi_index_snapshots.account_id
// guess. Bounded: mandates × projects in memory, 500-row upsert batches
// (§C.3). Before 0393 is applied the run is a no-op with `migrated:false`.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — constant-time compare via
// lib/security/cron-auth.ts (S8-C), same as bq-export / money-radar-sweep.
// `?dry=1` scores everything and writes nothing.
//
// Response (Appendix 1): { ok, dryRun, migrated, mandates, projects, pairs,
// upserts, deleted_inactive, batches, errors, ms } — counts only, so the
// cron-runner.sh line in content/reports/cron-health.jsonl stays small.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runMandateFitRefresh } from "@/lib/investors/fit-refresh";

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
  const summary = await runMandateFitRefresh({ dryRun: isDry(request) });
  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json(summary, { status: 503 });
  }
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export const POST = GET;
