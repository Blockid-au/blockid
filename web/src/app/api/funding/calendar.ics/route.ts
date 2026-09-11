// GET /api/funding/calendar.ics?token=<per-user calendar_token>
//
// T0245 — Money Radar ICS subscription (plan §4h). One VEVENT per
// `funding_matches` row with a date (grant close / program intake / event
// day) with 30 / 14 / 3-day VALARMs, rendered by the shared `renderIcs()`.
//
// Auth is the per-user token (calendar apps cannot send cookies), minted by
// GET /api/funding/calendar-token. Every fetch re-checks the `money_radar`
// entitlement so a lapsed subscriber's feed returns 403, not stale dates.
// `?download=1` forces a file attachment.

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getEntitlements } from "@/lib/entitlements";
import { renderIcs } from "@/lib/compliance/calendar";
import {
  buildFundingCalendar,
  FUNDING_CALENDAR_DESCRIPTION,
  FUNDING_CALENDAR_NAME,
  FUNDING_CALENDAR_PRODID,
} from "@/lib/funding/calendar";
import { isCalendarTokenShape, loadFundingCalendarRows, userForCalendarToken } from "@/lib/funding/calendar-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const ICS_RATE_MAX = 60;
export const ICS_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  // S8-C: the token is the only credential — bound guesses per IP.
  const limited = enforceRateLimit("funding-calendar-ics", null, request, ICS_RATE_MAX, ICS_RATE_WINDOW_MS);
  if (limited) return limited;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!isCalendarTokenShape(token)) {
    return NextResponse.json({ ok: false, error: "missing_or_invalid_token" }, { status: 401 });
  }
  const user = await userForCalendarToken(token);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unknown_token" }, { status: 401 });
  }
  const flags = await getEntitlements(user.plan, user.id);
  if (!flags.includes("money_radar")) {
    return NextResponse.json({ ok: false, error: "money_radar_required", upgrade: "/pricing" }, { status: 403 });
  }

  const now = new Date();
  const rows = await loadFundingCalendarRows(user.id);
  const events = buildFundingCalendar(rows, { now });
  const ics = renderIcs(events, {
    now,
    calendarName: FUNDING_CALENDAR_NAME,
    calendarDescription: FUNDING_CALENDAR_DESCRIPTION,
    prodId: FUNDING_CALENDAR_PRODID,
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    // Calendar apps poll; the sweep is weekly, so an hour is plenty.
    "Cache-Control": "private, max-age=3600",
    "X-Robots-Tag": "noindex",
  };
  if (url.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = 'attachment; filename="money-radar.ics"';
  }
  return new NextResponse(ics, { status: 200, headers });
}
