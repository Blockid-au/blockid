// GET|POST /api/cron/ga4-event-audit
//
// S23-B — weekly (Mon 04:30 UTC) GA4 Data API check that the G11/G12 +
// hero-test events (GA4_AUDIT_EVENTS) arrived in the last 7 days, and
// whether the `arm` ("Hero variant") custom dimension is registered. Writes
// content/reports/ga4-event-audit.json — the file /api/status reads to
// surface `ga4_events: ok | missing:<list> | blocked | unknown`.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` via isCronAuthorised.
// `?dry=1` runs the report but does not persist the file.
//
// The Data API being disabled / the service account lacking Viewer access
// is recorded as `blocked` (with the operator steps) — never a crash — so
// cron-runner logs a clean run and the status page shows the real state.
//
// audit-exempt: system actor; the report file is the evidence.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { persistGa4EventAudit, runGa4EventAudit } from "@/lib/analytics/ga4-event-audit";

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
  const dry = isDry(request);
  const report = await runGa4EventAudit({ dry });
  const persisted = dry ? false : await persistGa4EventAudit(report);
  // `missing` / `blocked` are findings, not route failures: 200 so
  // cron-runner records the body; only a transport error is a 500.
  return NextResponse.json({ ...report, persisted }, { status: report.error ? 500 : 200 });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
