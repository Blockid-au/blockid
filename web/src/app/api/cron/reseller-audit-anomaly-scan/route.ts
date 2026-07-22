// GET /api/cron/reseller-audit-anomaly-scan
//
// Standalone audit-log anomaly scan. The weekly digest cron already folds
// buildAnomalySummary() into its Monday email (tick 89), but that path is
// blunt for automated assertion — the digest fires once per week, the email
// is the primary signal, and the response envelope only carries a rollup
// count. This endpoint exposes the full buildAnomalySummary() shape (both
// actor and subject hotspot arrays), lets callers pin `threshold`,
// `window_days`, `now`, and `reseller_id` via query params, and never sends
// email — so a Playwright spec, cron-health probe, or ops one-shot can assert
// the anomaly path against a low threshold without waiting a week or having
// to inspect a mail sink.
//
// Auth: shared CRON_SECRET bearer pattern used by every other reseller-* cron
// route (see sibling reseller-clear-commissions, reseller-monthly-report,
// reseller-weekly-digest). When CRON_SECRET is unset (local dev without the
// env var) the endpoint accepts any request — matches sibling posture.
//
// Query params (all optional):
//   ?threshold=N       — override DEFAULT_ANOMALY_THRESHOLD (200); positive
//                        integer; ignored when non-positive
//   ?window_days=N     — override DEFAULT_ANOMALY_WINDOW_DAYS (7); positive
//                        integer; ignored when non-positive
//   ?now=ISO           — anchor the window end; useful for time-travel specs
//                        that seed rows at a known timestamp
//   ?reseller_id=UUID  — scope the audit-log SELECT to a single reseller so a
//                        harness-owned tenant does not pull in rows from other
//                        active resellers. When omitted the scan covers every
//                        active reseller (same shape the weekly digest emits).
//   ?actions=a,b       — override DEFAULT_ANOMALY_ACTIONS; empty string (or
//                        the literal "*") widens to wildcard. Comma-separated.
//
// Response envelope:
//   { ok: true, summary: AnomalySummary, resellers_scanned: N,
//     window: { start, end, threshold, actions }, ran_at, dry_run }
//
// Non-mutating, does not send email. Read-only across the audit-log table,
// which is itself append-only per migration 0093.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildAnomalySummary,
  DEFAULT_ANOMALY_ACTIONS,
  DEFAULT_ANOMALY_THRESHOLD,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  type AuditLogRow,
} from "@/lib/reseller/audit-anomaly";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseNow(raw: string | null): Date {
  if (raw === null) return new Date();
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return new Date();
  return new Date(ts);
}

function parseActions(raw: string | null): string[] | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "*") return [];
  return trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const threshold = parsePositiveInt(url.searchParams.get("threshold"));
  const windowDays = parsePositiveInt(url.searchParams.get("window_days"));
  const now = parseNow(url.searchParams.get("now"));
  const resellerIdFilter = url.searchParams.get("reseller_id");
  const actions = parseActions(url.searchParams.get("actions"));
  const dryRun = url.searchParams.get("dry_run") === "1";

  const effectiveWindowDays = windowDays ?? DEFAULT_ANOMALY_WINDOW_DAYS;
  const effectiveThreshold = threshold ?? DEFAULT_ANOMALY_THRESHOLD;
  const windowStart = new Date(now.getTime() - effectiveWindowDays * MS_PER_DAY);

  // Resolve the reseller scope. Scoping the audit-log SELECT to the active
  // reseller set (or a single tenant when reseller_id= is supplied) prevents
  // rows from stale terminated resellers from inflating the hotspot count.
  let resellerIds: string[] | null = null;
  if (resellerIdFilter) {
    resellerIds = [resellerIdFilter];
  } else {
    const { data: resellersData, error: resellersErr } = await supabase
      .from("resellers")
      .select("id")
      .eq("status", "active");
    if (resellersErr) {
      return NextResponse.json(
        { ok: false, reason: "resellers_query_failed", error: resellersErr.message },
        { status: 500 },
      );
    }
    resellerIds = (resellersData ?? []).map((r: { id: string }) => r.id);
  }

  if (resellerIds.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: null,
      resellers_scanned: 0,
      window: {
        start: windowStart.toISOString(),
        end: now.toISOString(),
        threshold: effectiveThreshold,
        window_days: effectiveWindowDays,
        actions: actions ?? Array.from(DEFAULT_ANOMALY_ACTIONS),
      },
      dry_run: dryRun,
      ran_at: now.toISOString(),
    });
  }

  const { data: auditRows, error: auditErr } = await supabase
    .from("reseller_audit_log")
    .select("reseller_id, actor_user_id, subject_user_id, action, created_at")
    .in("reseller_id", resellerIds)
    .gte("created_at", windowStart.toISOString());
  if (auditErr) {
    return NextResponse.json(
      { ok: false, reason: "audit_log_query_failed", error: auditErr.message },
      { status: 500 },
    );
  }

  const summary = buildAnomalySummary((auditRows ?? []) as AuditLogRow[], {
    now,
    threshold,
    windowDays,
    actions,
  });

  return NextResponse.json({
    ok: true,
    summary,
    resellers_scanned: resellerIds.length,
    window: {
      start: summary.window_start,
      end: summary.window_end,
      threshold: summary.threshold,
      window_days: effectiveWindowDays,
      actions: actions ?? Array.from(DEFAULT_ANOMALY_ACTIONS),
    },
    dry_run: dryRun,
    ran_at: now.toISOString(),
  });
}

export { GET as POST };
