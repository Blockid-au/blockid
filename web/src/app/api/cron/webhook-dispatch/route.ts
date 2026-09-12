// GET|POST /api/cron/webhook-dispatch
//
// S20-B — delivers queued outbound webhooks (`webhook_deliveries`, migration
// 0336). Crontab: `*/5 * * * * bash $RUN webhook-dispatch --timeout 120`.
// 25 deliveries per tick by default (`?limit=` may move it, ≤ 50); each is leased with a
// conditional UPDATE before it is sent, so an overlapping tick never sends
// the same row twice. Retry ladder 1 m / 10 m / 1 h / 6 h then `dead`;
// an endpoint is disabled after 20 consecutive failures (in-app
// `webhook_disabled` notification). Logic: src/lib/webhooks/dispatch.ts.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (pattern: funding-report-retry).
// `?dry=1` lists the due deliveries and sends / writes nothing.
//
// cron-runner.sh appends the JSON body to content/reports/cron-health.jsonl.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { DEFAULT_BATCH, dispatchDue, MAX_BATCH } from "@/lib/webhooks/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function query(request: Request): URLSearchParams {
  try {
    return new URL(request.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const q = query(request);
  const dry = q.get("dry") === "1" || q.get("dry") === "true";
  const limitRaw = Number(q.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_BATCH) : DEFAULT_BATCH;

  const startedAt = Date.now();
  const summary = await dispatchDue({ limit, dryRun: dry });
  if (!summary.ok && summary.error === "supabase_unavailable") {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  if (!summary.ok) {
    return NextResponse.json({ ...summary, ok: false, error: summary.error ?? "dispatch_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...summary, ok: true, limit, duration_ms: Date.now() - startedAt });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
