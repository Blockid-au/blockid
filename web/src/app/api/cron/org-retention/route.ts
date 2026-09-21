// GET|POST /api/cron/org-retention — weekly (Sunday 04:40 UTC) application
// of every organisation's `org_settings.retention_days` (G21 P3-B;
// migration 0428). Deletes the org's OWN artefacts older than the window —
// cohort_snapshots, assessment_overrides (via its batches) and
// intake_submissions (via its intakes) — never a founder's project, score,
// evidence or claim (docs/ops/retention.md lists exactly what). ≤ 500 rows
// per table per org per tick; one `org.retention.applied` audit row per org.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. `?dry=1` previews the
// counts and writes nothing (no delete, no audit row). `?limit=N` caps rows
// per table (1..500). 503 before 0428.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runOrgRetention } from "@/lib/org/retention";

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
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { dryRun, limit } = params(request);
  const startedAt = Date.now();
  const summary = await runOrgRetention({ dryRun, limit });
  if (!summary.ok) {
    const status = summary.error === "supabase_unavailable" || /migration 0428/.test(summary.error ?? "") ? 503 : 500;
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "retention_failed", duration_ms: Date.now() - startedAt }, { status });
  }
  return NextResponse.json({ ...summary, ok: true, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
