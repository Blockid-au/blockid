// /api/cron/archived-purge — 90-day retention purge for archived projects
// (Iteration-18 T1, Q4 MP #5).
//
// Hard-deletes rows from `projects` where `archived_at < now() - 90 days`.
// The soft-delete UI (see `archiveProject`) stamps `archived_at`; this cron
// closes the loop by permanently removing rows past the retention window so
// GDPR / SOC2-lite obligations are met without operator involvement.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` — same pattern as bq-export
// and lifecycle-mailer. Fails closed when the secret env var is unset.
//
// Schedule: daily 03:00 UTC (see web/vercel.json). Off-peak to avoid
// colliding with the interactive UI window.
//
// Audit: one `project.purged` row per deleted project, preserving the
// original `user_id` so the SOC2-lite trail attributes the deletion to the
// row's owner. If the purge itself fails, we still emit a single
// `project.purge.failed` system row (subject_id null) so the failure is
// visible in the audit stream — never fail silently.

import { NextResponse } from "next/server";
import { purgeArchivedOlderThan } from "@/lib/projects";
import { logUserAction } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const RETENTION_DAYS = 90;
const ROUTE_PATH = "/api/cron/archived-purge";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail-closed: refuse when the secret is missing so a misconfigured
  // deploy cannot be triggered externally.
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const purgedAt = new Date().toISOString();
  const result = await purgeArchivedOlderThan(RETENTION_DAYS);

  if (!result.ok) {
    // Emit a single failure audit row so cron-health picks it up. We do not
    // have a user_id in this branch (the SELECT failed), so we use the
    // system-null UUID and mark subject_type accordingly. Never throws.
    await logUserAction({
      userId: "00000000-0000-0000-0000-000000000000",
      action: "project.purge.failed",
      subjectType: "cron_run",
      subjectId: null,
      fields: {
        reason: "retention_90d",
        error: result.error,
        purged_at: purgedAt,
      },
      route: ROUTE_PATH,
    });
    return NextResponse.json(
      { ok: false, error: result.error, purged_count: 0, purged_ids: [] },
      { status: 500 },
    );
  }

  // Fan-out audit — one row per project, preserving the original owning
  // user_id. `logUserAction` never throws, so even if one insert fails the
  // rest still land.
  for (const row of result.purged) {
    await logUserAction({
      userId: row.user_id,
      action: "project.purged",
      subjectType: "project",
      subjectId: row.id,
      fields: {
        reason: "retention_90d",
        retention_days: RETENTION_DAYS,
        purged_at: purgedAt,
      },
      route: ROUTE_PATH,
    });
  }

  return NextResponse.json({
    ok: true,
    purged_count: result.count,
    purged_ids: result.purged.map((r) => r.id),
  });
}
