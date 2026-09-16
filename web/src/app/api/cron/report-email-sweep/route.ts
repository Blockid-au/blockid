// GET/POST /api/cron/report-email-sweep — render + send the queued founder
// report emails (G13-W5-R5 / S-R5, W4-review follow-up (b)).
//
// The report pipeline stamps `svi_snapshots.report_email_queued_at` instead
// of rendering the PDF + PNGs inside the SSE request; this sweep
// (`lib/svi/email-queue.ts sweepReportEmails`) does the render + send every
// 5 minutes, ≤ 5 snapshots per tick, oldest first. `sendReportEmail`
// stamps `report_email_sent_at` (the idempotency marker) as before.
//
// Auth: Bearer CRON_SECRET. `?dry=1` lists the candidates and sends nothing.
// Before migration 0402 the column is missing: `{ ok:true, error:"not_migrated" }`
// and the pipeline keeps sending inline.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sweepReportEmails, type EmailQueueDb } from "@/lib/svi/email-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Five renders × (react-pdf + 3 sharp PNGs) ≈ 40 s worst case. */
export const maxDuration = 120;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function baseUrlOf(request: Request): string | undefined {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
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
  const summary = await sweepReportEmails(supabase as unknown as EmailQueueDb, { dryRun: isDry(request) }, { baseUrl: baseUrlOf(request) });
  const body = { ...summary, duration_ms: Date.now() - startedAt };
  if (!summary.ok) return NextResponse.json({ ...body, error: summary.error ?? "sweep_failed" }, { status: 500 });
  return NextResponse.json(body);
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
