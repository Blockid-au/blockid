// /api/cron/verified-review-sla — every 30 min (19,49 * * * *) — G35 Pricing v5 P4.
//
// IN_REVIEW Verified report orders that are overdue (now > sla_due_at) or due
// within 4 business hours alert the admin once per order per level: a
// founder_notifications row (the dedupe record) + one ops e-mail per run
// (lib/verified-review/sla-alerts.ts). `?dry=1` lists what would alert and
// writes / sends nothing.
//
// Auth: CRON_SECRET via `Authorization: Bearer` or `x-cron-secret`, like
// every other cron here. GET and POST both work (cron-runner.sh POSTs).
// Allow-listed from apiRoute (api/cron/** — system actor; the run lands in
// cron-health.jsonl via the runner).

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runVerifiedReviewSlaAlerts } from "@/lib/verified-review/sla-alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function run(request: Request) {
  if (!isCronAuthorised(request, { xCronSecretHeader: true })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await runVerifiedReviewSlaAlerts(supabase, { dry });
    return NextResponse.json(
      {
        ...result,
        alerted: result.alerted.map((a) => ({ order_id: a.orderId, level: a.level, startup: a.startupName, due_at: a.sla.dueAt, line: a.sla.line })),
      },
      { status: result.ok ? 200 : 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:verified-review-sla] failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
