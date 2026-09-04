// GET /api/digest/preview
//
// Wave 28A — preview endpoint for the /workspace/notifications/preferences
// page. Runs the same buildFounderDigest() aggregator the Monday cron uses,
// scoped to a rolling 7-day window ending now, and returns the rendered
// subject + HTML so the founder can see exactly what next week's digest will
// look like — including the "silent week" case (returns 200 with null payload
// so the preference UI can render an empty state).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildFounderDigest } from "@/lib/digest/weekly";
import { renderFounderDigestEmail } from "@/lib/digest/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_DAYS = 7;

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const payload = await buildFounderDigest(user.id, periodStart, periodEnd);
  if (!payload) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "silent_week",
      payload: null,
      subject: null,
      html: null,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });
  }

  const rendered = renderFounderDigestEmail(payload);
  return NextResponse.json({
    ok: true,
    skipped: false,
    subject: rendered.subject,
    html: rendered.html,
    payload,
  });
}
